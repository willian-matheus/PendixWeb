import { readLocal, writeLocal, uid } from '../lib/localStore';

// Mock — sem tabela no Supabase ainda. Ver nota em services/empresas.ts.

const KEY = 'pendix_mock_notificacoes_v1';

export type PendixNotificacaoTipo =
  | 'pendencia_vencida' | 'pendencia_proxima' | 'cliente_respondeu' | 'documento_recebido';

export interface PendixNotificacao {
  id: string;
  tipo: PendixNotificacaoTipo;
  titulo: string;
  descricao: string;
  lida: boolean;
  created_at: string;
}

const SEED: PendixNotificacao[] = [
  {
    id: 'notif-seed-1', tipo: 'pendencia_vencida',
    titulo: 'Pendência vencida',
    descricao: 'O documento "Extrato Bancário" de Grupo Vitória Comércio Ltda venceu ontem.',
    lida: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'notif-seed-2', tipo: 'pendencia_proxima',
    titulo: 'Pendência próxima do vencimento',
    descricao: '"Folha de Pagamento" vence em 2 dias.',
    lida: false, created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'notif-seed-3', tipo: 'cliente_respondeu',
    titulo: 'Cliente respondeu',
    descricao: 'Nortech Soluções Industriais S.A. respondeu à cobrança enviada por WhatsApp.',
    lida: false, created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    id: 'notif-seed-4', tipo: 'documento_recebido',
    titulo: 'Documento recebido',
    descricao: '"Nota Fiscal" de Grupo Vitória Comércio Ltda foi recebido e está em análise.',
    lida: true, created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

function loadAll(): PendixNotificacao[] {
  return readLocal(KEY, SEED);
}
function saveAll(list: PendixNotificacao[]) {
  writeLocal(KEY, list);
}

export async function getPendixNotificacoes(): Promise<PendixNotificacao[]> {
  return [...loadAll()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getPendixNotificacoesNaoLidas(): Promise<number> {
  return loadAll().filter(n => !n.lida).length;
}

export async function marcarNotificacaoLida(id: string): Promise<void> {
  saveAll(loadAll().map(n => n.id === id ? { ...n, lida: true } : n));
}

export async function marcarTodasNotificacoesLidas(): Promise<void> {
  saveAll(loadAll().map(n => ({ ...n, lida: true })));
}

export async function addPendixNotificacao(
  n: Omit<PendixNotificacao, 'id' | 'created_at' | 'lida'>
): Promise<PendixNotificacao> {
  const nova: PendixNotificacao = { ...n, id: uid(), lida: false, created_at: new Date().toISOString() };
  const all = loadAll();
  all.unshift(nova);
  saveAll(all);
  return nova;
}
