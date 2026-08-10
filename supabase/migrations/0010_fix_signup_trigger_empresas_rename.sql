-- PendixWeb — corrige o trigger de novo usuário (pós-rename de escritorios -> empresas)
--
-- Bug: a migration 0007 criava um escritório automático só para contas com
-- role = 'dono_escritorio', e a 0008 renomeou a tabela `escritorios` para
-- `empresas` sem atualizar esta função — que continuou fazendo
-- `insert into public.escritorios`, uma tabela que não existe mais.
-- Resultado: qualquer novo cadastro de dono_escritorio sem escritorio_id no
-- metadata quebrava o signup inteiro (o trigger falha => o insert em
-- auth.users falha). Contas de outros papéis (ex.: admin) nunca ganhavam um
-- escritório, então travavam no primeiro insert (ex.: cadastrar cliente) com
-- "null value in column escritorio_id violates not-null constraint".
--
-- Correção: usa `public.empresas` (nome atual da tabela) e cria um
-- escritório automático para QUALQUER novo usuário sem escritorio_id no
-- metadata, não só donos de escritório — cada conta passa a ter o seu,
-- de forma transparente, sem precisar escolher nada na tela.

create or replace function public.pendix_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_escritorio_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'dono_escritorio');
  v_escritorio_id := nullif(new.raw_user_meta_data->>'escritorio_id', '')::uuid;

  if v_escritorio_id is null then
    insert into public.empresas (nome)
    values (coalesce(new.raw_user_meta_data->>'nome', new.email))
    returning id into v_escritorio_id;
  end if;

  insert into public.usuarios (id, nome, email, role, escritorio_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    v_role,
    v_escritorio_id
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.pendix_handle_new_user();

-- ── Backfill: contas existentes sem escritório (ex.: admin) ─────────────────
do $$
declare
  r record;
  v_escritorio_id uuid;
begin
  for r in
    select id, nome, email from public.usuarios where escritorio_id is null
  loop
    insert into public.empresas (nome) values (coalesce(r.nome, r.email))
    returning id into v_escritorio_id;

    update public.usuarios set escritorio_id = v_escritorio_id where id = r.id;
  end loop;
end $$;
