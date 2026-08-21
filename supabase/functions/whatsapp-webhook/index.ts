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
// 0. Nota de voz → transcrita (Transkriptor) e tratada como texto digitado
//    a partir daqui — todo o resto do fluxo (matcher, wizard, chat livre)
//    já lê `conteudo.texto` normalmente, então funciona sem lógica extra.
// 1. Identifica o cliente pelo telefone (pendix_clientes)
// 1a. SE NÃO achou cliente pelo telefone → fluxo de LOGIN POR E-MAIL:
//     pede o e-mail cadastrado, busca em pendix_clientes.email e, se achar,
//     vincula o telefone ao cliente (pendix_whatsapp_login_pendente guarda o
//     progresso entre mensagens). Não continua para os passos abaixo nessa
//     mesma mensagem — a próxima mensagem do cliente já bate o telefone.
// 2. Busca pendências em aberto do cliente
// 3. SE encontrou match → vincula à pendência existente (fluxo original).
//    Se veio anexo, o Claude analisa o conteúdo do arquivo (não só o nome)
//    antes de decidir: só marca 'recebido' sozinho com confirmação da IA;
//    qualquer outra coisa cai pra 'em_analise' aguardando revisão humana.
// 4. SE NÃO encontrou match → WIZARD DE CRIAÇÃO DE PENDÊNCIA:
//    a. Busca ou cria uma sessão de chat (pendix_chat_sessions)
//    b. Se a sessão já tem `coleta_estado` (passo + dados coletados até
//       agora), processa a resposta do passo atual E AVANÇA — nunca repete
//       o mesmo passo por conta própria. O SERVIDOR controla o estado, não
//       a IA — assim não tem como entrar em loop de pergunta repetida.
//       Exceção deliberada: campos obrigatórios (título, competência,
//       vencimento, início da cobrança, anexo de exemplo) reenviam o mesmo
//       passo com um aviso quando a resposta é inválida/vazia — não avançam
//       sem o dado.
//       Logo após "Cliente ou Empresa", um passo "selecionar_cliente" lista
//       (com botões) TODOS os cadastros do Pendix do escritório, pra deixar
//       explícito pra qual cadastro é a pendência — resolve sozinho, sem
//       perguntar, quando o escritório só tem um cadastro no total.
//    c. Se não tem coleta ativa: se a mensagem parece pedido de pendência,
//       inicia o wizard; senão, responde como assistente de chat livre
//       (só texto simples, sem tools, sem estado — não cria nada sozinho).

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

// Limite de mensagens do histórico enviadas ao Claude no chat livre
const MAX_HISTORICO = 30;
// Sessões sem atividade por 30 min são consideradas encerradas
const SESSAO_TIMEOUT_MS = 30 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

// Normaliza pro formato canônico DDD + 9 dígitos (11 dígitos, sem código do
// país), tratando o "9" extra do celular brasileiro — a Z-API às vezes
// entrega o número recebido SEM esse 9 (formato antigo, 10 dígitos locais)
// mesmo quando o número está cadastrado COM ele, o que fazia a comparação
// simples de dígitos falhar e o cliente cair, incorretamente, no fluxo de
// "número não cadastrado" mesmo já sendo cliente.
function localPhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  if (digits.length === 10) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isValidEmail(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
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

// Clique em botão/lista interativa. Formato best-effort (Z-API costuma
// espelhar o padrão de outras libs de WhatsApp) — se o nome do campo vier
// diferente na sua conta, ajuste aqui depois de checar um payload real nos
// logs da function.
function extrairBotaoId(payload: any): string | null {
  return payload.buttonsResponseMessage?.buttonId
    ?? payload.listResponseMessage?.selectedRowId
    ?? null;
}

// ── Media download ─────────────────────────────────────────────────────────

// Converte em base64 por blocos (evita estourar a pilha do spread operator
// em arquivos maiores) — usado pra mandar o anexo pra validação com o Claude
// sem precisar baixar o arquivo de novo depois de já ter subido pro storage.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function baixarEGuardarMidia(
  supabase: ReturnType<typeof createClient>,
  midia: NonNullable<ConteudoRecebido['midia']>,
  escritorioId: string,
  clienteId: string
): Promise<{ path: string; base64: string } | null> {
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
    return { path, base64: bytesToBase64(bytes) };
  } catch (err) {
    console.error('whatsapp-webhook: falha ao baixar mídia', String(err));
    return null;
  }
}

// ── Envio de mensagens (texto simples e com botões) ─────────────────────────

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

// Envia com botões via Z-API (send-button-list). Se a chamada falhar por
// qualquer motivo (endpoint/formato diferente na sua conta, instabilidade,
// etc.), cai automaticamente pra texto puro com as opções numeradas — a
// conversa nunca trava por causa disso, só perde os botões visuais.
async function enviarComBotoes(
  telefone: string,
  mensagem: string,
  opcoes: { id: string; label: string }[],
): Promise<void> {
  const zapiInstanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const zapiInstanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN');
  const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  const textoComOpcoes = `${mensagem}\n\n${opcoes.map((o, i) => `${i + 1}) ${o.label}`).join('\n')}`;

  if (!zapiInstanceId || !zapiInstanceToken || !zapiClientToken) {
    await enviarRespostaWhatsApp(telefone, textoComOpcoes);
    return;
  }

  try {
    const url = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiInstanceToken}/send-button-list`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClientToken },
      body: JSON.stringify({
        phone: normalizePhone(telefone),
        message: mensagem,
        buttonList: { buttons: opcoes.map(o => ({ id: o.id, label: o.label })) },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error('whatsapp-webhook: falha ao enviar botões, caindo pra texto', resp.status, body);
      await enviarRespostaWhatsApp(telefone, textoComOpcoes);
    }
  } catch (err) {
    console.error('whatsapp-webhook: erro ao enviar botões, caindo pra texto', String(err));
    await enviarRespostaWhatsApp(telefone, textoComOpcoes);
  }
}

// ── Identificação por e-mail (números sem cliente vinculado) ───────────────
//
// A function é stateless, então o progresso ("já pedimos o e-mail, essa é a
// 2ª tentativa") fica em pendix_whatsapp_login_pendente entre uma mensagem e
// outra. Ao achar o cliente pelo e-mail, vinculamos o telefone e paramos por
// aí — a próxima mensagem do cliente já vai bater o telefone normalmente e
// cair no fluxo normal (matcher de pendência / wizard).

async function registrarTentativaEResponder(
  supabase: ReturnType<typeof createClient>,
  telefoneDigits: string,
  telefoneRaw: string,
  mensagemBase: string,
): Promise<void> {
  const { data: pendente } = await supabase
    .from('pendix_whatsapp_login_pendente')
    .select('tentativas')
    .eq('telefone_digits', telefoneDigits)
    .maybeSingle();

  const tentativas = ((pendente?.tentativas as number | undefined) ?? 0) + 1;

  await supabase.from('pendix_whatsapp_login_pendente')
    .upsert({
      telefone_digits: telefoneDigits,
      telefone_raw: telefoneRaw,
      tentativas,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'telefone_digits' });

  const mensagem = tentativas >= 3
    ? `${mensagemBase}\n\nSe continuar com dificuldade, é só me avisar que a gente resolve por aqui mesmo.`
    : mensagemBase;

  await enviarRespostaWhatsApp(telefoneRaw, mensagem);
}

async function handleIdentificacaoFlow(
  supabase: ReturnType<typeof createClient>,
  telefoneRaw: string,
  texto: string | null,
): Promise<void> {
  const telefoneDigits = localPhoneDigits(telefoneRaw);
  const candidato = (texto ?? '').trim();

  if (isValidEmail(candidato)) {
    const { data: cliente } = await supabase
      .from('pendix_clientes')
      .select('id, escritorio_id, nome')
      .neq('email', '')
      .ilike('email', candidato)
      .limit(1)
      .maybeSingle();

    if (cliente) {
      await supabase.from('pendix_clientes')
        .update({ telefone: telefoneRaw, telefone_verificado: true })
        .eq('id', cliente.id);

      await supabase.from('pendix_whatsapp_login_pendente')
        .delete()
        .eq('telefone_digits', telefoneDigits);

      await supabase.from('pendix_historico').insert({
        escritorio_id: cliente.escritorio_id,
        cliente_id: cliente.id,
        acao: 'cliente_vinculado_whatsapp',
        descricao: `Número de WhatsApp vinculado via login por e-mail (${candidato})`,
        usuario_nome: 'WhatsApp (automático)',
      });

      await enviarRespostaWhatsApp(
        telefoneRaw,
        `✅ Encontramos seu cadastro, ${(cliente as any).nome || ''}! A partir de agora é só me chamar por aqui para enviar seus documentos ou tirar dúvidas.`,
      );
      return;
    }

    await registrarTentativaEResponder(
      supabase, telefoneDigits, telefoneRaw,
      'Não encontramos esse e-mail no nosso cadastro 🙏 Pode conferir e tentar novamente?',
    );
    return;
  }

  await registrarTentativaEResponder(
    supabase, telefoneDigits, telefoneRaw,
    'Olá! 👋 Não localizamos seu número cadastrado na plataforma. Para continuar, envie o e-mail que você usa no Pendix.',
  );
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
        model: 'claude-sonnet-5',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content:
            `Um cliente respondeu no WhatsApp: "${texto}"\n\n` +
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

// ── Validação de documento recebido (Claude visão/PDF) ─────────────────────
//
// Olha o conteúdo de verdade do arquivo (não só o nome) pra decidir se
// parece ser o documento pedido. `null` = não deu pra validar automaticamente
// (tipo de arquivo sem suporte a análise, sem API key, ou erro na chamada) —
// nesses casos a pendência cai pra revisão humana, igual ao comportamento
// anterior. Nunca rejeita sozinho: se o Claude achar que não bate, ainda
// assim fica para um humano confirmar (evita recusar por engano um
// documento válido só porque a IA teve um falso negativo).
async function validarDocumentoComClaude(
  nomeDocumento: string,
  competencia: string,
  midia: { mimeType: string; kind: MidiaKind },
  base64: string,
): Promise<{ valido: boolean; motivo: string } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  let conteudoArquivo: Record<string, unknown> | null = null;
  if (midia.kind === 'image') {
    conteudoArquivo = { type: 'image', source: { type: 'base64', media_type: midia.mimeType, data: base64 } };
  } else if (midia.kind === 'document' && midia.mimeType === 'application/pdf') {
    conteudoArquivo = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  }
  if (!conteudoArquivo) return null;

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
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            conteudoArquivo,
            {
              type: 'text',
              text: `Um cliente enviou este arquivo como o documento "${nomeDocumento}" ` +
                `referente à competência ${competencia}. Analise o conteúdo do arquivo e diga se ele realmente ` +
                `parece ser esse documento — não está em branco, corrompido, ilegível, ou é claramente outro tipo ` +
                `de documento/assunto sem relação.`,
            },
          ],
        }],
        tools: [{
          name: 'validar_documento',
          description: 'Registra se o arquivo enviado parece ser um documento válido do tipo esperado.',
          input_schema: {
            type: 'object',
            properties: {
              valido: { type: 'boolean' },
              motivo: { type: 'string', description: 'Justificativa breve (1 frase), em português.' },
            },
            required: ['valido', 'motivo'],
          },
        }],
        tool_choice: { type: 'tool', name: 'validar_documento' },
      }),
    });

    const data = await resp.json();
    const toolUse = data.content?.find((b: any) => b.type === 'tool_use');
    if (!toolUse) return null;
    return { valido: !!toolUse.input?.valido, motivo: String(toolUse.input?.motivo ?? '') };
  } catch (err) {
    console.error('whatsapp-webhook: falha ao validar documento com Claude', String(err));
    return null;
  }
}

// ── Transcrição de áudio (Transkriptor) ─────────────────────────────────────
//
// WhatsApp manda nota de voz como áudio — sem transcrever, o resto do fluxo
// (matcher de pendência, wizard, chat livre) não entende nada, porque todos
// eles trabalham em cima de `conteudo.texto`. Usa a Transkriptor pra
// transcrever a partir de uma URL: manda uma signed URL temporária do
// arquivo que a gente mesmo já subiu pro storage privado, espera processar
// (poll com tentativas limitadas — não segura a resposta do webhook
// indefinidamente pra áudios longos) e retorna o texto puro. `null` = não
// deu pra transcrever (sem API key configurada, erro, ou não terminou a
// tempo) — nesse caso o fluxo cai pro comportamento padrão de mensagem sem
// texto reconhecido.
const TRANSCRICAO_POLL_TENTATIVAS = 10;
const TRANSCRICAO_POLL_INTERVALO_MS = 3000;

async function transcreverAudio(urlPublica: string): Promise<string | null> {
  const apiKey = Deno.env.get('TRANSKRIPTOR_API_KEY');
  if (!apiKey) return null;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  };

  try {
    const respEnvio = await fetch('https://api.tor.app/developer/transcription/url', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: urlPublica, service: 'Standard', language: 'pt-BR' }),
    });
    if (!respEnvio.ok) {
      console.error('whatsapp-webhook: Transkriptor recusou envio', respEnvio.status, await respEnvio.text());
      return null;
    }
    const dataEnvio = await respEnvio.json();
    const orderId = dataEnvio?.body?.order_id ?? dataEnvio?.order_id;
    if (!orderId) {
      console.error('whatsapp-webhook: Transkriptor não retornou order_id', JSON.stringify(dataEnvio));
      return null;
    }

    for (let tentativa = 0; tentativa < TRANSCRICAO_POLL_TENTATIVAS; tentativa++) {
      await new Promise((resolve) => setTimeout(resolve, TRANSCRICAO_POLL_INTERVALO_MS));

      const respExport = await fetch(`https://api.tor.app/developer/files/${orderId}/content/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ export_type: 'txt' }),
      });

      if (respExport.status === 202) continue; // ainda processando
      if (!respExport.ok) {
        console.error('whatsapp-webhook: Transkriptor recusou export', respExport.status, await respExport.text());
        return null;
      }

      const dataExport = await respExport.json();
      const texto = dataExport?.body?.content ?? dataExport?.content;
      if (typeof texto === 'string' && texto.trim()) return texto.trim();
      console.error('whatsapp-webhook: Transkriptor retornou texto vazio', JSON.stringify(dataExport));
      return null;
    }

    console.error('whatsapp-webhook: Transkriptor não terminou dentro do orçamento de tentativas', orderId);
    return null; // não terminou dentro do orçamento de tentativas
  } catch (err) {
    console.error('whatsapp-webhook: falha ao transcrever áudio', String(err));
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

// ══════════════════════════════════════════════════════════════════════════
// ██  CHAT LIVRE — usado só quando NÃO há coleta de pendência em andamento ██
// ██  e a mensagem não parece um pedido de pendência. Sem tools, sem       ██
// ██  estado — é só uma resposta pontual, nunca cria nada sozinho.        ██
// ══════════════════════════════════════════════════════════════════════════

function buildChatLivrePrompt(nomeCliente: string): string {
  return `Você é o assistente virtual do Pendix, conversando com ${nomeCliente} pelo WhatsApp.
Responda de forma breve, profissional e amigável (1 a 3 frases).
Se o cliente perguntar sobre enviar um documento ou tiver uma pendência, avise que ele pode dizer algo como "quero criar uma pendência" ou "preciso enviar um documento" para você iniciar o cadastro guiado.
Não invente informações sobre pendências específicas do cliente — você não tem acesso a esses dados aqui.
Se o cliente perguntar algo fora do escopo contábil, redirecione gentilmente.

Regras de atendimento (gentileza e cordialidade):
- Tom sempre gentil, prestativo e profissional; nunca grosseiro, ríspido, impaciente, irônico ou frio/automático.
- Quando o cliente relatar um problema, demonstre compreensão antes de responder (ex: "Entendi, vamos verificar isso para você.").
- Nunca culpe o cliente por um erro ou problema.
- Se não souber ou não puder resolver algo, não invente informação — diga com educação que a situação precisa ser verificada.
- Evite linguagem técnica demais.
- Mensagens curtas, claras e objetivas — sem textos longos desnecessários.
- Emojis com moderação, só quando deixam a mensagem mais amigável — nunca em excesso ou em algo que pede tom mais formal.
- Ao encerrar o atendimento, quando fizer sentido, use uma despedida cordial (ex: "Tenha um ótimo dia! 😊", "Ficamos à disposição!").
- Prioridade: resolver a solicitação do cliente → ser claro → ser gentil → evitar informação desnecessária.`;
}

async function responderChatLivre(
  nomeCliente: string,
  historico: { role: 'user' | 'assistant'; content: string }[],
  mensagemAtual: string,
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return 'Olá! No momento estou com dificuldades técnicas. Tente novamente em instantes.';
  }

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
        system: buildChatLivrePrompt(nomeCliente),
        messages: [...historico, { role: 'user' as const, content: mensagemAtual }],
      }),
    });

    const data = await resp.json();
    const texto = data.content
      ?.filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    return texto || 'Oi! Posso te ajudar a registrar uma pendência — é só dizer o que você precisa enviar. 😊';
  } catch (err) {
    console.error('whatsapp-webhook: falha no chat livre', String(err));
    return 'Desculpe, tive um problema técnico. Pode tentar de novo?';
  }
}

// ── Resposta dinâmica quando já existe pendência aberta (sem anexo) ────────
//
// Antes disso era um texto fixo, sempre idêntico, ignorando o que o cliente
// escreveu (ex: uma dúvida como "pode ser em foto?" recebia de volta o mesmo
// aviso genérico de novo). Agora usa Claude, com o histórico recente da
// conversa daquela pendência, pra responder de verdade ao que foi dito —
// mantendo o mesmo papel de avisar que ainda aguardamos o envio quando fizer
// sentido, mas sem soar repetitivo/surdo. Nunca muda status da pendência
// nem promete isso — quem decide isso é o fluxo de validação de anexo.
function buildRespostaPendenciaPrompt(nomeDocumento: string, competencia: string, dataLimite: string | null): string {
  return `Você é o assistente virtual do Pendix, conversando por WhatsApp com um cliente que tem uma pendência em aberto.

Documento pendente: "${nomeDocumento}" — competência ${competencia}${dataLimite ? `, vencimento ${dataLimite}` : ''}.
O cliente ainda não enviou o arquivo (a mensagem dele agora é texto, sem anexo).
Aceitamos o arquivo em foto ou PDF, enviado diretamente aqui pelo WhatsApp.

Responda à mensagem do cliente de forma direta e útil (1 a 3 frases) — pode ser uma dúvida sobre formato, prazo, como enviar, ou qualquer outro comentário relacionado à pendência. Se a mensagem não for uma pergunta, apenas confirme que seguimos no aguardo do envio.
Não invente prazos, valores ou informações que você não tem sobre esse cliente. Não prometa mudar o status da pendência — isso é automático quando o arquivo chega.

Regras de atendimento (gentileza e cordialidade):
- Tom sempre gentil, prestativo e profissional; nunca grosseiro, ríspido ou frio/automático.
- Mensagens curtas, claras e objetivas — sem textos longos desnecessários.
- Emojis com moderação, só quando deixam a mensagem mais amigável.
- Evite repetir literalmente a mesma frase de respostas anteriores no histórico — varie a forma de dizer.`;
}

async function responderPerguntaSobrePendencia(
  nomeDocumento: string,
  competencia: string,
  dataLimite: string | null,
  historico: { role: 'user' | 'assistant'; content: string }[],
  mensagemAtual: string,
): Promise<string> {
  const fallback = `Certo! Ficamos no aguardo do envio de *${nomeDocumento}* — pode mandar por aqui mesmo, em foto ou PDF, assim que puder. Tenha um ótimo dia! 😊`;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fallback;

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
        max_tokens: 220,
        system: buildRespostaPendenciaPrompt(nomeDocumento, competencia, dataLimite),
        messages: [...historico, { role: 'user' as const, content: mensagemAtual }],
      }),
    });

    const data = await resp.json();
    const texto = data.content
      ?.filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    return texto || fallback;
  } catch (err) {
    console.error('whatsapp-webhook: falha ao responder pergunta sobre pendência', String(err));
    return fallback;
  }
}

async function carregarHistoricoConversa(
  supabase: ReturnType<typeof createClient>,
  conversaId: string,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data: msgs } = await supabase
    .from('pendix_mensagens')
    .select('remetente, conteudo')
    .eq('conversa_id', conversaId)
    .order('criada_em', { ascending: true })
    .limit(MAX_HISTORICO);

  return (msgs ?? []).map((m: any) => ({
    role: m.remetente === 'cliente' ? 'user' as const : 'assistant' as const,
    content: m.conteudo || '[arquivo enviado]',
  }));
}

function pareceQuerCriarPendencia(texto: string): boolean {
  return /pend[eê]ncia|documento|preciso (enviar|mandar)|enviar (o |um )?documento|nova solicita[cç][aã]o/i.test(texto);
}

// Sinal explícito de que o cliente quer uma pendência NOVA (não uma resposta
// à que já está em aberto) — ex: "quero criar outra pendência". Mais estrito
// que pareceQuerCriarPendencia() de propósito: esse regex genérico também
// casa com "vou mandar o documento" (uma resposta normal à pendência atual),
// então só ele não serve pra decidir se deve pular o match da pendência aberta.
function pareceQuerNovaPendenciaExplicitamente(texto: string): boolean {
  return /(nova|outra|mais uma)\s+pend[eê]ncia|pend[eê]ncia\s+(nova|outra)|criar\s+(uma\s+|outra\s+)?pend[eê]ncia|abrir\s+(uma\s+|outra\s+)?pend[eê]ncia|nova\s+solicita[cç][aã]o/i.test(texto);
}

// ══════════════════════════════════════════════════════════════════════════
// ██  WIZARD DE CRIAÇÃO DE PENDÊNCIA — passo a passo controlado pelo       ██
// ██  SERVIDOR (não pela IA). O estado (qual passo, o que já foi          ██
// ██  respondido) fica salvo em pendix_chat_sessions.coleta_estado entre  ██
// ██  uma mensagem e outra. Regra de ouro: toda mensagem recebida durante ██
// ██  o wizard SEMPRE avança pro próximo passo — nunca repete o atual.    ██
// ══════════════════════════════════════════════════════════════════════════

type PassoId =
  | 'tipo' | 'selecionar_cliente' | 'titulo' | 'descricao' | 'prioridade' | 'competencia'
  | 'periodicidade' | 'data_limite' | 'data_inicio_cobranca' | 'horario_notificacao'
  | 'anexo' | 'observacao_interna' | 'confirmacao';

// 'periodicidade' vem logo depois de 'competencia': é a pergunta "esse
// documento volta?", e ela só faz sentido depois de saber de qual mês estamos
// falando.
const ORDEM_PASSOS: PassoId[] = [
  'tipo', 'selecionar_cliente', 'titulo', 'descricao', 'prioridade', 'competencia',
  'periodicidade', 'data_limite', 'data_inicio_cobranca', 'horario_notificacao',
  'anexo', 'observacao_interna', 'confirmacao',
];

interface DadosColeta {
  tipo?: 'cliente' | 'empresa';
  cliente_alvo_id?: string;
  cliente_alvo_nome?: string;
  titulo?: string;
  descricao?: string;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
  competencia?: string;
  periodicidade?: PendixPeriodicidade;
  data_limite?: string;
  data_inicio_cobranca?: string;
  horario_notificacao?: string;
  arquivo_modelo_url?: string;
  arquivo_modelo_nome?: string | null;
  observacao_interna?: string;
}

interface EstadoColeta {
  passo: PassoId;
  dados: DadosColeta;
}

const PRIORIDADE_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

// ── Periodicidade ───────────────────────────────────────────────────────────
//
// Mesma lista (e mesma ordem) de PendixApp/lib/periodicidade.ts e de
// PendixWeb/src/pendix/lib/periodicidade.ts — a pendência criada por aqui tem
// que ser indistinguível de uma criada na web ou no app. Mexeu numa, espelhe
// nas outras e no CHECK de `periodicidade` no banco.

type PendixPeriodicidade =
  | 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral'
  | 'trimestral' | 'quadrimestral' | 'semestral' | 'anual' | 'bienal';

const PERIODICIDADE_OPCOES: { value: PendixPeriodicidade; label: string; descricao: string }[] = [
  { value: 'unica',         label: 'Única',         descricao: 'não repete' },
  { value: 'diaria',        label: 'Diária',        descricao: 'todos os dias' },
  { value: 'semanal',       label: 'Semanal',       descricao: 'a cada semana' },
  { value: 'quinzenal',     label: 'Quinzenal',     descricao: 'a cada 15 dias' },
  { value: 'mensal',        label: 'Mensal',        descricao: 'uma vez por mês' },
  { value: 'bimestral',     label: 'Bimestral',     descricao: 'a cada 2 meses' },
  { value: 'trimestral',    label: 'Trimestral',    descricao: 'a cada 3 meses' },
  { value: 'quadrimestral', label: 'Quadrimestral', descricao: 'a cada 4 meses' },
  { value: 'semestral',     label: 'Semestral',     descricao: 'a cada 6 meses' },
  { value: 'anual',         label: 'Anual',         descricao: 'uma vez por ano' },
  { value: 'bienal',        label: 'Bienal',        descricao: 'a cada 2 anos' },
];

const PERIODICIDADE_PADRAO: PendixPeriodicidade = 'unica';

/**
 * Aceita o número da lista ("5"), o nome ("mensal", "Mensal") ou como a pessoa
 * costuma escrever no WhatsApp ("todo mês", "a cada 3 meses", "não repete").
 * Devolve null quando não dá pra ter certeza — aí o passo é reenviado em vez
 * de chutar uma recorrência que o escritório não pediu.
 */
function parsePeriodicidade(texto: string): PendixPeriodicidade | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;

  const numero = t.match(/^(\d{1,2})$/);
  if (numero) return PERIODICIDADE_OPCOES[Number(numero[1]) - 1]?.value ?? null;

  const porNome = PERIODICIDADE_OPCOES.find(o => t.includes(o.value) || t.includes(o.label.toLowerCase()));
  if (porNome) return porNome.value;

  if (/(n[aã]o repete|uma [uú]nica vez|s[oó] uma vez|uma vez s[oó])/.test(t)) return 'unica';
  if (/(todo dia|todos os dias|di[aá]ri)/.test(t)) return 'diaria';
  if (/(toda semana|por semana|semanal)/.test(t)) return 'semanal';
  if (/(15 dias|quinze dias|quinzen)/.test(t)) return 'quinzenal';
  if (/(todo m[eê]s|por m[eê]s|mensal)/.test(t)) return 'mensal';
  if (/(2 meses|dois meses)/.test(t)) return 'bimestral';
  if (/(3 meses|tr[eê]s meses)/.test(t)) return 'trimestral';
  if (/(4 meses|quatro meses)/.test(t)) return 'quadrimestral';
  if (/(6 meses|seis meses)/.test(t)) return 'semestral';
  if (/(todo ano|por ano|anual|1 ano|um ano)/.test(t)) return 'anual';
  if (/(2 anos|dois anos)/.test(t)) return 'bienal';

  return null;
}

function descreverPeriodicidade(p?: PendixPeriodicidade): string {
  const o = PERIODICIDADE_OPCOES.find(x => x.value === (p ?? PERIODICIDADE_PADRAO));
  return o ? `${o.label} (${o.descricao})` : 'Única (não repete)';
}

const MESES_PT: Record<string, string> = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12',
};

function parseCompetencia(texto: string): string | null {
  const t = texto.trim().toLowerCase();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const mmYyyy = t.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}`;
  for (const [nome, num] of Object.entries(MESES_PT)) {
    if (t.includes(nome)) {
      const anoMatch = t.match(/\d{4}/);
      const ano = anoMatch ? anoMatch[0] : String(new Date().getFullYear());
      return `${ano}-${num}`;
    }
  }
  return null;
}

function parseData(texto: string): string | null {
  const t = texto.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const dmY = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  const dm = t.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dm) {
    const ano = new Date().getFullYear();
    return `${ano}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  return null;
}

function parseHorario(texto: string): string | null {
  const t = texto.trim();
  const m = t.match(/^([01]?\d|2[0-3])[:h]([0-5]\d)$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// Todos os cadastros do Pendix (pendix_clientes) do escritório — usado pro
// passo "selecionar_cliente", pra deixar explícito pra qual cadastro a
// pendência está sendo criada. Sempre lista todo mundo do escritório (não só
// quem compartilha o e-mail do contato) — o mesmo número de WhatsApp pode
// representar mais de uma empresa/cliente. Se só existe um cadastro no
// escritório inteiro, não tem escolha real e o passo resolve sozinho.
async function buscarClientesDoEscritorio(
  supabase: ReturnType<typeof createClient>,
  escritorioId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data } = await supabase
    .from('pendix_clientes')
    .select('id, nome')
    .eq('escritorio_id', escritorioId)
    .order('nome', { ascending: true });
  return (data ?? []) as { id: string; nome: string }[];
}

function resumoTexto(dados: DadosColeta, nomeCliente: string): string {
  const linhas = [
    `📋 *Resumo da pendência*`,
    `Para: ${dados.cliente_alvo_nome ?? nomeCliente} (${dados.tipo === 'empresa' ? 'Empresa' : 'Cliente'})`,
    `Título: ${dados.titulo}`,
  ];
  if (dados.descricao) linhas.push(`Descrição: ${dados.descricao}`);
  linhas.push(`Prioridade: ${PRIORIDADE_LABEL[dados.prioridade ?? 'media']}`);
  linhas.push(`Competência: ${dados.competencia}`);
  linhas.push(`Periodicidade: ${descreverPeriodicidade(dados.periodicidade)}`);
  if (dados.data_limite) linhas.push(`Vencimento: ${dados.data_limite}`);
  if (dados.data_inicio_cobranca) linhas.push(`Início da cobrança: ${dados.data_inicio_cobranca}`);
  linhas.push(`Horário de notificação: ${dados.horario_notificacao ?? '09:00 (padrão)'}`);
  if (dados.arquivo_modelo_nome) linhas.push(`Anexo de exemplo: ${dados.arquivo_modelo_nome}`);
  if (dados.observacao_interna) linhas.push(`Observação interna: ${dados.observacao_interna}`);
  linhas.push('', 'Posso confirmar e criar essa pendência?');
  return linhas.join('\n');
}

function mensagemDoPasso(
  passo: PassoId, dados: DadosColeta, nomeCliente: string,
  candidatosCliente: { id: string; nome: string }[] = [],
): { texto: string; botoes: { id: string; label: string }[] } {
  switch (passo) {
    case 'tipo':
      return {
        texto: `Vamos criar uma pendência para *${nomeCliente}*. É para Cliente (pessoa física) ou Empresa?`,
        botoes: [{ id: 'tipo_cliente', label: 'Cliente' }, { id: 'tipo_empresa', label: 'Empresa' }],
      };
    case 'selecionar_cliente':
      return {
        texto: 'Encontramos mais de um cadastro no Pendix. Para qual cadastro é essa pendência?',
        botoes: candidatosCliente.map(c => ({ id: `cliente_${c.id}`, label: c.nome })),
      };
    case 'titulo':
      return {
        texto: `Essa pendência é para *${dados.cliente_alvo_nome ?? nomeCliente}*. Qual o *título* do documento? (ex: Extrato Bancário) _(obrigatório para controle de pendências)_`,
        botoes: [],
      };
    case 'descricao':
      return {
        texto: 'Quer adicionar uma *descrição* com mais detalhes do que precisa ser enviado? Pode escrever, ou tocar em Pular.',
        botoes: [{ id: 'pular', label: 'Pular' }],
      };
    case 'prioridade':
      return {
        texto: 'Qual a *prioridade*? (ou digite "urgente")',
        botoes: [{ id: 'prio_baixa', label: 'Baixa' }, { id: 'prio_media', label: 'Média' }, { id: 'prio_alta', label: 'Alta' }],
      };
    case 'competencia':
      return {
        texto: 'Qual a *competência* (mês de referência)? Ex: agosto/2026 ou 2026-08. _(obrigatório para controle de pendências)_',
        botoes: [],
      };
    case 'periodicidade':
      // Sem botões de propósito: são 11 opções e o WhatsApp só mostra 3 —
      // a lista numerada em texto é a única que cabe inteira.
      return {
        texto: 'Esse documento *se repete*? Responda com o número da opção:\n\n'
          + PERIODICIDADE_OPCOES.map((o, i) => `${i + 1}) ${o.label} — ${o.descricao}`).join('\n')
          + '\n\nSe repetir, cada vez que o documento for recebido a próxima cobrança nasce sozinha.',
        botoes: [],
      };
    case 'data_limite':
      return {
        texto: 'Qual a *data de vencimento*? Mande no formato DD/MM/AAAA. _(obrigatório para controle de pendências)_',
        botoes: [],
      };
    case 'data_inicio_cobranca':
      return {
        texto: 'Quando devemos começar a *cobrar* esse documento? Mande uma data no formato DD/MM/AAAA. _(obrigatório para controle de pendências)_',
        botoes: [],
      };
    case 'horario_notificacao':
      return {
        texto: 'A que *horário* você quer que a gente envie as cobranças desse documento por aqui? Mande no formato HH:MM (ex: 09:00), ou toque em Pular para usar o horário padrão (09:00).',
        botoes: [{ id: 'pular', label: 'Pular' }],
      };
    case 'anexo':
      return {
        texto: 'Envie uma foto ou PDF de *exemplo* do que espera receber. _(obrigatório para controle de pendências)_',
        botoes: [],
      };
    case 'observacao_interna':
      return {
        texto: 'Por último, quer adicionar uma *observação interna* (só a nossa equipe vê, não fica visível pra você)? Pode escrever, ou tocar em Pular.',
        botoes: [{ id: 'pular', label: 'Pular' }],
      };
    case 'confirmacao':
      return {
        texto: resumoTexto(dados, nomeCliente),
        botoes: [{ id: 'confirmar', label: 'Confirmar' }, { id: 'cancelar', label: 'Cancelar' }],
      };
  }
}

async function enviarPassoColeta(
  supabase: ReturnType<typeof createClient>,
  sessionId: string, telefone: string, passo: PassoId, dados: DadosColeta, nomeCliente: string,
  candidatosCliente: { id: string; nome: string }[] = [],
): Promise<void> {
  const { texto, botoes } = mensagemDoPasso(passo, dados, nomeCliente, candidatosCliente);
  if (botoes.length) await enviarComBotoes(telefone, texto, botoes);
  else await enviarRespostaWhatsApp(telefone, texto);

  await supabase.from('pendix_chat_mensagens').insert({
    session_id: sessionId, remetente: 'ia', conteudo: texto, metadata: { passo },
  });
}

async function criarPendenciaFinal(
  supabase: ReturnType<typeof createClient>,
  cliente: { id: string; escritorio_id: string },
  dados: DadosColeta,
): Promise<string | null> {
  const clienteAlvoId = dados.cliente_alvo_id || cliente.id;
  const payload: Record<string, unknown> = {
    escritorio_id: cliente.escritorio_id,
    cliente_id: clienteAlvoId,
    nome_documento: dados.titulo || 'Documento',
    competencia: dados.competencia || mesAtual(),
    status: 'pendente',
    tipo: dados.tipo === 'empresa' ? 'empresa' : 'cliente',
    prioridade: dados.prioridade || 'media',
    periodicidade: dados.periodicidade || PERIODICIDADE_PADRAO,
    requer_revisao_humana: true,
    origem: 'whatsapp',
  };
  if (dados.descricao) payload.descricao = dados.descricao;
  if (dados.data_limite) payload.data_limite = dados.data_limite;
  if (dados.data_inicio_cobranca) payload.data_inicio_cobranca = dados.data_inicio_cobranca;
  if (dados.horario_notificacao) payload.horario_notificacao = dados.horario_notificacao;
  if (dados.observacao_interna) payload.observacoes = dados.observacao_interna;
  if (dados.arquivo_modelo_url) {
    payload.arquivo_modelo_url = dados.arquivo_modelo_url;
    payload.arquivo_modelo_nome = dados.arquivo_modelo_nome ?? null;
  }

  const { data: nova, error } = await supabase
    .from('pendix_pendencias')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('whatsapp-webhook: falha ao criar pendência (wizard)', error.message);
    return null;
  }

  await supabase.from('pendix_historico').insert({
    escritorio_id: cliente.escritorio_id,
    cliente_id: clienteAlvoId,
    pendencia_id: nova.id,
    acao: 'pendencia_criada_whatsapp',
    descricao: `Pendência "${dados.titulo}" (${dados.competencia}) criada via WhatsApp`,
    usuario_nome: 'WhatsApp',
  });

  return nova.id as string;
}

// Campo obrigatório sem resposta válida: reenvia o mesmo passo com um aviso,
// sem avançar o estado — mantém a regra de nunca repetir o passo em loop
// (aqui é uma reação a uma resposta inválida, não uma repetição "sem motivo").
async function reenviarPassoObrigatorio(
  supabase: ReturnType<typeof createClient>,
  sessionId: string, telefone: string, passo: PassoId, dados: DadosColeta, nomeCliente: string,
): Promise<void> {
  const { texto, botoes } = mensagemDoPasso(passo, dados, nomeCliente);
  const textoComAviso = `Desculpa, não consegui entender essa resposta 🙏 Esse campo é obrigatório para a gente controlar direitinho a pendência.\n\n${texto}`;
  if (botoes.length) await enviarComBotoes(telefone, textoComAviso, botoes);
  else await enviarRespostaWhatsApp(telefone, textoComAviso);

  await supabase.from('pendix_chat_mensagens').insert({
    session_id: sessionId, remetente: 'ia', conteudo: textoComAviso, metadata: { passo, reenvio_obrigatorio: true },
  });
}

async function processarPassoColeta(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  cliente: { id: string; escritorio_id: string; nome?: string; email?: string },
  telefone: string,
  estado: EstadoColeta,
  texto: string | null,
  botaoId: string | null,
  anexoPath: string | null,
  midiaFileName: string | null,
  midiaKind: MidiaKind | null,
  nomeCliente: string,
): Promise<{ ok: boolean; pendencia_id?: string }> {
  const passo = estado.passo;
  const dados = estado.dados;
  const conteudoTexto = (texto ?? '').trim();
  const pulou = botaoId === 'pular' || /^(pular|pula|n[aã]o|nao)$/i.test(conteudoTexto);

  // Passo final: confirma (cria de verdade) ou cancela — nunca reabre o wizard sozinho
  if (passo === 'confirmacao') {
    const confirmou = botaoId === 'confirmar' || /^(confirmar|confirmo|sim|ok|pode)/i.test(conteudoTexto);

    if (confirmou) {
      const pendenciaId = await criarPendenciaFinal(supabase, cliente, dados);
      await supabase.from('pendix_chat_sessions')
        .update({ coleta_estado: null, status: 'encerrada', atualizada_em: new Date().toISOString() })
        .eq('id', sessionId);
      const msg = pendenciaId
        ? '✅ Pendência criada com sucesso! Obrigado.'
        : 'Ops, tive um problema para salvar a pendência 🙏 Pode tentar de novo em instantes?';
      await enviarRespostaWhatsApp(telefone, msg);
      await supabase.from('pendix_chat_mensagens').insert({ session_id: sessionId, remetente: 'ia', conteudo: msg });
      return { ok: !!pendenciaId, pendencia_id: pendenciaId ?? undefined };
    }

    await supabase.from('pendix_chat_sessions')
      .update({ coleta_estado: null, status: 'encerrada', atualizada_em: new Date().toISOString() })
      .eq('id', sessionId);
    const msg = 'Sem problemas, cancelei essa pendência. Se quiser começar de novo é só me chamar. 👋';
    await enviarRespostaWhatsApp(telefone, msg);
    await supabase.from('pendix_chat_mensagens').insert({ session_id: sessionId, remetente: 'ia', conteudo: msg });
    return { ok: true };
  }

  switch (passo) {
    case 'tipo':
      dados.tipo = (botaoId === 'tipo_empresa' || /empresa/i.test(conteudoTexto)) ? 'empresa' : 'cliente';
      break;
    case 'selecionar_cliente': {
      const idEscolhidoBotao = botaoId?.startsWith('cliente_') ? botaoId.slice('cliente_'.length) : null;
      const candidatos = await buscarClientesDoEscritorio(supabase, cliente.escritorio_id);
      const escolhido = (idEscolhidoBotao && candidatos.find(c => c.id === idEscolhidoBotao))
        || candidatos.find(c => c.nome.toLowerCase() === conteudoTexto.toLowerCase())
        || candidatos[0];
      dados.cliente_alvo_id = escolhido?.id ?? cliente.id;
      dados.cliente_alvo_nome = escolhido?.nome ?? nomeCliente;
      break;
    }
    case 'titulo':
      if (!conteudoTexto) {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.titulo = conteudoTexto;
      break;
    case 'descricao':
      if (!pulou && conteudoTexto) dados.descricao = conteudoTexto;
      break;
    case 'prioridade':
      if (botaoId === 'prio_alta' || /\balta\b/i.test(conteudoTexto)) dados.prioridade = 'alta';
      else if (botaoId === 'prio_baixa' || /\bbaixa\b/i.test(conteudoTexto)) dados.prioridade = 'baixa';
      else if (/urgente/i.test(conteudoTexto)) dados.prioridade = 'urgente';
      else dados.prioridade = 'media';
      break;
    case 'competencia': {
      const competencia = parseCompetencia(conteudoTexto);
      if (!competencia) {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.competencia = competencia;
      break;
    }
    case 'periodicidade': {
      const periodicidade = parsePeriodicidade(conteudoTexto);
      if (!periodicidade) {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.periodicidade = periodicidade;
      break;
    }
    case 'data_limite': {
      const dataLimite = !pulou ? parseData(conteudoTexto) : null;
      if (!dataLimite) {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.data_limite = dataLimite;
      break;
    }
    case 'data_inicio_cobranca': {
      const dataInicio = !pulou ? parseData(conteudoTexto) : null;
      if (!dataInicio) {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.data_inicio_cobranca = dataInicio;
      break;
    }
    case 'horario_notificacao':
      if (!pulou) {
        const horario = parseHorario(conteudoTexto);
        if (horario) dados.horario_notificacao = horario;
      }
      break;
    case 'anexo':
      if (!anexoPath || midiaKind === 'audio') {
        await reenviarPassoObrigatorio(supabase, sessionId, telefone, passo, dados, nomeCliente);
        return { ok: true };
      }
      dados.arquivo_modelo_url = anexoPath;
      dados.arquivo_modelo_nome = midiaFileName;
      break;
    case 'observacao_interna':
      if (!pulou && conteudoTexto) dados.observacao_interna = conteudoTexto;
      break;
  }

  // Regra de ouro: sempre avança pro próximo passo da ORDEM_PASSOS, nunca repete o atual
  // (as validações acima já retornaram antes daqui quando um campo obrigatório ficou inválido).
  const idxAtual = ORDEM_PASSOS.indexOf(passo);
  let proximo = ORDEM_PASSOS[idxAtual + 1];
  let candidatosProximoPasso: { id: string; nome: string }[] = [];

  // "selecionar_cliente" é dinâmico: se o escritório só tem um cadastro no
  // Pendix (o dele mesmo), resolve sozinho sem interromper o wizard — só
  // pergunta de fato quando existe mais de um cadastro pra escolher.
  if (proximo === 'selecionar_cliente') {
    candidatosProximoPasso = await buscarClientesDoEscritorio(supabase, cliente.escritorio_id);
    if (candidatosProximoPasso.length <= 1) {
      dados.cliente_alvo_id = candidatosProximoPasso[0]?.id ?? cliente.id;
      dados.cliente_alvo_nome = candidatosProximoPasso[0]?.nome ?? nomeCliente;
      proximo = ORDEM_PASSOS[ORDEM_PASSOS.indexOf('selecionar_cliente') + 1];
      candidatosProximoPasso = [];
    }
  }

  const novoEstado: EstadoColeta = { passo: proximo, dados };

  await supabase.from('pendix_chat_sessions')
    .update({ coleta_estado: novoEstado, atualizada_em: new Date().toISOString() })
    .eq('id', sessionId);
  await enviarPassoColeta(supabase, sessionId, telefone, proximo, dados, nomeCliente, candidatosProximoPasso);

  return { ok: true };
}

async function handleWhatsAppConversa(
  supabase: ReturnType<typeof createClient>,
  cliente: { id: string; escritorio_id: string; nome?: string; email?: string; telefone_verificado?: boolean },
  telefone: string,
  conteudo: ConteudoRecebido,
  anexoPath: string | null,
  botaoId: string | null,
): Promise<{ ok: boolean; pendencia_id?: string }> {
  const nomeCliente = (cliente as any).nome || 'Cliente';
  const sessionId = await acharOuCriarSessaoChat(supabase, cliente.escritorio_id, cliente.id, telefone);

  const textoCliente = conteudo.texto
    || (conteudo.midia ? `[${conteudo.midia.kind}: ${conteudo.midia.fileName}]` : null)
    || (botaoId ? `[botão: ${botaoId}]` : '[mensagem sem conteúdo]');

  await supabase.from('pendix_chat_mensagens').insert({
    session_id: sessionId,
    remetente: 'cliente',
    conteudo: textoCliente,
    arquivo_url: anexoPath,
    metadata: { telefone, botao_id: botaoId },
  });

  const { data: sessaoAtual } = await supabase
    .from('pendix_chat_sessions')
    .select('coleta_estado')
    .eq('id', sessionId)
    .maybeSingle();
  const estado = (sessaoAtual?.coleta_estado ?? null) as EstadoColeta | null;

  // Já tem coleta em andamento — processa o passo atual e avança
  if (estado) {
    return await processarPassoColeta(
      supabase, sessionId, cliente, telefone, estado,
      conteudo.texto, botaoId, anexoPath, conteudo.midia?.fileName ?? null, conteudo.midia?.kind ?? null, nomeCliente,
    );
  }

  // Sem coleta ativa: inicia o wizard se a mensagem parece um pedido de pendência —
  // mas só para contatos que confirmaram o e-mail cadastrado pelo próprio WhatsApp
  // (telefone_verificado). Um telefone cadastrado direto pela equipe do escritório,
  // sem nunca ter passado por essa confirmação, não pode criar pendência nova.
  if (conteudo.texto && pareceQuerCriarPendencia(conteudo.texto)) {
    if (!cliente.telefone_verificado) {
      const msg = 'No momento não é possível criar uma pendência por aqui — seu contato ainda não está confirmado no Pendix. Assim que confirmarmos seu número, você já vai poder criar por aqui. 🙏';
      await supabase.from('pendix_chat_mensagens').insert({ session_id: sessionId, remetente: 'ia', conteudo: msg });
      await enviarRespostaWhatsApp(telefone, msg);
      return { ok: true };
    }

    const novoEstado: EstadoColeta = { passo: 'tipo', dados: {} };
    await supabase.from('pendix_chat_sessions')
      .update({ coleta_estado: novoEstado, atualizada_em: new Date().toISOString() })
      .eq('id', sessionId);
    await enviarPassoColeta(supabase, sessionId, telefone, 'tipo', novoEstado.dados, nomeCliente);
    return { ok: true };
  }

  // Senão, é conversa livre — resposta pontual, sem criar nada
  const historico = await carregarHistoricoChat(supabase, sessionId);
  const historicoSemAtual = historico.slice(0, -1);
  const resposta = await responderChatLivre(nomeCliente, historicoSemAtual, textoCliente);

  await supabase.from('pendix_chat_mensagens').insert({ session_id: sessionId, remetente: 'ia', conteudo: resposta });
  await supabase.from('pendix_chat_sessions').update({ atualizada_em: new Date().toISOString() }).eq('id', sessionId);
  await enviarRespostaWhatsApp(telefone, resposta);

  return { ok: true };
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

    // Mensagens de GRUPO do WhatsApp não são de um cliente individual — a
    // Z-API manda o telefone como um JID de grupo (ex: "1203...-group"), que
    // nunca bate com nenhum pendix_clientes.telefone. Sem esse filtro, toda
    // mensagem postada em qualquer grupo que o número do Pendix participa
    // caía no fluxo de "número não cadastrado" e o bot respondia pro grupo
    // inteiro a cada mensagem — chegou a mais de mil respostas repetidas
    // para um único grupo em produção antes desse fix.
    const ehMensagemDeGrupo = payload.isGroup === true
      || (typeof payload.phone === 'string' && payload.phone.includes('-group'));
    if (ehMensagemDeGrupo) {
      return new Response(JSON.stringify({ ignored: true, reason: 'group message' }), { status: 200 });
    }

    // Z-API reentrega o mesmo webhook às vezes (at-least-once delivery).
    // Sem essa trava, o wizard processa a mesma mensagem do cliente duas
    // vezes e o passo avança sozinho, desalinhando a próxima resposta real.
    const messageId = payload.messageId ? String(payload.messageId) : null;
    if (messageId) {
      const { error: dedupError } = await supabase
        .from('pendix_whatsapp_eventos_processados')
        .insert({ message_id: messageId });
      if (dedupError) {
        return new Response(JSON.stringify({ ignored: true, reason: 'duplicate' }), { status: 200 });
      }
    }

    const conteudo = extrairConteudo(payload);
    const botaoId = extrairBotaoId(payload);
    if (!conteudo.texto && !conteudo.midia && !botaoId) {
      return new Response(JSON.stringify({ ignored: true, reason: 'no content' }), { status: 200 });
    }

    const telefone = localPhoneDigits(payload.phone ?? '');
    const { data: clientes } = await supabase
      .from('pendix_clientes')
      .select('id, escritorio_id, telefone, nome, email, telefone_verificado');
    const cliente = (clientes ?? []).find((c: any) => localPhoneDigits(c.telefone) === telefone);

    if (!cliente) {
      await handleIdentificacaoFlow(supabase, payload.phone ?? '', conteudo.texto);
      return new Response(JSON.stringify({ ok: true, mode: 'identificacao' }), { status: 200 });
    }

    let anexoPath: string | null = null;
    let anexoBase64: string | null = null;
    if (conteudo.midia) {
      const guardado = await baixarEGuardarMidia(supabase, conteudo.midia, cliente.escritorio_id as string, cliente.id as string);
      anexoPath = guardado?.path ?? null;
      anexoBase64 = guardado?.base64 ?? null;
    }

    // Nota de voz: transcreve e trata como se o cliente tivesse digitado —
    // deixa o resto do fluxo (matcher, wizard, chat livre) funcionar sem
    // nenhuma lógica nova, já que todos eles já leem `conteudo.texto`.
    if (conteudo.midia?.kind === 'audio' && anexoPath) {
      const { data: signedData } = await supabase.storage
        .from('pendix-anexos')
        .createSignedUrl(anexoPath, 900);
      if (signedData?.signedUrl) {
        const transcricao = await transcreverAudio(signedData.signedUrl);
        if (transcricao) conteudo.texto = transcricao;
      }
    }

    // Se já existe um wizard de criação em andamento pra esse cliente, TODA
    // mensagem pertence a ele — nunca tenta casar com uma pendência aberta
    // nesse meio-tempo. Sem essa checagem, um clique de botão do wizard (ex:
    // "Cliente") podia ser sequestrado pelo fluxo original de resposta a
    // pendência sempre que já havia uma pendência aberta, travando o wizard.
    const { data: sessaoComWizardAtivo } = await supabase
      .from('pendix_chat_sessions')
      .select('coleta_estado')
      .eq('cliente_id', cliente.id)
      .eq('status', 'ativa')
      .not('coleta_estado', 'is', null)
      .order('atualizada_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    const temWizardEmAndamento = !!sessaoComWizardAtivo?.coleta_estado;

    // ── Buscar pendências abertas (fluxo original) ─────────────────────
    const { data: candidatas } = await supabase
      .from('pendix_pendencias')
      .select('id, nome_documento, competencia, data_limite')
      .eq('cliente_id', cliente.id)
      .in('status', PENDENCIA_STATUS_ABERTA);

    // Se o cliente pediu explicitamente uma pendência NOVA, não tenta casar
    // com a que já está aberta — senão "quero criar outra pendência" vira
    // silenciosamente uma resposta à pendência antiga em vez de abrir o wizard.
    const querNovaExplicitamente = !!conteudo.texto && pareceQuerNovaPendenciaExplicitamente(conteudo.texto);

    let pendenciaId: string | null = null;
    if (!temWizardEmAndamento && !querNovaExplicitamente && candidatas && candidatas.length >= 1) {
      if (candidatas.length === 1) {
        // Só há uma pendência aberta pra esse cliente — não tem ambiguidade
        // real pra resolver, então qualquer resposta (com ou sem anexo) é
        // tratada como sendo dela. Se não veio anexo, o próprio fluxo abaixo
        // já responde deixando claro que ainda estamos aguardando o arquivo,
        // sem marcar a pendência como em análise.
        pendenciaId = candidatas[0].id as string;
      } else {
        // Mais de uma pendência aberta: sempre confirma com o Claude, mesmo
        // com anexo, já que não dá pra saber a qual pendência a resposta se
        // refere sem isso.
        const textoParaClaude = conteudo.texto
          ?? (conteudo.midia ? `[arquivo enviado: ${conteudo.midia.fileName}]` : null);
        if (textoParaClaude) {
          pendenciaId = await escolherPendenciaComClaude(
            textoParaClaude,
            candidatas as { id: string; nome_documento: string; competencia: string }[]
          );
        }
      }
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

      const pendenciaMatch = candidatas?.find((c: any) => c.id === pendenciaId);
      const nomeDocumento = pendenciaMatch?.nome_documento ?? 'documento';

      // Áudio não conta como "arquivo enviado pra cumprir a pendência" — é
      // uma mensagem falada (já transcrita em conteudo.texto acima), então
      // cai no mesmo branch de resposta em texto, não no de documento.
      if (anexoPath && conteudo.midia?.kind !== 'audio') {
        // Analisa o conteúdo de verdade do arquivo (não só o nome) antes de
        // decidir o que fazer — só finaliza sozinho quando o Claude confirma
        // com confiança que é o documento certo; qualquer outra coisa (não
        // bateu, tipo de arquivo sem suporte a análise, IA indisponível)
        // continua indo pra revisão humana, igual ao comportamento anterior.
        const validacao = (anexoBase64 && conteudo.midia)
          ? await validarDocumentoComClaude(nomeDocumento, pendenciaMatch?.competencia ?? '', conteudo.midia, anexoBase64)
          : null;
        const aprovado = validacao?.valido === true;

        await supabase.from('pendix_pendencias').update({
          status: aprovado ? 'recebido' : 'em_analise',
          requer_revisao_humana: !aprovado,
          arquivo_url: anexoPath,
          arquivo_nome: conteudo.midia?.fileName ?? null,
          ...(aprovado ? { data_recebimento: new Date().toISOString() } : {}),
        }).eq('id', pendenciaId);

        await supabase.from('pendix_historico').insert({
          escritorio_id: cliente.escritorio_id,
          cliente_id: cliente.id,
          pendencia_id: pendenciaId,
          acao: aprovado ? 'documento_aprovado' : (validacao ? 'documento_reprovado' : 'documento_em_revisao'),
          descricao: validacao?.motivo
            ? `${aprovado ? 'Validado automaticamente pela IA' : 'IA sinalizou possível problema'}: ${validacao.motivo}`
            : (conteudo.texto ?? `Arquivo recebido: ${conteudo.midia?.fileName ?? ''}`),
          usuario_nome: aprovado || validacao ? 'IA (automático)' : 'WhatsApp (automático)',
        });

        await enviarRespostaWhatsApp(
          payload.phone,
          aprovado
            ? `✅ Recebemos e conferimos seu envio para *${nomeDocumento}*! Está tudo certo, muito obrigado! 😊`
            : validacao
              ? `Recebemos seu arquivo, mas não conseguimos confirmar que é o(a) *${nomeDocumento}* certo(a) — ${validacao.motivo} Pode conferir e reenviar, por favor? 🙏`
              : `📎 Recebemos seu envio para *${nomeDocumento}*! Vamos analisar e te avisamos por aqui se precisar de mais alguma coisa.`,
        );
      } else {
        // Sem anexo: nenhum documento foi de fato enviado, então a pendência
        // continua 'pendente' (não vira 'em_analise' — isso é só pra quando
        // chega um arquivo de verdade). A resposta é gerada pela IA com o
        // histórico da conversa, pra responder de verdade ao que o cliente
        // disse (dúvida sobre formato/prazo etc.) em vez de repetir sempre o
        // mesmo aviso genérico, mas sem prometer nada sobre status.
        const textoParaResposta = conteudo.texto
          ?? (botaoId ? `[clicou: ${botaoId}]` : 'Enviou uma mensagem sem texto reconhecido.');
        const historicoConversa = await carregarHistoricoConversa(supabase, conversaId);
        const respostaDinamica = await responderPerguntaSobrePendencia(
          nomeDocumento,
          pendenciaMatch?.competencia ?? '',
          (pendenciaMatch as any)?.data_limite ?? null,
          historicoConversa,
          textoParaResposta,
        );

        await supabase.from('pendix_historico').insert({
          escritorio_id: cliente.escritorio_id,
          cliente_id: cliente.id,
          pendencia_id: pendenciaId,
          acao: 'resposta_enviada',
          descricao: conteudo.texto,
          usuario_nome: 'WhatsApp (automático)',
        });

        await enviarRespostaWhatsApp(payload.phone, respostaDinamica);

        await supabase.from('pendix_mensagens').insert({
          conversa_id: conversaId,
          remetente: 'agente',
          tipo: 'texto',
          conteudo: respostaDinamica,
        });
      }

      return new Response(JSON.stringify({ ok: true, pendencia_id: pendenciaId, anexo: anexoPath }), { status: 200 });
    }

    // ── NOVO: wizard de criação / chat livre — sem pendência correspondente ──
    const chatResult = await handleWhatsAppConversa(
      supabase,
      cliente as { id: string; escritorio_id: string; nome?: string; email?: string; telefone_verificado?: boolean },
      payload.phone,
      conteudo,
      anexoPath,
      botaoId,
    );

    return new Response(JSON.stringify({
      ok: chatResult.ok,
      mode: 'wizard',
      pendencia_id: chatResult.pendencia_id ?? null,
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ ignored: true, reason: 'unknown type' }), { status: 200 });
});
