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
// Schema compartilhado com o PendixApp (mobile): conversa por pendência,
// mensagens ligadas via conversa_id. Ver supabase/migrations/0005_pendix_app_schema.sql.

export type PendixConversaStatus = 'ativa' | 'encerrada' | 'escalada_humano';
export type PendixMensagemRemetente = 'agente' | 'cliente';
export type PendixMensagemTipo = 'texto' | 'arquivo';
// Status de entrega/leitura da mensagem — vive dentro de `metadata`, não é coluna própria.
export type PendixMensagemEntregaStatus = 'enviada' | 'entregue' | 'lida' | 'erro';

export interface PendixConversa {
  id: string;
  escritorio_id: string;
  pendencia_id: string;
  cliente_id: string;
  telefone: string;
  status: PendixConversaStatus;
  resumo?: string;
  criada_em: string;
  atualizada_em: string;
}

export interface PendixMensagemMetadata {
  status?: PendixMensagemEntregaStatus;
  provider_message_id?: string;
  sender_nome?: string;
  telefone?: string;
  erro?: string;
}

export interface PendixMensagem {
  id: string;
  conversa_id: string;
  remetente: PendixMensagemRemetente;
  tipo: PendixMensagemTipo;
  conteudo?: string;
  arquivo_url?: string;
  metadata: PendixMensagemMetadata;
  criada_em: string;
}

// ── Conversas e mensagens de uma pendência ───────────────────────────────

export async function getPendixConversaMensagens(pendenciaId: string) {
  const { data: conversa, error: errConversa } = await supabase
    .from('pendix_conversas').select('*').eq('pendencia_id', pendenciaId).maybeSingle();
  if (errConversa) throw errConversa;
  if (!conversa) return { conversa: null as PendixConversa | null, mensagens: [] as PendixMensagem[] };

  const { data: mensagens, error: errMsg } = await supabase
    .from('pendix_mensagens').select('*').eq('conversa_id', conversa.id).order('criada_em', { ascending: true });
  if (errMsg) throw errMsg;

  return { conversa: conversa as PendixConversa, mensagens: (mensagens ?? []) as PendixMensagem[] };
}

async function acharOuCriarConversa(pendenciaId: string, escritorioId: string, clienteId: string, telefone: string) {
  const { data: existente, error: errBusca } = await supabase
    .from('pendix_conversas').select('*').eq('pendencia_id', pendenciaId).maybeSingle();
  if (errBusca) throw errBusca;
  if (existente) return existente as PendixConversa;

  const { data: nova, error } = await supabase
    .from('pendix_conversas')
    .insert({ escritorio_id: escritorioId, pendencia_id: pendenciaId, cliente_id: clienteId, telefone })
    .select().single();
  if (error) throw error;
  return nova as PendixConversa;
}

// Envia uma mensagem manual da equipe pro cliente (o envio de fato pela Z-API
// acontece numa Edge Function — esta função só registra a mensagem enviada).
export async function postPendixMensagemAgente(p: {
  pendenciaId: string; clienteId: string; telefone: string; conteudo: string;
}) {
  const eid = sessionOfficeId();
  const conversa = await acharOuCriarConversa(p.pendenciaId, eid ?? '', p.clienteId, p.telefone);

  const { data, error } = await supabase
    .from('pendix_mensagens')
    .insert({
      conversa_id: conversa.id,
      remetente: 'agente',
      tipo: 'texto',
      conteudo: p.conteudo,
      metadata: { status: 'enviada' },
    })
    .select().single();
  if (error) throw error;

  await supabase.from('pendix_pendencias')
    .update({ ultima_mensagem_enviada_em: new Date().toISOString() })
    .eq('id', p.pendenciaId);

  return data as PendixMensagem;
}

export async function getPendixConversasAtivas() {
  let q = supabase.from('pendix_conversas').select('*, pendix_clientes(nome)').order('atualizada_em', { ascending: false });
  if (!isSuperAdmin()) {
    const eid = sessionOfficeId();
    if (eid) q = q.eq('escritorio_id', eid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as (PendixConversa & { pendix_clientes?: { nome: string } })[];
}
