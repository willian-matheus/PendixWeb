-- PendixWeb — corrige o trigger de novo usuário
-- Rode no Supabase SQL Editor (Project > SQL Editor > New query), depois das migrations 0001-0006.
--
-- Problema: pendix_handle_new_user() criava a linha em public.usuarios sem
-- escritorio_id. Como a tela de Registro (PendixRegistro.tsx) não cria um
-- escritório, todo novo cadastro ficava com escritorio_id nulo e batia em
-- "new row violates row-level security policy" na primeira ação (ex.: criar
-- cliente), pois pendix_current_escritorio_id() retorna null nesse caso.
--
-- Correção: se o cadastro for de um dono_escritorio e não vier escritorio_id
-- no metadata (raw_user_meta_data), cria um escritório automaticamente e
-- vincula. Usuários convidados com escritorio_id já definido no metadata
-- continuam usando o valor informado.

create or replace function public.pendix_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_escritorio_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'dono_escritorio');
  v_escritorio_id := nullif(new.raw_user_meta_data->>'escritorio_id', '')::uuid;

  if v_escritorio_id is null and v_role = 'dono_escritorio' then
    insert into public.escritorios (nome)
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

-- ── Backfill: usuários já cadastrados sem escritório ─────────────────────
-- Cria um escritório para cada dono_escritorio existente que ainda está
-- com escritorio_id nulo (cobre o caso do seu usuário de teste também).
do $$
declare
  r record;
  v_escritorio_id uuid;
begin
  for r in
    select id, nome, email from public.usuarios
    where role = 'dono_escritorio' and escritorio_id is null
  loop
    insert into public.escritorios (nome) values (coalesce(r.nome, r.email))
    returning id into v_escritorio_id;

    update public.usuarios set escritorio_id = v_escritorio_id where id = r.id;
  end loop;
end $$;
