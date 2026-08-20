-- PendixWeb — protege a Edge Function agendada send-whatsapp-pendentes.
--
-- A anon key e a URL do projeto são públicas no frontend. Por isso o cron
-- precisa de um segundo segredo, guardado no Vault e enviado em header próprio.

do $$
begin
  if not exists (
    select 1 from vault.secrets
    where name = 'pendix_send_whatsapp_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'pendix_send_whatsapp_cron_secret',
      'Segredo interno para autorizar a Edge Function send-whatsapp-pendentes'
    );
  end if;
end;
$$;

create or replace function public.pendix_verify_send_whatsapp_cron_secret(supplied_secret text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $function$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'pendix_send_whatsapp_cron_secret'
      and decrypted_secret = supplied_secret
  );
$function$;

revoke all on function public.pendix_verify_send_whatsapp_cron_secret(text) from public;
grant execute on function public.pendix_verify_send_whatsapp_cron_secret(text) to service_role;

select cron.unschedule('send-whatsapp-pendentes')
where exists (
  select 1 from cron.job
  where jobname = 'send-whatsapp-pendentes'
);

select cron.schedule(
  'send-whatsapp-pendentes',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://ymakiqxrawpmklayqfam.supabase.co/functions/v1/send-whatsapp-pendentes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pendix_edge_function_anon_key'
      ),
      'x-pendix-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'pendix_send_whatsapp_cron_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
