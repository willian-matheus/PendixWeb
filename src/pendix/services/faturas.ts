import { supabase } from '../../app/services/supabase';

export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada';
export type StatusAssinatura = 'pending' | 'authorized' | 'paused' | 'cancelled';

export type Fatura = {
  id: string;
  empresa_id: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: StatusFatura;
  meio_pagamento: string | null;
  link_pagamento: string | null;
  pago_em: string | null;
};

export type Assinatura = {
  id: string;
  empresa_id: string;
  status: StatusAssinatura;
  valor: number;
  dia_cobranca: number;
  init_point: string | null;
};

const CAMPOS_FATURA =
  'id, empresa_id, competencia, valor, vencimento, status, meio_pagamento, link_pagamento, pago_em';

export async function listarFaturas(empresaId?: string): Promise<Fatura[]> {
  let q = supabase
    .from('pendix_faturas')
    .select(CAMPOS_FATURA)
    .order('competencia', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Fatura[];
}

export async function faturaEmAberto(empresaId: string): Promise<Fatura | null> {
  const { data, error } = await supabase
    .from('pendix_faturas')
    .select(CAMPOS_FATURA)
    .eq('empresa_id', empresaId)
    .in('status', ['aberta', 'vencida'])
    .order('vencimento', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Fatura) ?? null;
}

export async function listarAssinaturas(): Promise<Assinatura[]> {
  const { data, error } = await supabase
    .from('pendix_assinaturas')
    .select('id, empresa_id, status, valor, dia_cobranca, init_point');
  if (error) throw error;
  return (data ?? []) as Assinatura[];
}

/** Pergunta ao banco, não recalcula aqui.
 *
 *  A regra de carência mora em public.pendix_empresa_bloqueada (migration
 *  0020). Reimplementá-la em TypeScript criaria duas verdades que divergem
 *  no dia em que alguém mudar uma só. */
export async function empresaBloqueada(empresaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pendix_empresa_bloqueada', {
    p_empresa_id: empresaId,
  });
  if (error) throw error;
  return data === true;
}

export async function criarAssinatura(input: {
  empresaId: string;
  valor: number;
  diaCobranca: number;
  payerEmail: string;
}): Promise<{ initPoint: string }> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura-criar', {
    body: {
      empresa_id: input.empresaId,
      valor: input.valor,
      dia_cobranca: input.diaCobranca,
      payer_email: input.payerEmail,
    },
  });
  if (error) throw error;
  return { initPoint: (data as { init_point: string }).init_point };
}

export async function criarFaturaAvulsa(input: {
  empresaId: string;
  valor: number;
  descricao: string;
  vencimento: string; // 'YYYY-MM-DD'
}): Promise<{ faturaId: string; linkPagamento: string }> {
  const { data, error } = await supabase.functions.invoke('mp-fatura-avulsa', {
    body: {
      empresa_id: input.empresaId,
      valor: input.valor,
      descricao: input.descricao,
      vencimento: input.vencimento,
    },
  });
  if (error) throw error;
  const r = data as { fatura_id: string; link_pagamento: string };
  return { faturaId: r.fatura_id, linkPagamento: r.link_pagamento };
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(iso: string): string {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString('pt-BR');
}
