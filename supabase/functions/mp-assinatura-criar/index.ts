// Edge Function: cria a assinatura (preapproval) de uma empresa cliente.
//
// Autenticada pelo JWT do escritório — deploy SEM --no-verify-jwt.
//
// O escopo por escritório é revalidado NO SERVIDOR: confiar no empresa_id
// que veio do cliente deixaria um escritório criar assinatura na empresa de
// outro, e cobrar em nome dele. A leitura da empresa passa pelo cliente com
// o JWT do chamador justamente para a RLS filtrar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return new Response('sem token', { status: 401 });

  // Cliente com o JWT do chamador: RLS vale, então a leitura já é escopada.
  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: auth } = await comoUsuario.auth.getUser();
  if (!auth?.user) return new Response('token invalido', { status: 401 });

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return new Response('corpo invalido', { status: 400 });
  }
  const { empresa_id, valor, dia_cobranca, payer_email } = corpo;

  if (!empresa_id || !valor || !dia_cobranca || !payer_email) {
    return new Response('campos obrigatorios: empresa_id, valor, dia_cobranca, payer_email', { status: 400 });
  }
  if (!Number.isInteger(dia_cobranca) || dia_cobranca < 1 || dia_cobranca > 28) {
    return new Response('dia_cobranca deve estar entre 1 e 28', { status: 400 });
  }
  if (Number(valor) <= 0) return new Response('valor deve ser positivo', { status: 400 });

  // RLS filtra: se a empresa não é do escritório do chamador, não volta nada.
  const { data: empresa } = await comoUsuario
    .from('pendix_empresas')
    .select('id, nome, escritorio_id')
    .eq('id', empresa_id)
    .maybeSingle();
  if (!empresa) return new Response('empresa nao encontrada neste escritorio', { status: 404 });

  const criacao = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: `Mensalidade PendixWeb — ${empresa.nome}`,
      external_reference: empresa.id,
      payer_email,
      back_url: `${Deno.env.get('APP_BASE_URL')}/pendix/app/financeiro`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(valor),
        currency_id: 'BRL',
      },
    }),
  });

  if (!criacao.ok) {
    // Corpo do erro só no log do servidor: pode conter detalhe da conta.
    console.error('preapproval falhou', await criacao.text());
    return new Response('nao foi possivel criar a assinatura', { status: 502 });
  }
  const mp = await criacao.json();

  // Escrita com service role: pendix_assinaturas não tem policy de insert
  // para `authenticated` de propósito — só o servidor cria assinatura.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: assinatura, error } = await db
    .from('pendix_assinaturas')
    .insert({
      escritorio_id: empresa.escritorio_id,
      empresa_id: empresa.id,
      mp_preapproval_id: String(mp.id),
      status: String(mp.status ?? 'pending'),
      valor: Number(valor),
      dia_cobranca,
      init_point: String(mp.init_point ?? ''),
      payer_email,
    })
    .select('id')
    .single();

  if (error) {
    // A unique parcial barrou: já existe assinatura viva para esta empresa.
    return new Response(`nao foi possivel salvar a assinatura: ${error.message}`, { status: 409 });
  }

  await db
    .from('pendix_empresas')
    .update({
      mensalidade_valor: Number(valor),
      mensalidade_dia_vencimento: dia_cobranca,
      mensalidade_status: 'ativa',
    })
    .eq('id', empresa.id);

  await db.from('pendix_historico').insert({
    escritorio_id: empresa.escritorio_id,
    acao: 'assinatura_criada',
    descricao: `Assinatura mensal de R$ ${Number(valor).toFixed(2)} para ${empresa.nome}`,
    usuario_nome: auth.user.email ?? 'Escritorio',
  });

  return new Response(
    JSON.stringify({ init_point: mp.init_point, assinatura_id: assinatura.id }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
