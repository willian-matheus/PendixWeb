// Edge Function: recebe webhooks da Z-API (status de entrega/leitura + mensagens recebidas).
// Deploy com --no-verify-jwt, pois a Z-API chama esta URL sem token do Supabase.
// Autenticação própria: query string `?secret=...` comparada com o secret WHATSAPP_WEBHOOK_SECRET.
//
// Configurar na Z-API (painel da instância > Webhooks), mesma URL nos dois campos:
//   "Ao status da mensagem" e "Ao receber": https://<project>.supabase.co/functions/v1/whatsapp-webhook?secret=...
// (a função distingue pelo campo "type" do payload)
//
// Schema: cada pendência tem uma `pendix_conversas`; mensagens (`pendix_mensagens`)
// pertencem a uma conversa via `conversa_id`, com `remetente` (agente/cliente) e
// `metadata` jsonb guardando status de entrega/leitura + provider_message_id
// (não existe coluna própria pra isso nesse schema).
//
// Mensagem recebida do cliente (texto, imagem ou documento):
//   1. baixa o arquivo (se houver) e sobe pro bucket "pendix-anexos"
//   2. descobre a pendência em aberto correspondente (se só houver uma, associa direto;
//      se houver mais de uma, pede pro Claude escolher com base no texto da mensagem)
//   3. se não achar a conversa dessa pendência ainda, cria uma
//   4. anexa o arquivo na pendência e marca status "em_analise" + requer_revisao_humana
//      (uma pessoa da equipe confirma e marca como "recebido" — não aprova sozinho)
//   5. se não achar match com confiança, a mensagem NÃO é gravada (pendix_conversas
//      exige pendencia_id) — fica só no log da função, para revisão manual
//
// TODO: áudio (payload.audio) hoje só é baixado e anexado, sem transcrição/entendimento
// de conteúdo — Claude não processa áudio nativamente. Pendente para uma fase futura.
//
// TODO: escalonamento de cobrança (amigável/lembrete/urgente/crítico) e reenvios
// automáticos ainda não implementados — ver pendix_configuracao_cobranca.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const STATUS_MAP: Record<string, string> = {
  SENT: 'enviada',
  RECEIVED: 'entregue',
  READ: 'lida',
  READ_BY_ME: 'lida',
  PLAYED: 'lida',
};
const STATUS_RANK: Record<string, number> = { enviada: 1, entregue: 2, lida: 3 };

const PENDENCIA_STATUS_ABERTA = ['pendente', 'em_analise'];

// Compara só DDD+número (últimos 11 dígitos), pra não depender de o telefone
// cadastrado ter ou não o código do país (55) na frente.
function localPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 11 ? digits.slice(-11) : digits;
}

type MidiaKind = 'image' | 'document' | 'audio';

interface ConteudoRecebido {
  texto: string | null;
  midia: { url: string; mimeType: string; fileName: string; kind: MidiaKind } | null;
}

function extrairConteudo(payload: any): ConteudoRecebido {
  if (payload.text?.message) {
    return { texto: payload.text.message, midia: null };
  }
  if (payload.image) {
    const ext = (payload.image.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
    return {
      texto: payload.image.caption || null,
      midia: { url: payload.image.imageUrl, mimeType: payload.image.mimeType, fileName: `imagem.${ext}`, kind: 'image' },
    };
  }
  if (payload.document) {
    return {
      texto: payload.document.title || null,
      midia: {
        url: payload.document.documentUrl,
        mimeType: payload.document.mimeType,
        fileName: payload.document.fileName || 'documento',
        kind: 'document',
      },
    };
  }
  if (payload.audio) {
    return {
      texto: null,
      midia: { url: payload.audio.audioUrl, mimeType: payload.audio.mimeType, fileName: 'audio.ogg', kind: 'audio' },
    };
  }
  return { texto: null, midia: null };
}

async function baixarEGuardarMidia(
  supabase: ReturnType<typeof createClient>,
  midia: NonNullable<ConteudoRecebido['midia']>,
  escritorioId: string,
  clienteId: string
): Promise<string | null> {
  try {
    const resp = await fetch(midia.url);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const path = `${escritorioId}/${clienteId}/${Date.now()}-${midia.fileName}`;
    const { error } = await supabase.storage
      .from('pendix-anexos')
      .upload(path, bytes, { contentType: midia.mimeType, upsert: false });
    if (error) {
      console.error('whatsapp-webhook: falha ao subir anexo', error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error('whatsapp-webhook: falha ao baixar mídia', String(err));
    return null;
  }
}

async function escolherPendenciaComClaude(
  texto: string,
  candidatas: { id: string; nome_documento: string; competencia: string }[]
): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content:
            `Um cliente de escritório contábil respondeu no WhatsApp: "${texto}"\n\n` +
            `Pendências em aberto desse cliente:\n` +
            candidatas.map(c => `- id=${c.id} | ${c.nome_documento} (competência ${c.competencia})`).join('\n') +
            `\n\nQual pendência essa mensagem responde? Só escolha se tiver confiança razoável.`,
        }],
        tools: [{
          name: 'selecionar_pendencia',
          description: 'Escolhe a pendência à qual a mensagem do cliente se refere, ou "nenhuma" se não houver confiança.',
          input_schema: {
            type: 'object',
            properties: {
              pendencia_id: { type: 'string', enum: [...candidatas.map(c => c.id), 'nenhuma'] },
            },
            required: ['pendencia_id'],
          },
        }],
        tool_choice: { type: 'tool', name: 'selecionar_pendencia' },
      }),
    });

    const data = await resp.json();
    const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
    const escolhida = toolUse?.input?.pendencia_id;
    return escolhida && escolhida !== 'nenhuma' ? escolhida : null;
  } catch (err) {
    console.error('whatsapp-webhook: falha ao consultar Claude', String(err));
    return null;
  }
}

async function acharOuCriarConversa(
  supabase: ReturnType<typeof createClient>,
  pendenciaId: string,
  escritorioId: string,
  clienteId: string,
  telefone: string
): Promise<string> {
  const { data: existente } = await supabase
    .from('pendix_conversas').select('id').eq('pendencia_id', pendenciaId).maybeSingle();
  if (existente?.id) return existente.id as string;

  const { data: nova, error } = await supabase
    .from('pendix_conversas')
    .insert({ escritorio_id: escritorioId, pendencia_id: pendenciaId, cliente_id: clienteId, telefone })
    .select('id').single();
  if (error) throw error;
  return nova.id as string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== Deno.env.get('WHATSAPP_WEBHOOK_SECRET')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  // ── Status de entrega/leitura ──────────────────────────────────────────
  if (payload.type === 'MessageStatusCallback') {
    const novoStatus = STATUS_MAP[payload.status];
    const ids: string[] = Array.isArray(payload.ids) ? payload.ids : [];
    if (!novoStatus || !ids.length) {
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const { data: mensagens, error } = await supabase
      .from('pendix_mensagens')
      .select('id, metadata')
      .in('metadata->>provider_message_id', ids);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    for (const m of mensagens ?? []) {
      const metaAtual = (m.metadata ?? {}) as Record<string, unknown>;
      const statusAtual = String(metaAtual.status ?? '');
      // nunca regride: não sobrescreve 'lida' com 'entregue' se chegar fora de ordem
      if ((STATUS_RANK[statusAtual] ?? 0) >= (STATUS_RANK[novoStatus] ?? 0)) continue;
      await supabase.from('pendix_mensagens')
        .update({ metadata: { ...metaAtual, status: novoStatus } })
        .eq('id', m.id);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // ── Mensagem recebida ────────────────────────────────────────────────
  if (payload.type === 'ReceivedCallback') {
    if (payload.fromMe) {
      return new Response(JSON.stringify({ ignored: true, reason: 'fromMe' }), { status: 200 });
    }

    const conteudo = extrairConteudo(payload);
    if (!conteudo.texto && !conteudo.midia) {
      return new Response(JSON.stringify({ ignored: true, reason: 'no content' }), { status: 200 });
    }

    const telefone = localPhoneDigits(payload.phone ?? '');
    const { data: clientes } = await supabase
      .from('pendix_clientes')
      .select('id, escritorio_id, telefone');
    const cliente = (clientes ?? []).find((c: any) => localPhoneDigits(c.telefone) === telefone);

    if (!cliente) {
      console.log('whatsapp-webhook: mensagem recebida de telefone sem cliente vinculado', telefone);
      return new Response(JSON.stringify({ ignored: true, reason: 'cliente not found' }), { status: 200 });
    }

    let anexoPath: string | null = null;
    if (conteudo.midia) {
      anexoPath = await baixarEGuardarMidia(supabase, conteudo.midia, cliente.escritorio_id as string, cliente.id as string);
    }

    const { data: candidatas } = await supabase
      .from('pendix_pendencias')
      .select('id, nome_documento, competencia')
      .eq('cliente_id', cliente.id)
      .in('status', PENDENCIA_STATUS_ABERTA);

    let pendenciaId: string | null = null;
    if (candidatas?.length === 1) {
      pendenciaId = candidatas[0].id as string;
    } else if (candidatas && candidatas.length > 1 && conteudo.texto) {
      pendenciaId = await escolherPendenciaComClaude(
        conteudo.texto,
        candidatas as { id: string; nome_documento: string; competencia: string }[]
      );
    }

    if (!pendenciaId) {
      // pendix_conversas exige pendencia_id — sem match, não dá pra persistir a mensagem.
      console.log('whatsapp-webhook: sem pendência correspondente, mensagem não gravada', {
        cliente: cliente.id, texto: conteudo.texto, midia: conteudo.midia?.kind,
      });
      return new Response(JSON.stringify({ ignored: true, reason: 'sem pendência correspondente' }), { status: 200 });
    }

    const conversaId = await acharOuCriarConversa(
      supabase, pendenciaId, cliente.escritorio_id as string, cliente.id as string, payload.phone
    );

    await supabase.from('pendix_mensagens').insert({
      conversa_id: conversaId,
      remetente: 'cliente',
      tipo: anexoPath ? 'arquivo' : 'texto',
      conteudo: conteudo.texto,
      arquivo_url: anexoPath,
      metadata: {
        provider_message_id: payload.messageId ?? null,
        sender_nome: payload.senderName ?? null,
        telefone: payload.phone,
      },
    });
    await supabase.from('pendix_conversas').update({ atualizada_em: new Date().toISOString() }).eq('id', conversaId);

    if (anexoPath) {
      await supabase.from('pendix_pendencias').update({
        status: 'em_analise',
        requer_revisao_humana: true,
        arquivo_url: anexoPath,
        arquivo_nome: conteudo.midia?.fileName ?? null,
      }).eq('id', pendenciaId);

      await supabase.from('pendix_historico').insert({
        escritorio_id: cliente.escritorio_id,
        cliente_id: cliente.id,
        pendencia_id: pendenciaId,
        acao: 'documento_em_revisao',
        descricao: conteudo.texto ?? `Arquivo recebido: ${conteudo.midia?.fileName ?? ''}`,
        usuario_nome: 'WhatsApp (automático)',
      });
    } else {
      await supabase.from('pendix_pendencias')
        .update({ status: 'em_analise' })
        .eq('id', pendenciaId).eq('status', 'pendente');

      await supabase.from('pendix_historico').insert({
        escritorio_id: cliente.escritorio_id,
        cliente_id: cliente.id,
        pendencia_id: pendenciaId,
        acao: 'resposta_enviada',
        descricao: conteudo.texto,
        usuario_nome: 'WhatsApp (automático)',
      });
    }

    return new Response(JSON.stringify({ ok: true, pendencia_id: pendenciaId, anexo: anexoPath }), { status: 200 });
  }

  return new Response(JSON.stringify({ ignored: true, reason: 'unknown type' }), { status: 200 });
});
