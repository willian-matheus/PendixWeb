import { supabase } from '../../app/services/supabase';
import {
  calcularProximaOcorrencia, ehRecorrente, inicioDaCobranca,
  FREQUENCIA_COBRANCA_PADRAO, type PendixPeriodicidade,
} from '../lib/periodicidade';

export type { PendixPeriodicidade };

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
export function sessionOfficeId(): string | null {
  return getImpersonatedOfficeId() || getSessionUser()?.officeId || null;
}

// Usuário não-admin sem escritorio_id na sessão não pode ver/alterar nada —
// nunca deixamos uma query rodar sem filtro de tenant só porque o id não
// veio (isso vazaria dados de todos os escritórios). `blocked: true` diz
// pro chamador tratar como "sem acesso" (lista vazia / erro), nunca "vê tudo".
function requireTenantScope(): { blocked: boolean; eid: string | null } {
  if (isSuperAdmin()) return { blocked: false, eid: null };
  const eid = sessionOfficeId();
  return { blocked: !eid, eid };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PendixClienteStatus = 'ativo' | 'inativo' | 'suspenso';
export type PendixClienteTipo = 'pessoa' | 'empresa';
export type PendixRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';
// Schema compartilhado com o PendixApp (mobile) — ver supabase/migrations/0005_pendix_app_schema.sql
export type PendixPendenciaStatus = 'pendente' | 'em_analise' | 'recebido' | 'rejeitado' | 'cancelado';
export type PendixNivelCobranca = 'amigavel' | 'lembrete' | 'urgente' | 'critico';
// Frequência do documento recorrente configurado no cliente
// (pendix_documentos_config). Mesmo vocabulário da `periodicidade` da
// pendência — ver src/pendix/lib/periodicidade.ts — só que aqui o "não repete"
// se chama 'unico' (nome herdado da migration 0005) em vez de 'unica'.
export type PendixFrequencia =
  | 'unico'
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
export type PendixPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';
export type PendixPendenciaTipo = 'cliente' | 'empresa';

export interface PendixCliente {
  id: string;
  escritorio_id: string;
  nome: string;
  responsavel: string;
  telefone: string;
  email: string;
  regime: PendixRegime;
  status: PendixClienteStatus;
  tipo?: PendixClienteTipo;
  consentimento_whatsapp?: boolean;
  observacoes: string;
  empresa_id?: string | null;
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
  descricao_whatsapp?: string;
  arquivo_modelo_url?: string;
  arquivo_modelo_nome?: string;
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
  nivel_cobranca_atual?: PendixNivelCobranca;
  tentativas_reenvio?: number;
  ultima_mensagem_enviada_em?: string;
  requer_revisao_humana?: boolean;
  origem?: 'manual' | 'whatsapp' | 'automatico';
  tipo?: PendixPendenciaTipo;
  descricao?: string;
  prioridade?: PendixPrioridade;
  data_inicio_cobranca?: string;
  arquivo_modelo_url?: string;
  arquivo_modelo_nome?: string;
  datas_notificacao?: string[];
  datas_notificacao_enviadas?: string[];
  horario_notificacao?: string;
  /** De quanto em quanto tempo a pendência renasce. 'unica' = evento único. */
  periodicidade?: PendixPeriodicidade;
  /** Pendência que originou esta ocorrência (null quando foi criada à mão). */
  recorrencia_pai_id?: string | null;
  cobranca_automatica?: boolean;
  cobranca_frequencia?: PendixPeriodicidade;
  created_at: string;
  updated_at: string;
  pendix_clientes?: { nome: string; telefone?: string; empresa_id?: string | null; pendix_empresas?: { id: string; nome: string; telefone?: string; email?: string } | null };
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
  const { blocked, eid } = requireTenantScope();
  if (blocked) return [];
  let q = supabase.from('pendix_clientes').select('*').order('nome');
  if (eid) q = q.eq('escritorio_id', eid);
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
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase
    .from('pendix_clientes')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as PendixCliente;
}

export async function deletePendixCliente(id: string) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase.from('pendix_clientes').delete().eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { error } = await q;
  if (error) throw error;
}

// ── Documentos Config ──────────────────────────────────────────────────────

export async function getPendixDocConfigs(clienteId: string) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) return [];
  let q = supabase
    .from('pendix_documentos_config').select('*')
    .eq('cliente_id', clienteId).order('nome');
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q;
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
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase.from('pendix_documentos_config').update(p).eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as PendixDocConfig;
}

export async function deletePendixDocConfig(id: string) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase.from('pendix_documentos_config').delete().eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { error } = await q;
  if (error) throw error;
}

// ── Pendências ──────────────────────────────────────────────────────────────

export async function getPendixPendencias(filters?: {
  clienteId?: string; status?: string; competencia?: string; search?: string;
}) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) return [];

  let q = supabase
    .from('pendix_pendencias')
    .select('*, pendix_clientes(nome, telefone, empresa_id)')
    .order('data_limite', { ascending: true });

  if (eid) q = q.eq('escritorio_id', eid);
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
    .select('*, pendix_clientes(nome, telefone, empresa_id)').single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function updatePendixPendenciaStatus(
  id: string, status: PendixPendenciaStatus, obs?: string
) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // `data_recebimento` só faz sentido enquanto o status é 'recebido' — se a
  // pendência regredir pra outro status (ex: rejeitado após confirmado por
  // engano), limpa a data pra não deixar um registro de recebimento mentindo
  // sobre o estado atual.
  payload.data_recebimento = status === 'recebido' ? new Date().toISOString() : null;
  if (obs !== undefined) payload.observacoes = obs;
  let q = supabase.from('pendix_pendencias').update(payload).eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q.select('*, pendix_clientes(nome, telefone, empresa_id, pendix_empresas(id, nome, telefone, email))').single();
  if (error) throw error;
  const atualizada = data as PendixPendencia;

  // Fechou o ciclo de uma recorrente → abre o próximo. Best-effort: se falhar,
  // o documento continua marcado como recebido (o que o usuário pediu) e a
  // próxima ocorrência pode ser gerada de novo no próximo "recebido" ou à mão.
  if (status === 'recebido') {
    try {
      await gerarProximaOcorrencia(atualizada);
    } catch (err) {
      console.warn('[Pendências] Falha ao gerar a próxima ocorrência:', err);
    }
  }

  return atualizada;
}

/**
 * Cria a ocorrência seguinte de uma pendência recorrente, copiando o que
 * define o "molde" (cliente, documento, prioridade, anexo de exemplo) e
 * avançando as datas conforme a periodicidade.
 *
 * Devolve `null` quando não há o que gerar: pendência única, ou uma sucessora
 * que já existe. O índice único em `recorrencia_pai_id` é quem realmente
 * garante isso — a checagem antes é só para evitar o round-trip inútil, e a
 * violação (23505) é tratada como "outro já gerou", não como erro. É o mesmo
 * caminho do PendixApp (services/pendix.ts): quem fecha o ciclo abre o próximo,
 * não importa se foi pela web ou pelo celular.
 */
export async function gerarProximaOcorrencia(p: PendixPendencia): Promise<PendixPendencia | null> {
  if (!ehRecorrente(p.periodicidade)) return null;

  const proxima = calcularProximaOcorrencia(p);
  if (!proxima) return null;

  const { data: existente, error: errExistente } = await supabase
    .from('pendix_pendencias').select('id').eq('recorrencia_pai_id', p.id).maybeSingle();
  if (errExistente) throw errExistente;
  if (existente) return null;

  const { data, error } = await supabase.from('pendix_pendencias').insert({
    escritorio_id: p.escritorio_id,
    cliente_id: p.cliente_id,
    documento_id: p.documento_id ?? null,
    nome_documento: p.nome_documento,
    competencia: proxima.competencia,
    status: 'pendente',
    tipo: p.tipo ?? 'cliente',
    descricao: p.descricao ?? null,
    prioridade: p.prioridade ?? 'media',
    data_limite: proxima.data_limite ?? null,
    data_inicio_cobranca: proxima.data_inicio_cobranca ?? null,
    horario_notificacao: p.horario_notificacao ?? '09:00',
    datas_notificacao: proxima.datas_notificacao,
    // `datas_notificacao_enviadas` fica vazia de propósito: o ciclo novo ainda
    // não teve lembrete nenhum enviado.
    arquivo_modelo_url: p.arquivo_modelo_url ?? null,
    arquivo_modelo_nome: p.arquivo_modelo_nome ?? null,
    origem: p.origem ?? 'manual',
    periodicidade: p.periodicidade,
    recorrencia_pai_id: p.id,
    // O ciclo novo herda a configuração de cobrança, mas com o contador
    // zerado: o teto de reenvios é por ocorrência, não por recorrência.
    cobranca_automatica: p.cobranca_automatica ?? true,
    cobranca_frequencia: p.cobranca_frequencia ?? FREQUENCIA_COBRANCA_PADRAO,
    cobrancas_enviadas: 0,
    proxima_cobranca_em: inicioDaCobranca(proxima),
  }).select('*, pendix_clientes(nome, telefone, empresa_id)').single();

  if (error) {
    if ((error as { code?: string }).code === '23505') return null; // outro cliente já gerou
    throw error;
  }
  return data as PendixPendencia;
}

export async function updatePendixPendenciaCampos(
  id: string,
  p: Partial<Pick<PendixPendencia,
    'cliente_id' | 'nome_documento' | 'competencia' | 'data_limite' | 'observacoes' |
    'tipo' | 'descricao' | 'prioridade' | 'data_inicio_cobranca' |
    'arquivo_modelo_url' | 'arquivo_modelo_nome' | 'datas_notificacao' |
    'horario_notificacao' | 'periodicidade'
  >>
) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase
    .from('pendix_pendencias')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q.select('*, pendix_clientes(nome, telefone, empresa_id)').single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function getPendixPendenciaPorId(id: string) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase
    .from('pendix_pendencias')
    .select('*, pendix_clientes(nome, telefone, empresa_id, pendix_empresas(id, nome, telefone, email))')
    .eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { data, error } = await q.single();
  if (error) throw error;
  return data as PendixPendencia;
}

export async function deletePendixPendencia(id: string) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) throw new Error('Sessão sem escritório associado.');
  let q = supabase.from('pendix_pendencias').delete().eq('id', id);
  if (eid) q = q.eq('escritorio_id', eid);
  const { error } = await q;
  if (error) throw error;
}

// `arquivo_url` guarda o caminho no bucket privado `pendix-anexos` (não uma URL pública) —
// gera uma URL assinada de curta duração pra exibir/baixar o anexo.
export async function getPendixAnexoUrl(path: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('pendix-anexos')
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * A frequência do documento configurado vira a periodicidade da pendência
 * gerada — mesmo vocabulário, só o "não repete" muda de nome ('unico' na
 * config, 'unica' na pendência).
 */
export function periodicidadeDoDocumento(f?: PendixFrequencia | null): PendixPeriodicidade {
  return !f || f === 'unico' ? 'unica' : f;
}

export async function gerarPendenciasMes(clienteId: string, competencia: string) {
  const docs = await getPendixDocConfigs(clienteId);
  const ativas = docs.filter(d => d.ativo);
  if (!ativas.length) return [];

  const eid = sessionOfficeId();
  const [ano, mes] = competencia.split('-');

  // Não existe constraint única no banco pra (cliente_id, documento_id,
  // competencia), então clicar "Gerar Pendências do Mês" duas vezes duplicava
  // tudo — checa o que já existe pra essa competência antes de inserir.
  const { data: existentes, error: errExistentes } = await supabase
    .from('pendix_pendencias')
    .select('documento_id')
    .eq('cliente_id', clienteId)
    .eq('competencia', competencia);
  if (errExistentes) throw errExistentes;
  const documentoIdsExistentes = new Set((existentes ?? []).map(e => e.documento_id));
  const docsNovos = ativas.filter(doc => !documentoIdsExistentes.has(doc.id));
  if (!docsNovos.length) return [];

  const rows = docsNovos.map(doc => ({
    escritorio_id: eid || doc.escritorio_id,
    cliente_id: clienteId,
    documento_id: doc.id,
    nome_documento: doc.nome,
    competencia,
    status: 'pendente' as const,
    data_limite: `${ano}-${mes}-${String(doc.dia_limite).padStart(2, '0')}`,
    periodicidade: periodicidadeDoDocumento(doc.frequencia),
  }));

  const { data, error } = await supabase.from('pendix_pendencias').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as PendixPendencia[];
}

// ── Histórico ──────────────────────────────────────────────────────────────

export async function getPendixHistorico(opts?: {
  clienteId?: string; pendenciaId?: string; limit?: number; offset?: number;
}) {
  const { blocked, eid } = requireTenantScope();
  if (blocked) return [];

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let q = supabase
    .from('pendix_historico').select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (eid) q = q.eq('escritorio_id', eid);
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
  const { error } = await supabase.from('pendix_historico').insert({
    ...entry,
    escritorio_id: entry.escritorio_id || eid,
    usuario_nome: entry.usuario_nome || user?.nome,
  });
  // Nunca deveria travar a ação principal (mudar status, criar pendência...)
  // por causa da trilha de auditoria — mas também não pode falhar 100%
  // calada, senão não tem como saber depois que o histórico ficou incompleto.
  if (error) console.error('addPendixHistorico: falha ao gravar histórico', error.message);
}

// ── Stats helper ───────────────────────────────────────────────────────────

export async function getPendixStats() {
  const { blocked, eid } = requireTenantScope();
  if (blocked) {
    return { totalClientes: 0, totalEmpresas: 0, pendenciasAbertas: 0, vencidas: 0, concluidas: 0 };
  }

  const applyFilter = (q: any) => (eid ? q.eq('escritorio_id', eid) : q);

  const today = new Date().toISOString().slice(0, 10);

  const [clientes, empresas, abertas, vencidasPendente, concluidas] = await Promise.all([
    applyFilter(supabase.from('pendix_clientes').select('id', { count: 'exact', head: true })),
    applyFilter(supabase.from('pendix_empresas').select('id', { count: 'exact', head: true }).eq('status', 'ativa')),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).in('status', ['pendente', 'em_analise'])),
    // "vencida" não é mais um status guardado — é calculado (pendente + data_limite no passado)
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('data_limite', today)),
    applyFilter(supabase.from('pendix_pendencias').select('id', { count: 'exact', head: true }).eq('status', 'recebido')),
  ]);

  return {
    totalClientes: clientes.count ?? 0,
    totalEmpresas: (empresas as any).count ?? (empresas as any).length ?? 0,
    pendenciasAbertas: abertas.count ?? 0,
    vencidas: vencidasPendente.count ?? 0,
    concluidas: concluidas.count ?? 0,
  };
}

// ── Monthly pendências chart (real data) ─────────────────────────────────────

export async function getPendixPendenciasPorMes(numMeses = 6) {
  const meses: string[] = [];
  const now = new Date();
  for (let i = numMeses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  let q = supabase.from('pendix_pendencias').select('competencia').in('competencia', meses);
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }

  const { data, error } = await q;
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const m of meses) counts[m] = 0;
  for (const row of data ?? []) {
    if (row.competencia in counts) counts[row.competencia]++;
  }

  return meses.map(m => {
    const d = new Date(m + '-15'); // mid-month avoids TZ off-by-one
    return {
      mes: d.toLocaleDateString('pt-BR', { month: 'short' }),
      pendencias: counts[m],
    };
  });
}
