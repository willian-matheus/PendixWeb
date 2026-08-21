import { Outlet, Link, useLocation } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';
import { useTheme } from '../../app/theme/ThemeProvider';
import { useAccentColor, ACCENT_COLORS } from '../../app/theme/AccentColorProvider';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Building2, ClipboardList, CalendarDays, History, Bell, Settings,
  ChevronRight, LogOut, X, CreditCard,} from 'lucide-react';
import { Toaster } from 'sonner';
import Topbar from '../components/Topbar';
import PendixLogo from '../components/PendixLogo';
import PendixWordmark from '../components/PendixWordmark';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador', super_admin: 'Administrador', master: 'Master',
  contador: 'Contador', cliente_empresa: 'Cliente',
  acesso_completo: 'Acesso completo', visualizador: 'Visualizador',
};

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',     path: '/pendix/app' },
  { icon: Users,           label: 'Clientes',      path: '/pendix/app/clientes' },
  { icon: Building2,       label: 'Empresas',      path: '/pendix/app/empresas' },
  { icon: ClipboardList,   label: 'Pendências',    path: '/pendix/app/pendencias' },
  { icon: CalendarDays,    label: 'Calendário',    path: '/pendix/app/calendario' },
  { icon: History,         label: 'Histórico',     path: '/pendix/app/historico' },
  { icon: Bell,            label: 'Notificações',  path: '/pendix/app/notificacoes' },
  { icon: CreditCard,      label: 'Assinatura',    path: '/pendix/app/assinatura' },
  { icon: Settings,        label: 'Configurações', path: '/pendix/app/configuracoes' },
];

function usePendixMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const prevFavicon = favicon?.href ?? '';

    document.title = 'Pendix';
    if (favicon) favicon.href = '/pendix/logo-icon-white.png';

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
  const { theme } = useTheme();
  const { accent } = useAccentColor();
  const accentColor = ACCENT_COLORS[accent];
  const isDark = theme === 'dark';
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const c = {
    page:        isDark ? 'bg-[#06000f] text-gray-200'        : 'bg-gray-50 text-gray-900',
    sidebar:     isDark ? 'bg-[#08000f] border-white/[0.06]'   : 'bg-white border-gray-200',
    border:      isDark ? 'border-white/[0.06]'                : 'border-gray-100',
    navLabel:    isDark ? 'text-gray-700'                      : 'text-gray-400',
    navInactive: isDark ? 'text-gray-500 hover:bg-white/5 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
    navIcon:     isDark ? 'text-gray-600 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-gray-600',
    userCard:    isDark ? 'bg-white/[0.03] border-white/8'     : 'bg-gray-50 border-gray-200',
    userName:    isDark ? 'text-white'                         : 'text-gray-900',
    userRole:    isDark ? 'text-gray-600'                      : 'text-gray-500',
    closeBtn:    isDark ? 'text-gray-500 hover:bg-white/5 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
  };

  const SidebarContent = (
    <>
      {/* Logo */}
      <div className={`p-5 border-b flex items-center gap-4 ${c.border}`}>
        <PendixLogo variant={isDark ? 'white' : 'black'} size={40} className="shrink-0" />
        <PendixWordmark size={30} color={isDark ? '#ffffff' : '#091426'} />
        <button
          onClick={() => setMobileOpen(false)}
          className={`lg:hidden ml-auto p-1.5 rounded-lg transition-colors ${c.closeBtn}`}
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2">
        <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${c.navLabel}`}>Menu</p>
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
                  isActive ? 'text-white shadow-[0_4px_15px_rgba(139,92,246,0.3)]' : c.navInactive
                }`}
                style={isActive ? { backgroundImage: `linear-gradient(to right, ${accentColor.from}, ${accentColor.to})` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon size={17} className={isActive ? 'text-white' : c.navIcon} />
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
      <div className={`p-3 border-t ${c.border}`}>
        <div className={`rounded-xl border p-3 flex items-center justify-between ${c.userCard}`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-700 to-violet-900 border border-purple-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-purple-200">
                {user?.nome?.substring(0, 2).toUpperCase() || 'US'}
              </span>
            </div>
            <div className="overflow-hidden">
              <p className={`text-xs font-bold truncate w-28 ${c.userName}`}>{user?.nome || 'Usuário'}</p>
              <p className={`text-[9px] uppercase tracking-wider truncate w-28 ${c.userRole}`}>
                {(user?.role && ROLE_LABEL[user.role]) || user?.role?.replace('_', ' ') || ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sair"
            className={`shrink-0 transition-colors ${isDark ? 'text-gray-700 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className={`min-h-screen flex font-sans ${c.page}`}>
      <Toaster richColors position="top-right" />

      {/* Sidebar — desktop fixa */}
      <aside className={`hidden lg:flex w-60 border-r h-screen fixed left-0 top-0 flex-col z-40 ${c.sidebar}`}>
        {SidebarContent}
      </aside>

      {/* Sidebar — drawer mobile/tablet */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className={`relative w-64 h-full flex flex-col border-r animate-in slide-in-from-left ${c.sidebar}`}>
            {SidebarContent}
          </aside>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-screen flex flex-col lg:ml-60">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
