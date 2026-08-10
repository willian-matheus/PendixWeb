-- PendixWeb — promove os "extras" locais da pendência para colunas reais
--
-- `pendix_pendencias` guardava tipo/descrição/prioridade/data de início de
-- cobrança/anexo de exemplo só no localStorage do navegador de quem criou
-- (ver comentário "Extras locais da pendência" em src/pendix/services/pendix.ts).
-- Isso nunca funcionou pra pendências criadas fora do navegador (ex.: pelo
-- chatbot de WhatsApp), que não tem acesso a esse localStorage.
--
-- Esta migration promove esses campos para colunas reais, e adiciona duas
-- colunas em pendix_chat_sessions pra guardar temporariamente um anexo de
-- exemplo enviado no meio da conversa do WhatsApp, até a pendência ser
-- efetivamente criada.

alter table public.pendix_pendencias
  add column if not exists tipo text not null default 'cliente',
  add column if not exists descricao text,
  add column if not exists prioridade text not null default 'media',
  add column if not exists data_inicio_cobranca date,
  add column if not exists arquivo_modelo_url text,
  add column if not exists arquivo_modelo_nome text;

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_tipo_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_tipo_check
  check (tipo in ('cliente', 'empresa'));

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_prioridade_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_prioridade_check
  check (prioridade in ('baixa', 'media', 'alta', 'urgente'));

alter table public.pendix_chat_sessions
  add column if not exists anexo_modelo_pendente_url text,
  add column if not exists anexo_modelo_pendente_nome text;
