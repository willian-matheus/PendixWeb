-- PendixWeb — adiciona horário de notificação por pendência, pra permitir
-- que a cobrança via WhatsApp seja disparada automaticamente (por um cron
-- na Edge Function send-whatsapp-pendentes) no horário escolhido pelo
-- usuário, em vez de exigir o clique manual no botão "Cobrar".
--
-- `datas_notificacao_enviadas` rastreia quais datas de `datas_notificacao`
-- já tiveram lembrete enviado, pra a automação não reenviar a cada
-- execução do cron dentro do mesmo dia.

alter table public.pendix_pendencias
  add column if not exists horario_notificacao time not null default '09:00',
  add column if not exists datas_notificacao_enviadas date[] not null default '{}';
