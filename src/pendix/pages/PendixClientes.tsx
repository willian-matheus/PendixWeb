import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Eye, Trash2, ChevronDown, ChevronUp, FileText, X, Building2, Mail, Phone } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { useAuth } from '../../app/auth/AuthProvider';
import { toast } from 'sonner';
import {
  getPendixClientes, postPendixCliente, updatePendixCliente, deletePendixCliente,
  getPendixDocConfigs, postPendixDocConfig, deletePendixDocConfig,
  type PendixCliente, type PendixDocConfig, type PendixRegime, type PendixClienteStatus, type PendixClienteTipo, type PendixPrioridade, type PendixFrequencia,
} from '../services/pendix';
import {
  getPendixEmpresas, type PendixEmpresa,
} from '../services/empresas';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../app/components/ui/alert-dialog';

const REGIMES: { value: PendixRegime; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];
const STATUS_OPTIONS: { value: PendixClienteStatus; label: string }[] = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'suspenso', label: 'Suspenso' },
];
const TIPO_OPTIONS: { value: PendixClienteTipo; label: string }[] = [
  { value: 'pessoa', label: 'Cliente' },
  { value: 'empresa', label: 'Empresa' },
];
const PRIORIDADES: { value: PendixPrioridade; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];
const FREQ_OPTIONS: { value: PendixFrequencia; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'unico', label: 'Único' },
];

const STATUS_BADGE: Record<PendixClienteStatus, string> = {
  ativo:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  inativo:  'bg-gray-500/15 text-gray-400 border-gray-500/20',
  suspenso: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
};

const EMPTY_CLIENTE: Omit<PendixCliente, 'id' | 'created_at' | 'updated_at'> = {
  escritorio_id: '', nome: '', responsavel: '', telefone: '', email: '',
  regime: 'simples_nacional', status: 'ativo', observacoes: '', tipo: 'pessoa', empresa_id: null,
};
const EMPTY_DOC: Omit<PendixDocConfig, 'id' | 'created_at' | 'escritorio_id'> = {
  cliente_id: '', nome: '', frequencia: 'mensal', dia_limite: 10, prioridade: 'media', ativo: true,
};

export default function PendixClientes() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === 'dark';

  const [clientes, setClientes] = useState<PendixCliente[]>([]);
  const [empresas, setEmpresas] = useState<PendixEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, PendixDocConfig[]>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<PendixCliente | null>(null);
  const [form, setForm] = useState(EMPTY_CLIENTE);
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [saving, setSaving] = useState(false);

  const [visualizando, setVisualizando] = useState<PendixCliente | null>(null);

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docClienteId, setDocClienteId] = useState<string | null>(null);
  const [docForm, setDocForm] = useState(EMPTY_DOC);
  const [savingDoc, setSavingDoc] = useState(false);

  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);

  const c = {
    page:    isDark ? 'text-gray-200'                    : 'text-gray-900',
    card:    isDark ? 'bg-[#121212] border-white/8'      : 'bg-white border-gray-200',
    muted:   isDark ? 'text-gray-500'                    : 'text-gray-500',
    row:     isDark ? 'border-white/5 hover:bg-white/3'  : 'border-gray-100 hover:bg-gray-50',
    input:   isDark ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    select:  isDark ? 'bg-[#1a1a1a] border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900',
    modal:   isDark ? 'bg-[#18181b] border-white/10'     : 'bg-white border-gray-200',
    label:   isDark ? 'text-gray-400'                    : 'text-gray-600',
    subcard: isDark ? 'bg-white/3 border-white/5'        : 'bg-gray-50 border-gray-100',
  };

  async function load() {
    setLoading(true);
    try {
      const [cl, emp] = await Promise.all([getPendixClientes(), getPendixEmpresas()]);
      setClientes(cl);
      setEmpresas(emp);
    }
    catch { toast.error('Erro ao carregar clientes'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function expandCliente(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!docs[id]) {
      try {
        const d = await getPendixDocConfigs(id);
        setDocs(prev => ({ ...prev, [id]: d }));
      } catch { toast.error('Erro ao carregar documentos'); }
    }
  }

  function openModal(cliente?: PendixCliente) {
    if (cliente) { setEditando(cliente); setForm({ ...cliente }); setFormEmpresaId(cliente.empresa_id || ''); }
    else { setEditando(null); setForm({ ...EMPTY_CLIENTE, escritorio_id: (user as any)?.officeId || '' }); setFormEmpresaId(''); }
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    try {
      const formData = { ...form, empresa_id: formEmpresaId || null };
      if (editando) {
        const updated = await updatePendixCliente(editando.id, formData);
        setClientes(prev => prev.map(c => c.id === editando.id ? updated : c));
        toast.success('Cliente atualizado');
      } else {
        const novo = await postPendixCliente(formData);
        setClientes(prev => [...prev, novo]);
        toast.success('Cliente cadastrado');
      }
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!excluindo) return;
    try {
      await deletePendixCliente(excluindo.id);
      setClientes(prev => prev.filter(c => c.id !== excluindo.id));
      toast.success('Cliente removido');
    } catch { toast.error('Erro ao remover cliente'); }
    finally { setExcluindo(null); }
  }

  function openDocModal(clienteId: string) {
    setDocClienteId(clienteId);
    setDocForm({ ...EMPTY_DOC, cliente_id: clienteId });
    setDocModalOpen(true);
  }

  async function handleSaveDoc() {
    if (!docForm.nome.trim()) { toast.error('Nome do documento é obrigatório'); return; }
    setSavingDoc(true);
    try {
      const novo = await postPendixDocConfig({ ...docForm, cliente_id: docClienteId! });
      setDocs(prev => ({ ...prev, [docClienteId!]: [...(prev[docClienteId!] ?? []), novo] }));
      toast.success('Documento adicionado');
      setDocModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar documento');
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleDeleteDoc(docId: string, clienteId: string) {
    try {
      await deletePendixDocConfig(docId);
      setDocs(prev => ({ ...prev, [clienteId]: (prev[clienteId] ?? []).filter(d => d.id !== docId) }));
      toast.success('Documento removido');
    } catch { toast.error('Erro ao remover documento'); }
  }

  const filtered = clientes.filter(c =>
    (!filterStatus || c.status === filterStatus) &&
    (
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.responsavel?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Clientes</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>{clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={15} /> Novo Cliente
        </button>
      </div>

      {/* Search + filtro de status */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-5">
        <div className="relative">
          <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${c.muted}`} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, responsável ou e-mail..."
            className={`w-full rounded-xl border pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
          />
        </div>
        <select
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className={`rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
        >
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className={`rounded-2xl border overflow-hidden ${c.card}`}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`p-14 text-center text-sm ${c.muted}`}>
            {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
          </div>
        ) : (
          filtered.map((cl) => (
            <div key={cl.id}>
              {/* Linha do cliente */}
              <div
                className={`flex items-center gap-4 px-5 py-4 border-b cursor-pointer transition-colors select-none ${c.row}`}
                onClick={() => expandCliente(cl.id)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${isDark ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                  {cl.nome.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{cl.nome}</p>
                  <p className={`text-xs truncate ${c.muted}`}>{cl.responsavel || cl.email || '—'}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`hidden md:block text-xs ${c.muted}`}>{REGIMES.find(r => r.value === cl.regime)?.label ?? '—'}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_BADGE[cl.status]}`}>
                    {cl.status}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setVisualizando(cl); }}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); openModal(cl); }}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setExcluindo({ id: cl.id, nome: cl.nome }); }}
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                  >
                    <Trash2 size={13} />
                  </button>
                  {expandedId === cl.id ? <ChevronUp size={14} className={c.muted} /> : <ChevronDown size={14} className={c.muted} />}
                </div>
              </div>

              {/* Expansão — documentos */}
              {expandedId === cl.id && (
                <div className={`px-5 py-4 border-b ${isDark ? 'bg-white/2 border-white/5' : 'bg-gray-50/80 border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`text-xs font-bold uppercase tracking-widest ${c.muted}`}>Documentos obrigatórios</p>
                    <button
                      onClick={() => openDocModal(cl.id)}
                      className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-bold"
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                  {(docs[cl.id] ?? []).length === 0 ? (
                    <p className={`text-xs ${c.muted}`}>Nenhum documento configurado.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(docs[cl.id] ?? []).map(doc => (
                        <div key={doc.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${c.subcard}`}>
                          <FileText size={11} className="text-purple-400" />
                          <span className="font-medium">{doc.nome}</span>
                          <span className={c.muted}>· dia {doc.dia_limite}</span>
                          <button
                            onClick={() => handleDeleteDoc(doc.id, cl.id)}
                            className={`ml-1 ${c.muted} hover:text-red-400 transition-colors`}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {cl.telefone && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`text-xs ${c.muted}`}>WhatsApp:</span>
                      <a
                        href={`https://wa.me/55${cl.telefone.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-bold"
                      >
                        {cl.telefone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal Cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">{editando ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {([
                { label: 'Nome da empresa *', field: 'nome', type: 'text', placeholder: 'Razão Social / Nome' },
                { label: 'Responsável', field: 'responsavel', type: 'text', placeholder: 'Nome do responsável' },
                { label: 'WhatsApp', field: 'telefone', type: 'tel', placeholder: '(11) 99999-9999' },
                { label: 'E-mail', field: 'email', type: 'email', placeholder: 'email@empresa.com' },
              ] as { label: string; field: keyof typeof form; type: string; placeholder: string }[]).map(({ label, field, type, placeholder }) => (
                <div key={field}>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>{label}</label>
                  <input
                    type={type}
                    value={(form as any)[field] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              ))}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Tipo</label>
                <select
                  value={form.tipo ?? 'pessoa'}
                  onChange={e => setForm(prev => ({ ...prev, tipo: e.target.value as PendixClienteTipo }))}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                >
                  {TIPO_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Empresa vinculada (opcional)</label>
                <select
                  value={formEmpresaId}
                  onChange={e => setFormEmpresaId(e.target.value)}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                >
                  <option value="">Nenhuma</option>
                  {empresas.map(em => <option key={em.id} value={em.id}>{em.nome}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Regime</label>
                  <select
                    value={form.regime}
                    onChange={e => setForm(prev => ({ ...prev, regime: e.target.value as PendixRegime }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                  >
                    {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(prev => ({ ...prev, status: e.target.value as PendixClienteStatus }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
                  rows={3}
                  placeholder="Informações adicionais..."
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none transition ${c.input}`}
                />
              </div>
            </div>
            <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button onClick={() => setModalOpen(false)} className={`px-5 py-2.5 text-sm font-bold rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Documento */}
      {docModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">Novo Documento</h2>
              <button onClick={() => setDocModalOpen(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Nome do Documento *</label>
                <input
                  value={docForm.nome}
                  onChange={e => setDocForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Extrato Bancário"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Frequência</label>
                  <select
                    value={docForm.frequencia}
                    onChange={e => setDocForm(prev => ({ ...prev, frequencia: e.target.value as PendixFrequencia }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                  >
                    {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Dia Limite</label>
                  <input
                    type="number" min={1} max={31}
                    value={docForm.dia_limite}
                    onChange={e => setDocForm(prev => ({ ...prev, dia_limite: Number(e.target.value) }))}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Prioridade</label>
                <select
                  value={docForm.prioridade}
                  onChange={e => setDocForm(prev => ({ ...prev, prioridade: e.target.value as PendixPrioridade }))}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                >
                  {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button onClick={() => setDocModalOpen(false)} className={`px-5 py-2.5 text-sm font-bold rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}`}>
                Cancelar
              </button>
              <button
                onClick={handleSaveDoc}
                disabled={savingDoc}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
              >
                {savingDoc ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizar */}
      {visualizando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">{visualizando.nome}</h2>
              <button onClick={() => setVisualizando(null)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_BADGE[visualizando.status]}`}>
                {visualizando.status}
              </span>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Responsável</p>
                  <p>{visualizando.responsavel || '—'}</p>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Regime</p>
                  <p>{REGIMES.find(r => r.value === visualizando.regime)?.label ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone size={13} className={c.muted} /> {visualizando.telefone || '—'}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail size={13} className={c.muted} /> {visualizando.email || '—'}
              </div>
                <div className="flex items-center gap-2 text-sm">
                <Building2 size={13} className={c.muted} />
                {empresas.find(em => em.id === visualizando.empresa_id)?.nome || 'Nenhuma empresa vinculada'}
              </div>
              {visualizando.observacoes && (
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${c.label}`}>Observações</p>
                  <p className="text-sm leading-relaxed">{visualizando.observacoes}</p>
                </div>
              )}
            </div>
            <div className={`flex justify-end gap-3 px-6 py-4 border-t ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <button
                onClick={() => { openModal(visualizando); setVisualizando(null); }}
                className="px-5 py-2.5 text-sm font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert excluir */}
      <AlertDialog open={!!excluindo} onOpenChange={() => setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{excluindo?.nome}</strong>? Todas as pendências e documentos associados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
