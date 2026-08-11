-- PendixWeb — agenda a Edge Function send-whatsapp-pendentes pra rodar
-- sozinha a cada 10 minutos via pg_cron + pg_net, em vez de depender de
-- alguém invocá-la manualmente. A função já filtra internamente quem bateu
-- o horário/data configurados (ver supabase/functions/send-whatsapp-pendentes),
-- então rodar a cada poucos minutos é seguro.
--
-- Usa a anon key (guardada no Vault) como Bearer token só pra satisfazer o
-- verify_jwt da função — a função em si usa a service role key (via env)
-- pra falar com o banco.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'sb_publishable_iRBaVrySdApJt-GvQd5d5Q_RgO0ScRY',
  'pendix_edge_function_anon_key',
  'Anon key usada pelo pg_cron pra autenticar a chamada à Edge Function send-whatsapp-pendentes'
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
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
