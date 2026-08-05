import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  Users, ClipboardList, AlertTriangle, CheckCircle2,
  Plus, ArrowRight, Clock, RefreshCw, TrendingUp,
} from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixStats, getPendixPendencias, getPendixClientes,
  gerarPendenciasMes,
  type PendixPendencia, type PendixCliente,
} from '../services/pendix';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', recebido: 'Recebido',
  em_analise: 'Em análise', rejeitado: 'Rejeitado', cancelado: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  pendente:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  recebido:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  em_analise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  rejeitado:  'bg-red-500/15 text-red-400 border-red-500/20',
  cancelado:  'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PendixDashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [stats, setStats] = useState({ clientesAtivos: 0, pendenciasAbertas: 0, vencidas: 0, recebidosHoje: 0 });
  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const competencia = mesAtual();

  const c = {
    page:  isDark ? 'text-gray-200' : 'text-gray-900',
    card:  isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500' : 'text-gray-500',
    sub:   isDark ? 'text-gray-400' : 'text-gray-600',
    row:   isDark ? 'border-white/5 hover:bg-white/3' : 'border-gray-100 hover:bg-gray-50',
    badge: isDark ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600',
  };

  async function load() {
    setLoading(true);
    try {
      const [s, p, cl] = await Promise.all([
        getPendixStats(),
        getPendixPendencias({ competencia }),
        getPendixClientes(),
      ]);
      setStats(s);
      setPendencias(p.slice(0, 10));
      setClientes(cl);
    } catch {
      toast.error('Erro ao carregar dados do Pendix');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleGerarTodos() {
    const semDocs = 'Gere documentos por cliente na tela de Clientes primeiro.';
    if (!clientes.length) { toast.info(semDocs); return; }
    try {
      let total = 0;
      for (const cl of clientes.filter(c => c.status === 'ativo')) {
        setGerandoId(cl.id);
        const geradas = await gerarPendenciasMes(cl.id, competencia);
        total += geradas.length;
      }
      toast.success(`${total} pendências geradas para ${competencia}`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar pendências');
    } finally {
      setGerandoId(null);
    }
  }

  const STATS = [
    { label: 'Clientes Ativos', value: stats.clientesAtivos, icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: 'Pendências Abertas', value: stats.pendenciasAbertas, icon: ClipboardList, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Vencidas', value: stats.vencidas, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Recebidos Hoje', value: stats.recebidosHoje, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ];

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Módulo</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Pendix — Dashboard</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>Visão geral de pendências — competência {competencia}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className={`p-2.5 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            <RefreshCw size={15} className={gerandoId ? 'animate-spin text-purple-400' : c.muted} />
          </button>
          <button
            onClick={handleGerarTodos}
            disabled={!!gerandoId}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            <Plus size={15} />
            Gerar Pendências do Mês
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STATS.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-2xl border p-5 ${c.card}`}>
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${bg}`}>
              <Icon size={18} className={color} />
            </div>
            <p className="text-2xl font-black">{loading ? '—' : value}</p>
            <p className={`text-xs mt-1 ${c.muted}`}>{label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Últimas pendências */}
        <div className={`md:col-span-2 rounded-2xl border ${c.card}`}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-purple-400" />
              <span className="text-sm font-bold">Pendências Recentes</span>
            </div>
            <Link to="/pendix/app/pendencias" className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1">
              Ver todas <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
              ))}
            </div>
          ) : pendencias.length === 0 ? (
            <div className={`p-10 text-center text-sm ${c.muted}`}>
              Nenhuma pendência no mês atual.<br />
              <button onClick={handleGerarTodos} className="mt-2 text-purple-400 hover:text-purple-300 font-bold text-xs">
                Gerar agora →
              </button>
            </div>
          ) : (
            <div>
              {pendencias.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-3.5 border-b transition-colors ${c.row} ${i === pendencias.length - 1 ? 'border-b-0' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.nome_documento}</p>
                    <p className={`text-xs truncate ${c.muted}`}>{(p.pendix_clientes as any)?.nome ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {p.data_limite && (
                      <span className={`text-xs ${c.muted}`}>até {p.data_limite}</span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clientes com mais pendências */}
        <div className={`rounded-2xl border ${c.card}`}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-purple-400" />
              <span className="text-sm font-bold">Clientes</span>
            </div>
            <Link to="/pendix/app/clientes" className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1">
              Gerenciar <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`h-10 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
              ))}
            </div>
          ) : clientes.length === 0 ? (
            <div className={`p-8 text-center text-sm ${c.muted}`}>
              Nenhum cliente cadastrado.
              <Link to="/pendix/app/clientes" className="block mt-2 text-purple-400 font-bold text-xs">
                Cadastrar agora →
              </Link>
            </div>
          ) : (
            <div>
              {clientes.slice(0, 8).map((cl, i) => {
                const count = pendencias.filter(p => p.cliente_id === cl.id && p.status === 'pendente').length;
                return (
                  <div key={cl.id} className={`flex items-center gap-3 px-5 py-3 border-b transition-colors ${c.row} ${i === Math.min(clientes.length, 8) - 1 ? 'border-b-0' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isDark ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                      {cl.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{cl.nome}</p>
                      <p className={`text-[10px] ${c.muted}`}>{cl.regime?.replace('_', ' ') ?? '—'}</p>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] font-black bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
