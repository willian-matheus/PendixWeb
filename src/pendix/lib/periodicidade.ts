/**
 * Periodicidade das pendências — a regra de "quando nasce a próxima".
 *
 * Porte do PendixApp/lib/periodicidade.ts. Os dois precisam falar exatamente o
 * mesmo vocabulário: a mesma pendência é criada aqui e marcada como recebida no
 * celular (ou o contrário), e quem gera a ocorrência seguinte é o lado que
 * fechou o ciclo. Mexeu na lista aqui, espelhe lá — e no CHECK de
 * `periodicidade` no banco (PendixApp/supabase/migrations/
 * 20260820024021_pendix_cobranca_automatica.sql).
 *
 * A próxima ocorrência não é pré-gerada: ela nasce quando a atual é marcada
 * como recebida (ver `gerarProximaOcorrencia` em services/pendix.ts). Assim a
 * fila nunca enche de pendências futuras e a competência caminha sozinha.
 */

export type PendixPeriodicidade =
  | 'unica'
  | 'diaria'
  | 'semanal'
  | 'quinzenal'
  | 'mensal'
  | 'bimestral'
  | 'trimestral'
  | 'quadrimestral'
  | 'semestral'
  | 'anual'
  | 'bienal';

export const PERIODICIDADE_LABEL: Record<PendixPeriodicidade, string> = {
  unica: 'Única (não repete)',
  diaria: 'Diária',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  quadrimestral: 'Quadrimestral',
  semestral: 'Semestral',
  anual: 'Anual',
  bienal: 'Bienal',
};

/** O "a cada quanto" que aparece ao lado do rótulo. */
export const PERIODICIDADE_DESCRICAO: Record<PendixPeriodicidade, string> = {
  unica: 'não repete',
  diaria: 'todos os dias',
  semanal: 'a cada semana',
  quinzenal: 'a cada 15 dias',
  mensal: 'uma vez por mês',
  bimestral: 'a cada 2 meses',
  trimestral: 'a cada 3 meses',
  quadrimestral: 'a cada 4 meses',
  semestral: 'a cada 6 meses',
  anual: 'uma vez por ano',
  bienal: 'a cada 2 anos',
};

/** Rótulo curto para badge/linha de lista ("Repete mensalmente"). */
export const PERIODICIDADE_ADVERBIO: Record<PendixPeriodicidade, string> = {
  unica: 'não repete',
  diaria: 'todo dia',
  semanal: 'semanalmente',
  quinzenal: 'a cada 15 dias',
  mensal: 'mensalmente',
  bimestral: 'a cada 2 meses',
  trimestral: 'trimestralmente',
  quadrimestral: 'a cada 4 meses',
  semestral: 'semestralmente',
  anual: 'anualmente',
  bienal: 'a cada 2 anos',
};

/** Opções do <select>, na ordem em que o usuário espera lê-las. */
export const PERIODICIDADE_OPTS: { value: PendixPeriodicidade; label: string }[] =
  (Object.keys(PERIODICIDADE_LABEL) as PendixPeriodicidade[]).map((value) => ({
    value,
    label: value === 'unica'
      ? 'Única (não repete)'
      : `${PERIODICIDADE_LABEL[value]} — ${PERIODICIDADE_DESCRICAO[value]}`,
  }));

export const PERIODICIDADE_PADRAO: PendixPeriodicidade = 'unica';

/** Frequência de cobrança quando a pendência não define uma. */
export const FREQUENCIA_COBRANCA_PADRAO: PendixPeriodicidade = 'semanal';

/**
 * Passo de cada periodicidade. Quem tem `meses` anda em mês cheio (a
 * competência acompanha); quem tem `dias` anda em dias corridos, e aí a
 * competência é deduzida do mês em que a próxima data cai.
 */
interface Passo {
  dias?: number;
  meses?: number;
}

const PASSO: Record<PendixPeriodicidade, Passo | null> = {
  unica: null,
  diaria: { dias: 1 },
  semanal: { dias: 7 },
  quinzenal: { dias: 15 },
  mensal: { meses: 1 },
  bimestral: { meses: 2 },
  trimestral: { meses: 3 },
  quadrimestral: { meses: 4 },
  semestral: { meses: 6 },
  anual: { meses: 12 },
  bienal: { meses: 24 },
};

const RE_COMPETENCIA = /^\d{4}-\d{2}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function ehPeriodicidade(v: unknown): v is PendixPeriodicidade {
  return typeof v === 'string' && v in PASSO;
}

export function ehRecorrente(p?: PendixPeriodicidade | string | null): boolean {
  return ehPeriodicidade(p) && PASSO[p] !== null;
}

export function ehCompetencia(v?: string | null): boolean {
  if (!v || !RE_COMPETENCIA.test(v)) return false;
  const mes = Number(v.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

export function ehData(v?: string | null): boolean {
  if (!v || !RE_DATA.test(v)) return false;
  const [ano, mes, dia] = v.split('-').map(Number);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `mes` é 1-12. */
function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Soma dias corridos a uma data `YYYY-MM-DD`. */
export function somarDias(iso: string, dias: number): string {
  // Meio-dia UTC: longe o bastante das bordas para fuso/horário de verão não
  // deslocar o dia (mesmo cuidado da Edge Function send-whatsapp-pendentes).
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Soma meses cheios grampeando o dia no último dia do mês de destino:
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), não 03/03.
 */
export function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const totalMeses = ano * 12 + (mes - 1) + meses;
  const anoAlvo = Math.floor(totalMeses / 12);
  const mesAlvo = totalMeses - anoAlvo * 12 + 1;
  return `${anoAlvo}-${pad(mesAlvo)}-${pad(Math.min(dia, diasNoMes(anoAlvo, mesAlvo)))}`;
}

/**
 * Como `somarMeses`, mas "último dia do mês" continua sendo o último dia do
 * mês de destino: 28/02 + 1 mês = 31/03, não 28/03.
 *
 * Sem isso a recorrência escorregaria para sempre — um vencimento em 31/01
 * viraria 28/02 e daí em diante ficaria preso no dia 28, quando o que o
 * usuário quis dizer foi "vence no fim do mês".
 */
export function somarMesesPreservandoFimDeMes(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const alvo = somarMeses(iso, meses);
  if (dia !== diasNoMes(ano, mes)) return alvo;
  const [anoAlvo, mesAlvo] = alvo.split('-').map(Number);
  return `${anoAlvo}-${pad(mesAlvo)}-${pad(diasNoMes(anoAlvo, mesAlvo))}`;
}

/** Avança uma competência `YYYY-MM` em N meses. */
export function avancarCompetencia(competencia: string, meses: number): string {
  return somarMeses(`${competencia}-01`, meses).slice(0, 7);
}

/**
 * Avança uma data `YYYY-MM-DD` um passo da periodicidade. Devolve `null` para
 * 'unica' (não há próximo) ou se a data for inválida.
 */
export function avancarData(iso: string, p: PendixPeriodicidade | string | null | undefined): string | null {
  if (!ehPeriodicidade(p)) return null;
  const passo = PASSO[p];
  if (!passo || !ehData(iso)) return null;
  return passo.meses ? somarMesesPreservandoFimDeMes(iso, passo.meses) : somarDias(iso, passo.dias!);
}

export interface PendenciaRecorrente {
  competencia: string;
  data_limite?: string | null;
  data_inicio_cobranca?: string | null;
  datas_notificacao?: string[] | null;
  periodicidade?: PendixPeriodicidade | string | null;
}

export interface ProximaOcorrencia {
  competencia: string;
  data_limite?: string;
  data_inicio_cobranca?: string;
  datas_notificacao: string[];
}

/**
 * Calcula os campos da próxima ocorrência. Devolve `null` quando a pendência
 * não se repete (periodicidade ausente ou 'unica').
 *
 * Todas as datas andam o mesmo passo da periodicidade, então a distância entre
 * "começar a cobrar", "lembrar" e "vencer" é preservada de ciclo em ciclo.
 * Lança se a competência for inválida — sem ela não há como nomear o ciclo.
 */
export function calcularProximaOcorrencia(atual: PendenciaRecorrente): ProximaOcorrencia | null {
  const periodicidade = atual.periodicidade;
  if (!ehPeriodicidade(periodicidade)) return null;
  const passo = PASSO[periodicidade];
  if (!passo) return null;

  if (!ehCompetencia(atual.competencia)) {
    throw new Error(`Competência inválida: ${atual.competencia ?? '(vazia)'} — esperado AAAA-MM.`);
  }

  const avancar = (iso: string) => avancarData(iso, periodicidade)!;

  const dataLimite = ehData(atual.data_limite) ? avancar(atual.data_limite!) : undefined;
  const inicioCobranca = ehData(atual.data_inicio_cobranca)
    ? avancar(atual.data_inicio_cobranca!)
    : undefined;

  // Periodicidade em meses: a competência anda junto. Em dias: ela vira o mês
  // da próxima data de referência (vencimento, ou o 1º da competência atual
  // quando a pendência não tem prazo).
  const competencia = passo.meses
    ? avancarCompetencia(atual.competencia, passo.meses)
    : (dataLimite ?? avancar(`${atual.competencia}-01`)).slice(0, 7);

  const datasNotificacao = (atual.datas_notificacao ?? [])
    .filter((d) => ehData(d))
    .map(avancar);

  return { competencia, data_limite: dataLimite, data_inicio_cobranca: inicioCobranca, datas_notificacao: datasNotificacao };
}

/**
 * Primeira cobrança de uma ocorrência. Nunca pode virar `null` no insert de
 * uma recorrente: o cron lê `proxima_cobranca_em` nulo como "cobrar agora", e
 * o cliente levaria hoje a cobrança do documento do mês que vem.
 */
export function inicioDaCobranca(o: { data_inicio_cobranca?: string | null; competencia: string }): string | null {
  if (ehData(o.data_inicio_cobranca)) return o.data_inicio_cobranca!;
  return ehCompetencia(o.competencia) ? `${o.competencia}-01` : null;
}

/** "Repete mensalmente" — texto pronto para a UI, ou null se não repete. */
export function descreverPeriodicidade(p?: PendixPeriodicidade | string | null): string | null {
  if (!ehRecorrente(p)) return null;
  return `Repete ${PERIODICIDADE_ADVERBIO[p as PendixPeriodicidade]}`;
}
