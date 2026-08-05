import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Eye, Trash2, X, Building2, Mail, Phone } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixEmpresas, postPendixEmpresa, updatePendixEmpresa, deletePendixEmpresa,
  type PendixEmpresa, type PendixEmpresaStatus,
} from '../services/empresas';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../app/components/ui/alert-dialog';

const STATUS_OPTIONS: { value: PendixEmpresaStatus; label: string }[] = [
  { value: 'ativa', label: 'Ativa' },
  { value: 'inativa', label: 'Inativa' },
];
const STATUS_BADGE: Record<PendixEmpresaStatus, string> = {
  ativa: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  inativa: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

const EMPTY: Omit<PendixEmpresa, 'id' | 'created_at' | 'updated_at'> = {
  nome: '', telefone: '', email: '', observacoes: '', status: 'ativa',
};

export default function PendixEmpresas() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [empresas, setEmpresas] = useState<PendixEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<PendixEmpresa | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [visualizando, setVisualizando] = useState<PendixEmpresa | null>(null);
  const [excluindo, setExcluindo] = useState<{ id: string; nome: string } | null>(null);

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

  async function load() {
    setLoading(true);
    try { setEmpresas(await getPendixEmpresas()); }
    catch { toast.error('Erro ao carregar empresas'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openModal(empresa?: PendixEmpresa) {
    if (empresa) { setEditando(empresa); setForm({ ...empresa }); }
    else { setEditando(null); setForm(EMPTY); }
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Nome da empresa é obrigatório'); return; }
    setSaving(true);
    try {
      if (editando) {
        const updated = await updatePendixEmpresa(editando.id, form);
        setEmpresas(prev => prev.map(e => e.id === editando.id ? updated : e));
        toast.success('Empresa atualizada');
      } else {
        const nova = await postPendixEmpresa(form);
        setEmpresas(prev => [...prev, nova]);
        toast.success('Empresa cadastrada');
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
      await deletePendixEmpresa(excluindo.id);
      setEmpresas(prev => prev.filter(e => e.id !== excluindo.id));
      toast.success('Empresa removida');
    } catch { toast.error('Erro ao remover empresa'); }
    finally { setExcluindo(null); }
  }

  const filtered = empresas.filter(e =>
    (!filterStatus || e.status === filterStatus) &&
    (e.nome.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className={c.page}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Pendix</span>
          <h1 className="text-2xl font-black tracking-tight mt-1">Empresas</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>{empresas.length} empresa{empresas.length !== 1 ? 's' : ''} cadastrada{empresas.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={15} /> Nova Empresa
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-5">
        <div className="relative">
          <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${c.muted}`} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
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
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={`p-14 text-center text-sm ${c.muted}`}>
            {search || filterStatus ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada.'}
          </div>
        ) : (
          filtered.map((em, i) => (
            <div
              key={em.id}
              className={`flex items-center gap-4 px-5 py-4 border-b transition-colors ${c.row} ${i === filtered.length - 1 ? 'border-b-0' : ''}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                <Building2 size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{em.nome}</p>
                <p className={`text-xs truncate ${c.muted}`}>{em.email || em.telefone || '—'}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${STATUS_BADGE[em.status]}`}>
                  {em.status === 'ativa' ? 'Ativa' : 'Inativa'}
                </span>
                <button onClick={() => setVisualizando(em)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-purple-400 hover:bg-purple-500/10' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}>
                  <Eye size={13} />
                </button>
                <button onClick={() => openModal(em)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                  <Edit2 size={13} />
                </button>
                <button onClick={() => setExcluindo({ id: em.id, nome: em.nome })} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Cadastro/Edição */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl ${c.modal}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/8' : 'border-gray-100'}`}>
              <h2 className="text-base font-black">{editando ? 'Editar Empresa' : 'Nova Empresa'}</h2>
              <button onClick={() => setModalOpen(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/8' : 'hover:bg-gray-100'}`}>
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Nome da empresa *</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Razão Social"
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Telefone</label>
                  <input
                    value={form.telefone}
                    onChange={e => setForm(prev => ({ ...prev, telefone: e.target.value }))}
                    placeholder="(11) 3333-4444"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="contato@empresa.com"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.input}`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(prev => ({ ...prev, status: e.target.value as PendixEmpresaStatus }))}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition ${c.select}`}
                >
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
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
                {visualizando.status === 'ativa' ? 'Ativa' : 'Inativa'}
              </span>
              <div className="flex items-center gap-2 text-sm">
                <Phone size={13} className={c.muted} /> {visualizando.telefone || '—'}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail size={13} className={c.muted} /> {visualizando.email || '—'}
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

      <AlertDialog open={!!excluindo} onOpenChange={() => setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{excluindo?.nome}</strong>? Clientes vinculados a ela perdem o vínculo.
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
