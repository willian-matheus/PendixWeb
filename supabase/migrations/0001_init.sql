-- PendixWeb — schema inicial
-- Rode este arquivo inteiro no Supabase SQL Editor (Project > SQL Editor > New query).
-- Idempotente: pode ser executado mais de uma vez sem erro.

-- ── Extensões ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Escritórios (tenant) ────────────────────────────────────────────────
create table if not exists public.escritorios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  plano       text not null default 'normal' check (plano in ('normal', 'pro')),
  created_at  timestamptz not null default now()
);

-- ── Usuários (perfil, espelha auth.users) ──────────────────────────────
create table if not exists public.usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text not null,
  email          text not null,
  role           text not null default 'dono_escritorio'
                 check (role in ('admin', 'super_admin', 'dono_escritorio', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador')),
  escritorio_id  uuid references public.escritorios(id) on delete set null,
  empresa_id     uuid,
  telas          jsonb not null default '[]'::jsonb,
  empresa_ids    jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

-- ── Pendix: Clientes ─────────────────────────────────────────────────────
create table if not exists public.pendix_clientes (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome          text not null,
  responsavel   text not null default '',
  telefone      text not null default '',
  email         text not null default '',
  regime        text not null default 'simples_nacional'
                check (regime in ('simples_nacional', 'lucro_presumido', 'lucro_real', 'mei')),
  status        text not null default 'ativo'
                check (status in ('ativo', 'inativo', 'suspenso')),
  observacoes   text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_pendix_clientes_escritorio on public.pendix_clientes(escritorio_id);

-- ── Pendix: Configuração de documentos recorrentes ──────────────────────
create table if not exists public.pendix_documentos_config (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  cliente_id    uuid not null references public.pendix_clientes(id) on delete cascade,
  nome          text not null,
  frequencia    text not null default 'mensal'
                check (frequencia in ('mensal', 'trimestral', 'anual', 'unico')),
  dia_limite    smallint not null default 20 check (dia_limite between 1 and 31),
  prioridade    text not null default 'media'
                check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pendix_docconfig_cliente on public.pendix_documentos_config(cliente_id);
create index if not exists idx_pendix_docconfig_escritorio on public.pendix_documentos_config(escritorio_id);

-- ── Pendix: Pendências (instâncias por competência) ─────────────────────
create table if not exists public.pendix_pendencias (
  id                uuid primary key default gen_random_uuid(),
  escritorio_id     uuid not null references public.escritorios(id) on delete cascade,
  cliente_id        uuid not null references public.pendix_clientes(id) on delete cascade,
  documento_id      uuid references public.pendix_documentos_config(id) on delete set null,
  nome_documento    text not null,
  competencia       text not null, -- formato 'YYYY-MM'
  status            text not null default 'pendente'
                    check (status in ('pendente', 'enviada', 'recebida', 'concluida', 'vencida', 'cancelada')),
  arquivo_url       text,
  arquivo_nome      text,
  observacoes       text,
  data_limite       date,
  data_recebimento  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_pendix_pendencias_escritorio on public.pendix_pendencias(escritorio_id);
create index if not exists idx_pendix_pendencias_cliente on public.pendix_pendencias(cliente_id);
create index if not exists idx_pendix_pendencias_status on public.pendix_pendencias(status);
create index if not exists idx_pendix_pendencias_competencia on public.pendix_pendencias(competencia);

-- ── Pendix: Histórico (auditoria) ────────────────────────────────────────
create table if not exists public.pendix_historico (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  pendencia_id  uuid references public.pendix_pendencias(id) on delete set null,
  cliente_id    uuid references public.pendix_clientes(id) on delete set null,
  acao          text not null,
  descricao     text,
  usuario_nome  text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pendix_historico_escritorio on public.pendix_historico(escritorio_id);
create index if not exists idx_pendix_historico_cliente on public.pendix_historico(cliente_id);
create index if not exists idx_pendix_historico_pendencia on public.pendix_historico(pendencia_id);

-- ── Helpers para RLS ─────────────────────────────────────────────────────
create or replace function public.pendix_current_escritorio_id()
returns uuid language sql stable security definer set search_path = public as $$
  select escritorio_id from public.usuarios where id = auth.uid();
$$;

create or replace function public.pendix_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'super_admin') from public.usuarios where id = auth.uid()), false);
$$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.escritorios enable row level security;
alter table public.usuarios enable row level security;
alter table public.pendix_clientes enable row level security;
alter table public.pendix_documentos_config enable row level security;
alter table public.pendix_pendencias enable row level security;
alter table public.pendix_historico enable row level security;

drop policy if exists "usuarios: read own or admin" on public.usuarios;
create policy "usuarios: read own or admin" on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.pendix_is_admin());

drop policy if exists "usuarios: update own" on public.usuarios;
create policy "usuarios: update own" on public.usuarios
  for update to authenticated
  using (id = auth.uid() or public.pendix_is_admin());

drop policy if exists "escritorios: read scoped" on public.escritorios;
create policy "escritorios: read scoped" on public.escritorios
  for select to authenticated
  using (id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- pendix_clientes
drop policy if exists "pendix_clientes: select" on public.pendix_clientes;
create policy "pendix_clientes: select" on public.pendix_clientes
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_clientes: insert" on public.pendix_clientes;
create policy "pendix_clientes: insert" on public.pendix_clientes
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_clientes: update" on public.pendix_clientes;
create policy "pendix_clientes: update" on public.pendix_clientes
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_clientes: delete" on public.pendix_clientes;
create policy "pendix_clientes: delete" on public.pendix_clientes
  for delete to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- pendix_documentos_config
drop policy if exists "pendix_docconfig: select" on public.pendix_documentos_config;
create policy "pendix_docconfig: select" on public.pendix_documentos_config
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_docconfig: insert" on public.pendix_documentos_config;
create policy "pendix_docconfig: insert" on public.pendix_documentos_config
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_docconfig: update" on public.pendix_documentos_config;
create policy "pendix_docconfig: update" on public.pendix_documentos_config
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_docconfig: delete" on public.pendix_documentos_config;
create policy "pendix_docconfig: delete" on public.pendix_documentos_config
  for delete to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- pendix_pendencias
drop policy if exists "pendix_pendencias: select" on public.pendix_pendencias;
create policy "pendix_pendencias: select" on public.pendix_pendencias
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_pendencias: insert" on public.pendix_pendencias;
create policy "pendix_pendencias: insert" on public.pendix_pendencias
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_pendencias: update" on public.pendix_pendencias;
create policy "pendix_pendencias: update" on public.pendix_pendencias
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_pendencias: delete" on public.pendix_pendencias;
create policy "pendix_pendencias: delete" on public.pendix_pendencias
  for delete to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- pendix_historico
drop policy if exists "pendix_historico: select" on public.pendix_historico;
create policy "pendix_historico: select" on public.pendix_historico
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_historico: insert" on public.pendix_historico;
create policy "pendix_historico: insert" on public.pendix_historico
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

-- ── Trigger: cria linha em public.usuarios ao criar um usuário de auth ──
create or replace function public.pendix_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'dono_escritorio')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.pendix_handle_new_user();
