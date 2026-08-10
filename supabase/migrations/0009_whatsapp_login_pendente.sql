-- PendixWeb — Login por e-mail no WhatsApp
-- Rastreia números de WhatsApp em processo de identificação (sem cliente
-- vinculado ainda) entre uma mensagem e outra, já que a Edge Function é
-- stateless. Só o service_role (usado pela function) acessa esta tabela.

create table if not exists public.pendix_whatsapp_login_pendente (
  telefone_digits text primary key,
  telefone_raw    text not null,
  tentativas      smallint not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

alter table public.pendix_whatsapp_login_pendente enable row level security;
