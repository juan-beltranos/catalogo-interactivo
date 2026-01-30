import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where,
  getDocs,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { Product } from "@/interfaces";
import { ImageItem, ProductOption, Variant, VideoItem } from "@/types";
import { formatCOP, parseCOP } from "@/helpers";
import VariantsEditor from "@/components/admin/VariantsEditor";
import { compressImage } from "@/helpers/imageCompression";
import { MAX_VIDEO_MB, validateVideoFile } from "@/helpers/videoValidation";

const ProductsView: React.FC = () => {
  const { user } = useAuth();

  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState(""); // COP input
  const [categoryId, setCategoryId] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Variants (create)
  const [useVariants, setUseVariants] = useState(false);
  const [createVariants, setCreateVariants] = useState<Variant[]>([]);


  // Edit modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editPriceInput, setEditPriceInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);

  // 1) storeId del usuario actual
  useEffect(() => {
    if (!user) return;

    const fetchStore = async () => {
      const q = query(collection(db, "stores"), where("ownerUid", "==", user.uid));
      const snap = await getDocs(q);
      if (!snap.empty) setStoreId(snap.docs[0].id);
      else console.error("No se encontró tienda para este usuario");
    };

    fetchStore();
  }, [user]);

  // 2) refs por tienda
  const catsRef = useMemo(() => {
    if (!storeId) return null;
    return collection(db, "stores", storeId, "categories");
  }, [storeId]);

  const prodsRef = useMemo(() => {
    if (!storeId) return null;
    return collection(db, "stores", storeId, "products");
  }, [storeId]);

  // 3) listeners
  useEffect(() => {
    if (!storeId || !catsRef || !prodsRef) return;

    const qCats = query(catsRef, orderBy("name", "asc"));
    const unsubCats = onSnapshot(qCats, (snap) => {
      setCategories(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    });

    const qProds = query(prodsRef, orderBy("createdAt", "desc"));
    const unsubProds = onSnapshot(qProds, (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          description: data.description ?? "",
          price: Number(data.price ?? 0),
          categoryId: data.categoryId ?? "",
          images: (data.images ?? []) as ImageItem[],
          videos: (data.videos ?? []) as VideoItem[], 
          options: (data.options ?? []) as ProductOption[],
          variants: (data.variants ?? []) as Variant[],
        } satisfies Product;

      });

      setProducts(list);
      setLoading(false);
    });

    return () => {
      unsubCats();
      unsubProds();
    };
  }, [storeId, catsRef, prodsRef]);

  // --- Images upload helper ---
  const uploadImages = async (files: File[]): Promise<ImageItem[]> => {
    if (!storeId || !files.length) return [];

    const uploaded: ImageItem[] = [];

    for (const f of files) {
      const optimized = await compressImage(f);

      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const path = `stores/${storeId}/products/${filename}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, optimized);
      const url = await getDownloadURL(storageRef);

      uploaded.push({ url, path });
    }

    return uploaded;
  };

  const uploadVideos = async (files: File[]): Promise<VideoItem[]> => {
    if (!storeId || !files.length) return [];

    const uploaded: VideoItem[] = [];

    for (const f of files) {
      const err = validateVideoFile(f);
      if (err) {
        alert(err);
        continue;
      }

      const ext = (f.name.split(".").pop() || "mp4").toLowerCase();
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `stores/${storeId}/products/videos/${filename}`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, f, {
        contentType: f.type || "video/mp4",
        cacheControl: "public,max-age=31536000",
      });

      const url = await getDownloadURL(storageRef);
      uploaded.push({ url, path });
    }

    return uploaded;
  };

  const resetCreateForm = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setName("");
    setDescription("");
    setPriceInput("");
    setCategoryId("");
    setImageFiles([]);
    setVideoFiles([]);
    setUseVariants(false);
  };

  // --- CREATE ---
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !prodsRef) return;
    if (isSubmitting) return; // evita doble submit rápido

    const cleanName = name.trim();
    const basePrice = parseCOP(priceInput);

    if (!cleanName || !categoryId || !basePrice) return;

    setIsSubmitting(true);
    try {
      const images = await uploadImages(imageFiles);
      const videos = await uploadVideos(videoFiles);

      const variants = useVariants ? (createVariants || []) : [];

      await addDoc(prodsRef, {
        name: cleanName,
        description: description.trim(),
        price: basePrice,
        categoryId,
        images,
        videos,
        options: [],
        variants,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetCreateForm();
      setCreateVariants([]);
    } catch (err) {
      console.error(err);
      alert("Error al guardar producto");
    } finally {
      setIsSubmitting(false);
    }
  };



  // --- DELETE product (incluye borrar imágenes en Storage) ---
  const handleDeleteProduct = async (prod: Product) => {
    if (!storeId) return;
    if (!window.confirm("¿Eliminar producto?")) return;

    try {
      for (const img of prod.images || []) {
        if (img.path) {
          try {
            await deleteObject(ref(storage, img.path));
          } catch (e) {
            console.warn("No se pudo borrar imagen:", img.path, e);
          }
        }
      }

      for (const vid of (prod.videos || [])) {
        if (vid.path) {
          try {
            await deleteObject(ref(storage, vid.path));
          } catch (e) {
            console.warn("No se pudo borrar video:", vid.path, e);
          }
        }
      }

      await deleteDoc(doc(db, "stores", storeId, "products", prod.id));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar producto");
    }
  };

  // --- OPEN EDIT ---
  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setEditPriceInput(String(p.price));
    setUseVariants((p.variants?.length ?? 0) > 0);
  };


  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !editingProduct) return;

    setIsSubmitting(true);
    try {
      const basePrice = parseCOP(editPriceInput);

      const prodRef = doc(db, "stores", storeId, "products", editingProduct.id);
      await updateDoc(prodRef, {
        name: editingProduct.name.trim(),
        description: (editingProduct.description ?? "").trim(),
        price: basePrice,
        categoryId: editingProduct.categoryId,
        options: [],
        variants: useVariants ? (editingProduct.variants ?? []) : [],
        images: editingProduct.images ?? [],
        videos: editingProduct.videos ?? [],
        updatedAt: serverTimestamp(),
      });


      setEditingProduct(null);
    } catch (err) {
      console.error(err);
      alert("Error al actualizar producto");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- ADD images in edit modal (append) ---
  const handleAddMoreImagesToEdit = async (files: FileList | null) => {
    if (!files || !editingProduct) return;
    const list = Array.from(files);
    const uploaded = await uploadImages(list);

    setEditingProduct({
      ...editingProduct,
      images: [...(editingProduct.images || []), ...uploaded],
    });
  };

  // --- REMOVE one image from edit modal (and storage) ---
  const removeImageFromEdit = async (index: number) => {
    if (!editingProduct) return;
    const img = editingProduct.images?.[index];
    if (!img) return;

    if (!window.confirm("¿Eliminar esta imagen?")) return;

    try {
      if (img.path) await deleteObject(ref(storage, img.path));
    } catch (e) {
      console.warn("No se pudo borrar del storage", e);
    }

    const next = [...editingProduct.images];
    next.splice(index, 1);
    setEditingProduct({ ...editingProduct, images: next });
  };

  const handleAddMoreVideosToEdit = async (files: FileList | null) => {
    if (!files || !editingProduct) return;
    const list = Array.from(files);
    const uploaded = await uploadVideos(list);

    setEditingProduct({
      ...editingProduct,
      videos: [...((editingProduct as any).videos || []), ...uploaded],
    } as any);
  };

  const removeVideoFromEdit = async (index: number) => {
    if (!editingProduct) return;

    const vids = (((editingProduct as any).videos || []) as VideoItem[]);
    const vid = vids[index];
    if (!vid) return;

    if (!window.confirm("¿Eliminar este video?")) return;

    try {
      if (vid.path) await deleteObject(ref(storage, vid.path));
    } catch (e) {
      console.warn("No se pudo borrar video del storage", e);
    }

    const next = [...vids];
    next.splice(index, 1);

    setEditingProduct({ ...(editingProduct as any), videos: next });
  };

  if (!storeId) return <div className="p-8 text-center">Buscando configuración de tienda...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Productos</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CREATE */}
        <div className="bg-white p-6 rounded-xl border">
          <h2 className="font-bold mb-4">Añadir Producto</h2>

          <form onSubmit={handleAddProduct} className="space-y-4">
            <input
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />

            <textarea
              placeholder="Descripción (opcional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border rounded"
              rows={3}
            />

            {/* Precio COP */}
            <input
              type="text"
              placeholder="Precio (COP) ej: 250000 o 250.000"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />

            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>

            {/* Imágenes múltiples */}
            <p className="text-[11px] text-gray-400">
              + Agregar imágenes
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => setImageFiles(e.target.files ? Array.from(e.target.files) : [])}
              className="w-full text-xs"
            />

            <p className="text-[11px] text-gray-400">
              Máx {MAX_VIDEO_MB}MB por video.
            </p>
            {/* Videos múltiples */}
            <input
              type="file"
              multiple
              accept="video/*"
              onChange={(e) => setVideoFiles(e.target.files ? Array.from(e.target.files) : [])}
              className="w-full text-xs"
            />

            {/* Variantes toggle */}
            <div className="flex items-center gap-2">
              <input
                id="useVariants"
                type="checkbox"
                checked={useVariants}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseVariants(checked);
                  if (!checked) setCreateVariants([]);
                }}
              />
              <label htmlFor="useVariants" className="text-sm text-gray-700">
                Este producto tiene variantes
              </label>
            </div>

            {useVariants ? (
              <VariantsEditor
                variants={createVariants}
                onChange={(vars) => setCreateVariants(vars)}
              />
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 text-white py-2 rounded font-bold disabled:opacity-50"
            >
              Guardar
            </button>
          </form>
        </div>

        {/* LIST */}
        <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-500">Cargando...</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-[720px] w-full text-left">
                <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-500">
                  <tr>
                    <th className="px-4 sm:px-6 py-4">Producto</th>
                    <th className="px-4 sm:px-6 py-4">Precio</th>
                    <th className="px-4 sm:px-6 py-4">Variantes</th>
                    <th className="px-4 sm:px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {products.map((prod) => {
                    const hasVariants = (prod.variants?.length ?? 0) > 0;
                    const displayPrice = hasVariants
                      ? `Desde ${formatCOP(Math.min(...prod.variants.map((v) => v.price || 0)))}`
                      : formatCOP(prod.price);

                    return (
                      <tr key={prod.id} className="text-sm">
                        <td className="px-4 sm:px-6 py-4 font-medium">
                          <div className="flex items-center gap-3">
                            {/* imagen */}
                            {prod.images?.[0]?.url ? (
                              <img
                                src={prod.images[0].url}
                                alt={prod.name}
                                className="w-10 h-10 rounded object-cover border shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-gray-100 border shrink-0" />
                            )}

                            {/* texto */}
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-gray-900 truncate">
                                {prod.name}
                              </div>

                              <div className="text-xs text-gray-400 line-clamp-2 sm:line-clamp-1">
                                {prod.description || ""}
                              </div>

                              {(prod.videos?.length ?? 0) > 0 ? (
                                <div className="mt-1 text-[10px] text-gray-400">
                                  <i className="fa-solid fa-video mr-1" />
                                  {prod.videos!.length} video(s)
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 sm:px-6 py-4 font-bold text-indigo-600 whitespace-nowrap">
                          {displayPrice}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-gray-600 whitespace-nowrap">
                          {hasVariants ? prod.variants.length : "-"}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(prod)}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50"
                            title="Editar"
                            type="button"
                          >
                            <i className="fa-solid fa-pen" />
                          </button>

                          <button
                            onClick={() => handleDeleteProduct(prod)}
                            className="ml-2 inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                            title="Eliminar"
                            type="button"
                          >
                            <i className="fa-solid fa-trash-can" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!products.length ? (
                    <tr>
                      <td className="px-6 py-8 text-gray-400" colSpan={4}>
                        Aún no hay productos.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* EDIT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Editar Producto</h3>
              <button onClick={() => setEditingProduct(null)} className="text-gray-500">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="space-y-6">
              {/* Basic */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Nombre</label>
                  <input
                    type="text"
                    value={editingProduct.name}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, name: e.target.value })
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500">Precio base (COP)</label>
                  <input
                    type="text"
                    value={editPriceInput}
                    onChange={(e) => setEditPriceInput(e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Preview: {formatCOP(parseCOP(editPriceInput))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Descripción</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description || ""}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, description: e.target.value })
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500">Categoría</label>
                  <select
                    value={editingProduct.categoryId}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                    }
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Categoría</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Images */}
              <div className="border rounded p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">Imágenes</h4>
                  <label className="text-sm text-indigo-600 cursor-pointer">
                    + Agregar imágenes
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => handleAddMoreImagesToEdit(e.target.files)}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  {(editingProduct.images || []).map((img, idx) => (
                    <div key={img.path || img.url} className="relative">
                      <img
                        src={img.url}
                        alt="img"
                        className="w-full h-24 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => removeImageFromEdit(idx)}
                        className="absolute top-1 right-1 bg-white/90 border rounded px-2 py-1 text-xs"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {!editingProduct.images?.length ? (
                    <div className="text-sm text-gray-400">Sin imágenes</div>
                  ) : null}
                </div>
              </div>

              {/* Videos */}
              <div className="border rounded p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">Videos</h4>
                  <label className="text-sm text-indigo-600 cursor-pointer">
                    + Agregar videos
                    <input
                      type="file"
                      multiple
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => handleAddMoreVideosToEdit(e.target.files)}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  {(editingProduct.videos || []).map((v, idx) => (
                    <div key={v.path || v.url} className="relative border rounded-xl overflow-hidden bg-black">
                      <video src={v.url} controls className="w-full h-44 object-contain" />
                      <button
                        type="button"
                        onClick={() => removeVideoFromEdit(idx)}
                        className="absolute top-2 right-2 bg-white/90 border rounded px-2 py-1 text-xs"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {!(editingProduct.videos || []).length ? (
                    <div className="text-sm text-gray-400">Sin videos</div>
                  ) : null}
                </div>
              </div>

              {/* Variants */}
              <div className="border rounded p-4 space-y-4">
                <VariantsEditor
                  variants={editingProduct.variants || []}
                  onChange={(vars) => setEditingProduct({ ...editingProduct, variants: vars })}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 bg-gray-100 py-2 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded font-bold disabled:opacity-50"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProductsView;
