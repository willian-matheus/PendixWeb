import { Outlet, Link, useLocation } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';
import { useEffect } from 'react';
import {
  LayoutDashboard, Users, ClipboardList, History,
  ChevronRight, LogOut, ClipboardCheck,
} from 'lucide-react';
import { Toaster } from 'sonner';

const NAV = [
  { icon: LayoutDashboard, label: 'Visão Geral',  path: '/pendix/app' },
  { icon: Users,           label: 'Clientes',     path: '/pendix/app/clientes' },
  { icon: ClipboardList,   label: 'Pendências',   path: '/pendix/app/pendencias' },
  { icon: History,         label: 'Histórico',    path: '/pendix/app/historico' },
];

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';

    document.title = 'Pendix';
    if (favicon) favicon.href = '/pendix-favicon.svg';

    return () => {
      document.title = prevTitle;
      if (favicon) favicon.href = prevFavicon;
    };
  }, []);
}

export default function PendixRoot() {
  usePendixMeta();
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#06000f] text-gray-200 flex font-sans">
      <Toaster richColors position="top-right" />

      {/* Sidebar */}
      <aside className="w-60 border-r border-white/[0.06] h-screen fixed left-0 top-0 flex flex-col bg-[#08000f]">
        {/* Logo */}
        <div className="p-5 border-b border-white/[0.06] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.4)]">
            <ClipboardCheck size={18} className="text-white" />
          </div>
          <span className="text-xl font-black tracking-[0.12em] uppercase text-white">PENDIX</span>
        </div>

        {/* Nav label */}
        <div className="px-5 pt-5 pb-2">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-700">Menu</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 pb-4 overflow-y-auto">
          <div className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === '/pendix/app'
                ? location.pathname === '/pendix/app'
                : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-[0_4px_15px_rgba(139,92,246,0.3)]'
                      : 'text-gray-500 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={17} className={isActive ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'} />
                    <span className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'} tracking-wide`}>
                      {item.label}
                    </span>
                  </div>
                  {isActive && <ChevronRight size={13} className="opacity-70" />}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User card */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-700 to-violet-900 border border-purple-500/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-purple-200">
                  {user?.nome?.substring(0, 2).toUpperCase() || 'US'}
                </span>
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate w-28">{user?.nome || 'Usuário'}</p>
                <p className="text-[9px] text-gray-600 uppercase tracking-wider truncate w-28">
                  {user?.role?.replace('_', ' ') || ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              title="Sair"
              className="text-gray-700 hover:text-red-400 transition-colors shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="ml-60 flex-1 min-h-screen p-8">
        <Outlet />
      </main>
    </div>
  );
}
