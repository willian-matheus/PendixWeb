-- PendixWeb — Chatbot WhatsApp com IA
-- Sessões de chat e mensagens para a IA conversacional do WhatsApp.
-- Rode no Supabase SQL Editor, depois das migrations 0001-0005.

-- ── pendix_chat_sessions ─────────────────────────────────────────────────
-- Cada cliente tem no máximo uma sessão ativa por vez.
-- Diferente de pendix_conversas (que exige pendencia_id), sessões de chat
-- podem existir antes de qualquer pendência — são o canal livre de conversa.
create table if not exists public.pendix_chat_sessions (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null references public.escritorios(id) on delete cascade,
  cliente_id     uuid not null references public.pendix_clientes(id) on delete cascade,
  telefone       text not null,
  status         text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  criada_em      timestamptz not null default now(),
  atualizada_em  timestamptz not null default now()
);

create index if not exists idx_pendix_chat_sessions_cliente on public.pendix_chat_sessions(cliente_id);
create index if not exists idx_pendix_chat_sessions_escritorio on public.pendix_chat_sessions(escritorio_id);
create index if not exists idx_pendix_chat_sessions_status on public.pendix_chat_sessions(status);

-- ── pendix_chat_mensagens ────────────────────────────────────────────────
-- Histórico completo da conversa entre o cliente e a IA.
-- remetente: 'cliente' = mensagem recebida, 'ia' = mensagem enviada pela IA
create table if not exists public.pendix_chat_mensagens (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.pendix_chat_sessions(id) on delete cascade,
  remetente   text not null check (remetente in ('cliente', 'ia')),
  conteudo    text,
  arquivo_url text,
  metadata    jsonb not null default '{}'::jsonb,
  criada_em   timestamptz not null default now()
);

create index if not exists idx_pendix_chat_mensagens_session on public.pendix_chat_mensagens(session_id);
create index if not exists idx_pendix_chat_mensagens_criada on public.pendix_chat_mensagens(criada_em);

-- ── pendix_pendencias: coluna de origem ──────────────────────────────────
-- Permite distinguir pendências criadas manualmente das criadas via WhatsApp.
alter table public.pendix_pendencias
  add column if not exists origem text not null default 'manual';

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_origem_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_origem_check
  check (origem in ('manual', 'whatsapp', 'automatico'));

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.pendix_chat_sessions enable row level security;
alter table public.pendix_chat_mensagens enable row level security;

-- chat_sessions
drop policy if exists "pendix_chat_sessions: select" on public.pendix_chat_sessions;
create policy "pendix_chat_sessions: select" on public.pendix_chat_sessions
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_chat_sessions: insert" on public.pendix_chat_sessions;
create policy "pendix_chat_sessions: insert" on public.pendix_chat_sessions
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_chat_sessions: update" on public.pendix_chat_sessions;
create policy "pendix_chat_sessions: update" on public.pendix_chat_sessions
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- chat_mensagens (acesso via sessão)
drop policy if exists "pendix_chat_mensagens: select" on public.pendix_chat_mensagens;
create policy "pendix_chat_mensagens: select" on public.pendix_chat_mensagens
  for select to authenticated
  using (exists (
    select 1 from public.pendix_chat_sessions s
    where s.id = pendix_chat_mensagens.session_id
      and (s.escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
  ));

drop policy if exists "pendix_chat_mensagens: insert" on public.pendix_chat_mensagens;
create policy "pendix_chat_mensagens: insert" on public.pendix_chat_mensagens
  for insert to authenticated
  with check (exists (
    select 1 from public.pendix_chat_sessions s
    where s.id = pendix_chat_mensagens.session_id
      and (s.escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
  ));
