import { readLocal, writeLocal, uid } from '../lib/localStore';

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
function getSessionUser(): { officeId?: string } | null {
  try { return JSON.parse(localStorage.getItem('flash_user') || 'null'); }
  catch { return null; }
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

export type PendixEmpresaStatus = 'ativa' | 'inativa';

export interface PendixEmpresa {
  id: string;
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
  return [...loadAll()].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function postPendixEmpresa(
  p: Omit<PendixEmpresa, 'id' | 'created_at' | 'updated_at'>
): Promise<PendixEmpresa> {
  const now = new Date().toISOString();
  const nova: PendixEmpresa = { ...p, id: uid(), created_at: now, updated_at: now };
  const all = loadAll();
  all.push(nova);
  saveAll(all);
  return nova;
}

export async function updatePendixEmpresa(
  id: string, p: Partial<Omit<PendixEmpresa, 'id' | 'created_at'>>
): Promise<PendixEmpresa> {
  const all = loadAll();
  const idx = all.findIndex(e => e.id === id);
  if (idx === -1) throw new Error('Empresa não encontrada');
  all[idx] = { ...all[idx], ...p, updated_at: new Date().toISOString() };
  saveAll(all);
  return all[idx];
}

export async function deletePendixEmpresa(id: string): Promise<void> {
  saveAll(loadAll().filter(e => e.id !== id));
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
