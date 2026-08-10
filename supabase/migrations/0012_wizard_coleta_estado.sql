-- PendixWeb — estado do wizard de criação de pendência via WhatsApp
--
-- O fluxo antigo deixava a IA "decidir" sozinha em que pergunta da coleta
-- ela estava, só olhando o histórico da conversa — e ela entrava em loop,
-- repetindo a mesma pergunta. A correção move o controle do passo atual
-- para o servidor: cada sessão de chat guarda aqui o passo em andamento e
-- os dados já coletados, e o código sempre avança pro próximo passo a cada
-- mensagem recebida (nunca repete o atual).

alter table public.pendix_chat_sessions
  add column if not exists coleta_estado jsonb;
