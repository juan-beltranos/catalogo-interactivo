import React, { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import Sidebar from '../admin/Sidebar';
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../../lib/firebase";

const AdminLayout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/admin/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const initials = user?.email?.substring(0, 2).toUpperCase() || 'AD';

  const openMyCatalog = async () => {
    try {
      if (!user) return;

      const qStore = query(
        collection(db, "stores"),
        where("ownerUid", "==", user.uid),
        limit(1)
      );

      const snap = await getDocs(qStore);
      if (snap.empty) {
        alert("No se encontró una tienda para este usuario.");
        return;
      }

      const storeData = snap.docs[0].data() as any;
      const storeSlug = storeData.slug as string | undefined;

      if (!storeSlug) {
        alert("Tu tienda no tiene slug configurado.");
        return;
      }

      window.open(`/#/${storeSlug}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      alert("No se pudo abrir el catálogo.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header Admin */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* HAMBURGUESA (solo móvil) */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-700"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
            >
              <i className="fa-solid fa-bars"></i>
            </button>

            <Link to="/admin" className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <i className="fa-solid fa-layer-group text-white text-lg"></i>
              </div>
              <span className="text-xl font-bold text-gray-900 tracking-tight">
                Catalog<span className="text-indigo-600">SaaS</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={openMyCatalog}
              className="hidden sm:flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
            >
              <i className="fa-solid fa-arrow-up-right-from-square text-xs"></i>
              Ver Catálogo
            </button>

            <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end hidden lg:flex">
                <p className="text-sm font-semibold text-gray-900 leading-none">Administrador</p>
                <p className="text-xs text-gray-500 mt-1">{user?.email}</p>
              </div>

              <div className="group relative">
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200 shadow-sm cursor-pointer">
                  {initials}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-all"
                title="Cerrar sesión"
              >
                <i className="fa-solid fa-power-off"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar fijo (desktop) */}
        <aside className="hidden md:flex sticky top-16 h-[calc(100vh-64px)]">
          <Sidebar />
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-x-hidden">
          <div className="p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Drawer (móvil) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Overlay */}
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Cerrar menú"
          />

          {/* Panel */}
          <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
            <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
              <span className="font-bold text-gray-900">Menú</span>
              <button
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
