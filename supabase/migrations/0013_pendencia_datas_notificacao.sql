-- PendixWeb — troca o campo "frequência de cobrança" (unica/diária/semanal/...),
-- que nunca foi implementado de verdade (ficava só salvo no localStorage do
-- navegador de quem criou a pendência, sem nenhuma automação lendo esse
-- valor — ver comentário em pendix.ts), por até 3 datas específicas em que
-- o usuário quer que a pendência seja notificada de novo.

alter table public.pendix_pendencias
  add column if not exists datas_notificacao date[] not null default '{}';
