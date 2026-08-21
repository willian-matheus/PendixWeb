// Edge Function: cria a assinatura do escritório no Mercado Pago.
//
// Por que isto vive no servidor: o `MP_ACCESS_TOKEN` é a chave que move
// dinheiro. Ele não pode existir no frontend — e neste repositório muito menos,
// porque o `dist/` é commitado, então qualquer variável `VITE_*` acabaria no
// git. Aqui ele fica como secret da function e nunca sai daqui.
//
// Modelo: `preapproval` SEM plano associado e com pagamento pendente
// (https://www.mercadopago.com/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments).
// Criamos a assinatura com `status: "pending"`, o Mercado Pago devolve um
// `init_point`, e o escritório digita o cartão LÁ. Nenhum dado de cartão passa
// pelo Pendix — nem pelo frontend, nem por esta function.
//
// Quem confirma o pagamento é a `mp-webhook`, nunca esta função e nunca o
// cliente: um escritório não pode declarar a si mesmo como pago.
//
// Secrets: MP_ACCESS_TOKEN, PENDIX_APP_URL (opcional).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') ?? '';
const APP_URL = Deno.env.get('PENDIX_APP_URL') ?? 'http://localhost:5173';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  if (!MP_ACCESS_TOKEN) return json({ erro: 'MP_ACCESS_TOKEN não configurado.' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Quem está pedindo ─────────────────────────────────────────────────────
  // O escritório vem SEMPRE do JWT, nunca do corpo da requisição: senão um
  // escritório assinaria em nome de outro.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error: erroAuth } = await admin.auth.getUser(token);
  if (erroAuth || !user) return json({ erro: 'Não autenticado.' }, 401);

  const { data: perfil } = await admin
    .from('usuarios').select('escritorio_id, email').eq('id', user.id).maybeSingle();
  if (!perfil?.escritorio_id) return json({ erro: 'Usuário sem escritório.' }, 400);

  let corpo: { plano?: string };
  try { corpo = await req.json(); } catch { return json({ erro: 'Body inválido.' }, 400); }
  if (!corpo.plano) return json({ erro: 'Informe o plano.' }, 400);

  // ── O plano ───────────────────────────────────────────────────────────────
  // Só planos ativos e com preço. O CHECK do banco já impede ativo com preço
  // zero, mas a checagem aqui é o que dá uma mensagem decente em vez de mandar
  // `transaction_amount: 0` para o Mercado Pago.
  const { data: plano } = await admin
    .from('pendix_planos')
    .select('id, codigo, nome, valor_centavos, frequencia, frequencia_tipo, ativo')
    .eq('codigo', corpo.plano)
    .maybeSingle();

  if (!plano) return json({ erro: 'Plano não encontrado.' }, 404);
  if (!plano.ativo || plano.valor_centavos <= 0) {
    return json({ erro: 'Esse plano ainda não está disponível para contratação.' }, 409);
  }

  // ── Já tem assinatura? ────────────────────────────────────────────────────
  const { data: assinaturaAtual } = await admin
    .from('pendix_assinaturas').select('id, status').eq('escritorio_id', perfil.escritorio_id).maybeSingle();

  if (assinaturaAtual?.status === 'ativa') {
    return json({ erro: 'Este escritório já tem uma assinatura ativa.' }, 409);
  }

  // ── Cria o preapproval ────────────────────────────────────────────────────
  // `external_reference` carrega o escritorio_id: é por ele que o webhook
  // reencontra o tenant mesmo se a linha local ainda não tiver sido gravada.
  const emailPagador = perfil.email || user.email;
  const payload = {
    reason: `Pendix — Plano ${plano.nome}`,
    external_reference: perfil.escritorio_id,
    payer_email: emailPagador,
    auto_recurring: {
      frequency: plano.frequencia,
      frequency_type: plano.frequencia_tipo,
      transaction_amount: plano.valor_centavos / 100,
      currency_id: 'BRL',
    },
    back_url: `${APP_URL}/pendix/app/assinatura?retorno=1`,
    status: 'pending',
  };

  let mp: { id?: string; init_point?: string; message?: string };
  try {
    const resp = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    mp = await resp.json();
    if (!resp.ok || !mp.id || !mp.init_point) {
      console.error('mp-assinatura: Mercado Pago recusou', resp.status, JSON.stringify(mp));
      return json({ erro: mp.message || 'O Mercado Pago recusou a criação da assinatura.' }, 502);
    }
  } catch (err) {
    console.error('mp-assinatura: falha ao falar com o Mercado Pago', String(err));
    return json({ erro: 'Não foi possível falar com o Mercado Pago agora.' }, 502);
  }

  // ── Grava local ───────────────────────────────────────────────────────────
  // 'pendente': o escritório ainda não pagou nada. Quem promove para 'ativa' é
  // o webhook, depois de conferir com a API do Mercado Pago.
  const { error: erroUpsert } = await admin.from('pendix_assinaturas').upsert({
    escritorio_id: perfil.escritorio_id,
    plano_id: plano.id,
    status: 'pendente',
    mp_preapproval_id: mp.id,
    mp_payer_email: emailPagador,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'escritorio_id' });

  if (erroUpsert) {
    // O preapproval já existe no Mercado Pago. Não dá para "desfazer" aqui, e
    // o webhook consegue se virar pelo external_reference — então logamos alto
    // e deixamos o usuário seguir, em vez de travar uma assinatura já criada.
    console.error('mp-assinatura: preapproval criado mas não gravado', mp.id, erroUpsert.message);
  }

  return json({ ok: true, init_point: mp.init_point, preapproval_id: mp.id });
});
