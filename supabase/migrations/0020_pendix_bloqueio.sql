-- PendixWeb — bloqueio da empresa inadimplente.
--
-- ATENÇÃO: esta é a única migration desta feature que ALTERA policies já em
-- uso (`pendix_pendencias`). As demais só adicionam. Se algo der errado, o
-- rollback está no fim do arquivo, comentado.
--
-- O estado de bloqueio é DERIVADO das faturas, não guardado em coluna: um
-- booleano denormalizado poderia divergir da realidade financeira, e o
-- desbloqueio após pagamento precisa ser instantâneo.
--
-- Carência de 3 dias (seção 9.2 do platform-requirements.md). A comparação é
-- `>=`, então D+3 é o primeiro dia bloqueado — igual a estaBloqueada() em
-- supabase/functions/_shared/faturas.ts. Mudar um lado exige mudar o outro;
-- os testes em faturas.test.ts fixam essa fronteira.

create or replace function public.pendix_empresa_bloqueada(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pendix_faturas
    where empresa_id = p_empresa_id
      and status in ('aberta', 'vencida')
      and (current_date - vencimento) >= 3
  );
$$;

-- pendix_pendencias não tem empresa_id: liga por cliente_id, e foi
-- pendix_clientes que ganhou empresa_id na migration 0017. Daí o salto.
create or replace function public.pendix_cliente_bloqueado(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public.pendix_empresa_bloqueada(c.empresa_id)
     from public.pendix_clientes c
     where c.id = p_cliente_id and c.empresa_id is not null),
    false
  );
$$;

-- ── Exposição das funções ────────────────────────────────────────────────
--
-- O linter de segurança do Supabase aponta funções `security definer` deste
-- projeto executáveis por `anon` via /rest/v1/rpc/. Não repetimos o padrão:
-- revogamos do PUBLIC e devolvemos explicitamente a quem precisa.
--
-- DOIS CUIDADOS, e errar em qualquer um deles derruba o app inteiro:
--
-- 1. `revoke from public` tira o privilégio de todo papel que só o tinha por
--    herança do PUBLIC — `authenticated` e `service_role` incluídos. Por
--    isso cada grant abaixo é explícito.
--
-- 2. Expressão de policy RLS é avaliada com os privilégios de QUEM FAZ A
--    QUERY, não do dono da tabela — `security definer` muda o que a função
--    enxerga por dentro, não quem pode chamá-la. Como as policies de
--    pendix_pendencias abaixo chamam pendix_cliente_bloqueado, o papel
--    `authenticated` PRECISA de EXECUTE nela. Sem isso, todo insert de
--    pendência falha com "permission denied for function" — para
--    adimplentes e inadimplentes igualmente.

revoke execute on function public.pendix_empresa_bloqueada(uuid) from public, anon;
grant  execute on function public.pendix_empresa_bloqueada(uuid) to authenticated, service_role;

-- authenticated é obrigatório aqui: a policy de pendix_pendencias chama esta
-- função. Não revogue de authenticated achando que "só as policies usam".
revoke execute on function public.pendix_cliente_bloqueado(uuid) from public, anon;
grant  execute on function public.pendix_cliente_bloqueado(uuid) to authenticated, service_role;

-- ── Policies de escrita ──────────────────────────────────────────────────
--
-- Escrita bloqueada, LEITURA LIBERADA: a empresa precisa continuar
-- enxergando a própria situação para saber o que pagar. Bloquear o select
-- junto deixaria a pessoa sem entender por que parou de funcionar.
--
-- A policy de select de pendix_pendencias fica intocada de propósito.

drop policy if exists "pendix_pendencias: insert" on public.pendix_pendencias;
create policy "pendix_pendencias: insert" on public.pendix_pendencias
  for insert to authenticated
  with check (
    (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
    and not public.pendix_cliente_bloqueado(cliente_id)
  );

drop policy if exists "pendix_pendencias: update" on public.pendix_pendencias;
create policy "pendix_pendencias: update" on public.pendix_pendencias
  for update to authenticated
  using (
    (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
    and not public.pendix_cliente_bloqueado(cliente_id)
  );

-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- Estado exato das policies antes desta migration, conferido em pg_policies
-- no projeto ymakiqxrawpmklayqfam. Para reverter, rode:
--
-- drop policy if exists "pendix_pendencias: insert" on public.pendix_pendencias;
-- create policy "pendix_pendencias: insert" on public.pendix_pendencias
--   for insert to authenticated
--   with check ((escritorio_id = public.pendix_current_escritorio_id()) or public.pendix_is_admin());
--
-- drop policy if exists "pendix_pendencias: update" on public.pendix_pendencias;
-- create policy "pendix_pendencias: update" on public.pendix_pendencias
--   for update to authenticated
--   using ((escritorio_id = public.pendix_current_escritorio_id()) or public.pendix_is_admin());
