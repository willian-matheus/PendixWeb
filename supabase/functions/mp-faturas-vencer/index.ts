// Edge Function: marca faturas vencidas e dispara os alertas do dia.
//
// Agendada por pg_cron + pg_net (migration 0021), mesmo desenho da
// 0015_cron_whatsapp.sql.
//
// O BLOQUEIO em si não é escrito aqui — é derivado por
// public.pendix_empresa_bloqueada(). Esta função só vence e avisa. Guardar
// um booleano de bloqueio seria uma segunda verdade capaz de divergir das
// faturas.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { alertasDevidos, type StatusFatura } from '../_shared/faturas.ts';
import { enviarTexto } from '../_shared/zapi.ts';

const TIMEZONE = 'America/Sao_Paulo';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Hoje no fuso de Brasília, ao meio-dia, para não escorregar de dia na
 *  conversão. Mesmo cuidado que send-whatsapp-pendentes já toma. */
function hojeLocal(): Date {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  return new Date(`${iso}T12:00:00-03:00`);
}

const TEXTOS: Record<string, (valor: number) => string> = {
  'D-3': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} vence em 3 dias.`,
  'D+0': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} vence hoje.`,
  'D+1': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} venceu ontem. O acesso sera suspenso em 2 dias.`,
  'D+3': (v) => `Acesso suspenso por falta de pagamento da mensalidade de R$ ${v.toFixed(2)}.`,
};

const TITULOS: Record<string, string> = {
  'D-3': 'Mensalidade vence em 3 dias',
  'D+0': 'Mensalidade vence hoje',
  'D+1': 'Mensalidade vencida',
  'D+3': 'Acesso suspenso por inadimplencia',
};

Deno.serve(async () => {
  const hoje = hojeLocal();
  const hojeIso = hoje.toISOString().slice(0, 10);

  // 1. Vence o que passou da data e ainda estava aberta.
  const { error: erroVencer } = await db
    .from('pendix_faturas')
    .update({ status: 'vencida', updated_at: new Date().toISOString() })
    .eq('status', 'aberta')
    .lt('vencimento', hojeIso);
  if (erroVencer) {
    console.error('falha ao vencer faturas', erroVencer);
    return new Response(JSON.stringify({ erro: erroVencer.message }), { status: 500 });
  }

  // 2. Alerta o que tem marco hoje.
  const { data: faturas } = await db
    .from('pendix_faturas')
    .select('id, empresa_id, escritorio_id, valor, vencimento, status, alertas_enviados, link_pagamento')
    .in('status', ['aberta', 'vencida']);

  let enviados = 0;
  for (const f of faturas ?? []) {
    const marcos = alertasDevidos(
      new Date(`${f.vencimento}T12:00:00-03:00`),
      f.status as StatusFatura,
      hoje,
      f.alertas_enviados ?? [],
    );
    if (marcos.length === 0) continue;

    const { data: clientes } = await db
      .from('pendix_clientes')
      .select('id, telefone')
      .eq('empresa_id', f.empresa_id)
      .not('telefone', 'is', null);

    for (const marco of marcos) {
      const texto = TEXTOS[marco](Number(f.valor)) +
        (f.link_pagamento ? ` Pague aqui: ${f.link_pagamento}` : '');

      for (const c of clientes ?? []) {
        if (c.telefone) await enviarTexto(c.telefone, texto);
      }

      // Notificação no sino. chave_dedupe protege contra alerta repetido —
      // a tabela já tem essa máquina, herdada das notificações de pendência.
      await db.from('pendix_notificacoes').insert({
        escritorio_id: f.escritorio_id,
        tipo: 'fatura',
        titulo: TITULOS[marco],
        mensagem: texto,
        canal: 'app',
        status: 'enviada',
        dados: { fatura_id: f.id, empresa_id: f.empresa_id, marco },
        chave_dedupe: `fatura:${f.id}:${marco}`,
        enviado_em: new Date().toISOString(),
      });

      enviados++;
    }

    await db
      .from('pendix_faturas')
      .update({
        alertas_enviados: [...(f.alertas_enviados ?? []), ...marcos],
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    if (marcos.includes('D+3')) {
      await db.from('pendix_historico').insert({
        escritorio_id: f.escritorio_id,
        acao: 'empresa_bloqueada',
        descricao: `Empresa ${f.empresa_id} bloqueada por fatura ${f.id} vencida`,
        usuario_nome: 'Sistema',
      });
    }
  }

  return new Response(JSON.stringify({ alertas: enviados }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
