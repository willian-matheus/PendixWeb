import { supabase } from '../../app/services/supabase';

// ── Mock persistence ──────────────────────────────────────────────────────
// "Empresas" has no Supabase table yet. This first version is UI/UX-focused,
// so data lives in localStorage until a real `pendix_empresas` table exists —
// swap these functions for Supabase calls (same shape as services/pendix.ts)
// once the schema is ready.
//
// Duplicado (não importado) de services/pendix.ts pra evitar import
// circular — pendix.ts já importa deste arquivo. As chaves de localStorage
// são escopadas por escritório: sem isso, um escritório via as empresas
// cadastradas por outro assim que fizesse login no mesmo navegador.
function getSessionUser(): { officeId?: string; role?: string; nome?: string } | null {
  try { return JSON.parse(localStorage.getItem('flash_user') || 'null'); }
  catch { return null; }
}
function getImpersonatedOfficeId(): string | null {
  return localStorage.getItem('flash_impersonated_office_id');
}
function sessionScopeId(): string {
  return localStorage.getItem('flash_impersonated_office_id')
    || getSessionUser()?.officeId
    || 'sem-escritorio';
}
function keyEmpresas(): string {
  return `pendix_mock_empresas_v1:${sessionScopeId()}`;
}
function keyLinks(): string {
  return `pendix_mock_cliente_empresa_v1:${sessionScopeId()}`;
}
function isSuperAdmin(): boolean {
  if (getImpersonatedOfficeId()) return false;
  const r = getSessionUser()?.role;
  return r === 'super_admin' || r === 'admin';
}

}

// ── Types ─────────────────────────────────────────────────────────────────────
export type PendixEmpresaStatus = 'ativa' | 'inativa';

export interface PendixEmpresa {
  id: string;
  escritorio_id: string;
  nome: string;
  telefone: string;
  email: string;
  observacoes: string;
  status: PendixEmpresaStatus;
  created_at: string;
  updated_at: string;
}

const SEED: PendixEmpresa[] = [
  {
    id: 'emp-seed-1',
    nome: 'Grupo Vitória Comércio Ltda',
    telefone: '(11) 98888-1234',
    email: 'financeiro@grupovitoria.com.br',
    observacoes: 'Matriz com 3 filiais vinculadas.',
    status: 'ativa',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'emp-seed-2',
    nome: 'Nortech Soluções Industriais S.A.',
    telefone: '(41) 3355-7788',
    email: 'contabil@nortech.ind.br',
    observacoes: '',
    status: 'ativa',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
];

function loadAll(): PendixEmpresa[] {
  return readLocal(keyEmpresas(), SEED);
}
function saveAll(list: PendixEmpresa[]) {
  writeLocal(keyEmpresas(), list);
}


export async function getPendixEmpresas(): Promise<PendixEmpresa[]> {
  let q = supabase.from('pendix_empresas').select('*').order('nome');
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PendixEmpresa[];
}

export async function postPendixEmpresa(
  p: Omit<PendixEmpresa, 'id' | 'created_at' | 'updated_at'>
): Promise<PendixEmpresa> {
  const eid = sessionOfficeId();
  const { data, error } = await supabase
    .from('pendix_empresas')
    .insert({ ...p, escritorio_id: p.escritorio_id || eid })
    .select().single();
  if (error) throw error;
  return data as PendixEmpresa;
}

export async function updatePendixEmpresa(
  id: string, p: Partial<Omit<PendixEmpresa, 'id' | 'created_at'>>
): Promise<PendixEmpresa> {
  const { data, error } = await supabase
    .from('pendix_empresas')
    .update({ ...p, updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as PendixEmpresa;
}

export async function deletePendixEmpresa(id: string): Promise<void> {
  const { error } = await supabase.from('pendix_empresas').delete().eq('id', id);
  if (error) throw error;

  // Local mapping cleanup (mock persistence) — keep links in sync if local
  // mock data is being used alongside Supabase data.
  const links = readLocal<Record<string, string>>(keyLinks(), {});
  for (const clienteId of Object.keys(links)) {
    if (links[clienteId] === id) delete links[clienteId];
  }
  writeLocal(keyLinks(), links);

// ── Vínculo cliente ↔ empresa ────────────────────────────────────────────
// `pendix_clientes` também não tem coluna `empresa_id` ainda — o vínculo
// fica local, à parte da linha real do cliente no Supabase.

export function getClienteEmpresaLinks(): Record<string, string> {
  return readLocal<Record<string, string>>(keyLinks(), {});
}

export function getEmpresaIdDoCliente(clienteId: string): string | null {
  return getClienteEmpresaLinks()[clienteId] ?? null;
}

export function setEmpresaDoCliente(clienteId: string, empresaId: string | null): void {
  const links = getClienteEmpresaLinks();
  if (empresaId) links[clienteId] = empresaId;
  else delete links[clienteId];
  writeLocal(keyLinks(), links);
}

export function getClientesIdsDaEmpresa(empresaId: string): string[] {
  const links = getClienteEmpresaLinks();
  return Object.entries(links).filter(([, eid]) => eid === empresaId).map(([cid]) => cid);

}
