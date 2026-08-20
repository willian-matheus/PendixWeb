-- PendixWeb — hardening de autenticação/autorização.
--
-- Corrige duas classes de falha:
-- 1. O cadastro público não pode confiar em raw_user_meta_data para role ou
--    escritorio_id, porque esse objeto é controlado pelo cliente.
-- 2. Um usuário comum não pode alterar os próprios campos de permissão na
--    tabela usuarios.

create or replace function public.pendix_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_escritorio_id uuid;
begin
  -- Cadastro público sempre nasce como master de um novo escritório.
  -- Usuários convidados para escritórios existentes devem ser criados por um
  -- fluxo administrativo server-side, não por metadata enviada pelo cliente.
  insert into public.empresas (nome)
  values (coalesce(new.raw_user_meta_data->>'nome', new.email))
  returning id into v_escritorio_id;

  insert into public.usuarios (id, nome, email, role, escritorio_id, telefone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    'master',
    v_escritorio_id,
    coalesce(new.raw_user_meta_data->>'telefone', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

create or replace function public.pendix_guard_usuario_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() = old.id and not public.pendix_is_admin() then
    if new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.escritorio_id is distinct from old.escritorio_id
      or new.empresa_id is distinct from old.empresa_id
      or new.telas is distinct from old.telas
      or new.empresa_ids is distinct from old.empresa_ids
    then
      raise exception 'Não é permitido alterar permissões do próprio usuário.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists pendix_guard_usuario_sensitive_update on public.usuarios;
create trigger pendix_guard_usuario_sensitive_update
  before update on public.usuarios
  for each row execute function public.pendix_guard_usuario_sensitive_update();

drop policy if exists "usuarios: update own" on public.usuarios;
drop policy if exists "usuarios: update own profile fields" on public.usuarios;
create policy "usuarios: update own profile fields" on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "usuarios: admin update" on public.usuarios;
create policy "usuarios: admin update" on public.usuarios
  for update to authenticated
  using (public.pendix_is_admin())
  with check (public.pendix_is_admin());

-- A tela de pendências envia arquivo-modelo para pendix-anexos em
-- <escritorio_id>/modelos/*. A policy mantém o upload escopado ao tenant.
drop policy if exists "pendix_anexos: insert scoped" on storage.objects;
create policy "pendix_anexos: insert scoped" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pendix-anexos'
    and (storage.foldername(name))[1] = public.pendix_current_escritorio_id()::text
  );

drop policy if exists "pendix_anexos: update scoped" on storage.objects;
create policy "pendix_anexos: update scoped" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'pendix-anexos'
    and (storage.foldername(name))[1] = public.pendix_current_escritorio_id()::text
  )
  with check (
    bucket_id = 'pendix-anexos'
    and (storage.foldername(name))[1] = public.pendix_current_escritorio_id()::text
  );
