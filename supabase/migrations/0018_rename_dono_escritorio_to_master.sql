-- Renomeia o valor de role 'dono_escritorio' para 'master'. A partir de
-- agora só existe um papel administrativo real (admin/super_admin) e todo
-- o restante (donos de escritório cadastrados normalmente) é 'master'.

alter table public.usuarios drop constraint usuarios_role_check;
alter table public.usuarios add constraint usuarios_role_check
  check (role in ('admin', 'super_admin', 'master', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador'));

update public.usuarios set role = 'master' where role = 'dono_escritorio';

create or replace function public.pendix_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_escritorio_id uuid;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'master');
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
$function$;
