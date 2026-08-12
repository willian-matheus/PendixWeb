-- PendixWeb — promove o vínculo cliente↔empresa e o cadastro de "Empresas"
-- (client companies) de um mock em localStorage para tabelas reais.
--
-- `pendix_empresas` não existia — o front-end guardava tudo em
-- localStorage (ver comentário antigo em src/pendix/services/empresas.ts).
-- Isso nunca funcionou fora do navegador de quem criou o vínculo (ex.:
-- pendências criadas pelo chatbot de WhatsApp não enxergavam a empresa).
--
-- Esta migration cria a tabela real e adiciona a FK em pendix_clientes,
-- espelhando o padrão de RLS (policies escopadas a `authenticated`) e de
-- índices em FK já usado no restante do schema pendix_*.

create table if not exists public.pendix_empresas (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.empresas(id),
  nome          text not null,
  telefone      text not null default '',
  email         text not null default '',
  observacoes   text not null default '',
  status        text not null default 'ativa' check (status in ('ativa', 'inativa')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_pendix_empresas_escritorio on public.pendix_empresas(escritorio_id);

alter table public.pendix_clientes
  add column if not exists empresa_id uuid references public.pendix_empresas(id) on delete set null;
create index if not exists idx_pendix_clientes_empresa on public.pendix_clientes(empresa_id);

alter table public.pendix_empresas enable row level security;

drop policy if exists "pendix_empresas: select" on public.pendix_empresas;
create policy "pendix_empresas: select" on public.pendix_empresas
  for select to authenticated
  using (escritorio_id = pendix_current_escritorio_id() or pendix_is_admin());

drop policy if exists "pendix_empresas: insert" on public.pendix_empresas;
create policy "pendix_empresas: insert" on public.pendix_empresas
  for insert to authenticated
  with check (escritorio_id = pendix_current_escritorio_id() or pendix_is_admin());

drop policy if exists "pendix_empresas: update" on public.pendix_empresas;
create policy "pendix_empresas: update" on public.pendix_empresas
  for update to authenticated
  using (escritorio_id = pendix_current_escritorio_id() or pendix_is_admin());

drop policy if exists "pendix_empresas: delete" on public.pendix_empresas;
create policy "pendix_empresas: delete" on public.pendix_empresas
  for delete to authenticated
  using (escritorio_id = pendix_current_escritorio_id() or pendix_is_admin());
