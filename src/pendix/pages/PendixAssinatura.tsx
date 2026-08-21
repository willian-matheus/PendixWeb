import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { CreditCard, KeyRound, ShieldCheck, AlertTriangle, Clock, ExternalLink, Check } from 'lucide-react';
import { useTheme } from '../../app/theme/ThemeProvider';
import { useAuth } from '../../app/auth/AuthProvider';
import { toast } from 'sonner';
import {
  getPlanos, getAssinatura, getPagamentos, contratarPlano,
  formatarValor, descreverCiclo, diasAteBloqueio, assinaturaEmDia, DIAS_CARENCIA,
  type PendixPlano, type PendixAssinatura, type PendixAssinaturaPagamento,
} from '../services/assinatura';
import { Spinner } from '../components/Loader';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * O aviso do topo. É a única coisa que muda de verdade entre os estados da
 * assinatura, então mora numa função só — espalhar isso por seis `if` na
 * árvore de JSX é o caminho curto para os estados discordarem entre si.
 */
function avisoDoStatus(a: PendixAssinatura | null, dias: number | null) {
  if (!a || a.status === 'sem_assinatura') {
    return {
      tom: 'neutro' as const,
      icone: CreditCard,
      titulo: 'Escolha um plano para começar',
      texto: 'O acesso ao Pendix é liberado assim que a assinatura for confirmada.',
    };
  }
  if (a.status === 'pendente') {
    return {
      tom: 'atencao' as const,
      icone: Clock,
      titulo: 'Aguardando a confirmação do pagamento',
      texto: 'Você já iniciou a contratação. Assim que o Mercado Pago confirmar, o acesso é liberado automaticamente — pode levar alguns minutos.',
    };
  }
  if (a.status === 'ativa' && dias !== null && dias < 0) {
    return {
      tom: 'erro' as const,
      icone: AlertTriangle,
      titulo: 'Assinatura bloqueada',
      texto: `O vencimento em ${formatarData(a.vencimento_em)} passou dos ${DIAS_CARENCIA} dias de tolerância. Regularize o pagamento para reabrir o acesso.`,
    };
  }
  if (a.status === 'ativa') {
    return {
      tom: 'ok' as const,
      icone: ShieldCheck,
      titulo: 'Assinatura ativa',
      texto: a.vencimento_em
        ? `Próxima cobrança em ${formatarData(a.vencimento_em)}.`
        : 'Sua assinatura está em dia.',
    };
  }
  if (a.status === 'pausada') {
    return {
      tom: 'atencao' as const,
      icone: Clock,
      titulo: 'Assinatura pausada',
      texto: 'As cobranças estão suspensas no Mercado Pago. Reative por lá ou contrate um plano novamente.',
    };
  }
  return {
    tom: 'erro' as const,
    icone: AlertTriangle,
    titulo: a.status === 'cancelada' ? 'Assinatura cancelada' : 'Assinatura bloqueada',
    texto: 'Contrate um plano para voltar a usar a plataforma.',
  };
}

export default function PendixAssinatura() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === 'dark';
  const [params] = useSearchParams();

  const [planos, setPlanos] = useState<PendixPlano[]>([]);
  const [assinatura, setAssinatura] = useState<PendixAssinatura | null>(null);
  const [pagamentos, setPagamentos] = useState<PendixAssinaturaPagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [contratando, setContratando] = useState<string | null>(null);

  const c = {
    card:  isDark ? 'bg-[#121212] border-white/8' : 'bg-white border-gray-200',
    muted: isDark ? 'text-gray-500' : 'text-gray-500',
    label: isDark ? 'text-gray-400' : 'text-gray-600',
    caixa: isDark ? 'bg-white/3 border-white/5' : 'bg-gray-50 border-gray-100',
  };

  const carregar = useCallback(async () => {
    try {
      const [ps, a, pg] = await Promise.all([getPlanos(), getAssinatura(), getPagamentos()]);
      setPlanos(ps);
      setAssinatura(a);
      setPagamentos(pg);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível carregar a assinatura.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Volta do Mercado Pago (`back_url`): a confirmação chega pelo webhook, que
  // é assíncrono, então o estado quase nunca já mudou neste instante. Em vez
  // de mentir dizendo "pago", avisamos e recarregamos uma vez.
  useEffect(() => {
    if (params.get('retorno') !== '1') return;
    toast.info('Recebemos seu retorno do Mercado Pago. A confirmação chega em instantes.');
    const t = setTimeout(carregar, 4000);
    return () => clearTimeout(t);
  }, [params, carregar]);

  async function handleContratar(plano: PendixPlano) {
    setContratando(plano.codigo);
    try {
      const url = await contratarPlano(plano.codigo);
      // Mesma aba de propósito: é um fluxo de pagamento, e o `back_url` traz o
      // usuário de volta para cá. Abrir em nova aba deixaria as duas telas
      // discordando sobre o estado da assinatura.
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível iniciar a contratação.');
      setContratando(null);
    }
  }

  if (carregando) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner size={22} className="text-purple-500" />
      </div>
    );
  }

  const dias = diasAteBloqueio(assinatura);
  const emDia = assinaturaEmDia(assinatura);
  const aviso = avisoDoStatus(assinatura, dias);
  const planoAtual = planos.find(p => p.id === assinatura?.plano_id) ?? null;
  const disponiveis = planos.filter(p => p.ativo && p.valor_centavos > 0);

  const tomClasse = {
    ok:      'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
    atencao: 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400',
    erro:    'bg-red-500/10 border-red-500/25 text-red-400',
    neutro:  'bg-purple-500/10 border-purple-500/25 text-purple-400',
  }[aviso.tom];

  const IconeAviso = aviso.icone;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Assinatura</h1>
        <p className={`text-sm mt-1 ${c.muted}`}>Plano, chave de ativação e histórico de pagamentos do escritório.</p>
      </div>

      {/* Estado atual */}
      <div className={`rounded-2xl border p-5 flex items-start gap-4 ${tomClasse}`}>
        <IconeAviso size={20} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black">{aviso.titulo}</p>
          <p className="text-xs mt-1 opacity-90 leading-relaxed">{aviso.texto}</p>
          {emDia && dias !== null && dias <= DIAS_CARENCIA && (
            <p className="text-xs mt-2 font-bold">
              {dias === 0 ? 'O bloqueio acontece hoje.' : `Faltam ${dias} dia${dias > 1 ? 's' : ''} para o bloqueio.`}
            </p>
          )}
        </div>
      </div>

      {/* Dados da ativação — requisito 9.1 */}
      {assinatura && assinatura.status !== 'sem_assinatura' && (
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <div className="flex items-center gap-2 mb-5">
            <KeyRound size={15} className="text-purple-400" />
            <h2 className="text-sm font-black">Ativação</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className={`rounded-xl border p-4 ${c.caixa}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Chave de ativação</p>
              <p className="text-sm font-mono font-bold tracking-wider">{assinatura.chave_ativacao ?? '—'}</p>
            </div>
            <div className={`rounded-xl border p-4 ${c.caixa}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Plano contratado</p>
              <p className="text-sm font-bold">{planoAtual?.nome ?? '—'}</p>
            </div>
            <div className={`rounded-xl border p-4 ${c.caixa}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>Valor do plano</p>
              <p className="text-sm font-bold">
                {planoAtual ? `${formatarValor(planoAtual.valor_centavos)} ${descreverCiclo(planoAtual)}` : '—'}
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${c.caixa}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.label}`}>ID da compra</p>
              <p className="text-sm font-mono">{assinatura.ultimo_pagamento_id ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Planos */}
      <div className={`rounded-2xl border p-6 ${c.card}`}>
        <div className="flex items-center gap-2 mb-5">
          <CreditCard size={15} className="text-purple-400" />
          <h2 className="text-sm font-black">{emDia ? 'Trocar de plano' : 'Planos'}</h2>
        </div>

        {disponiveis.length === 0 ? (
          <div className={`rounded-xl border p-5 text-center ${c.caixa}`}>
            <p className="text-sm font-bold">Nenhum plano disponível no momento.</p>
            <p className={`text-xs mt-1.5 leading-relaxed ${c.muted}`}>
              Os planos ainda não foram publicados. Assim que os valores forem definidos, eles aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {disponiveis.map(p => {
              const atual = p.id === assinatura?.plano_id && emDia;
              return (
                <div key={p.id} className={`rounded-xl border p-5 flex flex-col ${atual ? 'border-purple-500/40 bg-purple-500/5' : c.caixa}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black">{p.nome}</p>
                    {atual && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/20">
                        Atual
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-2 leading-relaxed flex-1 ${c.muted}`}>{p.descricao}</p>
                  <p className="text-xl font-black mt-4">
                    {formatarValor(p.valor_centavos)}
                    <span className={`text-xs font-bold ml-1.5 ${c.muted}`}>{descreverCiclo(p)}</span>
                  </p>
                  <button
                    disabled={atual || contratando !== null}
                    onClick={() => handleContratar(p)}
                    className={`mt-4 flex items-center justify-center gap-2 text-sm font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      atual
                        ? 'border border-emerald-500/30 text-emerald-400'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    {atual
                      ? (<><Check size={14} /> Plano atual</>)
                      : contratando === p.codigo
                        ? 'Abrindo o Mercado Pago...'
                        : (<><ExternalLink size={14} /> Assinar</>)}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className={`text-[11px] mt-4 leading-relaxed ${c.muted}`}>
          O pagamento acontece no ambiente do Mercado Pago — os dados do seu cartão não passam pelo Pendix.
          {user?.email && ` A assinatura fica no e-mail ${user.email}.`}
        </p>
      </div>

      {/* Histórico */}
      {pagamentos.length > 0 && (
        <div className={`rounded-2xl border p-6 ${c.card}`}>
          <h2 className="text-sm font-black mb-5">Pagamentos</h2>
          <div className="space-y-2">
            {pagamentos.map(pg => (
              <div key={pg.id} className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${c.caixa}`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold">{formatarValor(pg.valor_centavos)}</p>
                  <p className={`text-[11px] font-mono truncate ${c.muted}`}>{pg.mp_payment_id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest ${pg.status === 'approved' ? 'text-emerald-400' : c.muted}`}>
                    {pg.status === 'approved' ? 'Pago' : pg.status}
                  </p>
                  <p className={`text-[11px] ${c.muted}`}>{formatarData(pg.pago_em ?? pg.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
