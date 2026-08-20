// Regras da cobrança automática — CÓPIA para o Deno.
//
// A fonte da verdade é PendixApp/lib/cobranca.ts + PendixApp/lib/periodicidade.ts,
// onde estas funções são testadas (`npm test` no PendixApp). O Deno não
// enxerga aquele repositório, então o arquivo é duplicado aqui. Mexeu lá,
// espelhe aqui — o CHECK de `cobranca_frequencia` no banco (migration
// 20260820024021_pendix_cobranca_automatica.sql) é o contrato que segura as
// duas pontas: qualquer valor fora da lista é recusado pelo Postgres.

export type Periodicidade =
  | 'unica' | 'diaria' | 'semanal' | 'quinzenal' | 'mensal' | 'bimestral'
  | 'trimestral' | 'quadrimestral' | 'semestral' | 'anual' | 'bienal';

export type NivelCobranca = 'amigavel' | 'lembrete' | 'urgente' | 'critico';

const PASSO: Record<Periodicidade, { dias?: number; meses?: number } | null> = {
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

export const FREQUENCIA_PADRAO: Periodicidade = 'semanal';

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function ehData(v?: string | null): boolean {
  if (!v || !RE_DATA.test(v)) return false;
  const [ano, mes, dia] = v.split('-').map(Number);
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Soma meses cheios mantendo "último dia do mês" como último dia. */
function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  const anoAlvo = Math.floor(total / 12);
  const mesAlvo = total - anoAlvo * 12 + 1;
  const ultimoAlvo = diasNoMes(anoAlvo, mesAlvo);
  const diaAlvo = dia === diasNoMes(ano, mes) ? ultimoAlvo : Math.min(dia, ultimoAlvo);
  return `${anoAlvo}-${pad(mesAlvo)}-${pad(diaAlvo)}`;
}

export function avancarData(iso: string, p: string | null | undefined): string | null {
  if (!p || !(p in PASSO)) return null;
  const passo = PASSO[p as Periodicidade];
  if (!passo || !ehData(iso)) return null;
  return passo.meses ? somarMeses(iso, passo.meses) : somarDias(iso, passo.dias!);
}

export function horarioParaMinutos(horario?: string | null): number {
  if (!horario) return 0;
  const [hh, mm] = horario.split(':').map(Number);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

export function diffDias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function dentroDaJanela(minutos: number, inicio: string, fim: string): boolean {
  const i = horarioParaMinutos(inicio);
  const f = horarioParaMinutos(fim);
  return i <= f ? minutos >= i && minutos <= f : minutos >= i || minutos <= f;
}

export interface RegrasCobranca {
  dias_amigavel: number;
  dias_lembrete: number;
  dias_urgente: number;
  horario_inicio: string;
  horario_fim: string;
  max_reenvios: number;
  cooldown_horas: number;
  ativo: boolean;
}

/** Espelha CONFIG_COBRANCA_DEFAULT do app — escritório sem linha usa isto. */
export const REGRAS_PADRAO: RegrasCobranca = {
  dias_amigavel: 2, dias_lembrete: 7, dias_urgente: 15,
  horario_inicio: '08:00', horario_fim: '19:00',
  max_reenvios: 4, cooldown_horas: 24, ativo: true,
};

export interface PendenciaCobravel {
  status: string;
  cobranca_automatica?: boolean | null;
  cobranca_frequencia?: string | null;
  proxima_cobranca_em?: string | null;
  cobrancas_enviadas?: number | null;
  horario_notificacao?: string | null;
  data_inicio_cobranca?: string | null;
  ultima_mensagem_enviada_em?: string | null;
  cliente?: { telefone?: string | null; consentimento_whatsapp?: boolean | null } | null;
}

export interface Agora {
  data: string;
  minutos: number;
  iso: string;
}

export type MotivoNaoCobrar =
  | 'escritorio_desligado' | 'cobranca_desligada' | 'status_nao_pendente'
  | 'sem_telefone' | 'sem_consentimento' | 'limite_de_reenvios'
  | 'ainda_nao_e_dia' | 'antes_do_horario' | 'fora_da_janela' | 'em_cooldown';

export interface DecisaoCobranca {
  cobrar: boolean;
  motivo?: MotivoNaoCobrar;
  nivel?: NivelCobranca;
  cobrancas_enviadas?: number;
  proxima_cobranca_em?: string | null;
}

export function nivelCobranca(
  diasEmCobranca: number,
  r: Pick<RegrasCobranca, 'dias_amigavel' | 'dias_lembrete' | 'dias_urgente'>,
): NivelCobranca {
  if (diasEmCobranca < r.dias_amigavel) return 'amigavel';
  if (diasEmCobranca < r.dias_lembrete) return 'lembrete';
  if (diasEmCobranca < r.dias_urgente) return 'urgente';
  return 'critico';
}

export function decidirCobranca(
  p: PendenciaCobravel,
  r: RegrasCobranca,
  agora: Agora,
): DecisaoCobranca {
  if (!r.ativo) return { cobrar: false, motivo: 'escritorio_desligado' };
  if (p.cobranca_automatica === false) return { cobrar: false, motivo: 'cobranca_desligada' };
  if (p.status !== 'pendente') return { cobrar: false, motivo: 'status_nao_pendente' };

  const telefone = p.cliente?.telefone?.replace(/\D/g, '') ?? '';
  if (!telefone) return { cobrar: false, motivo: 'sem_telefone' };
  if (p.cliente?.consentimento_whatsapp === false) return { cobrar: false, motivo: 'sem_consentimento' };

  const enviadas = p.cobrancas_enviadas ?? 0;
  if (enviadas >= r.max_reenvios) return { cobrar: false, motivo: 'limite_de_reenvios' };

  const prevista = ehData(p.proxima_cobranca_em)
    ? p.proxima_cobranca_em!
    : (ehData(p.data_inicio_cobranca) ? p.data_inicio_cobranca! : agora.data);
  if (prevista > agora.data) return { cobrar: false, motivo: 'ainda_nao_e_dia' };

  if (agora.minutos < horarioParaMinutos(p.horario_notificacao)) {
    return { cobrar: false, motivo: 'antes_do_horario' };
  }
  if (!dentroDaJanela(agora.minutos, r.horario_inicio, r.horario_fim)) {
    return { cobrar: false, motivo: 'fora_da_janela' };
  }

  if (p.ultima_mensagem_enviada_em) {
    const horas = (Date.parse(agora.iso) - Date.parse(p.ultima_mensagem_enviada_em)) / 3_600_000;
    if (Number.isFinite(horas) && horas < r.cooldown_horas) {
      return { cobrar: false, motivo: 'em_cooldown' };
    }
  }

  const inicio = ehData(p.data_inicio_cobranca) ? p.data_inicio_cobranca! : agora.data;
  const proximas = enviadas + 1;

  return {
    cobrar: true,
    nivel: nivelCobranca(Math.max(0, diffDias(inicio, agora.data)), r),
    cobrancas_enviadas: proximas,
    proxima_cobranca_em: proximas >= r.max_reenvios
      ? null
      : avancarData(agora.data, p.cobranca_frequencia ?? FREQUENCIA_PADRAO),
  };
}

/** Quando tentar de novo depois de uma FALHA de envio (ver lib/cobranca.ts). */
export function reagendarAposFalha(hoje: string): string | null {
  return ehData(hoje) ? somarDias(hoje, 1) : null;
}

export interface DadosMensagem {
  cliente: string;
  documento: string;
  competencia: string;
  data_limite?: string | null;
}

function formatarBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function montarMensagemCobranca(nivel: NivelCobranca, d: DadosMensagem): string {
  const doc = `*${d.documento}* (competência ${d.competencia})`;
  const prazo = ehData(d.data_limite) ? ` O prazo é ${formatarBR(d.data_limite!)}.` : '';

  switch (nivel) {
    case 'amigavel':
      return `Olá, ${d.cliente}! Precisamos do documento ${doc}. Pode enviar por aqui mesmo, em foto ou PDF?${prazo}`;
    case 'lembrete':
      return `Olá, ${d.cliente}! Passando para lembrar que ainda estamos aguardando o documento ${doc}. Pode mandar por aqui, em foto ou PDF?${prazo}`;
    case 'urgente':
      return `${d.cliente}, o documento ${doc} está atrasado e ainda não chegou até nós.${prazo} Consegue enviar hoje, por aqui mesmo?`;
    case 'critico':
      return `${d.cliente}, este é um aviso importante: seguimos sem o documento ${doc}.${prazo} A falta dele pode gerar multa e impedir a entrega das obrigações do período. Por favor, envie por aqui o quanto antes ou fale com a gente.`;
  }
}
