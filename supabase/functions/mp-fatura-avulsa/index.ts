// Edge Function: cria uma fatura avulsa (extra ou renegociação) e o link de
// pagamento correspondente via Checkout Pro.
//
// Autenticada pelo JWT do escritório.
//
// A fatura nasce PRIMEIRO no nosso banco, e o id dela vai como
// external_reference na preference — é assim que o mercadopago-webhook sabe
// qual fatura quitar quando o pagamento chegar. Inverter a ordem deixaria
// pagamento órfão, sem fatura para casar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return new Response('sem token', { status: 401 });

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
  const { empresa_id, valor, descricao, vencimento } = corpo;

  if (!empresa_id || !valor || !descricao || !vencimento) {
    return new Response('campos obrigatorios: empresa_id, valor, descricao, vencimento', { status: 400 });
  }
  if (Number(valor) <= 0) return new Response('valor deve ser positivo', { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vencimento))) {
    return new Response('vencimento deve estar no formato YYYY-MM-DD', { status: 400 });
  }

  // RLS escopa: empresa de outro escritório não volta.
  const { data: empresa } = await comoUsuario
    .from('pendix_empresas')
    .select('id, nome, escritorio_id')
    .eq('id', empresa_id)
    .maybeSingle();
  if (!empresa) return new Response('empresa nao encontrada neste escritorio', { status: 404 });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // assinatura_id fica null: é o que distingue avulsa de ciclo, e o que tira
  // esta linha da unique parcial por competência — daí caber mais de uma
  // avulsa no mesmo mês.
  const { data: fatura, error } = await db
    .from('pendix_faturas')
    .insert({
      escritorio_id: empresa.escritorio_id,
      empresa_id: empresa.id,
      assinatura_id: null,
      competencia: `${String(vencimento).slice(0, 7)}-01`,
      valor: Number(valor),
      vencimento,
      status: 'aberta',
    })
    .select('id')
    .single();
  if (error) return new Response(`nao foi possivel criar a fatura: ${error.message}`, { status: 500 });

  const preference = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        title: `${descricao} — ${empresa.nome}`,
        quantity: 1,
        unit_price: Number(valor),
        currency_id: 'BRL',
      }],
      external_reference: fatura.id,
      back_urls: { success: `${Deno.env.get('APP_BASE_URL')}/pendix/app/minhas-faturas` },
    }),
  });

  if (!preference.ok) {
    // Sem link, a fatura não serve para nada — e deixá-la aberta faria a
    // empresa ser BLOQUEADA por uma cobrança que nunca teve como pagar.
    await db.from('pendix_faturas').delete().eq('id', fatura.id);
    console.error('preference falhou', await preference.text());
    return new Response('nao foi possivel gerar o link de pagamento', { status: 502 });
  }
  const mp = await preference.json();

  await db
    .from('pendix_faturas')
    .update({ link_pagamento: String(mp.init_point ?? '') })
    .eq('id', fatura.id);

  await db.from('pendix_historico').insert({
    escritorio_id: empresa.escritorio_id,
    acao: 'fatura_criada',
    descricao: `Fatura avulsa "${descricao}" de R$ ${Number(valor).toFixed(2)} para ${empresa.nome}`,
    usuario_nome: auth.user.email ?? 'Escritorio',
  });

  return new Response(
    JSON.stringify({ fatura_id: fatura.id, link_pagamento: mp.init_point }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
