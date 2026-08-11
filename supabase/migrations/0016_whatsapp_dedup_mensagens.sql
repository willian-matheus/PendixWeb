-- PendixWeb — Deduplicação de webhooks da Z-API
-- A Z-API pode reentregar o mesmo evento "ReceivedCallback" mais de uma vez
-- (webhook at-least-once). Sem essa tabela, uma reentrega processa a mesma
-- mensagem do cliente duas vezes e desalinha o passo do wizard (coleta_estado
-- avança sozinho, sem o cliente ter respondido de novo). Guarda o
-- payload.messageId da Z-API; a function tenta inserir antes de processar e,
-- se colidir (chave já existe), é uma reentrega e a mensagem é ignorada.

create table if not exists public.pendix_whatsapp_eventos_processados (
  message_id     text primary key,
  processado_em  timestamptz not null default now()
);

alter table public.pendix_whatsapp_eventos_processados enable row level security;
