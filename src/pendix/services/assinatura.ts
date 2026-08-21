import { supabase } from '../../app/services/supabase';
import { sessionOfficeId } from './pendix';

// Assinatura do escritório na plataforma (Mercado Pago).
//
// Tudo aqui é LEITURA. As policies de `pendix_assinaturas` e
// `pendix_assinatura_pagamentos` só liberam select, de propósito: quem escreve
// é a Edge Function `mp-webhook`, com service role, depois de conferir com a
// API do Mercado Pago. Um escritório não pode se declarar pago.
//
// A única escrita possível a partir daqui é `contratarPlano`, e ela também não
// grava nada: pede à Edge Function `mp-assinatura` que crie o preapproval e
// devolve a URL do Mercado Pago para onde o usuário é redirecionado.

export type PendixAssinaturaStatus =
  | 'sem_assinatura' | 'pendente' | 'ativa' | 'inadimplente'
  | 'bloqueada' | 'pausada' | 'cancelada';

export interface PendixPlano {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  valor_centavos: number;
  frequencia: number;
  frequencia_tipo: 'days' | 'months';
  ativo: boolean;
  ordem: number;
}

export interface PendixAssinatura {
  id: string;
  escritorio_id: string;
  plano_id: string | null;
  status: PendixAssinaturaStatus;
  mp_preapproval_id: string | null;
  mp_payer_email: string | null;
  chave_ativacao: string | null;
  ultimo_pagamento_id: string | null;
  ultimo_pagamento_em: string | null;
  vencimento_em: string | null;
  bloqueada_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendixAssinaturaPagamento {
  id: string;
  mp_payment_id: string;
  valor_centavos: number;
  status: string;
  pago_em: string | null;
  created_at: string;
}

/** Dias de tolerância após o vencimento antes do bloqueio (requisito 9.2). */
export const DIAS_CARENCIA = 3;

export function formatarValor(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function descreverCiclo(p: Pick<PendixPlano, 'frequencia' | 'frequencia_tipo'>): string {
  if (p.frequencia_tipo === 'months') {
    if (p.frequencia === 1) return 'por mês';
    if (p.frequencia === 12) return 'por ano';
    return `a cada ${p.frequencia} meses`;
  }
  return p.frequencia === 1 ? 'por dia' : `a cada ${p.frequencia} dias`;
}

/**
 * Dias até o bloqueio. Negativo = já passou da carência. `null` quando não há
 * vencimento a considerar (nunca contratou, ou assinatura sem data).
 *
 * Compara em data local do navegador contra a data `YYYY-MM-DD` do banco — as
 * duas representam "o dia", sem hora, então não há fuso para errar aqui.
 */
export function diasAteBloqueio(a: Pick<PendixAssinatura, 'vencimento_em'> | null): number | null {
  if (!a?.vencimento_em) return null;
  const [ano, mes, dia] = a.vencimento_em.split('-').map(Number);
  const limite = new Date(ano, mes - 1, dia + DIAS_CARENCIA);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((limite.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * O escritório pode usar a plataforma?
 *
 * Espelha `pendix_assinatura_em_dia()` no banco. Existe em duplicata de
 * propósito: o banco é quem decide de verdade, mas a tela precisa da resposta
 * sem um round-trip a cada navegação. Mexeu numa, espelhe na outra.
 */
export function assinaturaEmDia(a: PendixAssinatura | null): boolean {
  if (!a || a.status !== 'ativa') return false;
  const dias = diasAteBloqueio(a);
  return dias === null || dias >= 0;
}

export async function getPlanos(): Promise<PendixPlano[]> {
  const { data, error } = await supabase
    .from('pendix_planos').select('*').order('ordem');
  if (error) throw error;
  return (data ?? []) as PendixPlano[];
}

/**
 * `null` quando o escritório nunca contratou nada.
 *
 * O filtro por `escritorio_id` é explícito de propósito, em vez de deixar o
 * RLS resolver: a policy libera TUDO para `pendix_is_admin()`, e aí um admin
 * receberia várias linhas e o `.maybeSingle()` estouraria. A policy continua
 * sendo a fronteira de segurança; isto aqui é sobre pegar a linha certa.
 */
export async function getAssinatura(): Promise<PendixAssinatura | null> {
  const eid = sessionOfficeId();
  if (!eid) return null;
  const { data, error } = await supabase
    .from('pendix_assinaturas').select('*').eq('escritorio_id', eid).maybeSingle();
  if (error) throw error;
  return (data ?? null) as PendixAssinatura | null;
}

export async function getPagamentos(limite = 12): Promise<PendixAssinaturaPagamento[]> {
  const eid = sessionOfficeId();
  if (!eid) return [];
  const { data, error } = await supabase
    .from('pendix_assinatura_pagamentos')
    .select('id, mp_payment_id, valor_centavos, status, pago_em, created_at')
    .eq('escritorio_id', eid)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as PendixAssinaturaPagamento[];
}

/**
 * Cria a assinatura no Mercado Pago e devolve a URL para onde o usuário deve
 * ser mandado. O cartão é digitado lá, nunca aqui.
 */
export async function contratarPlano(codigoPlano: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura', {
    body: { plano: codigoPlano },
  });
  if (error) {
    // O corpo de erro da function traz uma mensagem em português; o `error`
    // do supabase-js só diz "non-2xx". Vale a pena cavar.
    const detalhe = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro || error.message || 'Não foi possível iniciar a contratação.');
  }
  if (!data?.init_point) throw new Error('O Mercado Pago não devolveu o link de pagamento.');
  return data.init_point as string;
}
