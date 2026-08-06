// Edge Function: recebe webhooks da Z-API (status de entrega/leitura + mensagens recebidas).
// Deploy com --no-verify-jwt, pois a Z-API chama esta URL sem token do Supabase.
// Autenticação própria: query string `?secret=...` comparada com o secret WHATSAPP_WEBHOOK_SECRET.
//
// Configurar na Z-API (painel da instância > Webhooks), mesma URL nos dois campos:
//   "Ao status da mensagem" e "Ao receber": https://<project>.supabase.co/functions/v1/whatsapp-webhook?secret=...
// (a função distingue pelo campo "type" do payload)
//
// === FLUXO DE MENSAGEM RECEBIDA ===
//
// 1. Identifica o cliente pelo telefone (pendix_clientes)
// 2. Busca pendências em aberto do cliente
// 3. SE encontrou match → vincula à pendência existente (fluxo original)
// 4. SE NÃO encontrou match → ativa o CHATBOT COM IA:
//    a. Busca ou cria uma sessão de chat (pendix_chat_sessions)
//    b. Carrega o histórico da conversa (pendix_chat_mensagens)
//    c. Envia tudo pro Claude API com tools disponíveis
//    d. Se Claude responde com texto → envia de volta via Z-API
//    e. Se Claude chama a tool criar_pendencia → cria no banco e confirma

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

// Limite de mensagens do histórico enviadas ao Claude por sessão
const MAX_HISTORICO = 30;
// Sessões sem atividade por 30 min são consideradas encerradas
const SESSAO_TIMEOUT_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function localPhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

// ── Media download ─────────────────────────────────────────────────────────

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

// ── Pendência matcher (fluxo original) ─────────────────────────────────────

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
        model: 'claude-sonnet-4-20250514',
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

// ── Conversa vinculada a pendência (fluxo original) ────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════
// ██  CHATBOT COM IA — Fluxo conversacional para criar pendências         ██
// ══════════════════════════════════════════════════════════════════════════

async function acharOuCriarSessaoChat(
  supabase: ReturnType<typeof createClient>,
  escritorioId: string,
  clienteId: string,
  telefone: string
): Promise<string> {
  // Busca sessão ativa do cliente
  const { data: existente } = await supabase
    .from('pendix_chat_sessions')
    .select('id, atualizada_em')
    .eq('cliente_id', clienteId)
    .eq('status', 'ativa')
    .order('atualizada_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) {
    const ultimaAtividade = new Date(existente.atualizada_em as string).getTime();
    const agora = Date.now();
    if (agora - ultimaAtividade > SESSAO_TIMEOUT_MS) {
      // Sessão expirou — encerra e cria nova
      await supabase.from('pendix_chat_sessions')
        .update({ status: 'encerrada' })
        .eq('id', existente.id);
    } else {
      return existente.id as string;
    }
  }

  // Cria nova sessão
  const { data: nova, error } = await supabase
    .from('pendix_chat_sessions')
    .insert({ escritorio_id: escritorioId, cliente_id: clienteId, telefone })
    .select('id').single();
  if (error) throw error;
  return nova.id as string;
}

async function carregarHistoricoChat(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data: msgs } = await supabase
    .from('pendix_chat_mensagens')
    .select('remetente, conteudo')
    .eq('session_id', sessionId)
    .order('criada_em', { ascending: true })
    .limit(MAX_HISTORICO);

  return (msgs ?? []).map((m: any) => ({
    role: m.remetente === 'cliente' ? 'user' as const : 'assistant' as const,
    content: m.conteudo || '[arquivo enviado]',
  }));
}

function buildSystemPrompt(nomeCliente: string): string {
  return `Você é o assistente virtual do escritório contábil no sistema Pendix.
Você conversa com clientes pelo WhatsApp de forma profissional e amigável.

Nome do cliente: ${nomeCliente}

## O que você pode fazer:
- Responder saudações e perguntas simples
- Ajudar o cliente a criar pendências (documentos que o escritório precisa receber)

## Para criar uma pendência, colete as informações:
1. **Título** (obrigatório) — nome do documento, ex: "Extrato Bancário", "Nota Fiscal de Serviço"
2. **Competência** (obrigatório) — mês/ano de referência no formato YYYY-MM, ex: "2026-08"
3. **Descrição** (opcional) — detalhes adicionais sobre o documento
4. **Data de vencimento** (opcional) — prazo final no formato YYYY-MM-DD

## Regras:
- Pergunte uma informação por vez, de forma natural e amigável
- Quando o cliente disser "pular" ou equivalente, aceite e passe para a próxima
- Quando tiver pelo menos título e competência, mostre um resumo e peça confirmação
- Só chame a tool criar_pendencia DEPOIS do cliente confirmar (sim/ok/confirmo)
- Use emojis moderadamente (1-2 por mensagem no máximo)
- Seja conciso — máximo 3-4 frases por mensagem
- Se o cliente enviar um arquivo (foto/PDF) e mencionar que é um documento, considere isso como o início de criação de pendência
- Se o cliente perguntar algo fora do escopo (ex: assuntos pessoais), redirecione gentilmente para o contexto contábil
- Mês atual: ${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
- Use o formato de competência YYYY-MM (ex: se o cliente diz "agosto de 2026", converta para "2026-08")`;
}

const CLAUDE_TOOLS = [
  {
    name: 'criar_pendencia',
    description: 'Cria uma nova pendência no sistema Pendix. Chame SOMENTE depois que o cliente confirmar os dados.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título/nome do documento da pendência (ex: "Extrato Bancário do Bradesco")',
        },
        competencia: {
          type: 'string',
          description: 'Competência no formato YYYY-MM (ex: "2026-08")',
          pattern: '^\\d{4}-\\d{2}$',
        },
        descricao: {
          type: 'string',
          description: 'Descrição opcional com detalhes sobre o documento',
        },
        data_limite: {
          type: 'string',
          description: 'Data de vencimento no formato YYYY-MM-DD (ex: "2026-08-15")',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        },
      },
      required: ['titulo', 'competencia'],
    },
  },
];

interface ChatResult {
  resposta: string;
  toolCalled: 'criar_pendencia' | null;
  toolInput: Record<string, string> | null;
}

async function conversarComClaude(
  nomeCliente: string,
  historico: { role: 'user' | 'assistant'; content: string }[],
  mensagemAtual: string
): Promise<ChatResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { resposta: 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns minutos.', toolCalled: null, toolInput: null };
  }

  const messages = [
    ...historico,
    { role: 'user' as const, content: mensagemAtual },
  ];

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: buildSystemPrompt(nomeCliente),
        messages,
        tools: CLAUDE_TOOLS,
      }),
    });

    const data = await resp.json();

    // Verificar se Claude chamou uma tool
    const toolUseBlock = data.content?.find((b: any) => b.type === 'tool_use');

    if (toolUseBlock && toolUseBlock.name === 'criar_pendencia') {
      // Claude quer criar a pendência — precisa de uma segunda chamada
      // para obter a mensagem de confirmação ao cliente
      const toolResultMessages = [
        ...messages,
        { role: 'assistant' as const, content: data.content },
        {
          role: 'user' as const,
          content: [{
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: 'Pendência criada com sucesso no sistema!',
          }],
        },
      ];

      const confirmResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: buildSystemPrompt(nomeCliente),
          messages: toolResultMessages,
        }),
      });

      const confirmData = await confirmResp.json();
      const textoConfirm = confirmData.content
        ?.filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n') || '✅ Pendência criada com sucesso!';

      return {
        resposta: textoConfirm,
        toolCalled: 'criar_pendencia',
        toolInput: toolUseBlock.input as Record<string, string>,
      };
    }

    // Apenas texto — extrair a resposta
    const textoResposta = data.content
      ?.filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n') || 'Desculpe, não entendi. Pode reformular?';

    return { resposta: textoResposta, toolCalled: null, toolInput: null };
  } catch (err) {
    console.error('whatsapp-webhook: falha ao conversar com Claude', String(err));
    return { resposta: 'Desculpe, tive um problema técnico. Tente novamente em instantes.', toolCalled: null, toolInput: null };
  }
}

async function enviarRespostaWhatsApp(telefone: string, mensagem: string): Promise<void> {
  const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const zapiInstanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN');
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!zapiInstanceId || !zapiInstanceToken || !zapiClientToken) {
    console.error('whatsapp-webhook: variáveis Z-API não configuradas');
    return;
  }

  const url = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiInstanceToken}/send-text`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClientToken },
      body: JSON.stringify({ phone: normalizePhone(telefone), message: mensagem }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error('whatsapp-webhook: falha ao enviar resposta Z-API', resp.status, body);
    }
  } catch (err) {
    console.error('whatsapp-webhook: erro ao enviar resposta', String(err));
  }
}

async function handleChatbotFlow(
  supabase: ReturnType<typeof createClient>,
  cliente: { id: string; escritorio_id: string; nome?: string },
  telefone: string,
  conteudo: ConteudoRecebido,
  anexoPath: string | null,
): Promise<{ ok: boolean; pendencia_id?: string }> {
  const nomeCliente = (cliente as any).nome || 'Cliente';

  // 1. Achar ou criar sessão de chat
  const sessionId = await acharOuCriarSessaoChat(
    supabase, cliente.escritorio_id, cliente.id, telefone
  );

  // 2. Salvar a mensagem do cliente na sessão
  const textoCliente = conteudo.texto || (conteudo.midia ? `[${conteudo.midia.kind}: ${conteudo.midia.fileName}]` : '[mensagem sem conteúdo]');

  await supabase.from('pendix_chat_mensagens').insert({
    session_id: sessionId,
    remetente: 'cliente',
    conteudo: textoCliente,
    arquivo_url: anexoPath,
    metadata: { telefone },
  });

  // 3. Carregar histórico da sessão (sem a mensagem que acabamos de inserir, pois
  //    ela já vai como mensagem atual pro Claude)
  const historico = await carregarHistoricoChat(supabase, sessionId);
  // Remover a última mensagem do histórico (que é a mensagem atual que acabamos de inserir)
  const historicoSemAtual = historico.slice(0, -1);

  // 4. Conversar com Claude
  const resultado = await conversarComClaude(nomeCliente, historicoSemAtual, textoCliente);

  // 5. Se Claude chamou a tool criar_pendencia, criar a pendência no banco
  let pendenciaId: string | undefined;

  if (resultado.toolCalled === 'criar_pendencia' && resultado.toolInput) {
    const { titulo, competencia, descricao, data_limite } = resultado.toolInput;

    const payload: Record<string, unknown> = {
      escritorio_id: cliente.escritorio_id,
      cliente_id: cliente.id,
      nome_documento: titulo,
      competencia: competencia || mesAtual(),
      status: anexoPath ? 'em_analise' : 'pendente',
      requer_revisao_humana: true,
      origem: 'whatsapp',
    };
    if (descricao) payload.observacoes = descricao;
    if (data_limite) payload.data_limite = data_limite;
    if (anexoPath) {
      payload.arquivo_url = anexoPath;
      payload.arquivo_nome = conteudo.midia?.fileName ?? null;
    }

    const { data: novaPendencia, error: pendErr } = await supabase
      .from('pendix_pendencias')
      .insert(payload)
      .select('id')
      .single();

    if (pendErr) {
      console.error('whatsapp-webhook: falha ao criar pendência via chatbot', pendErr.message);
    } else {
      pendenciaId = novaPendencia.id as string;

      // Registrar no histórico
      await supabase.from('pendix_historico').insert({
        escritorio_id: cliente.escritorio_id,
        cliente_id: cliente.id,
        pendencia_id: pendenciaId,
        acao: 'pendencia_criada_whatsapp',
        descricao: `Pendência "${titulo}" (${competencia}) criada via conversa no WhatsApp`,
        usuario_nome: 'WhatsApp IA',
      });

      // Encerrar a sessão de chat (pendência criada, fluxo concluído)
      await supabase.from('pendix_chat_sessions')
        .update({ status: 'encerrada', atualizada_em: new Date().toISOString() })
        .eq('id', sessionId);
    }
  }

  // 6. Salvar a resposta da IA na sessão
  await supabase.from('pendix_chat_mensagens').insert({
    session_id: sessionId,
    remetente: 'ia',
    conteudo: resultado.resposta,
    metadata: { tool_called: resultado.toolCalled, pendencia_id: pendenciaId },
  });

  // 7. Atualizar timestamp da sessão
  await supabase.from('pendix_chat_sessions')
    .update({ atualizada_em: new Date().toISOString() })
    .eq('id', sessionId);

  // 8. Enviar a resposta de volta pelo WhatsApp
  await enviarRespostaWhatsApp(telefone, resultado.resposta);

  return { ok: true, pendencia_id: pendenciaId };
}

// ══════════════════════════════════════════════════════════════════════════
// ██  MAIN HANDLER                                                        ██
// ══════════════════════════════════════════════════════════════════════════

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
      .select('id, escritorio_id, telefone, nome');
    const cliente = (clientes ?? []).find((c: any) => localPhoneDigits(c.telefone) === telefone);

    if (!cliente) {
      console.log('whatsapp-webhook: mensagem recebida de telefone sem cliente vinculado', telefone);
      return new Response(JSON.stringify({ ignored: true, reason: 'cliente not found' }), { status: 200 });
    }

    let anexoPath: string | null = null;
    if (conteudo.midia) {
      anexoPath = await baixarEGuardarMidia(supabase, conteudo.midia, cliente.escritorio_id as string, cliente.id as string);
    }

    // ── Buscar pendências abertas (fluxo original) ─────────────────────
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

    // ── Fluxo original: vincular à pendência existente ─────────────────
    if (pendenciaId) {
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

    // ── NOVO: Chatbot com IA — sem pendência correspondente ────────────
    const chatResult = await handleChatbotFlow(
      supabase,
      cliente as { id: string; escritorio_id: string; nome?: string },
      payload.phone,
      conteudo,
      anexoPath,
    );

    return new Response(JSON.stringify({
      ok: chatResult.ok,
      mode: 'chatbot',
      pendencia_id: chatResult.pendencia_id ?? null,
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ ignored: true, reason: 'unknown type' }), { status: 200 });
});
