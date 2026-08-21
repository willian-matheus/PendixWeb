-- Pendix — assinatura do escritório (Mercado Pago).
--
-- O escritório é o cliente da plataforma: ele paga para usar o Pendix. Até
-- aqui isso existia só como a coluna `empresas.plano` ('normal'/'pro'), sem
-- nada por trás — nenhum pagamento, vencimento ou chave. Estas tabelas são
-- esse "por trás".
--
-- Modelo: assinatura recorrente do Mercado Pago (`preapproval`), na variante
-- SEM plano associado e com pagamento pendente. O escritório é redirecionado
-- para o `init_point` e digita o cartão dentro do Mercado Pago — nenhum dado
-- de cartão passa pelo Pendix, e o access token nunca sai da Edge Function.
--
-- `empresas.plano` continua existindo e continua sendo o que o AuthProvider lê.
-- Ele vira um espelho: quem manda é `pendix_assinaturas`, e o webhook
-- sincroniza os dois. Assim nada do código atual quebra.

-- ── Planos ──────────────────────────────────────────────────────────────────
--
-- Preço vive em dado, não em código: mudar valor não pode exigir deploy.
-- Nascem TODOS inativos de propósito — `valor_centavos = 0` é placeholder e
-- ninguém consegue contratar enquanto um humano não puser o preço real e
-- ligar o plano. Um preço errado aqui vira cobrança errada no cartão de
-- alguém.

create table if not exists public.pendix_planos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  nome           text not null,
  descricao      text not null default '',
  valor_centavos integer not null,
  -- Vocabulário do auto_recurring do Mercado Pago.
  frequencia     integer not null default 1,
  frequencia_tipo text not null default 'months',
  ativo          boolean not null default false,
  ordem          integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint pendix_planos_valor_check check (valor_centavos >= 0),
  constraint pendix_planos_frequencia_tipo_check check (frequencia_tipo in ('days', 'months')),
  -- Um plano só pode ser ligado com preço de verdade.
  constraint pendix_planos_ativo_exige_preco check (not ativo or valor_centavos > 0)
);

insert into public.pendix_planos (codigo, nome, descricao, valor_centavos, ordem)
values
  ('normal', 'Normal', 'Pendências, clientes e cobrança automática por WhatsApp.', 0, 1),
  ('pro',    'Pro',    'Tudo do Normal, com os recursos avançados.',                0, 2)
on conflict (codigo) do nothing;

comment on column public.pendix_planos.valor_centavos is
  'Preço em centavos. Plano nasce com 0 e inativo — definir o valor real antes de ativar.';

-- ── Assinatura ──────────────────────────────────────────────────────────────

create table if not exists public.pendix_assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  escritorio_id       uuid not null unique references public.empresas(id) on delete cascade,
  plano_id            uuid references public.pendix_planos(id),
  status              text not null default 'sem_assinatura',
  -- Id do `preapproval` no Mercado Pago. Único: um preapproval pertence a um
  -- escritório só, e o webhook usa isto para achar a linha.
  mp_preapproval_id   text unique,
  mp_payer_email      text,
  -- A "chave de ativação do escritório" da seção 9 dos requisitos. Só existe
  -- enquanto a assinatura está em dia; o bloqueio a apaga.
  chave_ativacao      text,
  -- "ID da compra" que a tela de Configurações precisa exibir.
  ultimo_pagamento_id text,
  ultimo_pagamento_em timestamptz,
  -- Data em que o próximo pagamento vence. O bloqueio é 3 dias depois dela.
  vencimento_em       date,
  bloqueada_em        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pendix_assinaturas_status_check check (status in (
    'sem_assinatura',  -- nunca contratou
    'pendente',        -- preapproval criado, esperando o cartão/autorização
    'ativa',           -- em dia
    'inadimplente',    -- venceu, ainda dentro dos 3 dias de carência
    'bloqueada',       -- passou da carência
    'pausada',
    'cancelada'
  ))
);

create index if not exists idx_pendix_assinaturas_vencimento
  on public.pendix_assinaturas(vencimento_em)
  where status in ('ativa', 'inadimplente');

-- ── Histórico de pagamentos ─────────────────────────────────────────────────
--
-- Ledger append-only. `mp_payment_id` único porque o Mercado Pago reentrega o
-- mesmo webhook (at-least-once) — sem isso o mesmo pagamento entraria duas
-- vezes e empurraria o vencimento dois meses.

create table if not exists public.pendix_assinatura_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null references public.empresas(id) on delete cascade,
  assinatura_id  uuid not null references public.pendix_assinaturas(id) on delete cascade,
  mp_payment_id  text not null unique,
  valor_centavos integer not null default 0,
  status         text not null,
  pago_em        timestamptz,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_pendix_assinatura_pagamentos_escritorio
  on public.pendix_assinatura_pagamentos(escritorio_id, created_at desc);

-- ── Regra do bloqueio ───────────────────────────────────────────────────────
--
-- Uma função só, para que a tela, a API e qualquer job futuro concordem sobre
-- o que "bloqueada" significa. Requisito 9.2: bloqueia 3 dias após o
-- vencimento. Escritório sem linha nenhuma NÃO é tratado como bloqueado aqui —
-- quem nunca contratou cai no estado 'sem_assinatura', e é a tela que decide
-- o que mostrar para ele.

create or replace function public.pendix_assinatura_em_dia(p_escritorio_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select a.status = 'ativa'
        and (a.vencimento_em is null or a.vencimento_em + 3 >= current_date)
       from public.pendix_assinaturas a
      where a.escritorio_id = p_escritorio_id),
    false
  );
$function$;

comment on function public.pendix_assinatura_em_dia(uuid) is
  'Assinatura ativa e dentro dos 3 dias de carência após o vencimento (requisito 9.2).';

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Planos são catálogo público (a tela precisa listá-los antes de existir
-- assinatura). Assinatura e pagamentos são do tenant, e SOMENTE LEITURA para
-- o cliente: quem escreve é a Edge Function com service role. Um escritório
-- não pode marcar a própria assinatura como paga.

alter table public.pendix_planos                enable row level security;
alter table public.pendix_assinaturas           enable row level security;
alter table public.pendix_assinatura_pagamentos enable row level security;

drop policy if exists "pendix_planos: leitura" on public.pendix_planos;
create policy "pendix_planos: leitura" on public.pendix_planos
  for select to authenticated using (true);

drop policy if exists "pendix_assinaturas: leitura do tenant" on public.pendix_assinaturas;
create policy "pendix_assinaturas: leitura do tenant" on public.pendix_assinaturas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_assinatura_pagamentos: leitura do tenant" on public.pendix_assinatura_pagamentos;
create policy "pendix_assinatura_pagamentos: leitura do tenant" on public.pendix_assinatura_pagamentos
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());
