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
} from "firebase/firestore";
import { db } from "../../lib/firebase";
// Opcional: helper
// import { getActiveStoreId } from "../../lib/store";

interface Category {
  id: string;
  name: string;
  order: number;
}

const CategoriesView: React.FC = () => {
  const [storeId, setStoreId] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryOrder, setNewCategoryOrder] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Edit State
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // 1) Cargar storeId (MVP: desde localStorage)
  useEffect(() => {
    const id = localStorage.getItem("activeStoreId");
    if (!id) {
      setError("No se encontró la tienda activa. Vuelve a registrarte o configura la tienda.");
      setLoading(false);
      return;
    }
    setStoreId(id);
  }, []);

  // 2) Referencia a subcolección de categorías
  const categoriesRef = useMemo(() => {
    if (!storeId) return null;
    return collection(db, "stores", storeId, "categories");
  }, [storeId]);

  // 3) Listener de categorías por tienda
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

        // sugerir orden para siguiente categoría
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
      // newCategoryOrder lo recalcula el listener
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
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-6 py-3 font-semibold">Orden</th>
                  <th className="px-6 py-3 font-semibold">Nombre</th>
                  <th className="px-6 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500">#{cat.order}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{cat.name}</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => setEditingCategory(cat)}
                        className="text-gray-400 hover:text-indigo-600 p-2"
                        title="Editar"
                      >
                        <i className="fa-solid fa-pen-to-square"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="text-gray-400 hover:text-red-600 p-2"
                        title="Eliminar"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </td>
                  </tr>
                ))}
                {!categories.length ? (
                  <tr>
                    <td className="px-6 py-6 text-sm text-gray-400" colSpan={3}>
                      Aún no hay categorías.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Modal */}
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
        @keyframes scale-up { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-scale-up { animation: scale-up 0.2s ease-out; }
      `}</style>
    </div>
  );
};

export default CategoriesView;
