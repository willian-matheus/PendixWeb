import { supabase } from '../../app/services/supabase';

// ── Helpers (mirrors pendix.ts) ───────────────────────────────────────────────
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

// ── CRUD ──────────────────────────────────────────────────────────────────────
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
}
