// Edge Function: dispara cobranças via WhatsApp automaticamente, respeitando
// o horário configurado em cada pendência (`horario_notificacao`).
//
// Quem precisa agir é o CLIENTE — é ele que tem o documento —, então toda
// mensagem daqui vai para o telefone dele.
//
// Três passagens:
// 1) Contato inicial (LEGADO) — só para pendências com a cobrança automática
//    desligada. Quem está com ela ligada é atendido pela passagem 3, que faz
//    o mesmo primeiro contato e ainda dá seguimento.
// 2) Lembretes agendados — pendências 'pendente' cuja data de hoje está em
//    `datas_notificacao` e ainda não foi enviada hoje
//    (`datas_notificacao_enviadas`).
// 3) Cobrança automática recorrente — pendências com `cobranca_automatica`,
//    cobradas no ritmo de `cobranca_frequencia` (diária → bienal) até o
//    documento chegar ou o teto `max_reenvios` do escritório ser atingido. O
//    tom sobe com o atraso usando os prazos de `pendix_configuracao_cobranca`.
//    A regra vive em ./cobranca.ts (cópia testada de PendixApp/lib/cobranca.ts).
//
// A ordem importa: a 3 roda por último e relê o banco, então uma mensagem
// mandada pelas passagens anteriores entra no cooldown e o cliente não leva
// duas no mesmo dia.
//
// Pensado pra ser chamado periodicamente por um cron (pg_cron + pg_net, ver
// migration 0015_cron_whatsapp.sql) — cada execução só processa quem já
// bateu o horário configurado, então rodar a cada poucos minutos é seguro.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  decidirCobranca,
  montarMensagemCobranca,
  reagendarAposFalha,
  REGRAS_PADRAO,
  type RegrasCobranca,
} from './cobranca.ts';

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

type PendenciaAutomatica = {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  nome_documento: string;
  competencia: string;
  status: string;
  data_limite: string | null;
  horario_notificacao: string | null;
  data_inicio_cobranca: string | null;
  ultima_mensagem_enviada_em: string | null;
  cobranca_automatica: boolean | null;
  cobranca_frequencia: string | null;
  proxima_cobranca_em: string | null;
  cobrancas_enviadas: number | null;
  pendix_clientes: { nome: string; telefone: string; consentimento_whatsapp: boolean | null } | null;
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

/**
 * Envio que falhou: adia para amanha SEM contar contra o teto (a mensagem nao
 * chegou) e sem mexer no cooldown (que so olha envio bem-sucedido). Sem isto a
 * pendencia continua elegivel e o cron tenta de novo a cada 10 minutos, para
 * sempre — e se a Z-API tiver entregue mesmo devolvendo erro, o cliente leva
 * uma cobranca a cada 10 minutos.
 */
async function marcarFalhaDeEnvio(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  pendenciaId: string,
  hoje: string,
): Promise<void> {
  try {
    await supabase
      .from('pendix_pendencias')
      .update({ proxima_cobranca_em: reagendarAposFalha(hoje) })
      .eq('id', pendenciaId);
  } catch (err) {
    console.error('send-whatsapp-pendentes: falha ao adiar cobranca', String(err));
  }
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

  const suppliedCronSecret = req.headers.get('x-pendix-cron-secret') ?? '';
  const { data: cronAuthorized, error: cronAuthError } = await supabase.rpc(
    'pendix_verify_send_whatsapp_cron_secret',
    { supplied_secret: suppliedCronSecret },
  );
  if (cronAuthError) {
    console.error('send-whatsapp-pendentes: falha ao validar segredo do cron', cronAuthError.message);
    return new Response(JSON.stringify({ error: 'cron authorization unavailable' }), { status: 500 });
  }
  if (cronAuthorized !== true) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const { data: hoje, minutos: minutosAgora } = agoraBR();

  const results: {
    pendencia_id: string;
    tipo: 'inicial' | 'lembrete' | 'automatica';
    ok: boolean;
    nivel?: string;
  }[] = [];

  // ── Passagem 1: contato inicial ──────────────────────────────────────
  const { data: iniciais, error: erroIniciais } = await supabase
    .from('pendix_pendencias')
    .select(
      'id, escritorio_id, cliente_id, nome_documento, competencia, horario_notificacao, data_inicio_cobranca, pendix_clientes(nome, telefone)',
    )
    .eq('status', 'pendente')
    .eq('cobranca_automatica', false)
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

  // -- Passagem 3: cobranca automatica recorrente -----------------------
  // Roda depois das outras duas de proposito: rele o banco ja com o
  // `ultima_mensagem_enviada_em` que elas gravaram, e o cooldown evita
  // mandar duas mensagens para o mesmo cliente no mesmo dia.
  const { data: automaticas, error: erroAutomaticas } = await supabase
    .from('pendix_pendencias')
    .select(
      'id, escritorio_id, cliente_id, nome_documento, competencia, status, data_limite, ' +
      'horario_notificacao, data_inicio_cobranca, ultima_mensagem_enviada_em, ' +
      'cobranca_automatica, cobranca_frequencia, proxima_cobranca_em, cobrancas_enviadas, ' +
      'pendix_clientes(nome, telefone, consentimento_whatsapp)',
    )
    .eq('status', 'pendente')
    .eq('cobranca_automatica', true)
    .or(`proxima_cobranca_em.is.null,proxima_cobranca_em.lte.${hoje}`)
    // Ordenado para o corte do limite ser deterministico: quem esta esperando
    // ha mais tempo passa na frente, e o resto entra na proxima execucao (10
    // minutos depois), em vez de ficar em um sorteio a cada rodada.
    .order('proxima_cobranca_em', { ascending: true, nullsFirst: true })
    .limit(100);

  if (erroAutomaticas) {
    return new Response(JSON.stringify({ error: erroAutomaticas.message }), { status: 500 });
  }

  const candidatas = (automaticas ?? []) as unknown as PendenciaAutomatica[];

  // Uma consulta so para as regras de todos os escritorios envolvidos.
  const regrasPorEscritorio = new Map<string, RegrasCobranca>();
  if (candidatas.length > 0) {
    const escritorios = [...new Set(candidatas.map((p) => p.escritorio_id))];
    const { data: configs } = await supabase
      .from('pendix_configuracao_cobranca')
      .select('*')
      .in('escritorio_id', escritorios);
    for (const c of (configs ?? []) as (RegrasCobranca & { escritorio_id: string })[]) {
      regrasPorEscritorio.set(c.escritorio_id, c);
    }
  }

  const agoraIso = new Date().toISOString();

  for (const p of candidatas) {
    // Escritorio sem linha de configuracao usa os mesmos padroes do app.
    const regras = regrasPorEscritorio.get(p.escritorio_id) ?? REGRAS_PADRAO;
    const cliente = p.pendix_clientes;

    const decisao = decidirCobranca(
      { ...p, cliente },
      regras,
      { data: hoje, minutos: minutosAgora, iso: agoraIso },
    );
    if (!decisao.cobrar) continue;

    const texto = montarMensagemCobranca(decisao.nivel!, {
      cliente: cliente!.nome,
      documento: p.nome_documento,
      competencia: p.competencia,
      data_limite: p.data_limite,
    });

    try {
      const ok = await enviarMensagemPendencia(supabase, zapiUrl, zapiClientToken, p, cliente!, texto);
      if (ok) {
        await supabase.from('pendix_pendencias').update({
          ultima_mensagem_enviada_em: new Date().toISOString(),
          cobrancas_enviadas: decisao.cobrancas_enviadas,
          proxima_cobranca_em: decisao.proxima_cobranca_em,
          nivel_cobranca_atual: decisao.nivel,
          // Campo legado, mantido em sincronia para as telas antigas.
          tentativas_reenvio: decisao.cobrancas_enviadas,
        }).eq('id', p.id);
      } else {
        await marcarFalhaDeEnvio(supabase, p.id, hoje);
      }
      results.push({ pendencia_id: p.id, tipo: 'automatica', ok, nivel: decisao.nivel });
    } catch (err) {
      console.error('send-whatsapp-pendentes: falha (automatica)', String(err));
      await marcarFalhaDeEnvio(supabase, p.id, hoje);
      results.push({ pendencia_id: p.id, tipo: 'automatica', ok: false, nivel: decisao.nivel });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
