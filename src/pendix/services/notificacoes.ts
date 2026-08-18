import { supabase } from '../../app/services/supabase';
import { readLocal, writeLocal } from '../lib/localStore';

// As notificações não são uma tabela — são derivadas do estado real das
// pendências e das mensagens recebidas. O que persiste em localStorage é
// apenas quais notificações já foram lidas (escopado por escritório, senão
// um escritório "leria" as notificações de outro no mesmo navegador).

function getSessionUser(): { officeId?: string; role?: string; nome?: string } | null {
  try { return JSON.parse(localStorage.getItem('flash_user') || 'null'); }
  catch { return null; }
}
function getImpersonatedOfficeId(): string | null {
  return localStorage.getItem('flash_impersonated_office_id');
}
function sessionOfficeId(): string | null {
  return getImpersonatedOfficeId() || getSessionUser()?.officeId || null;
}
function isSuperAdmin(): boolean {
  if (getImpersonatedOfficeId()) return false;
  const r = getSessionUser()?.role;
  return r === 'super_admin' || r === 'admin';
}
// Mesma regra de services/pendix.ts: não-admin sem escritório na sessão não
// enxerga nada — nunca roda query sem filtro de tenant.
function requireTenantScope(): { blocked: boolean; eid: string | null } {
  if (isSuperAdmin()) return { blocked: false, eid: null };
  const eid = sessionOfficeId();
  return { blocked: !eid, eid };
}
function scopeId(): string {
  return getImpersonatedOfficeId() || getSessionUser()?.officeId || 'sem-escritorio';
}
function keyLidas(): string {
  return `pendix_notificacoes_lidas_v1:${scopeId()}`;
}

// Limpeza única do mock antigo: a versão anterior semeava 4 notificações
// fictícias em todo navegador, então até um escritório sem nenhum dado abria
// o app com 3 notificações não lidas.
try { localStorage.removeItem('pendix_mock_notificacoes_v1'); } catch { /* storage indisponível */ }

export type PendixNotificacaoTipo =
  | 'pendencia_vencida' | 'pendencia_proxima' | 'cliente_respondeu' | 'documento_recebido';

export interface PendixNotificacao {
  id: string;
  tipo: PendixNotificacaoTipo;
  titulo: string;
  descricao: string;
  lida: boolean;
  created_at: string;
  pendencia_id?: string;
}

// Janelas de relevância
const DIAS_AVISO_PREVIO = 3;   // "vence em X dias"
const DIAS_RETROSPECTIVA = 7;  // recebidos / respostas recentes
const MAX_POR_FONTE = 20;
const MAX_TOTAL = 50;
const MAX_IDS_LIDOS = 500;

// ── Estado de leitura ────────────────────────────────────────────────────────

function loadLidas(): string[] {
  return readLocal<string[]>(keyLidas(), []);
}
function saveLidas(ids: string[]) {
  writeLocal(keyLidas(), ids.slice(-MAX_IDS_LIDOS));
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  const ids = loadLidas();
  if (!ids.includes(id)) saveLidas([...ids, id]);
}

export async function marcarTodasNotificacoesLidas(): Promise<void> {
  const atuais = await getPendixNotificacoes();
  const ids = new Set(loadLidas());
  for (const n of atuais) ids.add(n.id);
  saveLidas([...ids]);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function diffDias(dataISO: string): number {
  const alvo = new Date(`${dataISO}T12:00:00`).getTime();
  const hoje = new Date(`${hojeISO()}T12:00:00`).getTime();
  return Math.round((alvo - hoje) / 86400000);
}
// O `created_at` da notificação é o momento em que ela passou a ser relevante,
// nunca no futuro — senão o "há quanto tempo" da lista fica sem sentido.
function momento(dataISO: string): string {
  const t = new Date(`${dataISO}T12:00:00`).getTime();
  return new Date(Math.min(t, Date.now())).toISOString();
}
function dataBR(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
}
function nomeCliente(p: { pendix_clientes?: { nome?: string } | null }): string {
  return p.pendix_clientes?.nome || 'cliente sem nome';
}

type PendenciaRow = {
  id: string;
  nome_documento: string;
  data_limite?: string | null;
  data_recebimento?: string | null;
  pendix_clientes?: { nome?: string } | null;
};

function scoped(q: any, eid: string | null) {
  return eid ? q.eq('escritorio_id', eid) : q;
}

// ── Fontes ───────────────────────────────────────────────────────────────────

async function fonteVencidas(eid: string | null): Promise<PendixNotificacao[]> {
  const { data, error } = await scoped(
    supabase
      .from('pendix_pendencias')
      .select('id, nome_documento, data_limite, pendix_clientes(nome)')
      .eq('status', 'pendente')
      .lt('data_limite', hojeISO())
      .order('data_limite', { ascending: false })
      .limit(MAX_POR_FONTE),
    eid,
  );
  if (error) throw error;

  return ((data ?? []) as PendenciaRow[]).map(p => {
    const dias = Math.abs(diffDias(p.data_limite!));
    const quando = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
    return {
      id: `venc:${p.id}:${p.data_limite}`,
      tipo: 'pendencia_vencida' as const,
      titulo: 'Pendência vencida',
      descricao: `O documento "${p.nome_documento}" de ${nomeCliente(p)} venceu ${quando} (${dataBR(p.data_limite!)}).`,
      lida: false,
      created_at: momento(p.data_limite!),
      pendencia_id: p.id,
    };
  });
}

async function fonteProximas(eid: string | null): Promise<PendixNotificacao[]> {
  const hoje = hojeISO();
  const { data, error } = await scoped(
    supabase
      .from('pendix_pendencias')
      .select('id, nome_documento, data_limite, pendix_clientes(nome)')
      .eq('status', 'pendente')
      .gte('data_limite', hoje)
      .lte('data_limite', somaDias(hoje, DIAS_AVISO_PREVIO))
      .order('data_limite', { ascending: true })
      .limit(MAX_POR_FONTE),
    eid,
  );
  if (error) throw error;

  return ((data ?? []) as PendenciaRow[]).map(p => {
    const dias = diffDias(p.data_limite!);
    const quando = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
    return {
      id: `prox:${p.id}:${p.data_limite}`,
      tipo: 'pendencia_proxima' as const,
      titulo: 'Pendência próxima do vencimento',
      descricao: `"${p.nome_documento}" de ${nomeCliente(p)} ${quando} (${dataBR(p.data_limite!)}).`,
      lida: false,
      // Passou a ser relevante ao entrar na janela de aviso prévio.
      created_at: momento(somaDias(p.data_limite!, -DIAS_AVISO_PREVIO)),
      pendencia_id: p.id,
    };
  });
}

async function fonteRecebidos(eid: string | null): Promise<PendixNotificacao[]> {
  const desde = `${somaDias(hojeISO(), -DIAS_RETROSPECTIVA)}T00:00:00.000Z`;
  const { data, error } = await scoped(
    supabase
      .from('pendix_pendencias')
      .select('id, nome_documento, data_recebimento, pendix_clientes(nome)')
      .eq('status', 'recebido')
      .gte('data_recebimento', desde)
      .order('data_recebimento', { ascending: false })
      .limit(MAX_POR_FONTE),
    eid,
  );
  if (error) throw error;

  return ((data ?? []) as PendenciaRow[])
    .filter(p => !!p.data_recebimento)
    .map(p => ({
      id: `receb:${p.id}:${p.data_recebimento}`,
      tipo: 'documento_recebido' as const,
      titulo: 'Documento recebido',
      descricao: `"${p.nome_documento}" de ${nomeCliente(p)} foi recebido.`,
      lida: false,
      created_at: p.data_recebimento!,
      pendencia_id: p.id,
    }));
}

async function fonteRespostas(eid: string | null): Promise<PendixNotificacao[]> {
  const { data: conversas, error: errConv } = await scoped(
    supabase
      .from('pendix_conversas')
      .select('id, pendencia_id, pendix_clientes(nome)')
      .order('atualizada_em', { ascending: false })
      .limit(MAX_POR_FONTE),
    eid,
  );
  if (errConv) throw errConv;
  if (!conversas?.length) return [];

  const porConversa = new Map<string, { pendencia_id?: string; nome?: string }>(
    (conversas as any[]).map(c => [c.id, { pendencia_id: c.pendencia_id, nome: c.pendix_clientes?.nome }]),
  );

  const desde = `${somaDias(hojeISO(), -DIAS_RETROSPECTIVA)}T00:00:00.000Z`;
  const { data: msgs, error: errMsg } = await supabase
    .from('pendix_mensagens')
    .select('id, conversa_id, conteudo, tipo, criada_em')
    .in('conversa_id', [...porConversa.keys()])
    .eq('remetente', 'cliente')
    .gte('criada_em', desde)
    .order('criada_em', { ascending: false })
    .limit(MAX_POR_FONTE);
  if (errMsg) throw errMsg;

  return (msgs ?? []).map((m: any) => {
    const ctx = porConversa.get(m.conversa_id);
    const trecho = m.tipo === 'arquivo'
      ? 'enviou um arquivo'
      : `respondeu: "${String(m.conteudo ?? '').slice(0, 90)}"`;
    return {
      id: `msg:${m.id}`,
      tipo: 'cliente_respondeu' as const,
      titulo: 'Cliente respondeu',
      descricao: `${ctx?.nome || 'Cliente'} ${trecho}`,
      lida: false,
      created_at: m.criada_em,
      pendencia_id: ctx?.pendencia_id,
    };
  });
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function getPendixNotificacoes(): Promise<PendixNotificacao[]> {
  const { blocked, eid } = requireTenantScope();
  if (blocked) return [];

  // Uma fonte quebrada (tabela ausente, RLS) não pode zerar as outras.
  const resultados = await Promise.allSettled([
    fonteVencidas(eid),
    fonteProximas(eid),
    fonteRecebidos(eid),
    fonteRespostas(eid),
  ]);

  const todas: PendixNotificacao[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled') todas.push(...r.value);
    else console.error('getPendixNotificacoes: fonte indisponível', r.reason);
  }

  const lidas = new Set(loadLidas());
  return todas
    .map(n => ({ ...n, lida: lidas.has(n.id) }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_TOTAL);
}

export async function getPendixNotificacoesNaoLidas(): Promise<number> {
  return (await getPendixNotificacoes()).filter(n => !n.lida).length;
}
