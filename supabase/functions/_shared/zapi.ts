// Envio simples de texto pela Z-API.
//
// Faz rede e lê env, então NÃO ganha teste de unidade — diferente de
// faturas.ts e mercadopago.ts, que são puros de propósito.
//
// Nota de escopo: send-whatsapp-pendentes tem a sua própria
// `enviarMensagemPendencia`, que além de enviar registra a mensagem em
// pendix_mensagens e atualiza a pendência. Não foi refatorada para usar este
// helper — ela funciona, está em uso, e não há ambiente aqui para verificar
// a refatoração. Duplicação pequena e consciente é melhor que quebrar o
// caminho principal do produto.

export async function enviarTexto(telefone: string, texto: string): Promise<boolean> {
  const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
  const instanceToken = Deno.env.get('ZAPI_INSTANCE_TOKEN');
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

  if (!instanceId || !instanceToken || !clientToken) {
    console.error('Z-API sem credenciais configuradas');
    return false;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
      body: JSON.stringify({ phone: telefone, message: texto }),
    });
    if (!r.ok) {
      console.error('Z-API respondeu', r.status, await r.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('falha ao chamar Z-API', e);
    return false;
  }
}
