-- PendixWeb — alinha o schema com o que o PendixApp (mobile) espera:
-- vocabulário de status novo, sistema de cobrança escalonada, conversas por
-- pendência com mensagens no formato agente/cliente.
-- Rode no Supabase SQL Editor, depois das migrations 0001-0004.

-- ── usuarios ─────────────────────────────────────────────────────────────
alter table public.usuarios add column if not exists telefone text;

-- ── pendix_clientes ──────────────────────────────────────────────────────
alter table public.pendix_clientes
  add column if not exists tipo text not null default 'pessoa',
  add column if not exists consentimento_whatsapp boolean not null default false;

alter table public.pendix_clientes drop constraint if exists pendix_clientes_tipo_check;
alter table public.pendix_clientes add constraint pendix_clientes_tipo_check
  check (tipo in ('pessoa', 'empresa'));

-- ── pendix_documentos_config ─────────────────────────────────────────────
alter table public.pendix_documentos_config
  add column if not exists descricao_whatsapp text,
  add column if not exists arquivo_modelo_url text,
  add column if not exists arquivo_modelo_nome text;

-- ── pendix_pendencias: migra o vocabulário de status ────────────────────
-- pendente/enviada/recebida/concluida/vencida/cancelada  ->  pendente/em_analise/recebido/rejeitado/cancelado
alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_status_check;

update public.pendix_pendencias set status = case status
  when 'enviada'   then 'pendente'
  when 'vencida'   then 'pendente'
  when 'recebida'  then 'recebido'
  when 'concluida' then 'recebido'
  when 'cancelada' then 'cancelado'
  else status
end
where status in ('enviada', 'vencida', 'recebida', 'concluida', 'cancelada');

alter table public.pendix_pendencias add constraint pendix_pendencias_status_check
  check (status in ('pendente', 'em_analise', 'recebido', 'rejeitado', 'cancelado'));

alter table public.pendix_pendencias
  add column if not exists nivel_cobranca_atual text,
  add column if not exists tentativas_reenvio integer not null default 0,
  add column if not exists ultima_mensagem_enviada_em timestamptz,
  add column if not exists requer_revisao_humana boolean not null default false;

alter table public.pendix_pendencias drop constraint if exists pendix_pendencias_nivel_cobranca_check;
alter table public.pendix_pendencias add constraint pendix_pendencias_nivel_cobranca_check
  check (nivel_cobranca_atual is null or nivel_cobranca_atual in ('amigavel', 'lembrete', 'urgente', 'critico'));

-- ── pendix_conversas (nova) ──────────────────────────────────────────────
create table if not exists public.pendix_conversas (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null references public.escritorios(id) on delete cascade,
  pendencia_id   uuid not null references public.pendix_pendencias(id) on delete cascade,
  cliente_id     uuid not null references public.pendix_clientes(id) on delete cascade,
  telefone       text not null,
  status         text not null default 'ativa' check (status in ('ativa', 'encerrada', 'escalada_humano')),
  resumo         text,
  criada_em      timestamptz not null default now(),
  atualizada_em  timestamptz not null default now()
);
create index if not exists idx_pendix_conversas_pendencia on public.pendix_conversas(pendencia_id);
create index if not exists idx_pendix_conversas_cliente on public.pendix_conversas(cliente_id);
create index if not exists idx_pendix_conversas_escritorio on public.pendix_conversas(escritorio_id);

-- ── pendix_mensagens: formato antigo (cliente_id/telefone/status de entrega
-- direto na linha) é incompatível com o que o PendixApp espera
-- (conversa_id/remetente/tipo/metadata) — recria do zero.
drop table if exists public.pendix_mensagens cascade;

create table public.pendix_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.pendix_conversas(id) on delete cascade,
  remetente   text not null check (remetente in ('agente', 'cliente')),
  tipo        text not null default 'texto' check (tipo in ('texto', 'arquivo')),
  conteudo    text,
  arquivo_url text,
  -- guarda o que não virou coluna própria: provider_message_id, status de
  -- entrega/leitura (enviada/entregue/lida/erro), telefone, sender_nome etc.
  metadata    jsonb not null default '{}'::jsonb,
  criada_em   timestamptz not null default now()
);
create index if not exists idx_pendix_mensagens_conversa on public.pendix_mensagens(conversa_id);
create index if not exists idx_pendix_mensagens_metadata_provider_id
  on public.pendix_mensagens ((metadata ->> 'provider_message_id'));

-- ── pendix_configuracao_cobranca (nova) ──────────────────────────────────
create table if not exists public.pendix_configuracao_cobranca (
  escritorio_id  uuid primary key references public.escritorios(id) on delete cascade,
  dias_amigavel  integer not null default 2,
  dias_lembrete  integer not null default 7,
  dias_urgente   integer not null default 15,
  horario_inicio text not null default '08:00',
  horario_fim    text not null default '19:00',
  max_reenvios   integer not null default 4,
  cooldown_horas integer not null default 24,
  ativo          boolean not null default true
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.pendix_conversas enable row level security;
alter table public.pendix_mensagens enable row level security;
alter table public.pendix_configuracao_cobranca enable row level security;

drop policy if exists "pendix_conversas: select" on public.pendix_conversas;
create policy "pendix_conversas: select" on public.pendix_conversas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_conversas: insert" on public.pendix_conversas;
create policy "pendix_conversas: insert" on public.pendix_conversas
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_conversas: update" on public.pendix_conversas;
create policy "pendix_conversas: update" on public.pendix_conversas
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_mensagens: select" on public.pendix_mensagens;
create policy "pendix_mensagens: select" on public.pendix_mensagens
  for select to authenticated
  using (exists (
    select 1 from public.pendix_conversas c
    where c.id = pendix_mensagens.conversa_id
      and (c.escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
  ));

drop policy if exists "pendix_mensagens: insert" on public.pendix_mensagens;
create policy "pendix_mensagens: insert" on public.pendix_mensagens
  for insert to authenticated
  with check (exists (
    select 1 from public.pendix_conversas c
    where c.id = pendix_mensagens.conversa_id
      and (c.escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
  ));

drop policy if exists "pendix_config_cobranca: select" on public.pendix_configuracao_cobranca;
create policy "pendix_config_cobranca: select" on public.pendix_configuracao_cobranca
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_config_cobranca: insert" on public.pendix_configuracao_cobranca;
create policy "pendix_config_cobranca: insert" on public.pendix_configuracao_cobranca
  for insert to authenticated
  with check (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_config_cobranca: update" on public.pendix_configuracao_cobranca;
create policy "pendix_config_cobranca: update" on public.pendix_configuracao_cobranca
  for update to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());
