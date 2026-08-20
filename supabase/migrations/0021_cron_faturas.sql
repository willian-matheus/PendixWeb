-- PendixWeb — agenda mp-faturas-vencer uma vez por dia, às 9h de Brasília
-- (12h UTC). Mesmo desenho da 0015_cron_whatsapp.sql: pg_cron + pg_net, com
-- a anon key do Vault só para satisfazer o verify_jwt da função.
--
-- Diferente da 0015, aqui NÃO recriamos o secret no Vault — ele já existe
-- com o nome pendix_edge_function_anon_key. Recriar duplicaria a entrada.
--
-- Uma vez por dia basta: os marcos de alerta são diários (D-3, D+0, D+1,
-- D+3), e `alertas_enviados` impede repetição se a função rodar duas vezes.

select cron.unschedule('mp-faturas-vencer')
where exists (select 1 from cron.job where jobname = 'mp-faturas-vencer');

select cron.schedule(
  'mp-faturas-vencer',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://ymakiqxrawpmklayqfam.supabase.co/functions/v1/mp-faturas-vencer',
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
