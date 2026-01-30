import { SidebarItemProps, SidebarProps } from '@/interfaces';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';


const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon, label, active, onNavigate }) => (
  <Link
    to={to}
    onClick={onNavigate}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${active
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
  >
    <i className={`fa-solid ${icon} w-5 text-center`}></i>
    <span>{label}</span>
  </Link>
);

const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const location = useLocation();

  const menuItems = [
    { to: '/admin', icon: 'fa-chart-pie', label: 'Dashboard', exact: true },
    { to: '/admin/products', icon: 'fa-box', label: 'Productos' },
    { to: '/admin/categories', icon: 'fa-tags', label: 'Categorías' },
    { to: '/admin/orders', icon: 'fa-cart-shopping', label: 'Pedidos' },
    { to: '/admin/customers', icon: 'fa-users', label: 'Clientes' },
    { to: '/admin/settings', icon: 'fa-sliders', label: 'Configuración' },
  ];

  const isLinkActive = (item: typeof menuItems[0]) => {
    if ((item as any).exact) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-1">
        <div className="px-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Gestión
          </p>
        </div>

        {menuItems.map((item) => (
          <SidebarItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            active={isLinkActive(item as any)}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="mt-auto p-4 border-t border-gray-100">
        <div className="bg-indigo-600 rounded-xl p-4 text-white">
          <p className="text-sm font-bold">Plan Pro</p>
          <p className="text-xs opacity-80 mt-1">Disfruta de todas las funciones sin límites.</p>
          <button className="mt-3 w-full bg-white text-indigo-600 text-xs font-bold py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Ver Detalles
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
