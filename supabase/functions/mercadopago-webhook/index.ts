// Edge Function: recebe notificações do Mercado Pago (assinaturas e pagamentos).
//
// Deploy com --no-verify-jwt: o Mercado Pago não manda token do Supabase.
// A autenticação é PRÓPRIA, por assinatura HMAC no header x-signature —
// mesmo espírito da whatsapp-webhook, que se autentica por secret na query.
// Sem essa validação, quem descobrisse a URL quitaria fatura de graça.
//
// O corpo da notificação traz apenas o id do recurso. Valor e status vêm de
// um GET na API do Mercado Pago; o payload NÃO é fonte confiável, porque
// quem posta o corpo é quem está sendo autenticado.
//
// Idempotência em duas camadas: unique em pendix_faturas.mp_payment_id (mais
// a unique parcial por competência) e a tabela pendix_mp_eventos_processados.
// O Mercado Pago reenvia notificação por padrão; sem isso, duplica fatura.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseNotificacao, validarAssinatura } from '../_shared/mercadopago.ts';
import { calcularVencimento } from '../_shared/faturas.ts';

const MP_API = 'https://api.mercadopago.com';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function mpGet(caminho: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${MP_API}${caminho}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}` },
  });
  if (!r.ok) throw new Error(`Mercado Pago ${caminho} respondeu ${r.status}`);
  return await r.json();
}

async function registrarHistorico(
  escritorioId: string,
  acao: string,
  descricao: string,
): Promise<void> {
  await db.from('pendix_historico').insert({
    escritorio_id: escritorioId,
    acao,
    descricao,
    usuario_nome: 'Mercado Pago',
  });
}

/** Atualiza o status da assinatura no nosso lado. */
async function tratarAssinatura(preapprovalId: string): Promise<void> {
  const mp = await mpGet(`/preapproval/${preapprovalId}`);
  const status = String(mp.status ?? 'pending');

  const { data: assinatura } = await db
    .from('pendix_assinaturas')
    .select('id, escritorio_id, empresa_id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (!assinatura) return; // assinatura que não nasceu aqui

  await db
    .from('pendix_assinaturas')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', assinatura.id);

  // Assinatura cancelada/pausada tira a empresa do regime de cobrança.
  if (status === 'cancelled' || status === 'paused') {
    await db
      .from('pendix_empresas')
      .update({ mensalidade_status: status === 'paused' ? 'pausada' : 'sem_cobranca' })
      .eq('id', assinatura.empresa_id);
  }

  await registrarHistorico(
    assinatura.escritorio_id,
    status === 'authorized' ? 'assinatura_autorizada' : 'assinatura_cancelada',
    `Assinatura ${preapprovalId} agora esta ${status}`,
  );
}

/** Cria ou quita a fatura de um ciclo da assinatura. */
async function tratarPagamentoDeAssinatura(authorizedPaymentId: string): Promise<void> {
  const mp = await mpGet(`/authorized_payments/${authorizedPaymentId}`);
  const preapprovalId = String(mp.preapproval_id ?? '');
  const status = String(mp.status ?? '');
  const pagamento = (mp.payment ?? {}) as Record<string, unknown>;
  const valor = Number(
    (mp.transaction_amount as number | undefined) ??
      (pagamento.transaction_amount as number | undefined) ??
      0,
  );

  const { data: assinatura } = await db
    .from('pendix_assinaturas')
    .select('id, empresa_id, escritorio_id, dia_cobranca')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (!assinatura) return;

  const agora = new Date();
  const competencia = new Date(agora.getFullYear(), agora.getMonth(), 1, 12);
  const vencimento = calcularVencimento(competencia, assinatura.dia_cobranca);
  const pago = status === 'processed' || status === 'approved';

  // upsert pela competência: se o Mercado Pago reenviar, atualiza em vez de
  // duplicar. A unique parcial uq_pendix_faturas_competencia sustenta isso.
  const { error } = await db.from('pendix_faturas').upsert(
    {
      escritorio_id: assinatura.escritorio_id,
      empresa_id: assinatura.empresa_id,
      assinatura_id: assinatura.id,
      competencia: competencia.toISOString().slice(0, 10),
      valor,
      vencimento: vencimento.toISOString().slice(0, 10),
      status: pago ? 'paga' : 'aberta',
      mp_payment_id: String(pagamento.id ?? authorizedPaymentId),
      meio_pagamento: String(pagamento.payment_type_id ?? ''),
      pago_em: pago ? agora.toISOString() : null,
      updated_at: agora.toISOString(),
    },
    { onConflict: 'empresa_id,competencia' },
  );
  if (error) throw new Error(`upsert de fatura falhou: ${error.message}`);

  await registrarHistorico(
    assinatura.escritorio_id,
    pago ? 'fatura_paga' : 'fatura_criada',
    `Ciclo ${competencia.toISOString().slice(0, 7)} da assinatura ${preapprovalId}: ${status}`,
  );
}

/** Pagamento avulso (fatura extra) ou confirmação de boleto/Pix. */
async function tratarPagamentoAvulso(paymentId: string): Promise<void> {
  const mp = await mpGet(`/v1/payments/${paymentId}`);
  if (String(mp.status) !== 'approved') return;

  const referencia = String(mp.external_reference ?? '');
  if (!referencia) return; // pagamento que não nasceu no Pendix

  const { data: fatura } = await db
    .from('pendix_faturas')
    .select('id, escritorio_id')
    .eq('id', referencia)
    .maybeSingle();
  if (!fatura) return;

  await db
    .from('pendix_faturas')
    .update({
      status: 'paga',
      mp_payment_id: paymentId,
      meio_pagamento: String(mp.payment_type_id ?? ''),
      pago_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', fatura.id);

  await registrarHistorico(fatura.escritorio_id, 'fatura_paga', `Fatura ${fatura.id} quitada`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return new Response('corpo invalido', { status: 400 });
  }

  let notificacao;
  try {
    notificacao = parseNotificacao(corpo, req.headers, req.url);
  } catch {
    return new Response('notificacao invalida', { status: 400 });
  }

  const autentica = await validarAssinatura({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId: notificacao.dataIdAssinatura,
    secret: Deno.env.get('MP_WEBHOOK_SECRET') ?? '',
    agoraMs: Date.now(),
  });
  if (!autentica) return new Response('assinatura invalida', { status: 401 });

  // Evento repetido responde 200: reenviar não ajudaria em nada.
  const { error: jaVisto } = await db
    .from('pendix_mp_eventos_processados')
    .insert({ event_id: notificacao.eventId });
  if (jaVisto) return new Response('ja processado', { status: 200 });

  try {
    if (notificacao.tipo === 'subscription_preapproval') {
      await tratarAssinatura(notificacao.recursoId);
    } else if (notificacao.tipo === 'subscription_authorized_payment') {
      await tratarPagamentoDeAssinatura(notificacao.recursoId);
    } else if (notificacao.tipo === 'payment') {
      await tratarPagamentoAvulso(notificacao.recursoId);
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Solta o registro de idempotência: aqui o reenvio ajuda de verdade.
    await db.from('pendix_mp_eventos_processados').delete().eq('event_id', notificacao.eventId);
    console.error('falha ao tratar notificacao', notificacao, e);
    return new Response('erro ao processar', { status: 500 });
  }
});
