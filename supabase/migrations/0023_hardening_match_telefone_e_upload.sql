-- PendixWeb — fecha duas brechas no caminho do WhatsApp.
--
-- NÃO faz parte da feature de cobrança. Aplicável de forma independente.
--
-- ── 1. Isolamento entre escritórios no casamento por telefone ────────────
--
-- A whatsapp-webhook carregava TODOS os clientes de TODOS os escritórios em
-- memória a cada mensagem recebida e casava o telefone em JavaScript, com
-- `.find()`. Dois problemas:
--
--   a) Vazamento entre tenants. `.find()` devolve o PRIMEIRO match. Se dois
--      escritórios têm um cliente com o mesmo telefone — um contador que
--      atende dois escritórios, um telefone de empresa compartilhado — a
--      mensagem era atribuída ao escritório errado. Documento arquivado no
--      cliente errado, de outro tenant.
--
--   b) Minimização de dados. Nome, e-mail e telefone de todo cliente do
--      sistema iam para a memória da função a cada mensagem, sem necessidade.
--
-- O casamento em JS existia por um bom motivo: `telefone` é texto livre
-- ("(11) 98765-4321", "5511987654321", "11987654321"), então comparação
-- direta em SQL não casa. A coluna gerada abaixo normaliza para os 8 últimos
-- dígitos — a parte estável de um número brasileiro, que não muda com DDI,
-- com o nono dígito nem com formatação — e permite filtrar no banco.

alter table public.pendix_clientes
  add column if not exists telefone_digits text
  generated always as (
    right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8)
  ) stored;

create index if not exists idx_pendix_clientes_telefone_digits
  on public.pendix_clientes(telefone_digits);

-- Consulta para achar telefone duplicado ENTRE escritórios. Todo resultado
-- aqui é um caso que, antes desta migration, podia ser atribuído ao tenant
-- errado. Vale rodar depois de aplicar:
--
--   select telefone_digits, count(distinct escritorio_id) as escritorios
--   from public.pendix_clientes
--   where telefone_digits <> ''
--   group by telefone_digits
--   having count(distinct escritorio_id) > 1;
--
-- A função passa a mandar esses casos para o fluxo de identificação por
-- e-mail em vez de adivinhar. Ver whatsapp-webhook/index.ts.

-- ── 2. Limite de upload no storage ───────────────────────────────────────
--
-- O bucket pendix-anexos é privado (correto) e servido por signed URL
-- (correto), mas estava sem limite de tamanho: qualquer cliente podia subir
-- arquivo de qualquer tamanho pelo WhatsApp, sem teto de custo.
--
-- 20 MB é folgado: o WhatsApp já limita anexo a ~16 MB na origem.

update storage.buckets
set file_size_limit = 20971520
where id = 'pendix-anexos';

-- ── NÃO aplicado de propósito: allowlist de MIME ─────────────────────────
--
-- O ideal seria também restringir allowed_mime_types. Não está aqui porque
-- não há como verificar, sem tráfego real, exatamente quais Content-Type a
-- Z-API envia — XML costuma chegar como application/octet-stream, e uma
-- allowlist errada QUEBRA o recebimento de documentos em silêncio, que é o
-- caminho principal do produto.
--
-- Para fazer certo: rode a consulta abaixo depois de alguns dias de tráfego,
-- e só então monte a allowlist a partir do que realmente aparece.
--
--   select distinct metadata->>'mimetype' as mime, count(*)
--   from storage.objects where bucket_id = 'pendix-anexos'
--   group by 1 order by 2 desc;
--
-- Depois:
--   update storage.buckets
--   set allowed_mime_types = array['application/pdf','text/xml', ...]
--   where id = 'pendix-anexos';

-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- drop index if exists public.idx_pendix_clientes_telefone_digits;
-- alter table public.pendix_clientes drop column if exists telefone_digits;
-- update storage.buckets set file_size_limit = null where id = 'pendix-anexos';
