-- PendixWeb — suporte a mensagens recebidas + status de entrega/leitura via webhook Z-API
-- Rode no Supabase SQL Editor, depois de 0001_init.sql e 0002_pendix_mensagens.sql.

alter table public.pendix_mensagens
  add column if not exists direcao text not null default 'saida',
  add column if not exists sender_nome text;

alter table public.pendix_mensagens
  drop constraint if exists pendix_mensagens_direcao_check;
alter table public.pendix_mensagens
  add constraint pendix_mensagens_direcao_check check (direcao in ('saida', 'entrada'));

alter table public.pendix_mensagens
  drop constraint if exists pendix_mensagens_status_check;
alter table public.pendix_mensagens
  add constraint pendix_mensagens_status_check
  check (status in ('pendente', 'enviada', 'entregue', 'lida', 'erro', 'recebida'));

create index if not exists idx_pendix_mensagens_provider_id on public.pendix_mensagens(provider_message_id);
