-- PendixWeb — mensagens de WhatsApp
-- Rode este arquivo no Supabase SQL Editor (Project > SQL Editor > New query),
-- depois de já ter rodado 0001_init.sql.

create table if not exists public.pendix_mensagens (
  id                 uuid primary key default gen_random_uuid(),
  escritorio_id      uuid not null references public.escritorios(id) on delete cascade,
  cliente_id         uuid references public.pendix_clientes(id) on delete cascade,
  pendencia_id       uuid references public.pendix_pendencias(id) on delete set null,
  telefone           text not null,
  mensagem           text not null,
  status             text not null default 'pendente'
                     check (status in ('pendente', 'enviada', 'entregue', 'lida', 'erro')),
  provider_message_id text,
  erro               text,
  enviado_em         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_pendix_mensagens_escritorio on public.pendix_mensagens(escritorio_id);
create index if not exists idx_pendix_mensagens_cliente on public.pendix_mensagens(cliente_id);
create index if not exists idx_pendix_mensagens_pendencia on public.pendix_mensagens(pendencia_id);
create index if not exists idx_pendix_mensagens_status on public.pendix_mensagens(status);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.pendix_mensagens enable row level security;

drop policy if exists "pendix_mensagens: select" on public.pendix_mensagens;
create policy "pendix_mensagens: select" on public.pendix_mensagens
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_mensagens: insert" on public.pendix_mensagens;
create policy "pendix_mensagens: insert" on public.pendix_mensagens
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_mensagens: update" on public.pendix_mensagens;
create policy "pendix_mensagens: update" on public.pendix_mensagens
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_mensagens: delete" on public.pendix_mensagens;
create policy "pendix_mensagens: delete" on public.pendix_mensagens
  for delete to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());
