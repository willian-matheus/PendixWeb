import { supabase } from '../../app/services/supabase';

function getSessionUser(): { officeId?: string; role?: string; nome?: string } | null {
  try { return JSON.parse(localStorage.getItem('flash_user') || 'null'); }
  catch { return null; }
}
function getImpersonatedOfficeId(): string | null {
  return localStorage.getItem('flash_impersonated_office_id');
}
function isSuperAdmin(): boolean {
  if (getImpersonatedOfficeId()) return false;
  const r = getSessionUser()?.role;
  return r === 'super_admin' || r === 'admin';
}
function sessionOfficeId(): string | null {
  return getImpersonatedOfficeId() || getSessionUser()?.officeId || null;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PendixClienteStatus = 'ativo' | 'inativo' | 'suspenso';
export type PendixRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';
export type PendixPendenciaStatus = 'pendente' | 'recebido' | 'em_analise' | 'rejeitado' | 'cancelado';
export type PendixFrequencia = 'mensal' | 'trimestral' | 'anual' | 'unico';
export type PendixPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

export interface PendixCliente {
  id: string;
  escritorio_id: string;
  nome: string;
  responsavel: string;
  telefone: string;
  email: string;
  regime: PendixRegime;
  status: PendixClienteStatus;
  observacoes: string;
  created_at: string;
  updated_at: string;
}

export interface PendixDocConfig {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  nome: string;
  frequencia: PendixFrequencia;
  dia_limite: number;
  prioridade: PendixPrioridade;
  ativo: boolean;
  created_at: string;
}

export interface PendixPendencia {
  id: string;
  escritorio_id: string;
  cliente_id: string;
  documento_id?: string;
  nome_documento: string;
  competencia: string;
  status: PendixPendenciaStatus;
  arquivo_url?: string;
  arquivo_nome?: string;
  observacoes?: string;
  data_limite?: string;
  data_recebimento?: string;
  created_at: string;
  updated_at: string;
  pendix_clientes?: { nome: string; telefone?: string };
}

export interface PendixHistoricoEntry {
  id: string;
  escritorio_id: string;
  pendencia_id?: string;
  cliente_id?: string;
  acao: string;
  descricao?: string;
  usuario_nome?: string;
  created_at: string;
}

// ── Clientes ───────────────────────────────────────────────────────────────

export async function getPendixClientes() {
  let q = supabase.from('pendix_clientes').select('*').order('nome');
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendixCliente[];
}

export async function postPendixCliente(p: Omit<PendixCliente, 'id' | 'created_at' | 'updated_at'>) {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_clientes')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  return data as PendixCliente;
}

export async function updatePendixCliente(id: string, p: Partial<Omit<PendixCliente, 'id' | 'created_at'>>) {
  const { data, error } = await supabase
    .from('pendix_clientes')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as PendixCliente;
}

export async function deletePendixCliente(id: string) {
  const { error } = await supabase.from('pendix_clientes').delete().eq('id', id);
  if (error) throw error;
}

// ── Documentos Config ──────────────────────────────────────────────────────

export async function getPendixDocConfigs(clienteId: string) {
  const { data, error } = await supabase
    .from('pendix_documentos_config').select('*')
    .eq('cliente_id', clienteId).order('nome');
  if (error) throw error;
  return (data ?? []) as PendixDocConfig[];
}

export async function postPendixDocConfig(p: Omit<PendixDocConfig, 'id' | 'created_at'>) {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_documentos_config')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  return data as PendixDocConfig;
}

export async function updatePendixDocConfig(id: string, p: Partial<PendixDocConfig>) {
  const { data, error } = await supabase
    .from('pendix_documentos_config').update(p).eq('id', id).select().single();
  if (error) throw error;
  return data as PendixDocConfig;
}

export async function deletePendixDocConfig(id: string) {
  const { error } = await supabase.from('pendix_documentos_config').delete().eq('id', id);
  if (error) throw error;
}

// ── Pendências ──────────────────────────────────────────────────────────────

export async function getPendixPendencias(filters?: {
  clienteId?: string; status?: string; competencia?: string; search?: string;
}) {
  let q = supabase
    .from('pendix_pendencias')
    .select('*, pendix_clientes(nome, telefone)')
    .order('data_limite', { ascending: true });

  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  if (filters?.clienteId) q = q.eq('cliente_id', filters.clienteId);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.competencia) q = q.eq('competencia', filters.competencia);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as PendixPendencia[];
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter(r =>
      r.nome_documento.toLowerCase().includes(s) ||
      (r.pendix_clientes?.nome ?? '').toLowerCase().includes(s)
    );
  }
  return rows;
}

export async function postPendixPendencia(
  p: Omit<PendixPendencia, 'id' | 'created_at' | 'updated_at' | 'pendix_clientes'>
) {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_pendencias')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function updatePendixPendenciaStatus(
  id: string, status: PendixPendenciaStatus, obs?: string
) {
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'recebido') payload.data_recebimento = new Date().toISOString();
  if (obs !== undefined) payload.observacoes = obs;
  const { data, error } = await supabase
    .from('pendix_pendencias').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function deletePendixPendencia(id: string) {
  const { error } = await supabase.from('pendix_pendencias').delete().eq('id', id);
  if (error) throw error;
}

export async function gerarPendenciasMes(clienteId: string, competencia: string) {
  const docs = await getPendixDocConfigs(clienteId);
  const ativas = docs.filter(d => d.ativo);
  if (!ativas.length) return [];

  const eid = sessionOfficeId();
  const [ano, mes] = competencia.split('-');

  const rows = ativas.map(doc => ({
    escritorio_id: eid || doc.escritorio_id,
    cliente_id: clienteId,
    documento_id: doc.id,
    nome_documento: doc.nome,
    competencia,
    status: 'pendente' as const,
    data_limite: `${ano}-${mes}-${String(doc.dia_limite).padStart(2, '0')}`,
  }));

  const { data, error } = await supabase.from('pendix_pendencias').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as PendixPendencia[];
}

// ── Histórico ──────────────────────────────────────────────────────────────

export async function getPendixHistorico(opts?: { clienteId?: string; pendenciaId?: string }) {
  let q = supabase
    .from('pendix_historico').select('*')
    .order('created_at', { ascending: false }).limit(300);

  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  if (opts?.clienteId) q = q.eq('cliente_id', opts.clienteId);
  if (opts?.pendenciaId) q = q.eq('pendencia_id', opts.pendenciaId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendixHistoricoEntry[];
}

export async function addPendixHistorico(
  entry: Omit<PendixHistoricoEntry, 'id' | 'created_at'>
) {
  const eid = sessionOfficeId();
  const user = getSessionUser();
  await supabase.from('pendix_historico').insert({
    ...entry,
    escritorio_id: entry.escritorio_id || eid,
    usuario_nome: entry.usuario_nome || user?.nome,
  });
}

// ── Stats helper ───────────────────────────────────────────────────────────

export async function getPendixStats() {
  const eid = sessionOfficeId();
  const isAdmin = isSuperAdmin();

  const applyFilter = (q: any) => (!isAdmin && eid ? q.eq('escritorio_id', eid) : q);

  const today = new Date().toISOString().slice(0, 10);

  const [clientes, abertas, vencidas, hoje] = await Promise.all([
    applyFilter(supabase.from('pendix_clientes').select('id', { count: 'exact', head: true }).eq('status', 'ativo')),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_analise'])),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).in('status', ['pendente']).lt('data_limite', today)),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'recebido').gte('data_recebimento', today + 'T00:00:00Z')),
  ]);

  return {
    clientesAtivos: clientes.count ?? 0,
    pendenciasAbertas: abertas.count ?? 0,
    vencidas: vencidas.count ?? 0,
    recebidosHoje: hoje.count ?? 0,
  };
}
