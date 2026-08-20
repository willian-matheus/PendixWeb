-- PendixWeb — financeiro: assinatura mensal por empresa cliente e faturas.
--
-- Nomenclatura: "cobrança" neste repo já significa perseguir um documento
-- pendente (pendix_configuracao_cobranca, data_inicio_cobranca,
-- send-whatsapp-pendentes). O dinheiro usa "fatura" para não colidir.
--
-- Escreve apenas coisa nova: colunas em pendix_empresas e três tabelas.
-- Nenhuma policy existente é alterada aqui — isso fica na 0020.

alter table public.pendix_empresas
  add column if not exists mensalidade_valor numeric(12,2),
  add column if not exists mensalidade_dia_vencimento int,
  add column if not exists mensalidade_status text not null default 'sem_cobranca';

-- Constraints em bloco condicional: `add constraint` não aceita `if not
-- exists`, e a migration precisa poder rodar duas vezes sem quebrar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pendix_empresas_dia_venc_chk') then
    alter table public.pendix_empresas
      add constraint pendix_empresas_dia_venc_chk
      check (mensalidade_dia_vencimento is null or mensalidade_dia_vencimento between 1 and 28);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pendix_empresas_mens_status_chk') then
    alter table public.pendix_empresas
      add constraint pendix_empresas_mens_status_chk
      check (mensalidade_status in ('sem_cobranca', 'ativa', 'pausada'));
  end if;
end $$;

-- Dia limitado a 28 de propósito: 29/30/31 não existem em todo mês e viram
-- ambiguidade de vencimento.

create table if not exists public.pendix_assinaturas (
  id                 uuid primary key default gen_random_uuid(),
  escritorio_id      uuid not null references public.empresas(id) on delete cascade,
  empresa_id         uuid not null references public.pendix_empresas(id) on delete cascade,
  mp_preapproval_id  text unique,
  status             text not null default 'pending'
                     check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  valor              numeric(12,2) not null,
  dia_cobranca       int not null check (dia_cobranca between 1 and 28),
  init_point         text,
  payer_email        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_pendix_assinaturas_escritorio on public.pendix_assinaturas(escritorio_id);
create index if not exists idx_pendix_assinaturas_empresa on public.pendix_assinaturas(empresa_id);

-- Unique PARCIAL: só uma assinatura viva por empresa, mas cancelar e criar
-- outra depois precisa funcionar. Unique simples travaria isso para sempre.
create unique index if not exists uq_pendix_assinaturas_empresa_viva
  on public.pendix_assinaturas(empresa_id)
  where status in ('pending', 'authorized', 'paused');

create table if not exists public.pendix_faturas (
  id                uuid primary key default gen_random_uuid(),
  escritorio_id     uuid not null references public.empresas(id) on delete cascade,
  empresa_id        uuid not null references public.pendix_empresas(id) on delete cascade,
  assinatura_id     uuid references public.pendix_assinaturas(id) on delete set null,
  competencia       date not null,
  valor             numeric(12,2) not null,
  vencimento        date not null,
  status            text not null default 'aberta'
                    check (status in ('aberta', 'paga', 'vencida', 'cancelada')),
  mp_payment_id     text unique,
  meio_pagamento    text,
  link_pagamento    text,
  alertas_enviados  text[] not null default '{}',
  pago_em           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_pendix_faturas_escritorio on public.pendix_faturas(escritorio_id);
create index if not exists idx_pendix_faturas_empresa on public.pendix_faturas(empresa_id);
create index if not exists idx_pendix_faturas_assinatura on public.pendix_faturas(assinatura_id);
create index if not exists idx_pendix_faturas_status_venc on public.pendix_faturas(status, vencimento);

-- O Mercado Pago reenvia notificação. Sem esta restrição, o webhook duplica
-- a fatura do ciclo a cada reenvio.
create unique index if not exists uq_pendix_faturas_competencia
  on public.pendix_faturas(empresa_id, competencia)
  where assinatura_id is not null;

-- Segunda camada de idempotência, cobrindo eventos que não geram fatura.
-- Mesmo padrão de pendix_whatsapp_eventos_processados (migration 0016).
create table if not exists public.pendix_mp_eventos_processados (
  event_id       text primary key,
  processado_em  timestamptz not null default now()
);

alter table public.pendix_assinaturas enable row level security;
alter table public.pendix_faturas enable row level security;
alter table public.pendix_mp_eventos_processados enable row level security;

-- ── RLS ──────────────────────────────────────────────────────────────────
--
-- Leitura escopada ao escritório. Escrita é EXCLUSIVA das Edge Functions,
-- que usam service role e ignoram RLS — por isso não existe policy de
-- insert/update/delete para `authenticated`. Sem essa ausência deliberada,
-- um usuário logado marcaria a própria fatura como paga pelo console do
-- navegador, já que o Supabase é o único backend e o cliente fala direto
-- com ele.
--
-- pendix_mp_eventos_processados fica sem policy nenhuma: RLS ligado e zero
-- policies significa negado para todo mundo exceto service role.

drop policy if exists "pendix_assinaturas: select" on public.pendix_assinaturas;
create policy "pendix_assinaturas: select" on public.pendix_assinaturas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_faturas: select" on public.pendix_faturas;
create policy "pendix_faturas: select" on public.pendix_faturas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());
