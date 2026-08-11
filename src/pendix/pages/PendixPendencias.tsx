import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Search, MessageCircle, CheckCircle2, XCircle, Ban,
  Eye, Edit2, Trash2, RefreshCw, Plus, X, Clock, Paperclip, Smartphone,
} from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixPendencias, updatePendixPendenciaStatus, updatePendixPendenciaCampos, deletePendixPendencia,
  getPendixClientes, postPendixPendencia, addPendixHistorico,
  getPendenciaExtra, savePendenciaExtra,
  type PendixPendencia, type PendixPendenciaStatus, type PendixCliente,
  type PendixPendenciaTipo, type PendixPrioridade,
} from '../services/pendix';
import { getPendixEmpresas, getClienteEmpresaLinks, getClientesIdsDaEmpresa, type PendixEmpresa } from '../services/empresas';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../app/components/ui/alert-dialog';

const STATUS_CONFIG: Record<PendixPendenciaStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',    icon: Clock },
  em_analise: { label: 'Em Análise', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',          icon: MessageCircle },
  recebido:   { label: 'Recebido',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  rejeitado:  { label: 'Rejeitado',  color: 'bg-red-500/15 text-red-400 border-red-500/20',              icon: XCircle },
  cancelado:  { label: 'Cancelado',  color: 'bg-gray-500/15 text-gray-400 border-gray-500/20',           icon: Ban },
};

const PRIORIDADE_OPTIONS: { value: PendixPrioridade; label: string; color: string }[] = [
  { value: 'baixa',   label: 'Baixa',   color: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
  { value: 'media',   label: 'Média',   color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  { value: 'alta',    label: 'Alta',    color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  { value: 'urgente', label: 'Urgente', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
];

const MAX_NOTIFICACOES_EXTRA = 3;

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function meses() {
  const result = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

const EMPTY_FORM = {
  tipo: 'cliente' as PendixPendenciaTipo,
  clienteId: '',
  empresaId: '',
  escopoEmpresa: 'especifico' as 'especifico' | 'todos',
  titulo: '',
  descricao: '',
  prioridade: 'media' as PendixPrioridade,
  competencia: mesAtual(),
  dataVencimento: '',
  dataInicioCobranca: '',
  horarioNotificacao: '09:00',
  notificarMultiplasVezes: false,
  datasNotificacao: ['', '', ''] as string[],
  anexoNome: '',
  observacaoInterna: '',
};

export default function PendixPendencias() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [empresas, setEmpresas] = useState<PendixEmpresa[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('busca') ?? '');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState('');
  const [filterCompetencia, setFilterCompetencia] = useState(mesAtual());
  const [filterData, setFilterData] = useState('');

  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<PendixPendencia | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [salvando, setSalvando] = useState(false);

  const c = {
    page:   isDark ? 'text-gray-200'                    : 'text-gray-900',
    card:   isDark ? 'bg-[#121212] border-white/8'      : 'bg-white border-gray-200',
    muted:  isDark ? 'text-gray-500'                    : 'text-gray-500',
    row:    isDark ? 'border-white/5 hover:bg-white/3'  : 'border-gray-100 hover:bg-gray-50',
    input:  isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    select: isDark ? 'bg-[#1a1a1a] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900',
    modal:  isDark ? 'bg-[#18181b] border-white/10'     : 'bg-white border-gray-200',
    label:  isDark ? 'text-gray-400'                    : 'text-gray-600',
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cl, emp] = await Promise.all([
        getPendixPendencias({
          clienteId: filterCliente || undefined,
          status: filterStatus || undefined,
          competencia: filterCompetencia || undefined,
          search: search || undefined,
        }),
        clientes.length ? Promise.resolve(clientes) : getPendixClientes(),
        empresas.length ? Promise.resolve(empresas) : getPendixEmpresas(),
      ]);
      setPendencias(p);
      if (!clientes.length) setClientes(cl);
      if (!empresas.length) setEmpresas(emp);
      setLinks(getClienteEmpresaLinks());
    } catch {
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [filterCliente, filterStatus, filterCompetencia, search]);

  useEffect(() => { load(); }, [load]);

  const visiveis = pendencias.filter(p => {
    if (filterPrioridade && p.prioridade !== filterPrioridade) return false;
    if (filterData && p.data_limite !== filterData) return false;
    if (filterEmpresa) {
      const empresaDaPendencia = getPendenciaExtra(p.id).empresa_id ?? links[p.cliente_id];
      if (empresaDaPendencia !== filterEmpresa) return false;
    }
    return true;
  });

  async function changeStatus(p: PendixPendencia, status: PendixPendenciaStatus) {
    setAtualizando(p.id);
    try {
      const updated = await updatePendixPendenciaStatus(p.id, status);
      setPendencias(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x));
      await addPendixHistorico({
        escritorio_id: p.escritorio_id,
        pendencia_id: p.id,
        cliente_id: p.cliente_id,
        acao: `Status alterado para ${STATUS_CONFIG[status].label}`,
      });
      toast.success(`Status: ${STATUS_CONFIG[status].label}`);
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setAtualizando(null); }
  }

  async function handleDelete() {
    if (!excluindo) return;
    try {
      await deletePendixPendencia(excluindo.id);
      setPendencias(prev => prev.filter(p => p.id !== excluindo.id));
      toast.success('Pendência removida');
    } catch { toast.error('Erro ao remover'); }
    finally { setExcluindo(null); }
  }

  function cobrarWhatsApp(p: PendixPendencia) {
    const tel = (p.pendix_clientes as any)?.telefone;
    if (!tel) { toast.error('Cliente sem número de WhatsApp cadastrado'); return; }
    const num = '55' + tel.replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Olá, identificamos que ainda não recebemos "${p.nome_documento}" referente à competência ${p.competencia}. Por favor, envie o documento para prosseguirmos.`
    );
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
    addPendixHistorico({
      escritorio_id: p.escritorio_id, pendencia_id: p.id, cliente_id: p.cliente_id,
      acao: 'Cobrança enviada via WhatsApp',
      descricao: `Competência ${p.competencia} — ${p.nome_documento}`,
    });
  }

  function openNovaModal() {
    setEditandoId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditarModal(p: PendixPendencia) {
    const extra = getPendenciaExtra(p.id);
    setEditandoId(p.id);
    setForm({
      tipo: p.tipo ?? 'cliente',
      clienteId: p.cliente_id,
      empresaId: extra.empresa_id ?? '',
      escopoEmpresa: 'especifico',
      titulo: p.nome_documento,
      descricao: p.descricao ?? '',
      prioridade: p.prioridade ?? 'media',
      competencia: p.competencia,
      dataVencimento: p.data_limite ?? '',
      dataInicioCobranca: p.data_inicio_cobranca ?? '',
      horarioNotificacao: p.horario_notificacao?.slice(0, 5) || '09:00',
      notificarMultiplasVezes: (p.datas_notificacao?.length ?? 0) > 0,
      datasNotificacao: Array.from({ length: MAX_NOTIFICACOES_EXTRA }, (_, i) => p.datas_notificacao?.[i] ?? ''),
      anexoNome: p.arquivo_modelo_nome ?? '',
      observacaoInterna: p.observacoes ?? '',
    });
    setModalOpen(true);
  }

  const clientesDaEmpresaSelecionada = form.empresaId
    ? clientes.filter(cl => links[cl.id] === form.empresaId)
    : [];

  async function handleSalvar() {
    if (!form.titulo.trim()) { toast.error('Título da pendência é obrigatório'); return; }
    if (form.tipo === 'cliente' && !form.clienteId) { toast.error('Selecione um cliente'); return; }
    if (form.tipo === 'empresa' && !form.empresaId) { toast.error('Selecione uma empresa'); return; }
    if (form.tipo === 'empresa' && form.escopoEmpresa === 'especifico' && !form.clienteId) { toast.error('Selecione o cliente da empresa'); return; }

    setSalvando(true);
    try {
      const camposReais = {
        tipo: form.tipo,
        descricao: form.descricao || undefined,
        prioridade: form.prioridade,
        data_inicio_cobranca: form.dataInicioCobranca || undefined,
        horario_notificacao: form.horarioNotificacao || '09:00',
        arquivo_modelo_nome: form.anexoNome || undefined,
        datas_notificacao: form.notificarMultiplasVezes ? form.datasNotificacao.filter(Boolean) : [],
      };
      const extraLocal = {
        empresa_id: form.tipo === 'empresa' ? form.empresaId : undefined,
      };

      if (editandoId) {
        const updated = await updatePendixPendenciaCampos(editandoId, {
          nome_documento: form.titulo,
          competencia: form.competencia,
          data_limite: form.dataVencimento || undefined,
          observacoes: form.observacaoInterna || undefined,
          ...camposReais,
        });
        savePendenciaExtra(editandoId, extraLocal);
        setPendencias(prev => prev.map(p => p.id === editandoId ? updated : p));
        toast.success('Pendência atualizada');
      } else if (form.tipo === 'empresa' && form.escopoEmpresa === 'todos') {
        const idsClientes = getClientesIdsDaEmpresa(form.empresaId).filter(id => clientes.some(cl => cl.id === id));
        if (!idsClientes.length) { toast.error('Nenhum cliente vinculado a essa empresa'); setSalvando(false); return; }
        const criadas: PendixPendencia[] = [];
        for (const clienteId of idsClientes) {
          const nova = await postPendixPendencia({
            escritorio_id: '', cliente_id: clienteId, nome_documento: form.titulo,
            competencia: form.competencia, status: 'pendente',
            data_limite: form.dataVencimento || undefined, observacoes: form.observacaoInterna || undefined,
            ...camposReais,
          } as any);
          savePendenciaExtra(nova.id, extraLocal);
          criadas.push(nova);
        }
        setPendencias(prev => [...criadas, ...prev]);
        toast.success(`${criadas.length} pendências criadas para os clientes da empresa`);
      } else {
        const nova = await postPendixPendencia({
          escritorio_id: '', cliente_id: form.clienteId, nome_documento: form.titulo,
          competencia: form.competencia, status: 'pendente',
          data_limite: form.dataVencimento || undefined, observacoes: form.observacaoInterna || undefined,
          ...camposReais,
        } as any);
        savePendenciaExtra(nova.id, extraLocal);
        setPendencias(prev => [nova, ...prev]);
        toast.success('Pendência criada');
      }
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar pendência');
    } finally {
      setSalvando(false);
    }
  }

  const counts = {
    pendente: pendencias.filter(p => p.status === 'pendente').length,
    em_analise: pendencias.filter(p => p.status === 'em_analise').length,
    recebido: pendencias.filter(p => p.status === 'recebido').length,
    rejeitado: pendencias.filter(p => p.status === 'rejeitado').length,
    cancelado: pendencias.filter(p => p.status === 'cancelado').length,
  };

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Central de Pendências</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
            <RefreshCw size={14} className={loading ? 'animate-spin text-purple-400' : c.muted} />
          </button>
          <button
            onClick={openNovaModal}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus size={14} /> Nova Pendência
          </button>
        </div>
      </div>

      {/* Contadores rápidos */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.entries(counts) as [PendixPendenciaStatus, number][]).map(([s, n]) => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-xs font-bold transition-all ${filterStatus === s ? cfg.color : (isDark ? 'border-white/10 text-gray-400 hover:border-white/20' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}
            >
              <Icon size={12} /> {cfg.label} · {n}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <div className="relative xl:col-span-1">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${c.muted}`} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
          />
        </div>
        <select
          value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todos os clientes</option>
          {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
        </select>
        <select
          value={filterEmpresa} onChange={e => setFilterEmpresa(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todas as empresas</option>
          {empresas.map(em => <option key={em.id} value={em.id}>{em.nome}</option>)}
        </select>
        <select
          value={filterPrioridade} onChange={e => setFilterPrioridade(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Toda prioridade</option>
          {PRIORIDADE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={filterCompetencia} onChange={e => setFilterCompetencia(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todas as competências</option>
          {meses().map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          type="date" value={filterData} onChange={e => setFilterData(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
        />
      </div>

      {/* Lista */}
      <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className={`p-14 text-center text-sm ${c.muted}`}>Nenhuma pendência encontrada com os filtros selecionados.</div>
        ) : (
          visiveis.map((p, i) => {
            const cfg = STATUS_CONFIG[p.status];
            const Icon = cfg.icon;
            const prio = p.prioridade ? PRIORIDADE_OPTIONS.find(x => x.value === p.prioridade) : null;
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/pendix/app/pendencias/${p.id}`)}
                className={`flex items-center gap-4 px-5 py-3.5 border-b transition-colors cursor-pointer ${c.row} ${i === visiveis.length - 1 ? 'border-b-0' : ''}`}
              >
                <Icon size={15} className={cfg.color.split(' ')[1]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{p.nome_documento}</p>
                    {p.origem === 'whatsapp' && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-widest shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/20 flex items-center gap-1">
                        <Smartphone size={8} /> WhatsApp
                      </span>
                    )}
                    {prio && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${prio.color}`}>
                        {prio.label}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${c.muted}`}>
                    {(p.pendix_clientes as any)?.nome ?? '—'} · {p.competencia}
                    {p.data_limite && ` · até ${p.data_limite}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border mr-1 ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  {(p.status === 'pendente' || p.status === 'em_analise') && (
                    <button onClick={() => changeStatus(p, 'recebido')} disabled={atualizando === p.id} title="Marcar como recebido"
                      className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                      <CheckCircle2 size={13} />
                    </button>
                  )}
                  <button onClick={() => cobrarWhatsApp(p)} title="Cobrar via WhatsApp"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                    <MessageCircle size={13} />
                  </button>
                  <button onClick={() => navigate(`/pendix/app/pendencias/${p.id}`)} title="Visualizar"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                    <Eye size={13} />
                  </button>
                  <button onClick={() => openEditarModal(p)} title="Editar"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setExcluindo(p)} title="Remover"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nova / Editar Pendência */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-xl rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">{editandoId ? 'Editar Pendência' : 'Nova Pendência'}</h2>
              <button onClick={() => setModalOpen(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {!editandoId && (
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['cliente', 'empresa'] as PendixPendenciaTipo[]).map(t => (
                      <button
                        key={t} type="button"
                        onClick={() => setForm(p => ({ ...p, tipo: t, clienteId: '', empresaId: '' }))}
                        className={`px-4 py-2.5 rounded-xl border text-sm font-bold capitalize transition-colors ${form.tipo === t ? 'bg-purple-600 border-purple-600 text-white' : `${c.select} ${isDark ? 'hover:border-white/20' : 'hover:border-gray-300'}`}`}
                      >
                        {t === 'cliente' ? 'Cliente' : 'Empresa'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.tipo === 'cliente' && (
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Cliente *</label>
                  <select
                    value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                  >
                    <option value="">Selecionar cliente</option>
                    {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                  </select>
                </div>
              )}

              {form.tipo === 'empresa' && (
                <>
                  <div>
                    <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Empresa *</label>
                    <select
                      value={form.empresaId} onChange={e => setForm(p => ({ ...p, empresaId: e.target.value, clienteId: '' }))}
                      className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                    >
                      <option value="">Selecionar empresa</option>
                      {empresas.map(em => <option key={em.id} value={em.id}>{em.nome}</option>)}
                    </select>
                  </div>
                  {form.empresaId && (
                    <div>
                      <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Abrangência</label>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <button type="button" onClick={() => setForm(p => ({ ...p, escopoEmpresa: 'especifico' }))}
                          className={`px-4 py-2 rounded-xl border text-xs font-bold transition-colors ${form.escopoEmpresa === 'especifico' ? 'bg-purple-600 border-purple-600 text-white' : c.select}`}>
                          Cliente específico
                        </button>
                        <button type="button" onClick={() => setForm(p => ({ ...p, escopoEmpresa: 'todos' }))}
                          className={`px-4 py-2 rounded-xl border text-xs font-bold transition-colors ${form.escopoEmpresa === 'todos' ? 'bg-purple-600 border-purple-600 text-white' : c.select}`}>
                          Todos os clientes da empresa
                        </button>
                      </div>
                      {form.escopoEmpresa === 'especifico' && (
                        <select
                          value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                        >
                          <option value="">Selecionar cliente da empresa</option>
                          {clientesDaEmpresaSelecionada.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Título da pendência *</label>
                <input
                  value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex: Extrato Bancário"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Descrição</label>
                <textarea
                  value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  rows={2} placeholder="Detalhes sobre o que deve ser enviado..."
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none transition ${c.input}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Prioridade</label>
                  <select
                    value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value as PendixPrioridade }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                  >
                    {PRIORIDADE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Competência</label>
                  <input
                    type="month" value={form.competencia} onChange={e => setForm(p => ({ ...p, competencia: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Data de vencimento</label>
                  <input
                    type="date" value={form.dataVencimento} onChange={e => setForm(p => ({ ...p, dataVencimento: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Data inicial da cobrança</label>
                  <input
                    type="date" value={form.dataInicioCobranca} onChange={e => setForm(p => ({ ...p, dataInicioCobranca: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Horário de notificação</label>
                <input
                  type="time" value={form.horarioNotificacao} onChange={e => setForm(p => ({ ...p, horarioNotificacao: e.target.value }))}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                />
                <p className={`text-[10px] mt-1 ${c.muted}`}>Horário em que a cobrança inicial e os lembretes via WhatsApp serão enviados automaticamente.</p>
              </div>

              <div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.notificarMultiplasVezes}
                    onChange={e => setForm(p => ({ ...p, notificarMultiplasVezes: e.target.checked, datasNotificacao: e.target.checked ? p.datasNotificacao : ['', '', ''] }))}
                    className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
                  />
                  <span className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Notificar mais de uma vez (até {MAX_NOTIFICACOES_EXTRA}x)</span>
                </label>
                {form.notificarMultiplasVezes && (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {form.datasNotificacao.map((data, i) => (
                      <div key={i}>
                        <label className={`block text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>{i + 1}ª notificação</label>
                        <input
                          type="date" value={data}
                          onChange={e => setForm(p => {
                            const datasNotificacao = [...p.datasNotificacao];
                            datasNotificacao[i] = e.target.value;
                            return { ...p, datasNotificacao };
                          })}
                          className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Anexo de exemplo</label>
                <label className={`flex items-center gap-2 w-full rounded-xl border px-4 py-2.5 text-sm cursor-pointer transition ${c.input}`}>
                  <Paperclip size={14} className={c.muted} />
                  <span className={form.anexoNome ? '' : c.muted}>{form.anexoNome || 'Selecionar arquivo de exemplo...'}</span>
                  <input
                    type="file" className="hidden"
                    onChange={e => setForm(p => ({ ...p, anexoNome: e.target.files?.[0]?.name ?? '' }))}
                  />
                </label>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Observação interna</label>
                <textarea
                  value={form.observacaoInterna} onChange={e => setForm(p => ({ ...p, observacaoInterna: e.target.value }))}
                  rows={2} placeholder="Visível apenas para a equipe..."
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none transition ${c.input}`}
                />
              </div>
            </div>
            <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button onClick={() => setModalOpen(false)} className={`px-5 py-2.5 text-sm font-bold rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={salvando}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!excluindo} onOpenChange={() => setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover pendência</AlertDialogTitle>
            <AlertDialogDescription>
              Remover "{excluindo?.nome_documento}" de {(excluindo?.pendix_clientes as any)?.nome ?? 'cliente'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
