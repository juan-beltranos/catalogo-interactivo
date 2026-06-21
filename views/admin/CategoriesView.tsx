import React, { useEffect, useMemo, useState } from "react";
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
  getDocs,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getStoreForOwner } from "@/lib/storeLookup";
import { Category } from "@/interfaces";
import { useAuth } from "@/context/AuthContext";
import Paginator from "@/components/catalog/Paginator";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

type SortableCategoryRowProps = {
  cat: Category;
  onCopy: (cat: Category) => void;
  onWhatsApp: (cat: Category) => void;
  onShare: (cat: Category) => void;
  onEdit: (cat: Category) => void;
  onDelete: (id: string) => void;
};

const PAGE_SIZE = 20;

const SortableCategoryRow: React.FC<SortableCategoryRowProps> = ({
  cat,
  onCopy,
  onWhatsApp,
  onShare,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-gray-50 transition-colors ${isDragging ? "bg-indigo-50 shadow-lg opacity-80 relative z-10" : ""
        }`}
    >
      <td className="px-6 py-4 text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-indigo-600 touch-none"
            title="Arrastrar categoría"
          >
            <i className="fa-solid fa-grip-vertical"></i>
          </button>

          <span>#{cat.order}</span>
        </div>
      </td>

      <td className="px-6 py-4 text-sm font-medium text-gray-900">{cat.name}</td>

      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onCopy(cat)}
            className="text-gray-400 hover:text-blue-600 p-2"
            title="Copiar link"
          >
            <i className="fa-solid fa-link"></i>
          </button>

          <button
            type="button"
            onClick={() => onWhatsApp(cat)}
            className="text-gray-400 hover:text-green-600 p-2"
            title="Compartir por WhatsApp"
          >
            <i className="fa-brands fa-whatsapp"></i>
          </button>

          <button
            type="button"
            onClick={() => onShare(cat)}
            className="text-gray-400 hover:text-indigo-600 p-2"
            title="Compartir en redes"
          >
            <i className="fa-solid fa-share-nodes"></i>
          </button>

          <button
            type="button"
            onClick={() => onEdit(cat)}
            className="text-gray-400 hover:text-indigo-600 p-2"
            title="Editar"
          >
            <i className="fa-solid fa-pen-to-square"></i>
          </button>

          <button
            type="button"
            onClick={() => onDelete(cat.id)}
            className="text-gray-400 hover:text-red-600 p-2"
            title="Eliminar"
          >
            <i className="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  );
};

const CategoriesView: React.FC = () => {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryOrder, setNewCategoryOrder] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [page, setPage] = useState(1);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    if (!user) return;

    const fetchStore = async () => {
      try {
        setLoading(true);
        setError("");

        const store = await getStoreForOwner(user.uid);

        if (store) {
          const storeData = store.data;

          setStoreId(store.id);
          setStoreSlug(storeData.slug || "");
        } else {
          setStoreId(null);
          setStoreSlug("");
          setError("No se encontró tienda para este usuario.");
        }
      } catch (e) {
        console.error(e);
        setError("Error buscando tienda del usuario.");
      } finally {
        setLoading(false);
      }
    };

    fetchStore();
  }, [user]);

  const categoriesRef = useMemo(() => {
    if (!storeId) return null;
    return collection(db, "stores", storeId, "categories");
  }, [storeId]);

  const getCategoryUrl = (category: Category) => {
    if (!storeSlug) return "";
    return `${window.location.origin}/#/${storeSlug}?category=${encodeURIComponent(
      category.id
    )}`;
  };

  const copyCategoryUrl = async (category: Category) => {
    const url = getCategoryUrl(category);

    if (!url) {
      setError("No se pudo generar el link porque la tienda no tiene slug.");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      alert("Link de categoría copiado al portapapeles.");
    } catch (err) {
      console.error(err);
      setError("No se pudo copiar el link.");
    }
  };

  const shareCategoryOnWhatsApp = (category: Category) => {
    const url = getCategoryUrl(category);

    if (!url) {
      setError("No se pudo generar el link porque la tienda no tiene slug.");
      return;
    }

    const text = `Mira esta categoría: ${category.name}\n${url}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const shareCategory = async (category: Category) => {
    const url = getCategoryUrl(category);

    if (!url) {
      setError("No se pudo generar el link porque la tienda no tiene slug.");
      return;
    }

    const shareData = {
      title: `Categoría: ${category.name}`,
      text: `Mira esta categoría del catálogo: ${category.name}`,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(url);
      alert("Tu navegador no soporta compartir directo. Se copió el link al portapapeles.");
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!categoriesRef) return;

    setLoading(true);
    const q = query(categoriesRef, orderBy("order", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const cats: Category[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<Category, "id">;
          return { id: d.id, name: data.name, order: Number(data.order) };
        });

        setCategories(cats);
        setLoading(false);

        const nextOrder = cats.length ? Math.max(...cats.map((c) => c.order)) + 1 : 1;
        setNewCategoryOrder(nextOrder);
      },
      (err) => {
        console.error(err);
        setError("Error al cargar las categorías");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [categoriesRef]);

  const totalPages = Math.max(1, Math.ceil(categories.length / PAGE_SIZE));
  const paginatedCategories = useMemo(
    () => categories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [categories, page],
  );
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!storeId || !over || active.id === over.id) return;

    const oldIndex = categories.findIndex((cat) => cat.id === active.id);
    const newIndex = categories.findIndex((cat) => cat.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const previousCategories = categories;

    const reorderedCategories = arrayMove(categories, oldIndex, newIndex).map(
      (cat, index) => ({
        ...cat,
        order: index + 1,
      })
    );

    setCategories(reorderedCategories);
    setError("");

    try {
      const batch = writeBatch(db);

      reorderedCategories.forEach((cat) => {
        const catRef = doc(db, "stores", storeId, "categories", cat.id);
        batch.update(catRef, {
          order: cat.order,
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
    } catch (err) {
      console.error(err);
      setCategories(previousCategories);
      setError("Error al guardar el nuevo orden de categorías.");
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoriesRef) return;
    if (!newCategoryName.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      await addDoc(categoriesRef, {
        name: newCategoryName.trim(),
        order: Number(newCategoryOrder),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setNewCategoryName("");
    } catch (err) {
      console.error(err);
      setError("Error al guardar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) return;
    if (!editingCategory || !editingCategory.name.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const catRef = doc(db, "stores", storeId, "categories", editingCategory.id);
      await updateDoc(catRef, {
        name: editingCategory.name.trim(),
        order: Number(editingCategory.order),
        updatedAt: serverTimestamp(),
      });
      setEditingCategory(null);
    } catch (err) {
      console.error(err);
      setError("Error al actualizar categoría");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!storeId) return;
    if (!window.confirm("¿Estás seguro de eliminar esta categoría?")) return;

    try {
      await deleteDoc(doc(db, "stores", storeId, "categories", id));
    } catch (err) {
      console.error(err);
      setError("Error al eliminar");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
        <p className="text-gray-500 mt-1">Organiza tus productos por grupos lógicos.</p>
        {storeId ? (
          <p className="text-xs text-gray-400 mt-1">Tienda activa: {storeId}</p>
        ) : null}
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
          <h2 className="font-bold text-gray-900 mb-4">Nueva Categoría</h2>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                required
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Ej: Calzado"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
              <input
                type="number"
                required
                value={newCategoryOrder}
                onChange={(e) => setNewCategoryOrder(parseInt(e.target.value || "1", 10))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !storeId}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              Agregar Categoría
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <i className="fa-solid fa-circle-notch animate-spin text-indigo-600 text-2xl"></i>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="w-full overflow-x-auto">
                <table className="min-w-[720px] w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-3 font-semibold">Orden</th>
                      <th className="px-6 py-3 font-semibold">Nombre</th>
                      <th className="px-6 py-3 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={paginatedCategories.map((cat) => cat.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <tbody className="divide-y divide-gray-100">
                        {paginatedCategories.map((cat) => (
                          <SortableCategoryRow
                            key={cat.id}
                            cat={cat}
                            onCopy={copyCategoryUrl}
                            onWhatsApp={shareCategoryOnWhatsApp}
                            onShare={shareCategory}
                            onEdit={setEditingCategory}
                            onDelete={handleDeleteCategory}
                          />
                        ))}

                        {!categories.length ? (
                          <tr>
                            <td className="px-6 py-6 text-sm text-gray-400" colSpan={3}>
                              Aún no hay categorías.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </SortableContext>
                  </DndContext>
                </table>
              </div>
              {categories.length > PAGE_SIZE ? (
                <Paginator
                  page={page}
                  hasPrev={page > 1}
                  hasNext={page < totalPages}
                  onPrev={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditingCategory(null)}
          ></div>

          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-8 animate-scale-up">
            <h3 className="text-xl font-bold mb-6">Editar Categoría</h3>

            <form onSubmit={handleUpdateCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={editingCategory.name}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
                <input
                  type="number"
                  required
                  value={editingCategory.order}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      order: parseInt(e.target.value || "1", 10),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg font-semibold hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scale-up { 
          from { opacity: 0; transform: scale(0.95); } 
          to { opacity: 1; transform: scale(1); } 
        }
        .animate-scale-up { animation: scale-up 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default CategoriesView;
