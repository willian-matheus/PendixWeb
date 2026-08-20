# Auditoria de segurança — 2026-08-20

Auditoria do PendixWeb contra uma lista de boas práticas para CRM com IA.
A lista de referência assumia uma stack com backend NestJS; o PendixWeb tem o
Supabase como único backend, então cada item foi reavaliado contra o código
real em vez de aplicado ao pé da letra.

## Já estava correto

| Prática | Estado |
|---|---|
| RLS em todas as tabelas | 16/16 com RLS ligado. `pendix_whatsapp_eventos_processados` e `pendix_whatsapp_login_pendente` têm zero policies — deny-all intencional, só service role escreve. |
| Isolamento por tenant nas policies | Todas escopadas por `pendix_current_escritorio_id()`. |
| Chave de IA fora do cliente | Todas as chamadas ao Anthropic ficam em Edge Function. O front só carrega `VITE_SUPABASE_ANON_KEY`, pública por design. |
| Storage privado | Bucket `pendix-anexos` com `public = false`, servido por signed URL de 900s. |
| Saída do LLM restrita | `escolherPendenciaComClaude` força `tool_choice` e limita `pendencia_id` a um enum com as pendências **daquele** cliente. Injeção de prompt não consegue selecionar pendência de outro tenant nem exfiltrar dados. |
| Separação system/user no prompt | `responderChatLivre` e `responderPerguntaSobrePendencia` põem instrução em `system` e texto do cliente em turno `user`. |
| Audit log | `pendix_historico`, escopado por escritório. |
| Escopo por escritório nas Edge Functions novas | `mp-assinatura-criar` e `mp-fatura-avulsa` revalidam a empresa com o JWT do chamador; o `empresa_id` do cliente nunca é confiado. |

## Corrigido nesta auditoria

### 1. Travessia de diretório no upload do WhatsApp — alto

`baixarEGuardarMidia` montava o caminho do storage como
`${escritorioId}/${clienteId}/${Date.now()}-${midia.fileName}`, e
`midia.fileName` vem de `payload.document.fileName` — controlado por quem
envia a mensagem.

Um documento nomeado `../../outro-escritorio/cliente-x/nota.pdf` produz um
caminho que sai da pasta do tenant.

Não foi possível verificar se o Storage do Supabase normaliza `..` no key —
não havia ambiente para testar. Sanitizar é correto de qualquer forma: defesa
em profundidade não depende de o andar de baixo estar certo.

**Correção:** `nomeArquivoSeguro()` em `supabase/functions/_shared/arquivos.ts`,
função pura com 12 testes, incluindo travessia com `/`, com `\`, caminho
absoluto, byte nulo e nome que é só pontos. Um dos testes varre uma lista de
entradas maliciosas e afirma que a saída nunca contém separador nem `..`.

### 2. Casamento de cliente atravessava tenants — alto

A `whatsapp-webhook` carregava **todos os clientes de todos os escritórios**
em memória a cada mensagem e casava o telefone em JS com `.find()`, que
devolve o primeiro resultado.

Dois escritórios com um cliente de mesmo telefone — um contador que atende
dois escritórios, um telefone de empresa compartilhado — e a mensagem era
atribuída ao escritório errado: documento arquivado no cliente de outro
tenant, com o nome errado.

Em 2026-08-20 não havia telefone duplicado no banco, então a falha era
**latente**, não explorada. Ela apareceria conforme a base cresce.

O casamento em JS existia por um motivo legítimo: `telefone` é texto livre no
banco, então comparação direta em SQL não casa.

**Correção:** coluna gerada `telefone_digits` (8 últimos dígitos, a parte
estável de um número brasileiro) com índice, migration `0023`. A consulta
passa a filtrar no banco. Telefone que casa em mais de um escritório vai para
o fluxo de identificação por e-mail em vez de ser adivinhado.

Resolve junto o problema de minimização de dados: nome, e-mail e telefone de
todo cliente do sistema não vão mais para a memória da função a cada mensagem.

### 3. Upload sem limite de tamanho — médio

O bucket estava com `file_size_limit = null`. Qualquer cliente podia subir
arquivo de qualquer tamanho pelo WhatsApp, sem teto de custo.

**Correção:** 20 MB na migration `0023`. O WhatsApp já limita anexo a ~16 MB
na origem, então o teto é folgado.

### 4. Funções `security definer` expostas a `anon` — médio

O linter do Supabase aponta `pendix_handle_new_user()`,
`pendix_current_escritorio_id()` e `pendix_is_admin()` executáveis pelo papel
`anon` via `/rest/v1/rpc/`. A primeira é função de **trigger** de cadastro —
não tem motivo para ser alcançável pela API REST.

**Correção:** migration `0022`, separada de propósito por mexer em superfície
de autenticação.

**Cuidado ao aplicar:** expressão de policy RLS é avaliada com os privilégios
de quem faz a query. `security definer` muda o que a função enxerga por
dentro, não quem pode chamá-la. Como as policies chamam esses helpers,
`authenticated` precisa manter `EXECUTE` — e `revoke from public` derruba
privilégio herdado. A migration faz `revoke` seguido de `grant` explícito, e
traz um passo de verificação obrigatório.

## Não corrigido, e por quê

**Allowlist de MIME no bucket.** O certo seria restringir `allowed_mime_types`,
mas não há como saber, sem tráfego real, quais `Content-Type` a Z-API envia —
XML costuma chegar como `application/octet-stream`. Uma allowlist errada
quebra o recebimento de documentos em silêncio, que é o caminho principal do
produto. A migration `0023` traz a consulta para levantar os tipos reais e o
comando para aplicar depois.

**Rate limiting.** Ausente no login e nos webhooks. Edge Function do Supabase
não tem mecanismo nativo; exigiria uma tabela de contadores ou um serviço na
frente. Trabalho próprio, não um ajuste.

**Proteção contra senha vazada.** Desativada no Supabase Auth. É um toggle no
painel (Authentication → Policies), não código.

**MFA/2FA.** Não implementado. Decisão de produto.

**Antivírus em anexo.** Não implementado. Exige serviço externo.

## Nota sobre injeção de prompt

O Pendix recebe documento de terceiro por WhatsApp e manda para o Claude, o
que é uma superfície real. O risco está contido hoje, mas por razões que vale
não quebrar sem perceber:

- `escolherPendenciaComClaude` restringe a saída a um enum das pendências do
  próprio cliente. O pior caso de uma injeção é escolher a pendência errada
  **do mesmo cliente**.
- `validarDocumentoComClaude` decide se marca `recebido`. Uma injeção
  bem-sucedida faria o sistema aceitar um documento inválido — risco de regra
  de negócio, não de vazamento.
- O chat livre separa `system` de `user`.

Se alguém adicionar uma ferramenta que devolva dados livres em vez de enum,
ou concatenar texto do cliente no `system`, essa contenção acaba.
