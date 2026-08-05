import { useState, useEffect } from 'react';
import { Search, RefreshCw, Clock, MessageCircle, FileCheck, Edit3, Trash2, CheckCircle2, Brain } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import { getPendixHistorico, getPendixClientes, type PendixHistoricoEntry, type PendixCliente } from '../services/pendix';

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

function acaoIcon(acao: string) {
  if (acao.toLowerCase().includes('whatsapp')) return MessageCircle;
  if (acao.toLowerCase().includes('recebido')) return FileCheck;
  if (acao.toLowerCase().includes('análise')) return Brain;
  if (acao.toLowerCase().includes('status')) return CheckCircle2;
  if (acao.toLowerCase().includes('remov') || acao.toLowerCase().includes('exclu')) return Trash2;
  if (acao.toLowerCase().includes('cria') || acao.toLowerCase().includes('gera')) return CheckCircle2;
  return Edit3;
}

function acaoColor(acao: string, isDark: boolean) {
  if (acao.toLowerCase().includes('whatsapp')) return isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600';
  if (acao.toLowerCase().includes('recebido')) return isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600';
  if (acao.toLowerCase().includes('análise')) return isDark ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600';
  if (acao.toLowerCase().includes('rejeit')) return isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600';
  return isDark ? 'bg-white/8 text-gray-400' : 'bg-gray-100 text-gray-500';
}

type TipoAcao = 'criacao' | 'edicao' | 'status' | 'cobranca' | 'exclusao' | 'outro';

const TIPO_OPTIONS: { value: TipoAcao; label: string }[] = [
  { value: 'criacao',  label: 'Criação' },
  { value: 'edicao',   label: 'Edição' },
  { value: 'status',   label: 'Alteração de status' },
  { value: 'cobranca', label: 'Cobrança' },
  { value: 'exclusao', label: 'Exclusão' },
  { value: 'outro',    label: 'Outros' },
];

function tipoDeAcao(acao: string): TipoAcao {
  const a = acao.toLowerCase();
  if (a.includes('cria') || a.includes('gera')) return 'criacao';
  if (a.includes('whatsapp') || a.includes('cobran')) return 'cobranca';
  if (a.includes('status')) return 'status';
  if (a.includes('remov') || a.includes('exclu') || a.includes('cancel')) return 'exclusao';
  if (a.includes('edit') || a.includes('atualiz')) return 'edicao';
  return 'outro';
}

function groupByDate(entries: PendixHistoricoEntry[]) {
  const groups: Record<string, PendixHistoricoEntry[]> = {};
  for (const e of entries) {
    const date = new Date(e.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return groups;
}

export default function PendixHistorico() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [historico, setHistorico] = useState<PendixHistoricoEntry[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterData, setFilterData] = useState('');
  const [filterTipo, setFilterTipo] = useState<TipoAcao | ''>('');

  const c = {
    page:   isDark ? 'text-gray-200'               : 'text-gray-900',
    muted:  isDark ? 'text-gray-500'               : 'text-gray-500',
    card:   isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    input:  isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    select: isDark ? 'bg-[#1a1a1a] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900',
    line:   isDark ? 'bg-white/8' : 'bg-gray-200',
    dot:    isDark ? 'bg-purple-500' : 'bg-purple-500',
    dateLabel: isDark ? 'text-gray-600' : 'text-gray-400',
  };

  async function load() {
    setLoading(true);
    try {
      const [h, cl] = await Promise.all([
        getPendixHistorico({ clienteId: filterCliente || undefined }),
        clientes.length ? Promise.resolve(clientes) : getPendixClientes(),
      ]);
      setHistorico(h);
      if (!clientes.length) setClientes(cl);
    } catch {
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterCliente]);

  const filtered = historico.filter(e => {
    if (filterTipo && tipoDeAcao(e.acao) !== filterTipo) return false;
    if (filterData && e.created_at.slice(0, 10) !== filterData) return false;
    if (!search) return true;
    return (
      e.acao.toLowerCase().includes(search.toLowerCase()) ||
      (e.descricao ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.usuario_nome ?? '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const groups = groupByDate(filtered);

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Histórico</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>{filtered.length} registros</p>
        </div>
        <button
          onClick={load}
          className={`p-2.5 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-purple-400' : c.muted} />
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="relative md:col-span-1">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${c.muted}`} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ação, descrição ou usuário..."
            className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
          />
        </div>
        <select
          value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
          className={`rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todos os clientes</option>
          {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
        </select>
        <select
          value={filterTipo} onChange={e => setFilterTipo(e.target.value as TipoAcao | '')}
          className={`rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todos os tipos de ação</option>
          {TIPO_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="date" value={filterData} onChange={e => setFilterData(e.target.value)}
          className={`rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
        />
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={`py-20 text-center text-sm ${c.muted}`}>
          Nenhum registro encontrado.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([date, entries]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                <p className={`text-xs font-bold uppercase tracking-widest ${c.dateLabel}`}>{date}</p>
                <div className={`flex-1 h-px ${c.line}`} />
              </div>
              <div className="space-y-2 pl-5">
                {entries.map(e => {
                  const Icon = acaoIcon(e.acao);
                  const color = acaoColor(e.acao, isDark);
                  return (
                    <div key={e.id} className={`flex items-start gap-4 p-4 rounded-2xl border ${c.card}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-tight">{e.acao}</p>
                          <div className={`flex items-center gap-1 shrink-0 text-[10px] ${c.muted}`}>
                            <Clock size={10} />
                            {timeAgo(e.created_at)}
                          </div>
                        </div>
                        {e.descricao && (
                          <p className={`text-xs mt-1 leading-relaxed ${c.muted}`}>{e.descricao}</p>
                        )}
                        {e.usuario_nome && (
                          <p className={`text-[10px] mt-1.5 font-bold uppercase tracking-widest ${c.muted}`}>
                            por {e.usuario_nome}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
