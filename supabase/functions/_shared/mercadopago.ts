// Validação de origem e parsing das notificações do Mercado Pago.
//
// Puro: sem API do Deno, sem rede. Usa apenas Web Crypto, disponível tanto
// no Deno quanto no Node do Vitest.
//
// O formato foi conferido na documentação oficial (Webhooks > validar origem
// da notificação, MLB). Quatro detalhes que não são óbvios e que, se errados,
// fazem o webhook recusar notificação legítima ou — pior — aceitar forjada:
//
// 1. O `data.id` que entra no manifest é o dos QUERY PARAMS da URL, não o do
//    corpo. Normalmente coincidem, mas a assinatura é sobre o da URL.
// 2. Valor ausente SAI do manifest. Sem x-request-id o manifest é
//    "id:X;ts:Y;" — não "id:X;request-id:;ts:Y;".
// 3. `data.id` alfanumérico com maiúsculas vira minúsculo antes do hash.
// 4. A doc diz que `ts` é em milissegundos, mas o exemplo dela mesma
//    (ts=1704908010) tem 10 dígitos, que é segundos. Normalizamos pelo
//    número de dígitos em vez de apostar num dos dois.

export type TipoNotificacao =
  | 'subscription_preapproval'
  | 'subscription_authorized_payment'
  | 'payment'
  | 'desconhecido';

export type NotificacaoMP = {
  tipo: TipoNotificacao;
  /** Id do recurso a consultar na API do Mercado Pago. */
  recursoId: string;
  /** Valor exato que entra no manifest da assinatura. */
  dataIdAssinatura: string;
  eventId: string;
};

/** Janela aceita entre o ts assinado e agora. Barra replay de notificação
 *  capturada. O Mercado Pago reenvia em minutos, não em horas. */
const JANELA_MS = 5 * 60 * 1000;

const TIPOS_CONHECIDOS: TipoNotificacao[] = [
  'subscription_preapproval',
  'subscription_authorized_payment',
  'payment',
];

/** Monta o template assinado pelo Mercado Pago.
 *
 *  Segmento com valor ausente é OMITIDO, não deixado vazio — a doc é
 *  explícita, e usar string vazia produz hash diferente. */
export function montarManifest(
  dataId: string | null,
  xRequestId: string | null,
  ts: string,
): string {
  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId.toLowerCase()};`);
  if (xRequestId) partes.push(`request-id:${xRequestId};`);
  partes.push(`ts:${ts};`);
  return partes.join('');
}

export function parseNotificacao(
  body: unknown,
  headers: Headers,
  urlCompleta: string,
): NotificacaoMP {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;

  // A query manda: é sobre ela que a assinatura foi calculada.
  const daQuery = new URL(urlCompleta).searchParams.get('data.id');
  const doCorpo = data.id != null ? String(data.id) : '';
  const dataId = daQuery || doCorpo;
  if (!dataId) throw new Error('notificacao sem data.id (nem na query, nem no corpo)');

  // `type` é o campo atual; `topic` aparece em integrações legadas.
  const bruto = String(b.type ?? b.topic ?? '');
  const tipo = (TIPOS_CONHECIDOS as string[]).includes(bruto)
    ? (bruto as TipoNotificacao)
    : 'desconhecido';

  const requestId = headers.get('x-request-id') ?? 'sem-request-id';
  return {
    tipo,
    recursoId: dataId,
    dataIdAssinatura: dataId,
    eventId: `${requestId}:${dataId}`,
  };
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparação em tempo constante — `===` em string vaza tempo por prefixo,
 *  o que permitiria descobrir a assinatura byte a byte. */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Normaliza o ts para milissegundos.
 *
 *  Timestamps em segundos têm 10 dígitos até 2286; em milissegundos, 13.
 *  O corte em 1e12 separa os dois com folga de séculos. */
function tsParaMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
}

export async function validarAssinatura(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  agoraMs: number;
}): Promise<boolean> {
  const { xSignature, xRequestId, dataId, secret, agoraMs } = opts;
  if (!xSignature) return false;

  // Segredo vazio validaria qualquer coisa contra um HMAC de chave vazia.
  // Melhor recusar tudo do que aceitar tudo por secret não configurado.
  if (!secret) return false;

  const partes = new Map(
    xSignature.split(',').map((p) => {
      const [k, ...resto] = p.split('=');
      return [k.trim(), resto.join('=').trim()] as const;
    }),
  );
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(agoraMs - tsParaMs(tsNum)) > JANELA_MS) return false;

  const manifest = montarManifest(dataId, xRequestId, ts);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinado = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return igualSeguro(hex(assinado), v1);
}
