// Lógica pura do financeiro: datas, vencimento, alertas e bloqueio.
//
// Sem API do Deno, sem rede, sem banco — este arquivo é importado tanto
// pelas Edge Functions quanto pelo Vitest. Manter assim.
//
// A regra de carência aqui tem um espelho em SQL:
// public.pendix_empresa_bloqueada() (migration 0020). Mudar um lado exige
// mudar o outro.

export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada';

/** Dias de tolerância após o vencimento antes de bloquear o acesso.
 *  Segue a seção 9.2 do platform-requirements.md. */
export const CARENCIA_DIAS = 3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Diferença em dias entre duas datas, ignorando hora. */
function diasEntre(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

export function calcularVencimento(competencia: Date, diaCobranca: number): Date {
  if (!Number.isInteger(diaCobranca) || diaCobranca < 1 || diaCobranca > 28) {
    throw new Error(`dia de cobranca invalido: ${diaCobranca} (esperado 1..28)`);
  }
  return new Date(competencia.getFullYear(), competencia.getMonth(), diaCobranca, 12, 0, 0);
}

/** Bloqueia a partir de D+CARENCIA_DIAS, inclusive. Comparação `>=`. */
export function estaBloqueada(vencimento: Date, status: StatusFatura, hoje: Date): boolean {
  if (status === 'paga' || status === 'cancelada') return false;
  return diasEntre(vencimento, hoje) >= CARENCIA_DIAS;
}

/** A empresa está bloqueada, dadas as faturas dela?
 *
 *  Basta uma fatura passada da carência. Existe separada de estaBloqueada()
 *  para que a whatsapp-webhook — que precisa desta decisão mas fala com o
 *  banco, e por isso não é testável — não carregue nenhuma regra própria.
 *
 *  `vencimento` chega como 'YYYY-MM-DD' porque é assim que sai do Postgres. */
export function algumaFaturaBloqueia(
  faturas: ReadonlyArray<{ vencimento: string; status: StatusFatura }>,
  hoje: Date,
): boolean {
  return faturas.some((f) =>
    estaBloqueada(new Date(`${f.vencimento}T12:00:00-03:00`), f.status, hoje),
  );
}

const MARCOS: ReadonlyArray<readonly [string, number]> = [
  ['D-3', -3],
  ['D+0', 0],
  ['D+1', 1],
  ['D+3', CARENCIA_DIAS],
];

export function alertasDevidos(
  vencimento: Date,
  status: StatusFatura,
  hoje: Date,
  jaEnviados: string[],
): string[] {
  if (status === 'paga' || status === 'cancelada') return [];
  const delta = diasEntre(vencimento, hoje);
  return MARCOS
    .filter(([nome, dia]) => dia === delta && !jaEnviados.includes(nome))
    .map(([nome]) => nome);
}
