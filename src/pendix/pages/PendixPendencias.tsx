import { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, MessageCircle, CheckCircle2, XCircle,
  Eye, Trash2, RefreshCw, Plus, X, Clock, Brain,
} from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixPendencias, updatePendixPendenciaStatus, deletePendixPendencia,
  getPendixClientes, postPendixPendencia, addPendixHistorico,
  type PendixPendencia, type PendixPendenciaStatus, type PendixCliente,
} from '../services/pendix';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../app/components/ui/alert-dialog';

const STATUS_CONFIG: Record<PendixPendenciaStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',   icon: Clock },
  recebido:   { label: 'Recebido',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  em_analise: { label: 'Em análise', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20',   icon: Brain },
  rejeitado:  { label: 'Rejeitado',  color: 'bg-red-500/15 text-red-400 border-red-500/20',             icon: XCircle },
  cancelado:  { label: 'Cancelado',  color: 'bg-gray-500/15 text-gray-400 border-gray-500/20',          icon: X },
};

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

export default function PendixPendencias() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [pendencias, setPendencias] = useState<PendixPendencia[]>([]);
  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterCompetencia, setFilterCompetencia] = useState(mesAtual());

  const [detalhes, setDetalhes] = useState<PendixPendencia | null>(null);
  const [obsText, setObsText] = useState('');
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<PendixPendencia | null>(null);

  const [novaOpen, setNovaOpen] = useState(false);
  const [novaForm, setNovaForm] = useState({ cliente_id: '', nome_documento: '', competencia: mesAtual(), data_limite: '' });
  const [salvandoNova, setSalvandoNova] = useState(false);

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
      const [p, cl] = await Promise.all([
        getPendixPendencias({
          clienteId: filterCliente || undefined,
          status: filterStatus || undefined,
          competencia: filterCompetencia || undefined,
          search: search || undefined,
        }),
        clientes.length ? Promise.resolve(clientes) : getPendixClientes(),
      ]);
      setPendencias(p);
      if (!clientes.length) setClientes(cl);
    } catch {
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [filterCliente, filterStatus, filterCompetencia, search]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(p: PendixPendencia, status: PendixPendenciaStatus, obs?: string) {
    setAtualizando(p.id);
    try {
      const updated = await updatePendixPendenciaStatus(p.id, status, obs);
      setPendencias(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x));
      await addPendixHistorico({
        escritorio_id: p.escritorio_id,
        pendencia_id: p.id,
        cliente_id: p.cliente_id,
        acao: `Status alterado para ${STATUS_CONFIG[status].label}`,
        descricao: obs,
      });
      toast.success(`Status: ${STATUS_CONFIG[status].label}`);
      if (detalhes?.id === p.id) setDetalhes({ ...detalhes, status, observacoes: obs ?? detalhes.observacoes });
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

  async function handleSalvarNova() {
    if (!novaForm.cliente_id || !novaForm.nome_documento) {
      toast.error('Cliente e nome do documento são obrigatórios');
      return;
    }
    setSalvandoNova(true);
    try {
      const nova = await postPendixPendencia({
        escritorio_id: '',
        ...novaForm,
        status: 'pendente',
      });
      setPendencias(prev => [nova, ...prev]);
      toast.success('Pendência criada');
      setNovaOpen(false);
      setNovaForm({ cliente_id: '', nome_documento: '', competencia: mesAtual(), data_limite: '' });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar pendência');
    } finally {
      setSalvandoNova(false);
    }
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

  const counts = {
    pendente: pendencias.filter(p => p.status === 'pendente').length,
    recebido: pendencias.filter(p => p.status === 'recebido').length,
    em_analise: pendencias.filter(p => p.status === 'em_analise').length,
    rejeitado: pendencias.filter(p => p.status === 'rejeitado').length,
  };

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Central de Pendências</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className={`p-2.5 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
            <RefreshCw size={14} className={loading ? 'animate-spin text-purple-400' : c.muted} />
          </button>
          <button
            onClick={() => setNovaOpen(true)}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="relative">
          <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2 ${c.muted}`} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar documento ou cliente..."
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
          value={filterCompetencia} onChange={e => setFilterCompetencia(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todas as competências</option>
          {meses().map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : pendencias.length === 0 ? (
          <div className={`p-14 text-center text-sm ${c.muted}`}>Nenhuma pendência encontrada com os filtros selecionados.</div>
        ) : (
          pendencias.map((p, i) => {
            const cfg = STATUS_CONFIG[p.status];
            const Icon = cfg.icon;
            const isVencida = p.data_limite && p.status === 'pendente' && new Date(p.data_limite) < new Date();
            return (
              <div key={p.id} className={`flex items-center gap-4 px-5 py-3.5 border-b transition-colors ${c.row} ${i === pendencias.length - 1 ? 'border-b-0' : ''}`}>
                <Icon size={15} className={cfg.color.split(' ')[1]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{p.nome_documento}</p>
                    {isVencida && (
                      <span className="text-[9px] font-black bg-red-500/15 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                        Vencida
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${c.muted}`}>
                    {(p.pendix_clientes as any)?.nome ?? '—'} · {p.competencia}
                    {p.data_limite && ` · até ${p.data_limite}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  {/* Ações rápidas de status */}
                  {p.status === 'pendente' && (
                    <button
                      onClick={() => changeStatus(p, 'recebido')}
                      disabled={atualizando === p.id}
                      title="Marcar como recebido"
                      className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  {p.status === 'recebido' && (
                    <button
                      onClick={() => changeStatus(p, 'em_analise')}
                      disabled={atualizando === p.id}
                      title="Marcar como em análise"
                      className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
                    >
                      <Brain size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => cobrarWhatsApp(p)}
                    title="Cobrar via WhatsApp"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                  >
                    <MessageCircle size={14} />
                  </button>
                  <button
                    onClick={() => { setDetalhes(p); setObsText(p.observacoes ?? ''); }}
                    title="Ver detalhes"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => setExcluindo(p)}
                    title="Remover"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Detalhes */}
      {detalhes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">Detalhes da Pendência</h2>
              <button onClick={() => setDetalhes(null)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Documento</p>
                <p className="text-sm font-semibold">{detalhes.nome_documento}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Cliente</p>
                  <p className="text-sm">{(detalhes.pendix_clientes as any)?.nome ?? '—'}</p>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Competência</p>
                  <p className="text-sm">{detalhes.competencia}</p>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Data Limite</p>
                  <p className="text-sm">{detalhes.data_limite ?? '—'}</p>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Status</p>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_CONFIG[detalhes.status].color}`}>
                    {STATUS_CONFIG[detalhes.status].label}
                  </span>
                </div>
              </div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Observações</p>
                <textarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  rows={3}
                  placeholder="Adicionar observação..."
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none transition ${c.input}`}
                />
              </div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${c.label}`}>Alterar Status</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(STATUS_CONFIG) as [PendixPendenciaStatus, typeof STATUS_CONFIG[PendixPendenciaStatus]][]).map(([s, cfg]) => (
                    <button
                      key={s}
                      disabled={detalhes.status === s || atualizando === detalhes.id}
                      onClick={() => changeStatus(detalhes, s, obsText)}
                      className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all disabled:opacity-40 ${detalhes.status === s ? cfg.color : (isDark ? 'border-white/10 text-gray-400 hover:border-white/20' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={`flex justify-between gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button
                onClick={() => cobrarWhatsApp(detalhes)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 transition-colors"
              >
                <MessageCircle size={14} /> Cobrar no WhatsApp
              </button>
              <button
                onClick={() => changeStatus(detalhes, detalhes.status, obsText)}
                disabled={atualizando === detalhes.id}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                Salvar Observação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Pendência */}
      {novaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">Nova Pendência</h2>
              <button onClick={() => setNovaOpen(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Cliente *</label>
                <select
                  value={novaForm.cliente_id}
                  onChange={e => setNovaForm(p => ({ ...p, cliente_id: e.target.value }))}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                >
                  <option value="">Selecionar cliente</option>
                  {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Documento *</label>
                <input
                  value={novaForm.nome_documento}
                  onChange={e => setNovaForm(p => ({ ...p, nome_documento: e.target.value }))}
                  placeholder="Ex: Extrato Bancário"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Competência</label>
                  <input
                    type="month" value={novaForm.competencia}
                    onChange={e => setNovaForm(p => ({ ...p, competencia: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Data Limite</label>
                  <input
                    type="date" value={novaForm.data_limite}
                    onChange={e => setNovaForm(p => ({ ...p, data_limite: e.target.value }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              </div>
            </div>
            <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button onClick={() => setNovaOpen(false)} className={`px-5 py-2.5 text-sm font-bold rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                Cancelar
              </button>
              <button
                onClick={handleSalvarNova}
                disabled={salvandoNova}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                {salvandoNova ? 'Criando...' : 'Criar'}
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
