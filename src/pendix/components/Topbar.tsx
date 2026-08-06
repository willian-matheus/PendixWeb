import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, ChevronDown, LogOut, Settings, Menu, Clock, MessageCircle, FileCheck } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';
import { useTheme } from '../../app/theme/ThemeProvider';
import { getPendixNotificacoes, marcarNotificacaoLida, type PendixNotificacao } from '../services/notificacoes';

const TIPO_ICON: Record<PendixNotificacao['tipo'], React.ComponentType<any>> = {
  pendencia_vencida: Clock,
  pendencia_proxima: Bell,
  cliente_respondeu: MessageCircle,
  documento_recebido: FileCheck,
};

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [notifs, setNotifs] = useState<PendixNotificacao[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const c = {
    header:      isDark ? 'border-white/[0.06] bg-[#06000f]/90'                 : 'border-gray-200 bg-white/90',
    menuBtn:     isDark ? 'text-gray-400 hover:bg-white/5 hover:text-white'     : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
    iconBtn:     isDark ? 'border-white/10 text-gray-400 hover:text-white hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-100',
    dropdown:    isDark ? 'border-white/10 bg-[#121018]'                        : 'border-gray-200 bg-white',
    dropdownHd:  isDark ? 'border-white/8'                                      : 'border-gray-100',
    dropdownRow: isDark ? 'border-white/5 hover:bg-white/5'                     : 'border-gray-50 hover:bg-gray-50',
    title:       isDark ? 'text-white'                                          : 'text-gray-900',
    muted:       isDark ? 'text-gray-500'                                       : 'text-gray-500',
    profileName: isDark ? 'text-gray-300'                                       : 'text-gray-700',
    chevron:     isDark ? 'text-gray-600'                                       : 'text-gray-400',
    menuLink:    isDark ? 'text-gray-300 hover:bg-white/5 hover:text-white'     : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
  };

  async function loadNotifs() {
    setNotifs(await getPendixNotificacoes());
  }

  useEffect(() => { loadNotifs(); }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unread = notifs.filter(n => !n.lida);

  async function handleReadOne(id: string) {
    await marcarNotificacaoLida(id);
    loadNotifs();
  }

  return (
    <header className={`sticky top-0 z-30 h-16 border-b backdrop-blur-xl flex items-center gap-3 px-4 md:px-6 ${c.header}`}>
      <button
        onClick={onMenuClick}
        className={`lg:hidden p-2 -ml-1 rounded-lg transition-colors shrink-0 ${c.menuBtn}`}
        aria-label="Abrir menu"
      >
        <Menu size={19} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className={`relative p-2.5 rounded-xl border transition-colors ${c.iconBtn}`}
            aria-label="Notificações"
          >
            <Bell size={16} />
            {unread.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-white text-[9px] font-black flex items-center justify-center">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className={`absolute right-0 mt-2 w-80 max-w-[85vw] rounded-2xl border shadow-2xl overflow-hidden ${c.dropdown}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${c.dropdownHd}`}>
                <span className={`text-sm font-bold ${c.title}`}>Notificações</span>
                <Link
                  to="/pendix/app/notificacoes"
                  onClick={() => setNotifOpen(false)}
                  className="text-[11px] font-bold text-purple-400 hover:text-purple-300"
                >
                  Ver todas
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifs.length === 0 ? (
                  <p className={`text-xs text-center py-8 ${c.muted}`}>Nenhuma notificação.</p>
                ) : (
                  notifs.slice(0, 5).map(n => {
                    const Icon = TIPO_ICON[n.tipo];
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleReadOne(n.id)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-colors ${c.dropdownRow} ${n.lida ? 'opacity-50' : ''}`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon size={12} className="text-purple-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold truncate ${c.title}`}>{n.titulo}</p>
                          <p className={`text-[11px] mt-0.5 line-clamp-2 leading-snug ${c.muted}`}>{n.descricao}</p>
                        </div>
                        {!n.lida && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0 mt-1.5" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Perfil */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-100'}`}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-700 to-violet-900 border border-purple-500/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-purple-200">
                {user?.nome?.substring(0, 2).toUpperCase() || 'US'}
              </span>
            </div>
            <span className={`hidden md:block text-xs font-semibold max-w-[100px] truncate ${c.profileName}`}>
              {user?.nome || 'Usuário'}
            </span>
            <ChevronDown size={12} className={`hidden md:block ${c.chevron}`} />
          </button>

          {profileOpen && (
            <div className={`absolute right-0 mt-2 w-52 rounded-2xl border shadow-2xl overflow-hidden ${c.dropdown}`}>
              <div className={`px-4 py-3 border-b ${c.dropdownHd}`}>
                <p className={`text-xs font-bold truncate ${c.title}`}>{user?.nome || 'Usuário'}</p>
                <p className={`text-[10px] truncate ${c.muted}`}>{user?.email}</p>
              </div>
              <Link
                to="/pendix/app/configuracoes"
                onClick={() => setProfileOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-colors ${c.menuLink}`}
              >
                <Settings size={13} /> Configurações
              </Link>
              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={13} /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
