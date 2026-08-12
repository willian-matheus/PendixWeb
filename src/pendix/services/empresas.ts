import { supabase } from '../../app/services/supabase';
import { readLocal, writeLocal } from '../lib/localStore';

// Duplicado (não importado) de services/pendix.ts pra evitar import
// circular — pendix.ts já importa deste arquivo. As chaves de localStorage
// são escopadas por escritório: sem isso, um escritório veria as empresas
// cadastradas por outro assim que fizesse login no mesmo navegador.
function getSessionUser(): { officeId?: string; role?: string; nome?: string } | null {
  try { return JSON.parse(localStorage.getItem('flash_user') || 'null'); }
  catch { return null; }
}
function getImpersonatedOfficeId(): string | null {
  return localStorage.getItem('flash_impersonated_office_id');
}
function sessionScopeId(): string {
  return getImpersonatedOfficeId()
    || getSessionUser()?.officeId
    || 'sem-escritorio';
}
function sessionOfficeId(): string | null {
  return getImpersonatedOfficeId() || getSessionUser()?.officeId || null;
}
function keyLinks(): string {
  return `pendix_mock_cliente_empresa_v1:${sessionScopeId()}`;
}
function isSuperAdmin(): boolean {
  if (getImpersonatedOfficeId()) return false;
  const r = getSessionUser()?.role;
  return r === 'super_admin' || r === 'admin';
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
}

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
