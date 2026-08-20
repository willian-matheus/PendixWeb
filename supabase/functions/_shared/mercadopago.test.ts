import { describe, it, expect } from 'vitest';
import { parseNotificacao, validarAssinatura, montarManifest } from './mercadopago';

const SECRET = 'segredo-de-teste';

async function assinar(manifest: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('montarManifest', () => {
  it('monta os tres segmentos quando tudo esta presente', () => {
    expect(montarManifest('123', 'req-a', '1704908010')).toBe(
      'id:123;request-id:req-a;ts:1704908010;',
    );
  });

  // A doc é explícita: valor ausente sai do manifest inteiro, não vira vazio.
  it('omite o segmento request-id quando o header nao veio', () => {
    expect(montarManifest('123', null, '1704908010')).toBe('id:123;ts:1704908010;');
  });

  it('omite o segmento id quando data.id nao veio', () => {
    expect(montarManifest(null, 'req-a', '1704908010')).toBe('request-id:req-a;ts:1704908010;');
  });

  it('converte data.id alfanumerico maiusculo para minusculo', () => {
    expect(montarManifest('ORD01JQ4S4KY8HWQ6NA5PXB65B3D3', 'req-a', '1')).toBe(
      'id:ord01jq4s4ky8hwq6na5pxb65b3d3;request-id:req-a;ts:1;',
    );
  });
});

describe('validarAssinatura', () => {
  const dataId = '123456';
  const xRequestId = 'req-abc';
  const tsSegundos = 1704908010;
  const agoraMs = tsSegundos * 1000;

  it('aceita assinatura correta com ts em segundos', async () => {
    const v1 = await assinar(montarManifest(dataId, xRequestId, String(tsSegundos)));
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraMs: agoraMs + 10_000,
    })).resolves.toBe(true);
  });

  it('aceita assinatura correta com ts em milissegundos', async () => {
    const tsMs = agoraMs;
    const v1 = await assinar(montarManifest(dataId, xRequestId, String(tsMs)));
    await expect(validarAssinatura({
      xSignature: `ts=${tsMs},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraMs: agoraMs + 10_000,
    })).resolves.toBe(true);
  });

  it('recusa assinatura forjada com outro segredo', async () => {
    const v1 = await assinar(montarManifest(dataId, xRequestId, String(tsSegundos)), 'outro');
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraMs: agoraMs + 10_000,
    })).resolves.toBe(false);
  });

  it('recusa quando o id do recurso nao bate (replay em outro recurso)', async () => {
    const v1 = await assinar(montarManifest('999', xRequestId, String(tsSegundos)));
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraMs: agoraMs + 10_000,
    })).resolves.toBe(false);
  });

  it('recusa header ausente', async () => {
    await expect(validarAssinatura({
      xSignature: null, xRequestId, dataId, secret: SECRET, agoraMs,
    })).resolves.toBe(false);
  });

  it('recusa header malformado', async () => {
    await expect(validarAssinatura({
      xSignature: 'lixo', xRequestId, dataId, secret: SECRET, agoraMs,
    })).resolves.toBe(false);
  });

  it('recusa header sem v1', async () => {
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos}`, xRequestId, dataId, secret: SECRET, agoraMs,
    })).resolves.toBe(false);
  });

  it('recusa timestamp velho demais (replay de notificacao capturada)', async () => {
    const v1 = await assinar(montarManifest(dataId, xRequestId, String(tsSegundos)));
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraMs: agoraMs + 3_600_000,
    })).resolves.toBe(false);
  });

  // Secret não configurado não pode virar "aceita tudo". A função recusa
  // antes de chamar crypto — que, aliás, nem aceita chave de tamanho zero.
  it('recusa segredo vazio em vez de validar qualquer coisa', async () => {
    const v1 = await assinar(montarManifest(dataId, xRequestId, String(tsSegundos)));
    await expect(validarAssinatura({
      xSignature: `ts=${tsSegundos},v1=${v1}`,
      xRequestId, dataId, secret: '', agoraMs: agoraMs + 10_000,
    })).resolves.toBe(false);
  });
});

describe('parseNotificacao', () => {
  const h = (id = 'req-1') => new Headers({ 'x-request-id': id });
  const url = (q = '') => `https://exemplo.com/functions/v1/mercadopago-webhook${q}`;

  it('reconhece pagamento de assinatura', () => {
    const n = parseNotificacao({ type: 'subscription_authorized_payment', data: { id: '77' } }, h(), url());
    expect(n.tipo).toBe('subscription_authorized_payment');
    expect(n.recursoId).toBe('77');
  });

  it('reconhece pagamento avulso', () => {
    expect(parseNotificacao({ type: 'payment', data: { id: '5' } }, h(), url()).tipo).toBe('payment');
  });

  it('reconhece mudanca de assinatura', () => {
    expect(parseNotificacao({ type: 'subscription_preapproval', data: { id: '9' } }, h(), url()).tipo)
      .toBe('subscription_preapproval');
  });

  it('marca tipo desconhecido em vez de estourar', () => {
    expect(parseNotificacao({ type: 'shipping', data: { id: '1' } }, h(), url()).tipo).toBe('desconhecido');
  });

  it('aceita o campo legado topic', () => {
    expect(parseNotificacao({ topic: 'payment', data: { id: '3' } }, h(), url()).tipo).toBe('payment');
  });

  // A assinatura é calculada sobre o data.id da QUERY, não o do corpo.
  it('prefere o data.id da query string ao do corpo', () => {
    const n = parseNotificacao({ type: 'payment', data: { id: 'do-corpo' } }, h(), url('?data.id=da-query'));
    expect(n.dataIdAssinatura).toBe('da-query');
    expect(n.recursoId).toBe('da-query');
  });

  it('cai para o data.id do corpo quando a query nao traz', () => {
    const n = parseNotificacao({ type: 'payment', data: { id: 'do-corpo' } }, h(), url());
    expect(n.dataIdAssinatura).toBe('do-corpo');
  });

  it('gera eventId estavel combinando request-id e recurso', () => {
    const a = parseNotificacao({ type: 'payment', data: { id: '5' } }, h('req-x'), url());
    const b = parseNotificacao({ type: 'payment', data: { id: '5' } }, h('req-x'), url());
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).toContain('5');
  });

  it('estoura em corpo sem data.id e sem query', () => {
    expect(() => parseNotificacao({ type: 'payment' }, h(), url())).toThrow();
  });
});
