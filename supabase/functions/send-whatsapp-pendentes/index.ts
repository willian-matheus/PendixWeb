// Edge Function: dispara cobranças via WhatsApp automaticamente, respeitando
// o horário configurado em cada pendência (`horario_notificacao`).
//
// Duas passagens:
// 1) Contato inicial — pendências 'pendente' nunca contatadas
//    (ultima_mensagem_enviada_em IS NULL), a partir de data_inicio_cobranca.
// 2) Lembretes agendados — pendências 'pendente' cuja data de hoje está em
//    `datas_notificacao` e ainda não foi enviada hoje
//    (`datas_notificacao_enviadas`).
//
// Pensado pra ser chamado periodicamente por um cron (pg_cron + pg_net, ver
// migration 0015_cron_whatsapp.sql) — cada execução só processa quem já
// bateu o horário configurado, então rodar a cada poucos minutos é seguro.
//
// TODO (escopo futuro, não implementado ainda): escalonamento de cobrança
// por nível (amigável → lembrete → urgente → crítico) usando os prazos
// configurados em `pendix_configuracao_cobranca` (dias_amigavel/lembrete/
// urgente, cooldown, max_reenvios).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TIMEZONE = 'America/Sao_Paulo';

type Cliente = { nome: string; telefone: string } | null;

type PendenciaBase = {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  nome_documento: string;
  competencia: string;
  horario_notificacao: string;
  pendix_clientes: Cliente;
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function mensagemInicial(nomeCliente: string, nomeDocumento: string, competencia: string): string {
  return `Olá, ${nomeCliente}! Precisamos do seguinte documento: *${nomeDocumento}* (competência ${competencia}). Pode enviar por aqui mesmo, em foto ou PDF?`;
}

function mensagemLembrete(nomeCliente: string, nomeDocumento: string, competencia: string): string {
  return `Olá, ${nomeCliente}! Passando para lembrar que ainda precisamos do documento *${nomeDocumento}* (competência ${competencia}). Pode enviar por aqui mesmo, em foto ou PDF?`;
}

function horarioParaMinutos(horario: string): number {
  const [hh, mm] = horario.split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

function agoraBR(): { data: string; minutos: number } {
  const now = new Date();
  const data = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const hh = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(partes.find((p) => p.type === 'minute')?.value ?? '0');
  return { data, minutos: hh * 60 + mm };
}

async function enviarMensagemPendencia(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  zapiUrl: string,
  zapiClientToken: string,
  p: { id: string; escritorio_id: string; cliente_id: string },
  cliente: { nome: string; telefone: string },
  texto: string,
): Promise<boolean> {
  const resp = await fetch(zapiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClientToken },
    body: JSON.stringify({ phone: normalizePhone(cliente.telefone), message: texto }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) return false;

  // acha ou cria a conversa dessa pendência
  const { data: conversaExistente } = await supabase
    .from('pendix_conversas')
    .select('id')
    .eq('pendencia_id', p.id)
    .maybeSingle();

  let conversaId = conversaExistente?.id as string | undefined;
  if (!conversaId) {
    const { data: novaConversa, error: convErr } = await supabase
      .from('pendix_conversas')
      .insert({
        escritorio_id: p.escritorio_id,
        pendencia_id: p.id,
        cliente_id: p.cliente_id,
        telefone: cliente.telefone,
      })
      .select('id').single();
    if (convErr) throw convErr;
    conversaId = novaConversa.id as string;
  }

  await supabase.from('pendix_mensagens').insert({
    conversa_id: conversaId,
    remetente: 'agente',
    tipo: 'texto',
    conteudo: texto,
    metadata: {
      status: 'enviada',
      provider_message_id: body.messageId || body.zaapId || null,
    },
  });

  await supabase.from('pendix_historico').insert({
    escritorio_id: p.escritorio_id,
    cliente_id: p.cliente_id,
    pendencia_id: p.id,
    acao: 'cobranca_enviada',
    descricao: texto,
    usuario_nome: 'WhatsApp (automático)',
  });

  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID')!;
  const zapiInstanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN')!;
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN')!;
  const zapiUrl = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiInstanceToken}/send-text`;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: hoje, minutos: minutosAgora } = agoraBR();

  const results: { pendencia_id: string; tipo: 'inicial' | 'lembrete'; ok: boolean }[] = [];

  // ── Passagem 1: contato inicial ──────────────────────────────────────
  const { data: iniciais, error: erroIniciais } = await supabase
    .from('pendix_pendencias')
    .select(
      'id, escritorio_id, cliente_id, nome_documento, competencia, horario_notificacao, data_inicio_cobranca, pendix_clientes(nome, telefone)',
    )
    .eq('status', 'pendente')
    .is('ultima_mensagem_enviada_em', null)
    .or(`data_inicio_cobranca.is.null,data_inicio_cobranca.lte.${hoje}`)
    .limit(50);

  if (erroIniciais) {
    return new Response(JSON.stringify({ error: erroIniciais.message }), { status: 500 });
  }

  for (const p of (iniciais ?? []) as (PendenciaBase & { data_inicio_cobranca: string | null })[]) {
    if (minutosAgora < horarioParaMinutos(p.horario_notificacao)) continue;

    const cliente = p.pendix_clientes;
    if (!cliente?.telefone) {
      results.push({ pendencia_id: p.id, tipo: 'inicial', ok: false });
      continue;
    }

    const texto = mensagemInicial(cliente.nome, p.nome_documento, p.competencia);
    try {
      const ok = await enviarMensagemPendencia(supabase, zapiUrl, zapiClientToken, p, cliente, texto);
      if (ok) {
        await supabase.from('pendix_pendencias').update({
          ultima_mensagem_enviada_em: new Date().toISOString(),
          tentativas_reenvio: 1,
          nivel_cobranca_atual: 'amigavel',
        }).eq('id', p.id);
      }
      results.push({ pendencia_id: p.id, tipo: 'inicial', ok });
    } catch (err) {
      console.error('send-whatsapp-pendentes: falha (inicial)', String(err));
      results.push({ pendencia_id: p.id, tipo: 'inicial', ok: false });
    }
  }

  // ── Passagem 2: lembretes agendados (datas_notificacao) ──────────────
  const { data: lembretes, error: erroLembretes } = await supabase
    .from('pendix_pendencias')
    .select(
      'id, escritorio_id, cliente_id, nome_documento, competencia, horario_notificacao, datas_notificacao_enviadas, pendix_clientes(nome, telefone)',
    )
    .eq('status', 'pendente')
    .contains('datas_notificacao', [hoje])
    .limit(50);

  if (erroLembretes) {
    return new Response(JSON.stringify({ error: erroLembretes.message }), { status: 500 });
  }

  for (const p of (lembretes ?? []) as (PendenciaBase & { datas_notificacao_enviadas: string[] })[]) {
    if (p.datas_notificacao_enviadas?.includes(hoje)) continue;
    if (minutosAgora < horarioParaMinutos(p.horario_notificacao)) continue;

    const cliente = p.pendix_clientes;
    if (!cliente?.telefone) {
      results.push({ pendencia_id: p.id, tipo: 'lembrete', ok: false });
      continue;
    }

    const texto = mensagemLembrete(cliente.nome, p.nome_documento, p.competencia);
    try {
      const ok = await enviarMensagemPendencia(supabase, zapiUrl, zapiClientToken, p, cliente, texto);
      if (ok) {
        await supabase.from('pendix_pendencias').update({
          ultima_mensagem_enviada_em: new Date().toISOString(),
          datas_notificacao_enviadas: [...(p.datas_notificacao_enviadas ?? []), hoje],
        }).eq('id', p.id);
      }
      results.push({ pendencia_id: p.id, tipo: 'lembrete', ok });
    } catch (err) {
      console.error('send-whatsapp-pendentes: falha (lembrete)', String(err));
      results.push({ pendencia_id: p.id, tipo: 'lembrete', ok: false });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
