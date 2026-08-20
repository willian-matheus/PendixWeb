# Cobrança de mensalidade das empresas via Mercado Pago

Data: 2026-08-20
Status: aprovado para planejamento

## Problema

O escritório contábil atende várias empresas clientes e cobra mensalidade
delas. Hoje isso acontece fora da PendixWeb — não há valor, fatura, nem
qualquer noção de adimplência no sistema. O escritório controla à mão quem
pagou, e nada acontece quando alguém deixa de pagar.

Este documento especifica a cobrança recorrente dessas mensalidades pelo
Mercado Pago, com bloqueio automático do acesso da empresa inadimplente.

## Escopo

Dentro:

- Assinatura mensal por empresa cliente, com valor e dia de vencimento fixos.
- Cobrança via Mercado Pago aceitando cartão de crédito, conta Mercado Pago,
  boleto e Pix.
- Conciliação automática por webhook.
- Alertas antes e depois do vencimento.
- Bloqueio automático do acesso da empresa após a carência.
- Fatura avulsa pontual (extra ou renegociação).

Fora:

- Cobrança da PendixWeb ao escritório. As seções 1.2 e 9 do
  `src/imports/pasted_text/platform-requirements.md` descrevem esse fluxo
  inverso — chave de ativação, plano contratado, ID da compra em
  Configurações. Nada disso é implementado aqui; o botão "Alterar plano" em
  `PendixConfiguracoes.tsx` continua sendo um stub.
- Split de pagamento / marketplace. O dinheiro entra numa conta única.
- Repasse automatizado ao escritório.
- Emissão de nota fiscal.

## Premissas e riscos

**O dinheiro cai na conta Mercado Pago da PendixWeb**, não na do escritório,
e o repasse acontece por fora. Decisão do dono do produto. Isso coloca a
PendixWeb como intermediária financeira: a receita entra como dela, com
implicação fiscal, e o arranjo pode ter implicação regulatória. Recomenda-se
validação com contador e jurídico antes de operar em produção. O desenho
técnico abaixo não depende dessa escolha — migrar para split via OAuth por
escritório depois exige trocar o `access_token` usado na chamada e adicionar
`marketplace_fee`, sem mexer no modelo de dados.

**"Débito automático" significa assinatura do Mercado Pago.** Não existe
débito em conta corrente bancária. A documentação de Assinaturas lista para
o Brasil (MLB) `credit, mercadopago, boleto, pix`. Cartão de crédito e conta
Mercado Pago cobram sozinhos; boleto e Pix são gerados a cada ciclo e a
empresa paga ativamente.

**Nomenclatura.** No repo, "cobrança" já significa perseguir um documento
pendente (`pendix_configuracao_cobranca`, `data_inicio_cobranca`,
`send-whatsapp-pendentes`). O financeiro usa **fatura** para não colidir.

## Arquitetura

Assinaturas (preapproval) é a espinha dorsal. O Mercado Pago cuida da
recorrência, das tentativas automáticas em recusa de cartão e da atualização
de cartão vencido pelas bandeiras. A PendixWeb não gera cobrança mensal por
conta própria — reage ao webhook de cada ciclo.

```
escritório define valor da empresa
        │
        ▼
Edge Function mp-assinatura-criar ──► POST /preapproval (Mercado Pago)
        │                                      │
        │                                      ▼
        └──► pendix_assinaturas            init_point
                                               │
                                               ▼
                              empresa autoriza uma vez (WhatsApp/e-mail)
                                               │
                    ┌──────────────────────────┘
                    ▼
        Mercado Pago cobra a cada mês
                    │
                    ▼
        Edge Function mercadopago-webhook ──► pendix_faturas
                    │
                    ▼
        Edge Function mp-faturas-vencer (cron diário)
                    │
                    ├──► alertas (WhatsApp)
                    └──► bloqueio após carência
```

## Modelo de dados

Migrations a partir da `0019`. Padrão de RLS existente:
`pendix_current_escritorio_id()` e `pendix_is_admin()` (definidas em
`0001_init.sql`), policies escopadas a `authenticated`, índice em toda FK.

Lembrete de nomes: `public.empresas` é o escritório (tenant, renomeado de
`escritorios` na `0008`); `public.pendix_empresas` é a empresa cliente.

### `pendix_empresas` (alteração)

| coluna | tipo | nota |
|---|---|---|
| `mensalidade_valor` | `numeric(12,2)` | `null` = empresa sem cobrança |
| `mensalidade_dia_vencimento` | `int` | 1–28, evita mês curto |
| `mensalidade_status` | `text` | `sem_cobranca` / `ativa` / `pausada` |

### `pendix_assinaturas` (nova)

Uma linha por empresa com cobrança ativa.

| coluna | tipo | nota |
|---|---|---|
| `id` | `uuid` pk | |
| `escritorio_id` | `uuid` not null → `empresas(id)` | escopo de RLS |
| `empresa_id` | `uuid` not null → `pendix_empresas(id)` | |
| `mp_preapproval_id` | `text` unique | id no Mercado Pago |
| `status` | `text` | `pending`/`authorized`/`paused`/`cancelled` |
| `valor` | `numeric(12,2)` not null | |
| `dia_cobranca` | `int` not null | |
| `init_point` | `text` | link de autorização |
| `payer_email` | `text` | e-mail usado na assinatura |
| `created_at` / `updated_at` | `timestamptz` | |

Unique parcial em `empresa_id` restrito a
`status in ('pending','authorized','paused')` — uma assinatura viva por
empresa. Unique simples impediria criar assinatura nova depois de uma
cancelada.

### `pendix_faturas` (nova)

Uma linha por ciclo cobrado, mais as avulsas.

| coluna | tipo | nota |
|---|---|---|
| `id` | `uuid` pk | |
| `escritorio_id` | `uuid` not null → `empresas(id)` | |
| `empresa_id` | `uuid` not null → `pendix_empresas(id)` | |
| `assinatura_id` | `uuid` → `pendix_assinaturas(id)` | `null` em fatura avulsa |
| `competencia` | `date` not null | dia 1 do mês de referência |
| `valor` | `numeric(12,2)` not null | |
| `vencimento` | `date` not null | |
| `status` | `text` not null | `aberta`/`paga`/`vencida`/`cancelada` |
| `mp_payment_id` | `text` unique | idempotência do webhook |
| `meio_pagamento` | `text` | `credit_card`/`account_money`/`bolbradesco`/`pix` |
| `link_pagamento` | `text` | usado na tela de bloqueio |
| `alertas_enviados` | `text[]` | marcos já disparados |
| `pago_em` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | |

`unique (empresa_id, competencia)` onde `assinatura_id is not null`. O
Mercado Pago reenvia notificação; sem essa restrição o webhook duplica
fatura.

### `pendix_mp_eventos_processados` (nova)

`event_id text primary key`, `processado_em timestamptz default now()`.
Mesmo padrão de `pendix_whatsapp_eventos_processados` (`0016`). Segunda
camada de idempotência, cobrindo eventos que não geram fatura.

### Auditoria

Reaproveita `pendix_historico`, que já tem `acao`, `descricao`,
`usuario_nome` e escopo por escritório. Ações novas: `fatura_criada`,
`fatura_paga`, `empresa_bloqueada`, `empresa_desbloqueada`,
`assinatura_autorizada`, `assinatura_cancelada`.

## Adimplência e bloqueio

Uma empresa está bloqueada quando tem fatura `vencida` com
`hoje >= vencimento + 3 dias`. A carência de 3 dias segue o precedente da
seção 9.2 do `platform-requirements.md`. O terceiro dia após o vencimento
(D+3) é o primeiro dia bloqueado — a comparação é `>=`, não `>`, e essa
escolha precisa bater com a tabela de alertas mais abaixo.

O estado é derivado, não denormalizado — uma função SQL
`pendix_empresa_bloqueada(empresa_id uuid) returns boolean`, `stable`,
`security definer`. Guardar um booleano em coluna criaria a possibilidade de
ele divergir da realidade das faturas.

**O bloqueio precisa existir em três camadas.** O front-end sozinho é
contornável: o Supabase é o único backend e o cliente fala direto com ele,
então quem souber o suficiente continua chamando a API depois de bloqueado.

*Camada de banco.* As policies de `insert` e `update` em
`pendix_pendencias`, `pendix_mensagens` e nos anexos passam a exigir
`not pendix_empresa_bloqueada(...)`. Leitura continua liberada — a empresa
precisa enxergar a própria situação. Essa é a camada que de fato bloqueia.

*Camada de Edge Function.* A `whatsapp-webhook` fala com o banco usando
`SUPABASE_SERVICE_ROLE_KEY`, que **ignora RLS por completo**. Sem uma
checagem explícita dentro dela, uma empresa bloqueada continua enviando
documento pelo WhatsApp normalmente — que é justamente o caminho principal do
Pendix. A função passa a consultar `pendix_empresa_bloqueada` antes de criar
pendência ou aceitar anexo, e responde ao cliente com o aviso de
inadimplência e o link de pagamento.

*Camada de front.* Um guard que redireciona para `/pendix/bloqueado`,
mostrando a fatura em aberto e o link de pagamento. Isso é experiência de
uso, não segurança: existe para a pessoa entender o que houve e conseguir se
desbloquear sozinha, em vez de esbarrar num erro de permissão.

O bloqueio atinge apenas usuários vinculados à empresa inadimplente. O
escritório nunca é bloqueado — ele é o credor.

A quitação libera na hora: o webhook marca a fatura `paga`, e como o estado é
derivado, `pendix_empresa_bloqueada` passa a devolver `false` na mesma
transação.

## Alertas

Escalonamento por fatura em aberto, reaproveitando a Z-API já integrada em
`supabase/functions/send-whatsapp-pendentes`:

| momento | mensagem |
|---|---|
| D-3 | lembrete de vencimento próximo |
| D+0 | vence hoje |
| D+1 | vencida, avisa que bloqueia em 2 dias |
| D+3 | acesso bloqueado, com link de pagamento |

A coluna `alertas_enviados` impede reenvio duplicado, mesmo padrão de
`datas_notificacao_enviadas` nas pendências.

Não existe tabela `pendix_notificacoes` — o sino do app deriva notificações
de pendências em `src/pendix/services/notificacoes.ts`. As faturas entram
nesse mesmo serviço como uma origem adicional, sem tabela nova.

## Edge Functions

### `mp-assinatura-criar`

Autenticada (JWT do escritório). Recebe `empresa_id`, valor e dia. Cria o
`preapproval` no Mercado Pago, grava `pendix_assinaturas` e devolve o
`init_point`. Valida que a empresa pertence ao escritório do chamador —
sem isso, um escritório cria assinatura na empresa de outro.

### `mercadopago-webhook`

Deploy com `--no-verify-jwt`; o Mercado Pago não manda token do Supabase.
Autenticação própria por assinatura `x-signature` (HMAC com
`MP_WEBHOOK_SECRET`), validando também o `x-request-id` e o timestamp para
recusar replay. Mesmo espírito da `whatsapp-webhook`, que já faz
autenticação própria por secret.

Tópicos tratados:

| tópico | efeito |
|---|---|
| `subscription_preapproval` | atualiza `pendix_assinaturas.status` |
| `subscription_authorized_payment` | cria/atualiza fatura do ciclo |
| `payment` | fatura avulsa e confirmação de boleto/Pix |

O corpo do webhook traz só o id. O valor e o status vêm de um `GET` na API
do Mercado Pago — nunca do payload, que não é fonte confiável.

Toda escrita idempotente por `mp_payment_id` e
`pendix_mp_eventos_processados`. Responde `200` para evento já processado;
erro só quando o reenvio ajudaria.

### `mp-faturas-vencer`

Cron diário via pg_cron + pg_net, mesmo desenho da `0015_cron_whatsapp.sql`.
Marca faturas `aberta` vencidas como `vencida` e dispara os alertas devidos.
O bloqueio em si não é escrito por essa função — é derivado.

## Credenciais

`MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` como secrets do Supabase, lidos
apenas dentro das Edge Functions. Nunca no bundle do front, nunca no git.
A aplicação no Mercado Pago é a `PENDIX` (AppID `7440948531782856`).

O front não precisa da `public_key`: o fluxo é redirect para o `init_point`,
sem Bricks. Nenhum dado de cartão passa pela PendixWeb, o que mantém a
aplicação fora do escopo PCI.

## Telas

**Financeiro** (escritório, item novo no menu de `PendixRoot`): empresas com
valor mensal, status da assinatura, faturas do mês, ações de criar assinatura
e reenviar link.

**Minhas faturas** (usuário da empresa): histórico e fatura em aberto.

**`/pendix/bloqueado`**: fatura vencida, valor, link de pagamento e
instrução. Alcançável logado, fora do guard normal.

**Cadastro da empresa** (`PendixEmpresas`): campos de valor e dia de
vencimento.

## Testes

O projeto não tem runner — `package.json` só define `dev` e `build`. Cobrança
é onde errar custa dinheiro real, e a alternativa a testar é disparar
pagamento de verdade. Entra Vitest, cobrindo:

- Parsing e validação de assinatura do webhook, incluindo payload forjado.
- Idempotência: o mesmo evento duas vezes gera uma fatura.
- Cálculo de vencimento com `dia_cobranca` em mês curto.
- Transição de adimplência: aberta → vencida → bloqueada → paga → liberada.
- Isolamento entre escritórios em `mp-assinatura-criar`.
- Recusa de envio de documento pelo WhatsApp com empresa bloqueada — o
  caminho que RLS não cobre.

As policies de RLS de bloqueio são testadas por integração contra um Supabase
local, não por unidade — é onde o bloqueio de fato mora.

Todo desenvolvimento contra credenciais de teste e usuários de teste do
Mercado Pago. Nenhuma cobrança real durante a implementação.

## Ordem de implementação

1. Migrations do modelo de dados e da função de adimplência.
2. Vitest e o harness de teste.
3. `mercadopago-webhook` com idempotência.
4. `mp-assinatura-criar`.
5. Policies de bloqueio no banco e checagem na `whatsapp-webhook`.
6. Cron de vencimento e alertas.
7. Telas.

O webhook vem antes da criação de assinatura de propósito: dá para exercitar
com evento simulado, e é a peça de onde depende toda a conciliação.
