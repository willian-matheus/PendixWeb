import { useState, useEffect } from 'react';
import { Bell, Clock, MessageCircle, FileCheck, CheckCheck } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas,
  type PendixNotificacao, type PendixNotificacaoTipo,
} from '../services/notificacoes';

const TIPO_CONFIG: Record<PendixNotificacaoTipo, { label: string; icon: React.ComponentType<any>; color: string }> = {
  pendencia_vencida:   { label: 'Pendência vencida',                 icon: Clock,         color: 'bg-red-500/15 text-red-400 border-red-500/20' },
  pendencia_proxima:   { label: 'Pendência próxima do vencimento',   icon: Bell,          color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  cliente_respondeu:   { label: 'Cliente respondeu',                 icon: MessageCircle, color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  documento_recebido:  { label: 'Documento recebido',                icon: FileCheck,     color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d atrás`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function PendixNotificacoes() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [notifs, setNotifs] = useState<PendixNotificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false);

  const c = {
    page:  isDark ? 'text-gray-200' : 'text-gray-900',
    card:  isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500' : 'text-gray-500',
    row:   isDark ? 'border-white/5 hover:bg-white/3' : 'border-gray-100 hover:bg-gray-50',
    unread: isDark ? 'bg-purple-500/[0.04]' : 'bg-purple-50/50',
  };

  async function load() {
    setLoading(true);
    try { setNotifs(await getPendixNotificacoes()); }
    catch { toast.error('Erro ao carregar notificações'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleMarcarLida(id: string) {
    await marcarNotificacaoLida(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  }

  async function handleMarcarTodas() {
    await marcarTodasNotificacoesLidas();
    setNotifs(prev => prev.map(n => ({ ...n, lida: true })));
    toast.success('Todas as notificações foram marcadas como lidas');
  }

  const visiveis = somenteNaoLidas ? notifs.filter(n => !n.lida) : notifs;
  const unreadCount = notifs.filter(n => !n.lida).length;

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Notificações</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>{unreadCount} não lida{unreadCount !== 1 ? 's' : ''} de {notifs.length}</p>
        </div>
        <button
          onClick={handleMarcarTodas}
          disabled={unreadCount === 0}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
        >
          <CheckCheck size={14} /> Marcar todas como lidas
        </button>
      </div>

      {/* Tabs estilo Gmail */}
      <div className="flex items-center gap-2 mb-5">
        {[
          { value: false, label: 'Todas' },
          { value: true, label: 'Não lidas' },
        ].map(tab => (
          <button
            key={String(tab.value)}
            onClick={() => setSomenteNaoLidas(tab.value)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-colors border ${
              somenteNaoLidas === tab.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : isDark ? 'border-white/10 text-gray-400 hover:border-white/20' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-16 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className={`p-14 text-center text-sm ${c.muted}`}>
            {somenteNaoLidas ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação.'}
          </div>
        ) : (
          visiveis.map((n, i) => {
            const cfg = TIPO_CONFIG[n.tipo];
            const Icon = cfg.icon;
            return (
              <button
                key={n.id}
                onClick={() => !n.lida && handleMarcarLida(n.id)}
                className={`w-full text-left flex items-start gap-4 px-5 py-4 border-b transition-colors ${c.row} ${!n.lida ? c.unread : ''} ${i === visiveis.length - 1 ? 'border-b-0' : ''}`}
              >
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${n.lida ? 'font-medium' : 'font-black'}`}>{n.titulo}</p>
                    <span className={`text-[10px] shrink-0 ${c.muted}`}>{timeAgo(n.created_at)}</span>
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${c.muted} ${n.lida ? '' : (isDark ? 'text-gray-300' : 'text-gray-700')}`}>{n.descricao}</p>
                </div>
                {!n.lida && <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0 mt-1.5" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
