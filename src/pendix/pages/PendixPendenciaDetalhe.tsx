import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, Ban,
  Building2, User, Phone, Mail, Paperclip, MessageCircle, FileText,
  PenSquare, PlusCircle,
} from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { toast } from 'sonner';
import {
  getPendixPendenciaPorId, updatePendixPendenciaStatus, addPendixHistorico, getPendenciaExtra,
  type PendixPendencia, type PendixPendenciaStatus,
} from '../services/pendix';
import { getPendixEmpresas, type PendixEmpresa } from '../services/empresas';

const STATUS_CONFIG: Record<PendixPendenciaStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pendente:   { label: 'Pendente',   color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',    icon: Clock },
  em_analise: { label: 'Em Análise', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20',          icon: MessageCircle },
  recebido:   { label: 'Recebido',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  rejeitado:  { label: 'Rejeitado',  color: 'bg-red-500/15 text-red-400 border-red-500/20',              icon: XCircle },
  cancelado:  { label: 'Cancelado',  color: 'bg-gray-500/15 text-gray-400 border-gray-500/20',           icon: Ban },
};

const PRIORIDADE_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const FREQ_LABEL: Record<string, string> = {
  unica: 'Uma vez', diaria: 'Diária', a_cada_2_dias: 'A cada 2 dias',
  semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal',
};

const TIMELINE_STEPS: { key: PendixPendenciaStatus | 'criada'; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'criada',     label: 'Pendência criada',        icon: PlusCircle },
  { key: 'em_analise', label: 'Cliente respondeu / em análise', icon: MessageCircle },
  { key: 'recebido',   label: 'Documento recebido',       icon: FileText },
];

export default function PendixPendenciaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [pendencia, setPendencia] = useState<PendixPendencia | null>(null);
  const [empresa, setEmpresa] = useState<PendixEmpresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const c = {
    page:  isDark ? 'text-gray-200' : 'text-gray-900',
    card:  isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500' : 'text-gray-500',
    label: isDark ? 'text-gray-400' : 'text-gray-600',
    line:  isDark ? 'bg-white/10' : 'bg-gray-200',
  };

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getPendixPendenciaPorId(id);
      setPendencia(p);
      const extra = getPendenciaExtra(id);
      if (extra.empresa_id) {
        const empresas = await getPendixEmpresas();
        setEmpresa(empresas.find(e => e.id === extra.empresa_id) ?? null);
      } else {
        setEmpresa(null);
      }
    } catch {
      toast.error('Pendência não encontrada');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className={c.page}>
        <div className="space-y-4">
          <div className={`h-8 w-48 rounded-lg animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
          <div className={`h-40 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-gray-100'}`} />
        </div>
      </div>
    );
  }

  if (!pendencia) {
    return (
      <div className={`${c.page} text-center py-20`}>
        <p className={c.muted}>Pendência não encontrada.</p>
        <Link to="/pendix/app/pendencias" className="text-purple-400 hover:text-purple-300 font-bold text-sm mt-3 inline-block">
          ← Voltar para pendências
        </Link>
      </div>
    );
  }

  const extra = getPendenciaExtra(pendencia.id);
  const cfg = STATUS_CONFIG[pendencia.status];
  const StatusIcon = cfg.icon;
  const cliente = pendencia.pendix_clientes as any;

  async function changeStatus(status: PendixPendenciaStatus) {
    if (!pendencia) return;
    setAtualizando(true);
    try {
      const updated = await updatePendixPendenciaStatus(pendencia.id, status);
      setPendencia({ ...pendencia, ...updated });
      await addPendixHistorico({
        escritorio_id: pendencia.escritorio_id, pendencia_id: pendencia.id, cliente_id: pendencia.cliente_id,
        acao: `Status alterado para ${STATUS_CONFIG[status].label}`,
      });
      toast.success(`Status: ${STATUS_CONFIG[status].label}`);
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setAtualizando(false); }
  }

  function cobrarWhatsApp() {
    if (!pendencia) return;
    const tel = cliente?.telefone;
    if (!tel) { toast.error('Cliente sem WhatsApp cadastrado'); return; }
    const num = '55' + tel.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá, identificamos que ainda não recebemos "${pendencia.nome_documento}". Por favor, envie o documento para prosseguirmos.`);
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
  }

  // Timeline — passos alcançados de acordo com o status atual.
  const ordem: PendixPendenciaStatus[] = ['pendente', 'em_analise', 'recebido'];
  const posicaoAtual = pendencia.status === 'cancelado' || pendencia.status === 'rejeitado' ? -1 : ordem.indexOf(pendencia.status);
  const stepAlcancado = (key: string) => {
    if (key === 'criada') return true;
    if (posicaoAtual === -1) return false;
    const idxOrdem = ordem.indexOf(key as PendixPendenciaStatus);
    return idxOrdem !== -1 && idxOrdem <= posicaoAtual;
  };

  return (
    <div className={c.page}>
      <button
        onClick={() => navigate('/pendix/app/pendencias')}
        className={`flex items-center gap-2 text-xs font-bold mb-6 transition-colors ${isDark ? 'text-gray-500 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
      >
        <ArrowLeft size={14} /> Voltar para pendências
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${cfg.color}`}>
              <StatusIcon size={11} /> {cfg.label}
            </span>
            {extra.prioridade && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/20">
                Prioridade {PRIORIDADE_LABEL[extra.prioridade]}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight">{pendencia.nome_documento}</h1>
          <p className={`text-sm mt-1 ${c.muted}`}>Competência {pendencia.competencia}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cobrarWhatsApp}
            className="flex items-center gap-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/20 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <MessageCircle size={14} /> Cobrar
          </button>
          <button
            onClick={() => navigate('/pendix/app/pendencias')}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <PenSquare size={14} /> Editar
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Dados gerais */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${c.label}`}>Dados gerais</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>Vencimento</p><p className="text-sm">{pendencia.data_limite || '—'}</p></div>
              <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>Data inicial da cobrança</p><p className="text-sm">{extra.data_inicio_cobranca || '—'}</p></div>
              <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>Frequência de cobrança</p><p className="text-sm">{extra.frequencia_cobranca ? FREQ_LABEL[extra.frequencia_cobranca] : '—'}</p></div>
              <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>Tipo</p><p className="text-sm capitalize">{extra.tipo === 'empresa' ? 'Empresa' : 'Cliente'}</p></div>
            </div>
            {extra.descricao && (
              <div className="mt-4">
                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.label}`}>Descrição</p>
                <p className="text-sm leading-relaxed">{extra.descricao}</p>
              </div>
            )}
          </div>

          {/* Observações */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${c.label}`}>Observações</p>
            <p className="text-sm leading-relaxed">{pendencia.observacoes || 'Nenhuma observação registrada.'}</p>
          </div>

          {/* Timeline */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-5 ${c.label}`}>Timeline</p>
            <div className="space-y-0">
              {TIMELINE_STEPS.map((step, idx) => {
                const alcancado = stepAlcancado(step.key);
                const Icon = step.icon;
                return (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${alcancado ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : `${isDark ? 'bg-white/5 border-white/10 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-300'}`}`}>
                        <Icon size={14} />
                      </div>
                      {idx < TIMELINE_STEPS.length - 1 && <div className={`w-px flex-1 min-h-[24px] ${alcancado ? 'bg-purple-500/30' : c.line}`} />}
                    </div>
                    <div className="pb-6">
                      <p className={`text-sm font-semibold ${alcancado ? '' : c.muted}`}>{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Cliente */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <div className="flex items-center gap-2 mb-4">
              <User size={14} className="text-purple-400" />
              <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Cliente</p>
            </div>
            <p className="text-sm font-bold mb-2">{cliente?.nome ?? '—'}</p>
            {cliente?.telefone && (
              <div className="flex items-center gap-2 text-xs">
                <Phone size={12} className={c.muted} /> {cliente.telefone}
              </div>
            )}
          </div>

          {/* Empresa */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={14} className="text-blue-400" />
              <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Empresa</p>
            </div>
            {empresa ? (
              <>
                <p className="text-sm font-bold mb-2">{empresa.nome}</p>
                {empresa.telefone && <div className="flex items-center gap-2 text-xs mb-1"><Phone size={12} className={c.muted} /> {empresa.telefone}</div>}
                {empresa.email && <div className="flex items-center gap-2 text-xs"><Mail size={12} className={c.muted} /> {empresa.email}</div>}
              </>
            ) : (
              <p className={`text-xs ${c.muted}`}>Pendência individual, sem empresa vinculada.</p>
            )}
          </div>

          {/* Anexos */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <div className="flex items-center gap-2 mb-4">
              <Paperclip size={14} className="text-purple-400" />
              <p className={`text-xs font-bold uppercase tracking-widest ${c.label}`}>Anexos</p>
            </div>
            {extra.anexo_nome ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-100'}`}>
                <FileText size={13} className="text-purple-400 shrink-0" />
                <span className="truncate">{extra.anexo_nome}</span>
              </div>
            ) : (
              <p className={`text-xs ${c.muted}`}>Nenhum anexo de exemplo enviado.</p>
            )}
          </div>

          {/* Alterar status */}
          <div className={`rounded-2xl border p-5 ${c.card}`}>
            <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${c.label}`}>Alterar status</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(STATUS_CONFIG) as [PendixPendenciaStatus, typeof STATUS_CONFIG[PendixPendenciaStatus]][]).map(([s, cfg2]) => (
                <button
                  key={s}
                  disabled={pendencia.status === s || atualizando}
                  onClick={() => changeStatus(s)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all disabled:opacity-40 ${pendencia.status === s ? cfg2.color : (isDark ? 'border-white/10 text-gray-400 hover:border-white/20' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}
                >
                  {cfg2.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
