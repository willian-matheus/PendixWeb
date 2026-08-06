-- PendixWeb — bucket de Storage para anexos recebidos via WhatsApp
-- Rode no Supabase SQL Editor, depois das migrations anteriores.

insert into storage.buckets (id, name, public)
values ('pendix-anexos', 'pendix-anexos', false)
on conflict (id) do nothing;

-- Convenção de path: <escritorio_id>/<cliente_id>/<arquivo>
-- Só a Edge Function (service role) grava; usuários autenticados só leem o que é do próprio escritório.
drop policy if exists "pendix_anexos: select scoped" on storage.objects;
create policy "pendix_anexos: select scoped" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pendix-anexos'
    and (
      (storage.foldername(name))[1] = public.pendix_current_escritorio_id()::text
      or public.pendix_is_admin()
    )
  );
