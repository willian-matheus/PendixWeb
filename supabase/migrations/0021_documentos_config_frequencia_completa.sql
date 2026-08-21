-- Pendix — a frequência do documento configurado passa a falar o mesmo
-- vocabulário da periodicidade da pendência.
--
-- `pendix_documentos_config.frequencia` nasceu (migration 0005) com quatro
-- opções: mensal, trimestral, anual e único. Obrigação contábil, porém, tem
-- ritmo mais variado que isso — DAS diário de quem parcela, FGTS quinzenal,
-- balanço bienal. A pendência já aceita as onze desde
-- PendixApp/supabase/migrations/20260820024021_pendix_cobranca_automatica.sql;
-- esta migration alinha a configuração recorrente à mesma lista, para que
-- `gerarPendenciasMes` possa copiar a frequência direto para `periodicidade`.
--
-- O "não repete" continua sendo 'unico' aqui (e 'unica' na pendência) de
-- propósito: renomear a coluna quebraria as linhas já gravadas sem ganho real.
-- A conversão entre os dois nomes vive em `periodicidadeDoDocumento`
-- (src/pendix/services/pendix.ts).

alter table public.pendix_documentos_config
  drop constraint if exists pendix_documentos_config_frequencia_check;

alter table public.pendix_documentos_config
  add constraint pendix_documentos_config_frequencia_check
  check (frequencia in (
    'unico', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
    'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal'
  ));

comment on column public.pendix_documentos_config.frequencia is
  'De quanto em quanto tempo o documento é exigido. Mesma lista de pendix_pendencias.periodicidade, com ''unico'' no lugar de ''unica''.';
