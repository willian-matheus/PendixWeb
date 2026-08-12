import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import {
  Users, Building2, ClipboardList, AlertTriangle, CheckCheck,
  Plus, ArrowRight, Clock, RefreshCw, CalendarClock, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixStats, getPendixPendencias, getPendixClientes, getPendixHistorico,
  gerarPendenciasMes, getPendixPendenciasPorMes,
  type PendixPendencia, type PendixCliente, type PendixHistoricoEntry,
} from '../services/pendix';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', em_analise: 'Em Análise', recebido: 'Recebido',
  rejeitado: 'Rejeitado', cancelado: 'Cancelado',
};
const STATUS_COLOR: Record<string, string> = {
  pendente:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  em_analise: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  recebido:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  rejeitado:  'bg-red-500/15 text-red-400 border-red-500/20',
  cancelado:  'bg-gray-500/15 text-gray-400 border-gray-500/20',
};
const STATUS_HEX: Record<string, string> = {
  pendente: '#eab308', em_analise: '#3b82f6', recebido: '#10b981',
  rejeitado: '#ef4444', cancelado: '#6b7280',
};
const PRIORIDADE_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const PRIORIDADE_HEX: Record<string, string> = { baixa: '#6b7280', media: '#3b82f6', alta: '#f97316', urgente: '#ef4444' };

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PendixDashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [stats, setStats] = useState({ totalClientes: 0, totalEmpresas: 0, pendenciasAbertas: 0, vencidas: 0, concluidas: 0 });
  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [atividades, setAtividades] = useState<PendixHistoricoEntry[]>([]);
  const [mesesData, setMesesData] = useState<{ mes: string; pendencias: number }[]>([]);
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
    // Promise.allSettled em vez de Promise.all: antes, se qualquer uma das
    // 4 chamadas falhasse, NENHUM state era atualizado e o dashboard inteiro
    // ficava zerado mesmo quando 3 das 4 tinham dado certo.
    const [s, p, cl, hist] = await Promise.allSettled([
      getPendixStats(),
      // Sem filtro de competência — os cards de "Total"/"Vencidas" já são
      // globais, e o resto do dashboard (gráficos, Próximas Cobranças)
      // precisa usar o mesmo escopo, senão os números não batem e
      // pendências vencidas de meses anteriores ficam invisíveis.
      getPendixPendencias(),
      getPendixClientes(),
      getPendixHistorico(),
    ]);

    if (s.status === 'fulfilled') setStats(s.value);
    else console.error('dashboard: falha ao carregar stats', s.reason);

    if (p.status === 'fulfilled') setPendencias(p.value);
    else console.error('dashboard: falha ao carregar pendências', p.reason);

    if (cl.status === 'fulfilled') setClientes(cl.value);
    else console.error('dashboard: falha ao carregar clientes', cl.reason);

    if (hist.status === 'fulfilled') setAtividades(hist.value.slice(0, 6));
    else console.error('dashboard: falha ao carregar histórico', hist.reason);

    if ([s, p, cl, hist].some(r => r.status === 'rejected')) {
      toast.error('Alguns dados do Pendix não puderam ser carregados — tente atualizar.');
    }
    setLoading(false);
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
    { label: 'Total de Clientes',       value: stats.totalClientes,     icon: Users,          color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: 'Total de Empresas',       value: stats.totalEmpresas,     icon: Building2,       color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Pendências Abertas',      value: stats.pendenciasAbertas, icon: ClipboardList,   color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Pendências Vencidas',     value: stats.vencidas,          icon: AlertTriangle,   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Pendências Concluídas',   value: stats.concluidas,        icon: CheckCheck,      color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  ];

  const porStatusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pendencias) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return Object.entries(counts).map(([status, value]) => ({ name: STATUS_LABEL[status] ?? status, value, color: STATUS_HEX[status] ?? '#8b5cf6' }));
  }, [pendencias]);

  const porPrioridadeData = useMemo(() => {
    const counts: Record<string, number> = { baixa: 0, media: 0, alta: 0, urgente: 0 };
    for (const p of pendencias) {
      const prio = p.prioridade ?? 'media';
      counts[prio] = (counts[prio] ?? 0) + 1;
    }
    return Object.entries(counts).map(([k, value]) => ({ name: PRIORIDADE_LABEL[k], value, color: PRIORIDADE_HEX[k] }));
  }, [pendencias]);

  const porMesData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pendencias) counts[p.competencia] = (counts[p.competencia] ?? 0) + 1;
    const competencias = Object.keys(counts).sort().slice(-6);
    return competencias.map(comp => {
      const [ano, mes] = comp.split('-');
      const label = new Date(Number(ano), Number(mes) - 1, 1)
        .toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', '');
      return { mes: label.charAt(0).toUpperCase() + label.slice(1), pendencias: counts[comp] };
    });
  }, [pendencias]);

  const proximasCobrancas = pendencias
    .filter(p => p.data_limite && (p.status === 'pendente' || p.status === 'em_analise'))
    .sort((a, b) => (a.data_limite! < b.data_limite! ? -1 : 1))
    .slice(0, 6);

  const axisColor = isDark ? '#6b7280' : '#9ca3af';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb';
  const tooltipTextColor = isDark ? '#e5e7eb' : '#111827';
  const tooltipStyle = {
    contentStyle: { background: isDark ? '#18181b' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 12, fontSize: 12 },
    labelStyle: { color: tooltipTextColor },
    itemStyle: { color: tooltipTextColor },
  };

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>Visão geral de todas as pendências em aberto</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
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

      {/* Gráficos */}
      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <div className={`rounded-2xl border p-5 ${c.card}`}>
          <p className="text-sm font-bold mb-4">Pendências por status</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={porStatusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                {porStatusData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className={`rounded-2xl border p-5 ${c.card}`}>
          <p className="text-sm font-bold mb-4">Pendências por prioridade</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porPrioridadeData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {porPrioridadeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`rounded-2xl border p-5 ${c.card}`}>
          <p className="text-sm font-bold mb-4">Pendências por mês</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porMesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="pendencias" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Últimas atividades */}
        <div className={`md:col-span-2 rounded-2xl border ${c.card}`}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-purple-400" />
              <span className="text-sm font-bold">Últimas Atividades</span>
            </div>
            <Link to="/pendix/app/historico" className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1">
              Ver todas <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
              ))}
            </div>
          ) : atividades.length === 0 ? (
            <div className={`p-10 text-center text-sm ${c.muted}`}>Nenhuma atividade registrada ainda.</div>
          ) : (
            <div>
              {atividades.map((a, i) => (
                <div key={a.id} className={`flex items-center gap-4 px-5 py-3.5 border-b transition-colors ${c.row} ${i === atividades.length - 1 ? 'border-b-0' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${c.badge}`}>
                    <Activity size={13} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{a.acao}</p>
                    {a.descricao && <p className={`text-xs truncate ${c.muted}`}>{a.descricao}</p>}
                  </div>
                  <span className={`text-[10px] shrink-0 ${c.muted}`}>{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas cobranças */}
        <div className={`rounded-2xl border ${c.card}`}>
          <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <CalendarClock size={15} className="text-purple-400" />
              <span className="text-sm font-bold">Próximas Cobranças</span>
            </div>
            <Link to="/pendix/app/pendencias" className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1">
              Ver todas <ArrowRight size={11} />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`h-10 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
              ))}
            </div>
          ) : proximasCobrancas.length === 0 ? (
            <div className={`p-8 text-center text-sm ${c.muted}`}>Nenhuma cobrança agendada.</div>
          ) : (
            <div>
              {proximasCobrancas.map((p, i) => (
                <Link
                  key={p.id}
                  to={`/pendix/app/pendencias/${p.id}`}
                  className={`flex items-center gap-3 px-5 py-3 border-b transition-colors ${c.row} ${i === proximasCobrancas.length - 1 ? 'border-b-0' : ''}`}
                >
                  <Clock size={13} className={c.muted} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{p.nome_documento}</p>
                    <p className={`text-[10px] truncate ${c.muted}`}>{(p.pendix_clientes as any)?.nome ?? '—'}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 ${STATUS_COLOR[p.status]}`}>
                    {p.data_limite}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
