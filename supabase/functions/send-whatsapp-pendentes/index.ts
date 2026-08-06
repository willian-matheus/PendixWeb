// Edge Function: envia o primeiro contato de WhatsApp para pendências que
// ainda não foram cobradas (status 'pendente' e nunca contatadas).
//
// TODO (escopo futuro, não implementado ainda): escalonamento de cobrança
// (amigável → lembrete → urgente → crítico) usando os prazos configurados em
// `pendix_configuracao_cobranca` (dias_amigavel/lembrete/urgente, cooldown,
// max_reenvios, horário). Hoje só dispara o contato inicial.

import { createClient } from 'jsr:@supabase/supabase-js@2';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function mensagemInicial(nomeCliente: string, nomeDocumento: string, competencia: string): string {
  return `Olá, ${nomeCliente}! Precisamos do seguinte documento: *${nomeDocumento}* (competência ${competencia}). Pode enviar por aqui mesmo, em texto, foto ou PDF?`;
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

  const { data: pendencias, error } = await supabase
    .from('pendix_pendencias')
    .select('id, escritorio_id, cliente_id, nome_documento, competencia, pendix_clientes(nome, telefone)')
    .eq('status', 'pendente')
    .is('ultima_mensagem_enviada_em', null)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results: { pendencia_id: string; ok: boolean }[] = [];

  for (const p of pendencias ?? []) {
    const cliente = p.pendix_clientes as unknown as { nome: string; telefone: string } | null;
    if (!cliente?.telefone) {
      results.push({ pendencia_id: p.id as string, ok: false });
      continue;
    }

    const texto = mensagemInicial(cliente.nome, p.nome_documento as string, p.competencia as string);

    try {
      const resp = await fetch(zapiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClientToken },
        body: JSON.stringify({ phone: normalizePhone(cliente.telefone), message: texto }),
      });
      const body = await resp.json().catch(() => ({}));

      if (!resp.ok || body.error) {
        results.push({ pendencia_id: p.id as string, ok: false });
        continue;
      }

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

      await supabase.from('pendix_pendencias').update({
        ultima_mensagem_enviada_em: new Date().toISOString(),
        tentativas_reenvio: 1,
        nivel_cobranca_atual: 'amigavel',
      }).eq('id', p.id);

      await supabase.from('pendix_historico').insert({
        escritorio_id: p.escritorio_id,
        cliente_id: p.cliente_id,
        pendencia_id: p.id,
        acao: 'cobranca_enviada',
        descricao: texto,
        usuario_nome: 'WhatsApp (automático)',
      });

      results.push({ pendencia_id: p.id as string, ok: true });
    } catch (err) {
      console.error('send-whatsapp-pendentes: falha', String(err));
      results.push({ pendencia_id: p.id as string, ok: false });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
