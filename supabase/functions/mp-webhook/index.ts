// Edge Function: recebe as notificações de assinatura do Mercado Pago.
//
// Deploy com --no-verify-jwt: o Mercado Pago chama sem token do Supabase.
// A autenticação é a assinatura HMAC do próprio Mercado Pago (header
// `x-signature`), validada em `assinaturaValida()` abaixo.
//
// REGRA DE OURO: o corpo da notificação NÃO é fonte da verdade. Ele diz
// apenas "algo mudou, o id é esse". Quem responde "mudou para o quê" é a API
// do Mercado Pago, consultada com o nosso access token. Confiar no corpo
// deixaria qualquer um que descobrisse a URL declarar um escritório como pago.
//
// Cadastrar em Suas integrações > Webhooks, eventos `subscription_preapproval`
// e `payment`:
//   https://<project>.supabase.co/functions/v1/mp-webhook
//
// Secrets: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const MP_WEBHOOK_SECRET = Deno.env.get('MP_WEBHOOK_SECRET') ?? '';

/**
 * Valida o header `x-signature`, conforme a documentação do Mercado Pago.
 *
 * O manifest é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` e a
 * contrachave é um HMAC-SHA256 hex com o secret da aplicação. Partes ausentes
 * saem do manifest em vez de virarem string vazia — é o que a doc manda, e
 * montar errado faz toda notificação legítima ser recusada.
 */
async function assinaturaValida(req: Request, dataId: string | null): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET) {
    console.error('mp-webhook: MP_WEBHOOK_SECRET não configurado — recusando tudo');
    return false;
  }

  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id');

  let ts = '';
  let v1 = '';
  for (const parte of xSignature.split(',')) {
    const [chave, valor] = parte.split('=').map((s) => s?.trim());
    if (chave === 'ts') ts = valor ?? '';
    if (chave === 'v1') v1 = valor ?? '';
  }
  if (!ts || !v1) return false;

  const partes: string[] = [];
  // A doc pede minúsculas quando o id vem alfanumérico maiúsculo.
  if (dataId) partes.push(`id:${dataId.toLowerCase()};`);
  if (xRequestId) partes.push(`request-id:${xRequestId};`);
  partes.push(`ts:${ts};`);
  const manifest = partes.join('');

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinado = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifest));
  const esperado = [...new Uint8Array(assinado)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparação em tempo constante: um `===` vaza, byte a byte, quanto do
  // prefixo está certo, e isso permite forjar a assinatura por tentativa.
  if (esperado.length !== v1.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return diferenca === 0;
}

async function mpGet(caminho: string): Promise<Record<string, unknown> | null> {
  try {
    const resp = await fetch(`https://api.mercadopago.com${caminho}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      console.error('mp-webhook: Mercado Pago recusou GET', caminho, resp.status);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.error('mp-webhook: falha no GET', caminho, String(err));
    return null;
  }
}

/** "PDX-A1B2-C3D4-E5F6" — legível para o escritório ditar por telefone. */
function gerarChaveAtivacao(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `PDX-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Status do preapproval do Mercado Pago → o nosso vocabulário. */
function traduzirStatus(mp: string): string {
  switch (mp) {
    case 'authorized': return 'ativa';
    case 'paused':     return 'pausada';
    case 'cancelled':  return 'cancelada';
    default:           return 'pendente';
  }
}

type Admin = ReturnType<typeof createClient>;

/** Acha a assinatura pelo preapproval_id; cai no external_reference se preciso. */
async function acharAssinatura(admin: Admin, preapprovalId: string, externalRef: unknown) {
  const { data: porId } = await admin
    .from('pendix_assinaturas').select('*').eq('mp_preapproval_id', preapprovalId).maybeSingle();
  if (porId) return porId;

  if (typeof externalRef === 'string' && externalRef) {
    const { data: porRef } = await admin
      .from('pendix_assinaturas').select('*').eq('escritorio_id', externalRef).maybeSingle();
    if (porRef) return porRef;
  }
  return null;
}

async function tratarPreapproval(admin: Admin, preapprovalId: string): Promise<string> {
  const mp = await mpGet(`/preapproval/${preapprovalId}`);
  if (!mp) return 'preapproval não encontrado no Mercado Pago';

  const assinatura = await acharAssinatura(admin, preapprovalId, mp.external_reference);
  if (!assinatura) return 'assinatura local não encontrada';

  const status = traduzirStatus(String(mp.status ?? ''));

  const patch: Record<string, unknown> = {
    status,
    mp_preapproval_id: preapprovalId,
    updated_at: new Date().toISOString(),
  };

  if (status === 'ativa') {
    // A chave nasce na primeira autorização e sobrevive às renovações — o
    // escritório a guarda, e trocá-la a cada ciclo quebraria isso.
    if (!assinatura.chave_ativacao) patch.chave_ativacao = gerarChaveAtivacao();
    patch.bloqueada_em = null;
    const proximo = mp.next_payment_date;
    if (typeof proximo === 'string') patch.vencimento_em = proximo.slice(0, 10);
  }

  // Pausada ou cancelada: a chave sai de circulação. É o "bloqueio" do
  // requisito 9.2 chegando por outro caminho que não o vencimento.
  if (status === 'pausada' || status === 'cancelada') {
    patch.chave_ativacao = null;
    patch.bloqueada_em = new Date().toISOString();
  }

  await admin.from('pendix_assinaturas').update(patch).eq('id', assinatura.id);

  // `empresas.plano` é o espelho que o AuthProvider lê.
  const { data: plano } = await admin
    .from('pendix_planos').select('codigo').eq('id', assinatura.plano_id).maybeSingle();
  await admin.from('empresas')
    .update({ plano: status === 'ativa' ? (plano?.codigo ?? 'normal') : 'normal' })
    .eq('id', assinatura.escritorio_id);

  return `assinatura ${assinatura.id} → ${status}`;
}

async function tratarPagamento(admin: Admin, paymentId: string): Promise<string> {
  const mp = await mpGet(`/v1/payments/${paymentId}`);
  if (!mp) return 'pagamento não encontrado no Mercado Pago';

  // Só nos interessa pagamento de assinatura — o vínculo é o preapproval_id.
  const preapprovalId = String(mp.metadata && (mp.metadata as Record<string, unknown>).preapproval_id || '')
    || String((mp as Record<string, unknown>).preapproval_id ?? '');
  const assinatura = await acharAssinatura(admin, preapprovalId, mp.external_reference);
  if (!assinatura) return 'pagamento sem assinatura correspondente';

  const aprovado = mp.status === 'approved';
  const valor = Math.round(Number(mp.transaction_amount ?? 0) * 100);

  // `mp_payment_id` é único: o Mercado Pago reentrega o mesmo webhook, e sem
  // isso o mesmo pagamento empurraria o vencimento duas vezes.
  const { error: erroLedger } = await admin.from('pendix_assinatura_pagamentos').insert({
    escritorio_id: assinatura.escritorio_id,
    assinatura_id: assinatura.id,
    mp_payment_id: String(paymentId),
    valor_centavos: valor,
    status: String(mp.status ?? 'desconhecido'),
    pago_em: aprovado ? (mp.date_approved ?? new Date().toISOString()) : null,
    payload: mp,
  });

  if (erroLedger) {
    if ((erroLedger as { code?: string }).code === '23505') return 'pagamento já registrado (reentrega)';
    console.error('mp-webhook: falha ao gravar pagamento', erroLedger.message);
    return 'falha ao gravar pagamento';
  }

  if (!aprovado) return `pagamento ${paymentId} com status ${mp.status}`;

  // Pagamento aprovado: o ID da compra vai para a tela de Configurações e o
  // vencimento anda. A data vem do Mercado Pago quando ele informa; senão
  // caímos no ciclo do plano.
  const patch: Record<string, unknown> = {
    status: 'ativa',
    ultimo_pagamento_id: String(paymentId),
    ultimo_pagamento_em: mp.date_approved ?? new Date().toISOString(),
    bloqueada_em: null,
    updated_at: new Date().toISOString(),
  };
  if (!assinatura.chave_ativacao) patch.chave_ativacao = gerarChaveAtivacao();

  const preapproval = preapprovalId ? await mpGet(`/preapproval/${preapprovalId}`) : null;
  if (preapproval && typeof preapproval.next_payment_date === 'string') {
    patch.vencimento_em = preapproval.next_payment_date.slice(0, 10);
  }

  await admin.from('pendix_assinaturas').update(patch).eq('id', assinatura.id);
  return `pagamento ${paymentId} aprovado`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!MP_ACCESS_TOKEN) {
    console.error('mp-webhook: MP_ACCESS_TOKEN não configurado');
    return new Response('misconfigured', { status: 500 });
  }

  const url = new URL(req.url);
  const dataIdQuery = url.searchParams.get('data.id') ?? url.searchParams.get('id');

  if (!await assinaturaValida(req, dataIdQuery)) {
    return new Response('unauthorized', { status: 401 });
  }

  const corpo = await req.json().catch(() => null);
  if (!corpo) return new Response('invalid json', { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const tipo = String(corpo.type ?? corpo.topic ?? '');
  const id = String(corpo.data?.id ?? dataIdQuery ?? '');
  if (!id) return new Response(JSON.stringify({ ignored: 'sem id' }), { status: 200 });

  let resultado = `tipo ignorado: ${tipo}`;
  try {
    if (tipo.startsWith('subscription_preapproval') || tipo === 'preapproval') {
      resultado = await tratarPreapproval(admin, id);
    } else if (tipo === 'payment') {
      resultado = await tratarPagamento(admin, id);
    }
  } catch (err) {
    console.error('mp-webhook: exceção ao tratar', tipo, id, String(err));
    // 200 de propósito: um 500 faz o Mercado Pago reentregar em loop. O erro
    // está no log, e a próxima notificação (ou a tela, que relê a assinatura)
    // reconcilia.
    return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }

  console.log('mp-webhook:', tipo, id, '→', resultado);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
