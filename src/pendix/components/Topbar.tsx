import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search, Bell, ChevronDown, LogOut, Settings, Menu, Clock, MessageCircle, FileCheck } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthProvider';
import { getPendixNotificacoes, marcarNotificacaoLida, type PendixNotificacao } from '../services/notificacoes';

const TIPO_ICON: Record<PendixNotificacao['tipo'], React.ComponentType<any>> = {
  pendencia_vencida: Clock,
  pendencia_proxima: Bell,
  cliente_respondeu: MessageCircle,
  documento_recebido: FileCheck,
};

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [notifs, setNotifs] = useState<PendixNotificacao[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/pendix/app/pendencias?busca=${encodeURIComponent(search.trim())}`);
  }

  async function handleReadOne(id: string) {
    await marcarNotificacaoLida(id);
    loadNotifs();
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-white/[0.06] bg-[#06000f]/90 backdrop-blur-xl flex items-center gap-3 px-4 md:px-6">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-1 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
        aria-label="Abrir menu"
      >
        <Menu size={19} />
      </button>

      <form onSubmit={handleSearch} className="flex-1 max-w-md relative hidden sm:block">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar clientes, empresas, pendências..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/40 transition"
        />
      </form>

      <div className="flex-1 sm:hidden" />

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
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
            <div className="absolute right-0 mt-2 w-80 max-w-[85vw] rounded-2xl border border-white/10 bg-[#121018] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                <span className="text-sm font-bold text-white">Notificações</span>
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
                  <p className="text-xs text-gray-500 text-center py-8">Nenhuma notificação.</p>
                ) : (
                  notifs.slice(0, 5).map(n => {
                    const Icon = TIPO_ICON[n.tipo];
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleReadOne(n.id)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors ${n.lida ? 'opacity-50' : ''}`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon size={12} className="text-purple-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{n.titulo}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">{n.descricao}</p>
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
            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-700 to-violet-900 border border-purple-500/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-purple-200">
                {user?.nome?.substring(0, 2).toUpperCase() || 'US'}
              </span>
            </div>
            <span className="hidden md:block text-xs font-semibold text-gray-300 max-w-[100px] truncate">
              {user?.nome || 'Usuário'}
            </span>
            <ChevronDown size={12} className="text-gray-600 hidden md:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/10 bg-[#121018] shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/8">
                <p className="text-xs font-bold text-white truncate">{user?.nome || 'Usuário'}</p>
                <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
              </div>
              <Link
                to="/pendix/app/configuracoes"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
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
