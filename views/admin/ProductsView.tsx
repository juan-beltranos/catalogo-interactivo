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
  QueryDocumentSnapshot,
  DocumentData,
  startAfter,
  endBefore,
  limit,
  limitToLast,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { Product } from "@/interfaces";
import { ImageItem, ProductOption, Variant, VideoItem } from "@/types";
import { formatCOP, parseCOP } from "@/helpers";
import VariantsEditor from "@/components/admin/VariantsEditor";
import { compressImage } from "@/helpers/imageCompression";
import { MAX_VIDEO_MB, validateVideoFile } from "@/helpers/videoValidation";
import Paginator from "@/components/catalog/Paginator";
import { deleteCloudinaryAsset, cldImg, uploadImageToCloudinary } from "@/helpers/cloudinaryUpload";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../../lib/firebase";
import ImportProductsExcel from "@/components/catalog/ImportProductsExcel";

const PAGE_SIZE = 20;

const ProductsView: React.FC = () => {
  const { user } = useAuth();

  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);

  const [pageFirstDoc, setPageFirstDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [pageLastDoc, setPageLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const [history, setHistory] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);

  // Create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState(""); // COP input
  const [categoryId, setCategoryId] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sku, setSku] = useState("");
  const [hasDiscount, setHasDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValueInput, setDiscountValueInput] = useState(""); // "10" o "20000"


  // Variants (create)
  const [useVariants, setUseVariants] = useState(false);
  const [createVariants, setCreateVariants] = useState<Variant[]>([]);


  // Edit modal
  const [editSku, setEditSku] = useState("");
  const [editHasDiscount, setEditHasDiscount] = useState(false);
  const [editDiscountType, setEditDiscountType] =
    useState<"percent" | "amount">("percent");
  const [editDiscountValueInput, setEditDiscountValueInput] = useState("");

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editPriceInput, setEditPriceInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    total: 0,
    done: 0,
    currentName: "",
  });


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
      //@ts-ignore
      setCategories(snap.docs.map((d) => ({ id: d.id, name: d.data().name })));
    });

    setLoading(true);
    loadFirstPage();

    return () => {
      unsubCats();
    };
  }, [storeId, catsRef, prodsRef]);


  // --- Images upload helper ---
  const uploadImages = async (files: File[]): Promise<ImageItem[]> => {
    if (!storeId || !files.length) return [];

    setUploading(true);
    setUploadProgress({ done: 0, total: files.length, currentName: "" });

    try {
      const uploaded: ImageItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress({ done: i, total: files.length, currentName: f.name });

        // ✅ Sí: aquí sigues optimizando ANTES de subir (tu compressImage)
        const optimizedBlob = await compressImage(f);
        const optimizedFile = new File([optimizedBlob], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });

        const up = await uploadImageToCloudinary(storeId, optimizedFile);

        uploaded.push({
          url: up.url,
          publicId: up.publicId,
        });
      }

      setUploadProgress({ done: files.length, total: files.length, currentName: "" });
      return uploaded;
    } finally {
      setUploading(false);
    }
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
    setSku("");
    setHasDiscount(false);
    setDiscountType("percent");
    setDiscountValueInput("");
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

      const cleanSku = sku.trim() || null;

      const discount =
        hasDiscount && discountValueNum > 0
          ? {
            type: discountType, // "percent" | "amount"
            value: discountType === "percent"
              ? Math.min(100, Math.max(0, discountValueNum))
              : Math.max(0, discountValueNum),
          }
          : null;

      await addDoc(prodsRef, {
        name: cleanName,
        sku: cleanSku,
        description: description.trim(),
        price: basePrice,
        discount,
        categoryId,
        images,
        videos,
        options: [],
        variants,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await loadFirstPage();
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
        if (img.publicId) {
          try {
            await deleteCloudinaryAsset(storeId, img.publicId, "image");
          } catch (e) {
            console.warn("No se pudo borrar imagen en Cloudinary:", img.publicId, e);
          }
        }
      }

      await deleteDoc(doc(db, "stores", storeId, "products", prod.id));
      await loadFirstPage();
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

    // SKU
    setEditSku(p.sku ?? "");

    // Discount
    if (p.discount) {
      setEditHasDiscount(true);
      setEditDiscountType(p.discount.type);
      setEditDiscountValueInput(String(p.discount.value));
    } else {
      setEditHasDiscount(false);
      setEditDiscountType("percent");
      setEditDiscountValueInput("");
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !editingProduct) return;

    setIsSubmitting(true);
    try {
      const basePrice = parseCOP(editPriceInput);

      const prodRef = doc(db, "stores", storeId, "products", editingProduct.id);
      const cleanSku = editSku.trim() || null;

      const discount =
        editHasDiscount && editDiscountValueNum > 0
          ? {
            type: editDiscountType,
            value:
              editDiscountType === "percent"
                ? Math.min(100, Math.max(0, editDiscountValueNum))
                : Math.max(0, editDiscountValueNum),
          }
          : null;

      await updateDoc(prodRef, {
        name: editingProduct.name.trim(),
        sku: cleanSku,
        description: (editingProduct.description ?? "").trim(),
        price: basePrice,
        discount,
        categoryId: editingProduct.categoryId,
        options: [],
        variants: useVariants ? (editingProduct.variants ?? []) : [],
        images: editingProduct.images ?? [],
        videos: editingProduct.videos ?? [],
        updatedAt: serverTimestamp(),
      });

      await loadFirstPage();
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
    if (!editingProduct || !storeId) return;

    const img = editingProduct.images?.[index];
    if (!img) return;

    if (!window.confirm("¿Eliminar esta imagen?")) return;

    try {
      // 1) borrar en Cloudinary vía Function
      if (img.publicId) {
        await deleteCloudinaryAsset(storeId, img.publicId, "image");
      }
    } catch (e) {
      console.warn("No se pudo borrar en Cloudinary", e);
      // si quieres, puedes abortar aquí para no quitarla del UI:
      // return;
    }

    // 2) quitar del estado local (se guardará cuando le des “Guardar cambios”)
    const next = [...(editingProduct.images || [])];
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

  const mapDocToProduct = (d: QueryDocumentSnapshot<DocumentData>) => {
    const data = d.data() as any;

    return {
      id: d.id,
      name: data.name ?? "",
      sku: data.sku ?? null,             
      discount: data.discount ?? null, 
      description: data.description ?? "",
      price: Number(data.price ?? 0),
      categoryId: data.categoryId ?? "",
      images: (data.images ?? []) as ImageItem[],
      videos: (data.videos ?? []) as VideoItem[],
      options: (data.options ?? []) as ProductOption[],
      variants: (data.variants ?? []) as Variant[],
    } satisfies Product;
  };


  const loadPage = async (mode: "first" | "next" | "prev") => {
    if (!prodsRef) return;

    setLoadingPage(true);
    try {
      let qBase = query(prodsRef, orderBy("createdAt", "desc"));

      if (mode === "next" && pageLastDoc) {
        qBase = query(qBase, startAfter(pageLastDoc));
      }

      if (mode === "prev" && pageFirstDoc) {
        // vuelve hacia atrás: trae los últimos 31 antes del firstDoc actual
        qBase = query(qBase, endBefore(pageFirstDoc), limitToLast(PAGE_SIZE + 1));
      } else {
        qBase = query(qBase, limit(PAGE_SIZE + 1));
      }

      const snap = await getDocs(qBase);
      const docs = snap.docs;

      const nextExists = docs.length > PAGE_SIZE;
      const pageDocs = nextExists ? docs.slice(0, PAGE_SIZE) : docs;

      setProducts(pageDocs.map(mapDocToProduct));
      setHasNext(nextExists);

      setPageFirstDoc(pageDocs[0] ?? null);
      setPageLastDoc(pageDocs[pageDocs.length - 1] ?? null);
    } finally {
      setLoadingPage(false);
      setLoading(false);
    }
  };

  const loadFirstPage = async () => {
    setPage(1);
    setHistory([]);
    await loadPage("first");
  };

  const goNext = async () => {
    if (!hasNext || loadingPage) return;
    if (pageFirstDoc) setHistory((h) => [...h, pageFirstDoc]);
    setPage((p) => p + 1);
    await loadPage("next");
  };

  const goPrev = async () => {
    if (history.length === 0 || loadingPage) return;
    setHistory((h) => h.slice(0, -1));
    setPage((p) => Math.max(1, p - 1));
    await loadPage("prev");
  };

  const basePrice = parseCOP(priceInput);

  const discountValueNum = Number((discountValueInput || "").replace(/[^\d]/g, "")) || 0;

  const finalPrice = useMemo(() => {
    if (!hasDiscount) return basePrice;

    if (!basePrice) return 0;

    if (discountType === "percent") {
      const pct = Math.min(100, Math.max(0, discountValueNum));
      return Math.max(0, Math.round(basePrice * (1 - pct / 100)));
    }

    // amount
    const amt = Math.max(0, discountValueNum);
    return Math.max(0, basePrice - amt);
  }, [hasDiscount, discountType, discountValueNum, basePrice]);

  const savings = useMemo(() => {
    if (!hasDiscount) return 0;
    return Math.max(0, basePrice - finalPrice);
  }, [hasDiscount, basePrice, finalPrice]);

  const editBasePrice = parseCOP(editPriceInput);

  const editDiscountValueNum =
    Number((editDiscountValueInput || "").replace(/[^\d]/g, "")) || 0;

  const editFinalPrice = useMemo(() => {
    if (!editHasDiscount) return editBasePrice;
    if (!editBasePrice) return 0;

    if (editDiscountType === "percent") {
      const pct = Math.min(100, Math.max(0, editDiscountValueNum));
      return Math.max(0, Math.round(editBasePrice * (1 - pct / 100)));
    }

    const amt = Math.max(0, editDiscountValueNum);
    return Math.max(0, editBasePrice - amt);
  }, [editHasDiscount, editDiscountType, editDiscountValueNum, editBasePrice]);

  const editSavings = useMemo(() => {
    if (!editHasDiscount) return 0;
    return Math.max(0, editBasePrice - editFinalPrice);
  }, [editHasDiscount, editBasePrice, editFinalPrice]);


  if (!storeId) return <div className="p-8 text-center">Buscando configuración de tienda...</div>;


  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Productos</h1>
      </div>

      {storeId ? <ImportProductsExcel storeId={storeId} /> : null}

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

            {/* Descuento */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700 font-medium">
                  Descuento
                </label>

                <div className="flex items-center gap-2">
                  <input
                    id="hasDiscount"
                    type="checkbox"
                    checked={hasDiscount}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasDiscount(checked);
                      if (!checked) {
                        setDiscountValueInput("");
                        setDiscountType("percent");
                      }
                    }}
                  />
                  <label htmlFor="hasDiscount" className="text-sm text-gray-600">
                    Activar
                  </label>
                </div>
              </div>

              {hasDiscount ? (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="percent">% Porcentaje</option>
                    <option value="amount">$ Valor (COP)</option>
                  </select>

                  <input
                    type="text"
                    placeholder={discountType === "percent" ? "Ej: 10" : "Ej: 20000"}
                    value={discountValueInput}
                    onChange={(e) => setDiscountValueInput(e.target.value)}
                    className="w-full p-2 border rounded sm:col-span-2"
                  />

                  <div className="sm:col-span-3 text-xs text-gray-500">
                    {basePrice ? (
                      <>
                        <div>
                          Precio original: <b>{formatCOP(basePrice)}</b>
                        </div>
                        <div>
                          Precio final: <b className="text-indigo-700">{formatCOP(finalPrice)}</b>
                          {savings > 0 ? (
                            <> — Ahorro: <b>{formatCOP(savings)}</b></>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div>Escribe el precio para ver el cálculo del descuento.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-400">
                  Si no activas descuento, se mostrará el precio normal.
                </div>
              )}
            </div>


            <input
              type="text"
              placeholder="Código / SKU (opcional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full p-2 border rounded"
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
                                src={cldImg(prod.images[0].url, { w: 80, h: 80, crop: "fill" })}
                                alt={prod.name}
                                className="w-10 h-10 rounded object-cover border shrink-0"
                                loading="lazy"
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
              <Paginator
                page={page}
                hasNext={hasNext}
                hasPrev={history.length > 0}
                loading={loadingPage}
                onNext={goNext}
                onPrev={goPrev}
              />
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
                {/* SKU */}
                <div>
                  <label className="text-xs text-gray-500">Código / SKU</label>
                  <input
                    type="text"
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="w-full p-2 border rounded"
                    placeholder="Opcional"
                  />
                </div>

                {/* Descuento */}
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Descuento
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editHasDiscount}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEditHasDiscount(checked);
                          if (!checked) {
                            setEditDiscountValueInput("");
                            setEditDiscountType("percent");
                          }
                        }}
                      />
                      <span className="text-sm text-gray-600">Activar</span>
                    </div>
                  </div>

                  {editHasDiscount ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={editDiscountType}
                        onChange={(e) => setEditDiscountType(e.target.value as any)}
                        className="p-2 border rounded"
                      >
                        <option value="percent">% Porcentaje</option>
                        <option value="amount">$ Valor (COP)</option>
                      </select>

                      <input
                        type="text"
                        value={editDiscountValueInput}
                        onChange={(e) => setEditDiscountValueInput(e.target.value)}
                        placeholder={editDiscountType === "percent" ? "Ej: 10" : "Ej: 20000"}
                        className="p-2 border rounded sm:col-span-2"
                      />

                      <div className="sm:col-span-3 text-xs text-gray-500">
                        {editBasePrice ? (
                          <>
                            <div>
                              Precio original: <b>{formatCOP(editBasePrice)}</b>
                            </div>
                            <div>
                              Precio final:{" "}
                              <b className="text-indigo-700">{formatCOP(editFinalPrice)}</b>
                              {editSavings > 0 && (
                                <> — Ahorro: <b>{formatCOP(editSavings)}</b></>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>Escribe el precio para calcular el descuento.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      Sin descuento, se mostrará el precio normal.
                    </div>
                  )}
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
                        src={cldImg(img.url, { w: 240, h: 240, crop: "fill" })}
                        alt="img"
                        className="w-full h-auto object-cover rounded border"
                        loading="lazy"
                        decoding="async"
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


      {uploading && (
        <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-600" />
              <div>
                <div className="font-bold">Subiendo archivos...</div>
                <div className="text-xs text-gray-500">{uploadProgress.currentName}</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-gray-600">
              {uploadProgress.done}/{uploadProgress.total}
            </div>

            <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600"
                style={{
                  width:
                    uploadProgress.total > 0
                      ? `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`
                      : "0%",
                }}
              />
            </div>

            <div className="mt-3 text-[11px] text-gray-400">
              No cierres esta ventana mientras se suben los archivos.
            </div>
          </div>
        </div>
      )}



    </div>
  );
};

export default ProductsView;
