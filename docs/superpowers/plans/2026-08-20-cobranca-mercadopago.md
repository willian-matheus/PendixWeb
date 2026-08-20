# Cobrança Mercado Pago — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrar mensalidade das empresas clientes do escritório via Assinaturas do Mercado Pago, conciliando por webhook e bloqueando o acesso da empresa inadimplente automaticamente.

**Architecture:** Assinaturas (preapproval) é a espinha dorsal — o Mercado Pago cuida da recorrência e das tentativas de cobrança; a PendixWeb reage ao webhook de cada ciclo. Toda lógica pura (cálculo de vencimento, marcos de alerta, validação de assinatura HMAC) vive em módulos `_shared` sem API do Deno, para rodar sob Vitest. O bloqueio existe em três camadas: policies de RLS, checagem explícita na `whatsapp-webhook` (que usa service role e ignora RLS), e guard de rota no front.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions em Deno), React 18 + TypeScript + Vite, Vitest, API de Assinaturas do Mercado Pago.

**Spec:** `docs/superpowers/specs/2026-08-20-cobranca-mercadopago-design.md`

## Status em 2026-08-20

Todo o código está escrito e commitado na branch `feat/cobranca-mercadopago`,
incluindo a Task 8 (bloqueio no caminho do WhatsApp).
45 testes passam (`npm test`) e o build passa (`npm run build`).

Correção aplicada depois da escrita original deste plano: as migrations
`0020` e `0022` ganharam `grant execute ... to authenticated, service_role`
explícito. Expressão de policy RLS é avaliada com os privilégios de quem faz
a query, então `authenticated` precisa de EXECUTE nas funções que a policy
chama. Um `revoke from public` sem regrant quebraria todo insert de pendência
com "permission denied for function".

**Nada foi aplicado no Supabase.** Não há CLI nem Docker no ambiente onde o
plano foi executado, e a permissão para escrever DDL no projeto remoto foi
negada. As migrations e Edge Functions existem como arquivo, prontas para
aplicar, mas **nenhuma foi executada contra um banco** — logo, nenhuma foi
verificada de verdade.

Pendente, na ordem: aplicar `0019` → `0020` → `0021`, deployar as quatro Edge
Functions (a `mercadopago-webhook` com `--no-verify-jwt`), gravar os secrets,
registrar a URL do webhook e rodar a Task 14 ponta a ponta com usuários de
teste. Os passos de verificação de cada task descrevem o que conferir.

A `0022` é independente da feature: fecha funções `security definer` expostas
a `anon`, achadas pelo linter do Supabase.

## Global Constraints

- Migrations começam na `0019`. A última existente é a `0018`.
- O tenant (escritório) é `public.empresas`. A empresa cliente é `public.pendix_empresas`. Não confundir.
- "Cobrança" no repo já significa perseguir documento pendente. O financeiro usa **fatura**.
- Padrão de RLS existente: policies `to authenticated`, usando `public.pendix_current_escritorio_id()` e `public.pendix_is_admin()` (definidas em `supabase/migrations/0001_init.sql:104-112`). Índice em toda FK.
- Edge Functions importam Supabase assim: `import { createClient } from 'jsr:@supabase/supabase-js@2';`
- Módulos em `supabase/functions/_shared/` **não podem usar APIs do Deno** (`Deno.env`, `serve`) — o Vitest importa esses arquivos direto.
- Carência de bloqueio: `hoje >= vencimento + 3 dias`. D+3 é o primeiro dia bloqueado.
- Secrets `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` só dentro de Edge Functions. Nunca no bundle do front, nunca no git.
- Todo desenvolvimento contra credenciais de teste do Mercado Pago. Nenhuma cobrança real.
- Timezone `America/Sao_Paulo`, como em `supabase/functions/send-whatsapp-pendentes/index.ts`.

---

## File Structure

**Criar:**

| arquivo | responsabilidade |
|---|---|
| `tsconfig.json` | não existe no projeto; Vitest e editor precisam |
| `vitest.config.ts` | runner |
| `supabase/functions/_shared/faturas.ts` | lógica pura de datas, vencimento, alertas, bloqueio |
| `supabase/functions/_shared/mercadopago.ts` | validação de assinatura HMAC e parsing de notificação |
| `supabase/functions/_shared/faturas.test.ts` | testes do módulo de faturas |
| `supabase/functions/_shared/mercadopago.test.ts` | testes de assinatura/parsing |
| `supabase/functions/mercadopago-webhook/index.ts` | recebe notificações do MP |
| `supabase/functions/mp-assinatura-criar/index.ts` | cria preapproval |
| `supabase/functions/mp-faturas-vencer/index.ts` | cron diário: vencer + alertar |
| `supabase/functions/mp-fatura-avulsa/index.ts` | fatura extra com link Checkout Pro |
| `supabase/functions/_shared/zapi.ts` | envio de WhatsApp, extraído da `send-whatsapp-pendentes` |
| `supabase/migrations/0019_pendix_faturas.sql` | tabelas e RLS |
| `supabase/migrations/0020_pendix_bloqueio.sql` | função de adimplência e policies |
| `supabase/migrations/0021_cron_faturas.sql` | agendamento |
| `src/pendix/services/faturas.ts` | queries do front |
| `src/pendix/pages/PendixFinanceiro.tsx` | tela do escritório |
| `src/pendix/pages/PendixMinhasFaturas.tsx` | tela da empresa cliente |
| `src/pendix/pages/PendixBloqueado.tsx` | tela de bloqueio |
| `src/pendix/auth/RequireAdimplente.tsx` | guard |

**Modificar:**

| arquivo | mudança |
|---|---|
| `package.json` | scripts `test`, devDeps do Vitest |
| `src/app/routes.tsx:96-118` | rotas `financeiro`, `minhas-faturas` e `/pendix/bloqueado` |
| `src/pendix/pages/PendixRoot.tsx` | itens "Financeiro" e "Minhas faturas" no menu |
| `src/pendix/services/notificacoes.ts` | faturas como origem adicional do sino |
| `src/pendix/pages/PendixEmpresas.tsx` | campos de valor e dia de vencimento |
| `supabase/functions/whatsapp-webhook/index.ts` | checagem de bloqueio antes de criar pendência |

---

### Task 1: Harness de teste (Vitest)

O projeto não tem runner nem `tsconfig.json`. Sem isso nenhuma tarefa seguinte tem onde rodar teste.

**Files:**
- Create: `tsconfig.json`, `vitest.config.ts`
- Modify: `package.json`
- Test: `supabase/functions/_shared/smoke.test.ts` (removido no fim da task)

**Interfaces:**
- Consumes: nada.
- Produces: `npm test` (roda uma vez) e `npm run test:watch`. Testes ficam em `**/*.test.ts`.

- [ ] **Step 1: Instalar Vitest**

```bash
npm i -D vitest@2.1.8 @vitest/coverage-v8@2.1.8 typescript@5.6.3
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "supabase/functions/_shared", "vitest.config.ts"]
}
```

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/functions/_shared/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Adicionar scripts ao `package.json`**

Dentro de `"scripts"`, ao lado de `dev` e `build`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Escrever um teste de fumaça**

Criar `supabase/functions/_shared/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('roda', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 1 teste.

- [ ] **Step 7: Remover o teste de fumaça e commitar**

```bash
rm supabase/functions/_shared/smoke.test.ts
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: adiciona Vitest e tsconfig ao projeto"
```

---

### Task 2: Migration 0019 — tabelas e RLS

**Files:**
- Create: `supabase/migrations/0019_pendix_faturas.sql`

**Interfaces:**
- Consumes: `public.empresas`, `public.pendix_empresas`, `public.pendix_current_escritorio_id()`, `public.pendix_is_admin()`.
- Produces: tabelas `pendix_assinaturas`, `pendix_faturas`, `pendix_mp_eventos_processados`; colunas `mensalidade_valor`, `mensalidade_dia_vencimento`, `mensalidade_status` em `pendix_empresas`.

- [ ] **Step 1: Escrever a migration**

```sql
-- PendixWeb — financeiro: assinatura mensal por empresa cliente e faturas.
--
-- Nomenclatura: "cobrança" neste repo já significa perseguir um documento
-- pendente (pendix_configuracao_cobranca, data_inicio_cobranca). O dinheiro
-- usa "fatura" para não colidir.

alter table public.pendix_empresas
  add column if not exists mensalidade_valor numeric(12,2),
  add column if not exists mensalidade_dia_vencimento int
    check (mensalidade_dia_vencimento between 1 and 28),
  add column if not exists mensalidade_status text not null default 'sem_cobranca'
    check (mensalidade_status in ('sem_cobranca', 'ativa', 'pausada'));

-- Dia limitado a 28 de propósito: 29/30/31 não existem em todo mês e viram
-- ambiguidade de vencimento.

create table if not exists public.pendix_assinaturas (
  id                 uuid primary key default gen_random_uuid(),
  escritorio_id      uuid not null references public.empresas(id) on delete cascade,
  empresa_id         uuid not null references public.pendix_empresas(id) on delete cascade,
  mp_preapproval_id  text unique,
  status             text not null default 'pending'
                     check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  valor              numeric(12,2) not null,
  dia_cobranca       int not null check (dia_cobranca between 1 and 28),
  init_point         text,
  payer_email        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_pendix_assinaturas_escritorio on public.pendix_assinaturas(escritorio_id);
create index if not exists idx_pendix_assinaturas_empresa on public.pendix_assinaturas(empresa_id);

-- Unique PARCIAL: só uma assinatura viva por empresa, mas cancelar e criar
-- outra depois precisa funcionar.
create unique index if not exists uq_pendix_assinaturas_empresa_viva
  on public.pendix_assinaturas(empresa_id)
  where status in ('pending', 'authorized', 'paused');

create table if not exists public.pendix_faturas (
  id                uuid primary key default gen_random_uuid(),
  escritorio_id     uuid not null references public.empresas(id) on delete cascade,
  empresa_id        uuid not null references public.pendix_empresas(id) on delete cascade,
  assinatura_id     uuid references public.pendix_assinaturas(id) on delete set null,
  competencia       date not null,
  valor             numeric(12,2) not null,
  vencimento        date not null,
  status            text not null default 'aberta'
                    check (status in ('aberta', 'paga', 'vencida', 'cancelada')),
  mp_payment_id     text unique,
  meio_pagamento    text,
  link_pagamento    text,
  alertas_enviados  text[] not null default '{}',
  pago_em           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_pendix_faturas_escritorio on public.pendix_faturas(escritorio_id);
create index if not exists idx_pendix_faturas_empresa on public.pendix_faturas(empresa_id);
create index if not exists idx_pendix_faturas_assinatura on public.pendix_faturas(assinatura_id);
create index if not exists idx_pendix_faturas_status_venc on public.pendix_faturas(status, vencimento);

-- O Mercado Pago reenvia notificação. Sem esta restrição, o webhook duplica
-- a fatura do ciclo.
create unique index if not exists uq_pendix_faturas_competencia
  on public.pendix_faturas(empresa_id, competencia)
  where assinatura_id is not null;

-- Segunda camada de idempotência, para eventos que não geram fatura.
-- Mesmo padrão de pendix_whatsapp_eventos_processados (migration 0016).
create table if not exists public.pendix_mp_eventos_processados (
  event_id       text primary key,
  processado_em  timestamptz not null default now()
);

alter table public.pendix_assinaturas enable row level security;
alter table public.pendix_faturas enable row level security;
alter table public.pendix_mp_eventos_processados enable row level security;

-- Leitura escopada ao escritório. Escrita é exclusiva das Edge Functions
-- (service role, que ignora RLS) — por isso não há policy de insert/update
-- para `authenticated`: nenhum cliente do navegador cria ou altera fatura.
drop policy if exists "pendix_assinaturas: select" on public.pendix_assinaturas;
create policy "pendix_assinaturas: select" on public.pendix_assinaturas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());

drop policy if exists "pendix_faturas: select" on public.pendix_faturas;
create policy "pendix_faturas: select" on public.pendix_faturas
  for select to authenticated
  using (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin());
```

- [ ] **Step 2: Aplicar no Supabase local e conferir**

```bash
supabase db reset
```

Expected: reset conclui sem erro e a `0019` aparece na lista aplicada.

- [ ] **Step 3: Confirmar que a unique parcial funciona**

```bash
supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "select indexname from pg_indexes where tablename in ('pendix_faturas','pendix_assinaturas');"
```

Expected: lista inclui `uq_pendix_faturas_competencia` e `uq_pendix_assinaturas_empresa_viva`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_pendix_faturas.sql
git commit -m "feat: tabelas de assinatura e fatura com RLS"
```

---

### Task 3: Módulo de faturas — lógica pura de datas e estado

O coração do bloqueio. Puro de propósito: sem Deno, sem rede, sem banco.

**Files:**
- Create: `supabase/functions/_shared/faturas.ts`
- Test: `supabase/functions/_shared/faturas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada'`
  - `calcularVencimento(competencia: Date, diaCobranca: number): Date`
  - `estaBloqueada(vencimento: Date, status: StatusFatura, hoje: Date): boolean`
  - `alertasDevidos(vencimento: Date, status: StatusFatura, hoje: Date, jaEnviados: string[]): string[]`
  - `CARENCIA_DIAS = 3`

- [ ] **Step 1: Escrever os testes que falham**

Criar `supabase/functions/_shared/faturas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcularVencimento, estaBloqueada, alertasDevidos, CARENCIA_DIAS } from './faturas';

const d = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe('calcularVencimento', () => {
  it('usa o dia de cobranca dentro do mes da competencia', () => {
    expect(calcularVencimento(d('2026-03-01'), 10).toISOString().slice(0, 10)).toBe('2026-03-10');
  });

  it('funciona em fevereiro com dia 28', () => {
    expect(calcularVencimento(d('2026-02-01'), 28).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('rejeita dia fora de 1..28', () => {
    expect(() => calcularVencimento(d('2026-03-01'), 31)).toThrow();
    expect(() => calcularVencimento(d('2026-03-01'), 0)).toThrow();
  });
});

describe('estaBloqueada', () => {
  it('nao bloqueia fatura paga, por mais vencida que esteja', () => {
    expect(estaBloqueada(d('2026-01-10'), 'paga', d('2026-08-20'))).toBe(false);
  });

  it('nao bloqueia fatura cancelada', () => {
    expect(estaBloqueada(d('2026-01-10'), 'cancelada', d('2026-08-20'))).toBe(false);
  });

  it('nao bloqueia no dia do vencimento', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-10'))).toBe(false);
  });

  it('nao bloqueia no penultimo dia da carencia', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-12'))).toBe(false);
  });

  it('bloqueia exatamente em D+3, o primeiro dia apos a carencia', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-13'))).toBe(true);
  });

  it('segue bloqueada depois de D+3', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-04-01'))).toBe(true);
  });

  it('a carencia declarada e de 3 dias', () => {
    expect(CARENCIA_DIAS).toBe(3);
  });
});

describe('alertasDevidos', () => {
  it('avisa 3 dias antes do vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-07'), [])).toEqual(['D-3']);
  });

  it('avisa no dia do vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-10'), [])).toEqual(['D+0']);
  });

  it('avisa no dia seguinte ao vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'vencida', d('2026-03-11'), [])).toEqual(['D+1']);
  });

  it('avisa no dia do bloqueio', () => {
    expect(alertasDevidos(d('2026-03-10'), 'vencida', d('2026-03-13'), [])).toEqual(['D+3']);
  });

  it('nao repete alerta ja enviado', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-07'), ['D-3'])).toEqual([]);
  });

  it('nao alerta fatura paga', () => {
    expect(alertasDevidos(d('2026-03-10'), 'paga', d('2026-03-13'), [])).toEqual([]);
  });

  it('nao alerta em dia sem marco', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-05'), [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./faturas"`.

- [ ] **Step 3: Implementar o módulo**

Criar `supabase/functions/_shared/faturas.ts`:

```ts
// Lógica pura do financeiro: datas, vencimento, alertas e bloqueio.
//
// Sem API do Deno, sem rede, sem banco — este arquivo é importado tanto
// pelas Edge Functions quanto pelo Vitest. Manter assim.

export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada';

/** Dias de tolerância após o vencimento antes de bloquear o acesso.
 *  Segue a seção 9.2 do platform-requirements.md. */
export const CARENCIA_DIAS = 3;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Diferença em dias entre duas datas, ignorando hora. */
function diasEntre(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

export function calcularVencimento(competencia: Date, diaCobranca: number): Date {
  if (!Number.isInteger(diaCobranca) || diaCobranca < 1 || diaCobranca > 28) {
    throw new Error(`dia de cobranca invalido: ${diaCobranca} (esperado 1..28)`);
  }
  return new Date(competencia.getFullYear(), competencia.getMonth(), diaCobranca, 12, 0, 0);
}

/** Bloqueia a partir de D+CARENCIA_DIAS, inclusive. Comparação `>=`. */
export function estaBloqueada(vencimento: Date, status: StatusFatura, hoje: Date): boolean {
  if (status === 'paga' || status === 'cancelada') return false;
  return diasEntre(vencimento, hoje) >= CARENCIA_DIAS;
}

const MARCOS: ReadonlyArray<readonly [string, number]> = [
  ['D-3', -3],
  ['D+0', 0],
  ['D+1', 1],
  ['D+3', CARENCIA_DIAS],
];

export function alertasDevidos(
  vencimento: Date,
  status: StatusFatura,
  hoje: Date,
  jaEnviados: string[],
): string[] {
  if (status === 'paga' || status === 'cancelada') return [];
  const delta = diasEntre(vencimento, hoje);
  return MARCOS
    .filter(([nome, dia]) => dia === delta && !jaEnviados.includes(nome))
    .map(([nome]) => nome);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, todos os testes de `faturas.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/faturas.ts supabase/functions/_shared/faturas.test.ts
git commit -m "feat: logica pura de vencimento, alertas e bloqueio"
```

---

### Task 4: Validação de assinatura do webhook do Mercado Pago

Sem isso, qualquer um que descubra a URL marca fatura como paga.

**Files:**
- Create: `supabase/functions/_shared/mercadopago.ts`
- Test: `supabase/functions/_shared/mercadopago.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type NotificacaoMP = { tipo: 'subscription_preapproval' | 'subscription_authorized_payment' | 'payment' | 'desconhecido'; recursoId: string; eventId: string }`
  - `parseNotificacao(body: unknown, headers: Headers): NotificacaoMP`
  - `validarAssinatura(opts: { xSignature: string | null; xRequestId: string | null; dataId: string; secret: string; agoraSegundos: number }): Promise<boolean>`

- [ ] **Step 1: Confirmar o formato da assinatura na documentação**

Antes de escrever o código, confirme o manifest e o header. Use a ferramenta MCP do Mercado Pago:

`search_documentation` com `term: "webhooks validar origem notificacao x-signature"`, `language: "pt"`, `siteId: "MLB"`.

Esperado confirmar: header `x-signature` no formato `ts=<timestamp>,v1=<hash>`, e manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com HMAC-SHA256 usando a chave secreta. **Se a documentação divergir disto, ajuste o código abaixo e os testes antes de seguir** — o resto da task assume esse formato.

- [ ] **Step 2: Escrever os testes que falham**

Criar `supabase/functions/_shared/mercadopago.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseNotificacao, validarAssinatura } from './mercadopago';

const SECRET = 'segredo-de-teste';

async function assinar(manifest: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('validarAssinatura', () => {
  const dataId = '123456';
  const xRequestId = 'req-abc';
  const ts = 1800000000;

  it('aceita assinatura correta', async () => {
    const v1 = await assinar(`id:${dataId};request-id:${xRequestId};ts:${ts};`);
    await expect(validarAssinatura({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraSegundos: ts + 10,
    })).resolves.toBe(true);
  });

  it('recusa assinatura forjada', async () => {
    const v1 = await assinar(`id:${dataId};request-id:${xRequestId};ts:${ts};`, 'outro-segredo');
    await expect(validarAssinatura({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraSegundos: ts + 10,
    })).resolves.toBe(false);
  });

  it('recusa quando o id do recurso nao bate (replay em outro recurso)', async () => {
    const v1 = await assinar(`id:999;request-id:${xRequestId};ts:${ts};`);
    await expect(validarAssinatura({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraSegundos: ts + 10,
    })).resolves.toBe(false);
  });

  it('recusa header ausente', async () => {
    await expect(validarAssinatura({
      xSignature: null, xRequestId, dataId, secret: SECRET, agoraSegundos: ts,
    })).resolves.toBe(false);
  });

  it('recusa header malformado', async () => {
    await expect(validarAssinatura({
      xSignature: 'lixo', xRequestId, dataId, secret: SECRET, agoraSegundos: ts,
    })).resolves.toBe(false);
  });

  it('recusa timestamp velho demais (replay)', async () => {
    const v1 = await assinar(`id:${dataId};request-id:${xRequestId};ts:${ts};`);
    await expect(validarAssinatura({
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId, dataId, secret: SECRET, agoraSegundos: ts + 3600,
    })).resolves.toBe(false);
  });
});

describe('parseNotificacao', () => {
  const h = (id = 'req-1') => new Headers({ 'x-request-id': id });

  it('reconhece pagamento de assinatura', () => {
    const n = parseNotificacao({ type: 'subscription_authorized_payment', data: { id: '77' } }, h());
    expect(n.tipo).toBe('subscription_authorized_payment');
    expect(n.recursoId).toBe('77');
  });

  it('reconhece pagamento avulso', () => {
    expect(parseNotificacao({ type: 'payment', data: { id: '5' } }, h()).tipo).toBe('payment');
  });

  it('reconhece mudanca de assinatura', () => {
    const n = parseNotificacao({ type: 'subscription_preapproval', data: { id: '9' } }, h());
    expect(n.tipo).toBe('subscription_preapproval');
  });

  it('marca tipo desconhecido em vez de estourar', () => {
    expect(parseNotificacao({ type: 'shipping', data: { id: '1' } }, h()).tipo).toBe('desconhecido');
  });

  it('aceita o campo legado topic', () => {
    expect(parseNotificacao({ topic: 'payment', data: { id: '3' } }, h()).tipo).toBe('payment');
  });

  it('gera eventId estavel combinando request-id e recurso', () => {
    const a = parseNotificacao({ type: 'payment', data: { id: '5' } }, h('req-x'));
    const b = parseNotificacao({ type: 'payment', data: { id: '5' } }, h('req-x'));
    expect(a.eventId).toBe(b.eventId);
    expect(a.eventId).toContain('5');
  });

  it('estoura em corpo sem data.id', () => {
    expect(() => parseNotificacao({ type: 'payment' }, h())).toThrow();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./mercadopago"`.

- [ ] **Step 4: Implementar o módulo**

Criar `supabase/functions/_shared/mercadopago.ts`:

```ts
// Validação de origem e parsing das notificações do Mercado Pago.
//
// Puro: sem API do Deno, sem rede. Usa apenas Web Crypto, disponível tanto
// no Deno quanto no Node do Vitest.

export type TipoNotificacao =
  | 'subscription_preapproval'
  | 'subscription_authorized_payment'
  | 'payment'
  | 'desconhecido';

export type NotificacaoMP = {
  tipo: TipoNotificacao;
  recursoId: string;
  eventId: string;
};

/** Janela aceita entre o ts assinado e agora. Barra replay de notificação
 *  capturada. O Mercado Pago reenvia em minutos, não em horas. */
const JANELA_SEGUNDOS = 300;

const TIPOS_CONHECIDOS: TipoNotificacao[] = [
  'subscription_preapproval',
  'subscription_authorized_payment',
  'payment',
];

export function parseNotificacao(body: unknown, headers: Headers): NotificacaoMP {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  const recursoId = data.id != null ? String(data.id) : '';
  if (!recursoId) throw new Error('notificacao sem data.id');

  // `type` é o campo atual; `topic` aparece em integrações legadas.
  const bruto = String(b.type ?? b.topic ?? '');
  const tipo = (TIPOS_CONHECIDOS as string[]).includes(bruto)
    ? (bruto as TipoNotificacao)
    : 'desconhecido';

  const requestId = headers.get('x-request-id') ?? 'sem-request-id';
  return { tipo, recursoId, eventId: `${requestId}:${recursoId}` };
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparação em tempo constante — `===` em string vaza tempo por prefixo. */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function validarAssinatura(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  secret: string;
  agoraSegundos: number;
}): Promise<boolean> {
  const { xSignature, xRequestId, dataId, secret, agoraSegundos } = opts;
  if (!xSignature) return false;

  const partes = new Map(
    xSignature.split(',').map((p) => {
      const [k, ...resto] = p.split('=');
      return [k.trim(), resto.join('=').trim()] as const;
    }),
  );
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(agoraSegundos - tsNum) > JANELA_SEGUNDOS) return false;

  const manifest = `id:${dataId};request-id:${xRequestId ?? ''};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinado = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  return igualSeguro(hex(assinado), v1);
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, todos os testes dos dois arquivos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/mercadopago.ts supabase/functions/_shared/mercadopago.test.ts
git commit -m "feat: validacao de assinatura e parsing do webhook Mercado Pago"
```

---

### Task 5: Edge Function `mercadopago-webhook`

**Files:**
- Create: `supabase/functions/mercadopago-webhook/index.ts`

**Interfaces:**
- Consumes: `_shared/mercadopago.ts` (`parseNotificacao`, `validarAssinatura`), `_shared/faturas.ts` (`calcularVencimento`).
- Produces: endpoint `POST /functions/v1/mercadopago-webhook`. Escreve em `pendix_faturas`, `pendix_assinaturas`, `pendix_mp_eventos_processados`, `pendix_historico`.

- [ ] **Step 1: Escrever a função**

Criar `supabase/functions/mercadopago-webhook/index.ts`:

```ts
// Edge Function: recebe notificações do Mercado Pago (assinaturas e pagamentos).
//
// Deploy com --no-verify-jwt: o Mercado Pago não manda token do Supabase.
// A autenticação é própria, por assinatura HMAC no header x-signature —
// mesmo espírito da whatsapp-webhook, que se autentica por secret na query.
//
// O corpo da notificação traz apenas o id do recurso. Valor e status vêm de
// um GET na API do Mercado Pago; o payload não é fonte confiável.
//
// Idempotência em duas camadas: unique em pendix_faturas.mp_payment_id (e a
// unique parcial por competência) e a tabela pendix_mp_eventos_processados.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseNotificacao, validarAssinatura } from '../_shared/mercadopago.ts';
import { calcularVencimento } from '../_shared/faturas.ts';

const MP_API = 'https://api.mercadopago.com';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function mpGet(caminho: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${MP_API}${caminho}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}` },
  });
  if (!r.ok) throw new Error(`Mercado Pago ${caminho} respondeu ${r.status}`);
  return await r.json();
}

async function registrarHistorico(
  escritorioId: string,
  acao: string,
  descricao: string,
): Promise<void> {
  await db.from('pendix_historico').insert({
    escritorio_id: escritorioId,
    acao,
    descricao,
    usuario_nome: 'Mercado Pago',
  });
}

/** Atualiza o status da assinatura no nosso lado. */
async function tratarAssinatura(preapprovalId: string): Promise<void> {
  const mp = await mpGet(`/preapproval/${preapprovalId}`);
  const status = String(mp.status ?? 'pending');

  const { data: assinatura } = await db
    .from('pendix_assinaturas')
    .select('id, escritorio_id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (!assinatura) return;

  await db
    .from('pendix_assinaturas')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', assinatura.id);

  await registrarHistorico(
    assinatura.escritorio_id,
    status === 'authorized' ? 'assinatura_autorizada' : 'assinatura_cancelada',
    `Assinatura ${preapprovalId} agora esta ${status}`,
  );
}

/** Cria ou quita a fatura de um ciclo da assinatura. */
async function tratarPagamentoDeAssinatura(authorizedPaymentId: string): Promise<void> {
  const mp = await mpGet(`/authorized_payments/${authorizedPaymentId}`);
  const preapprovalId = String(mp.preapproval_id ?? '');
  const status = String(mp.status ?? '');
  const valor = Number(
    (mp.transaction_amount as number | undefined) ??
      ((mp.payment as Record<string, unknown> | undefined)?.transaction_amount as number) ??
      0,
  );

  const { data: assinatura } = await db
    .from('pendix_assinaturas')
    .select('id, empresa_id, escritorio_id, dia_cobranca')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (!assinatura) return;

  const agora = new Date();
  const competencia = new Date(agora.getFullYear(), agora.getMonth(), 1, 12);
  const vencimento = calcularVencimento(competencia, assinatura.dia_cobranca);
  const pago = status === 'processed' || status === 'approved';

  // upsert pela competência: se o Mercado Pago reenviar, atualiza em vez de
  // duplicar. A unique parcial uq_pendix_faturas_competencia garante isso.
  const { error } = await db.from('pendix_faturas').upsert(
    {
      escritorio_id: assinatura.escritorio_id,
      empresa_id: assinatura.empresa_id,
      assinatura_id: assinatura.id,
      competencia: competencia.toISOString().slice(0, 10),
      valor,
      vencimento: vencimento.toISOString().slice(0, 10),
      status: pago ? 'paga' : 'aberta',
      mp_payment_id: String(mp.payment ? (mp.payment as Record<string, unknown>).id : authorizedPaymentId),
      meio_pagamento: String(
        (mp.payment as Record<string, unknown> | undefined)?.payment_type_id ?? '',
      ),
      pago_em: pago ? agora.toISOString() : null,
      updated_at: agora.toISOString(),
    },
    { onConflict: 'empresa_id,competencia' },
  );
  if (error) throw new Error(`upsert de fatura falhou: ${error.message}`);

  await registrarHistorico(
    assinatura.escritorio_id,
    pago ? 'fatura_paga' : 'fatura_criada',
    `Ciclo ${competencia.toISOString().slice(0, 7)} da assinatura ${preapprovalId}: ${status}`,
  );
}

/** Pagamento avulso (fatura extra) ou confirmação de boleto/Pix. */
async function tratarPagamentoAvulso(paymentId: string): Promise<void> {
  const mp = await mpGet(`/v1/payments/${paymentId}`);
  if (String(mp.status) !== 'approved') return;

  const referencia = String(mp.external_reference ?? '');
  if (!referencia) return; // pagamento que não nasceu no Pendix

  const { data: fatura } = await db
    .from('pendix_faturas')
    .select('id, escritorio_id')
    .eq('id', referencia)
    .maybeSingle();
  if (!fatura) return;

  await db
    .from('pendix_faturas')
    .update({
      status: 'paga',
      mp_payment_id: paymentId,
      meio_pagamento: String(mp.payment_type_id ?? ''),
      pago_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', fatura.id);

  await registrarHistorico(fatura.escritorio_id, 'fatura_paga', `Fatura ${fatura.id} quitada`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return new Response('corpo invalido', { status: 400 });
  }

  let notificacao;
  try {
    notificacao = parseNotificacao(corpo, req.headers);
  } catch {
    return new Response('notificacao invalida', { status: 400 });
  }

  const autentica = await validarAssinatura({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId: notificacao.recursoId,
    secret: Deno.env.get('MP_WEBHOOK_SECRET')!,
    agoraSegundos: Math.floor(Date.now() / 1000),
  });
  if (!autentica) return new Response('assinatura invalida', { status: 401 });

  // Evento repetido responde 200: reenviar não ajudaria em nada.
  const { error: jaVisto } = await db
    .from('pendix_mp_eventos_processados')
    .insert({ event_id: notificacao.eventId });
  if (jaVisto) return new Response('ja processado', { status: 200 });

  try {
    if (notificacao.tipo === 'subscription_preapproval') {
      await tratarAssinatura(notificacao.recursoId);
    } else if (notificacao.tipo === 'subscription_authorized_payment') {
      await tratarPagamentoDeAssinatura(notificacao.recursoId);
    } else if (notificacao.tipo === 'payment') {
      await tratarPagamentoAvulso(notificacao.recursoId);
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Solta o registro de idempotência: aqui o reenvio ajuda de verdade.
    await db.from('pendix_mp_eventos_processados').delete().eq('event_id', notificacao.eventId);
    console.error('falha ao tratar notificacao', notificacao, e);
    return new Response('erro ao processar', { status: 500 });
  }
});
```

- [ ] **Step 2: Deployar com `--no-verify-jwt`**

```bash
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

Expected: deploy conclui, função aparece em `supabase functions list`.

- [ ] **Step 3: Confirmar que recusa requisição sem assinatura**

```bash
curl -si -X POST "$SUPABASE_URL/functions/v1/mercadopago-webhook" -H 'content-type: application/json' -d '{"type":"payment","data":{"id":"1"}}' | head -1
```

Expected: `HTTP/2 401`. Se vier 200, a validação não está ativa — pare e corrija.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/mercadopago-webhook/index.ts
git commit -m "feat: webhook do Mercado Pago com assinatura e idempotencia"
```

---

### Task 6: Edge Function `mp-assinatura-criar`

**Files:**
- Create: `supabase/functions/mp-assinatura-criar/index.ts`

**Interfaces:**
- Consumes: `pendix_empresas`, `pendix_assinaturas`.
- Produces: `POST /functions/v1/mp-assinatura-criar` com corpo `{ empresa_id, valor, dia_cobranca, payer_email }`, resposta `{ init_point, assinatura_id }`.

- [ ] **Step 1: Escrever a função**

Criar `supabase/functions/mp-assinatura-criar/index.ts`:

```ts
// Edge Function: cria a assinatura (preapproval) de uma empresa cliente.
//
// Autenticada pelo JWT do escritório (deploy SEM --no-verify-jwt). O escopo
// por escritório é revalidado no servidor: confiar no empresa_id que veio do
// cliente deixaria um escritório criar assinatura na empresa de outro.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return new Response('sem token', { status: 401 });

  // Cliente com o JWT do chamador: RLS vale, então a leitura já é escopada.
  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: auth } = await comoUsuario.auth.getUser();
  if (!auth?.user) return new Response('token invalido', { status: 401 });

  const { empresa_id, valor, dia_cobranca, payer_email } = await req.json();
  if (!empresa_id || !valor || !dia_cobranca || !payer_email) {
    return new Response('campos obrigatorios: empresa_id, valor, dia_cobranca, payer_email', { status: 400 });
  }
  if (!Number.isInteger(dia_cobranca) || dia_cobranca < 1 || dia_cobranca > 28) {
    return new Response('dia_cobranca deve estar entre 1 e 28', { status: 400 });
  }
  if (Number(valor) <= 0) return new Response('valor deve ser positivo', { status: 400 });

  // RLS filtra: se a empresa não é do escritório do chamador, não volta nada.
  const { data: empresa } = await comoUsuario
    .from('pendix_empresas')
    .select('id, nome, escritorio_id')
    .eq('id', empresa_id)
    .maybeSingle();
  if (!empresa) return new Response('empresa nao encontrada neste escritorio', { status: 404 });

  const criacao = await fetch(`${MP_API}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: `Mensalidade PendixWeb — ${empresa.nome}`,
      external_reference: empresa.id,
      payer_email,
      back_url: `${Deno.env.get('APP_BASE_URL')}/pendix/app/financeiro`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(valor),
        currency_id: 'BRL',
      },
    }),
  });

  if (!criacao.ok) {
    console.error('preapproval falhou', await criacao.text());
    return new Response('nao foi possivel criar a assinatura', { status: 502 });
  }
  const mp = await criacao.json();

  // Escrita com service role: pendix_assinaturas não tem policy de insert
  // para `authenticated` de propósito — só o servidor cria assinatura.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: assinatura, error } = await db
    .from('pendix_assinaturas')
    .insert({
      escritorio_id: empresa.escritorio_id,
      empresa_id: empresa.id,
      mp_preapproval_id: String(mp.id),
      status: String(mp.status ?? 'pending'),
      valor: Number(valor),
      dia_cobranca,
      init_point: String(mp.init_point ?? ''),
      payer_email,
    })
    .select('id')
    .single();

  if (error) {
    // A unique parcial barrou: já existe assinatura viva para esta empresa.
    return new Response(`nao foi possivel salvar a assinatura: ${error.message}`, { status: 409 });
  }

  await db
    .from('pendix_empresas')
    .update({
      mensalidade_valor: Number(valor),
      mensalidade_dia_vencimento: dia_cobranca,
      mensalidade_status: 'ativa',
    })
    .eq('id', empresa.id);

  return new Response(
    JSON.stringify({ init_point: mp.init_point, assinatura_id: assinatura.id }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 2: Deployar**

```bash
supabase functions deploy mp-assinatura-criar
```

Expected: deploy conclui.

- [ ] **Step 3: Confirmar que exige token**

```bash
curl -si -X POST "$SUPABASE_URL/functions/v1/mp-assinatura-criar" -d '{}' | head -1
```

Expected: `HTTP/2 401`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/mp-assinatura-criar/index.ts
git commit -m "feat: criacao de assinatura no Mercado Pago"
```

---

### Task 7: Migration 0020 — função de adimplência e policies de bloqueio

**Files:**
- Create: `supabase/migrations/0020_pendix_bloqueio.sql`

**Interfaces:**
- Consumes: `pendix_faturas`, `pendix_pendencias`, `pendix_clientes`.
- Produces: `public.pendix_empresa_bloqueada(uuid) returns boolean`.

- [ ] **Step 1: Escrever a migration**

```sql
-- PendixWeb — bloqueio da empresa inadimplente.
--
-- O estado é DERIVADO das faturas, não guardado em coluna: um booleano
-- denormalizado poderia divergir da realidade financeira.
--
-- Carência de 3 dias (seção 9.2 do platform-requirements.md). A comparação é
-- `>=`, então D+3 é o primeiro dia bloqueado — igual a estaBloqueada() em
-- supabase/functions/_shared/faturas.ts. Mudar um lado exige mudar o outro.

create or replace function public.pendix_empresa_bloqueada(p_empresa_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.pendix_faturas
    where empresa_id = p_empresa_id
      and status in ('aberta', 'vencida')
      and (current_date - vencimento) >= 3
  );
$$;

-- pendix_pendencias não tem empresa_id: liga por cliente_id, e foi
-- pendix_clientes que ganhou empresa_id na migration 0017. Daí o join.
create or replace function public.pendix_cliente_bloqueado(p_cliente_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public.pendix_empresa_bloqueada(c.empresa_id)
     from public.pendix_clientes c
     where c.id = p_cliente_id and c.empresa_id is not null),
    false
  );
$$;

-- O front chama pendix_empresa_bloqueada por RPC (src/pendix/auth/
-- RequireAdimplente.tsx) para não duplicar a regra de carência em TypeScript.
grant execute on function public.pendix_empresa_bloqueada(uuid) to authenticated;

-- Escrita bloqueada, leitura liberada: a empresa precisa continuar enxergando
-- a própria situação para saber o que pagar.
drop policy if exists "pendix_pendencias: insert" on public.pendix_pendencias;
create policy "pendix_pendencias: insert" on public.pendix_pendencias
  for insert to authenticated
  with check (
    (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
    and not public.pendix_cliente_bloqueado(cliente_id)
  );

drop policy if exists "pendix_pendencias: update" on public.pendix_pendencias;
create policy "pendix_pendencias: update" on public.pendix_pendencias
  for update to authenticated
  using (
    (escritorio_id = public.pendix_current_escritorio_id() or public.pendix_is_admin())
    and not public.pendix_cliente_bloqueado(cliente_id)
  );
```

- [ ] **Step 2: Aplicar e testar a função à mão**

```bash
supabase db reset
```

Depois, num psql conectado ao banco local, com uma empresa de teste que tenha fatura vencida há 5 dias:

```sql
select public.pendix_empresa_bloqueada('<uuid-da-empresa>');
```

Expected: `t`. Com a fatura marcada `paga`, a mesma chamada devolve `f`.

- [ ] **Step 3: Confirmar que a fronteira de 3 dias bate com o TS**

Com fatura vencida há exatamente 2 dias: `f`. Com 3 dias: `t`. Igual aos testes de `estaBloqueada` na Task 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_pendix_bloqueio.sql
git commit -m "feat: bloqueio da empresa inadimplente nas policies"
```

---

### Task 8: Bloqueio no caminho do WhatsApp

A `whatsapp-webhook` usa `SUPABASE_SERVICE_ROLE_KEY` (`supabase/functions/whatsapp-webhook/index.ts:1281`), que **ignora RLS por completo**. Sem esta task, a empresa bloqueada continua enviando documento pelo WhatsApp — o caminho principal do Pendix.

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

**Interfaces:**
- Consumes: `public.pendix_empresa_bloqueada` (Task 7).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Localizar onde o cliente é identificado**

O fluxo está documentado no cabeçalho do arquivo: o passo 1 identifica o cliente pelo telefone em `pendix_clientes`. A checagem entra logo depois dessa identificação e antes do passo 2 (busca de pendências), para valer tanto no fluxo de match quanto no wizard de criação.

Run: `grep -n "pendix_clientes" supabase/functions/whatsapp-webhook/index.ts | head`

- [ ] **Step 2: Adicionar a função de checagem**

Perto das outras helpers do arquivo:

```ts
/** A empresa do cliente está inadimplente?
 *
 *  Esta função usa service role, que ignora RLS — por isso o bloqueio das
 *  policies (migration 0020) NÃO vale aqui e precisa ser checado à mão. */
async function empresaBloqueada(clienteId: string): Promise<boolean> {
  const { data: cliente } = await supabase
    .from('pendix_clientes')
    .select('empresa_id')
    .eq('id', clienteId)
    .maybeSingle();
  if (!cliente?.empresa_id) return false;

  const { data, error } = await supabase.rpc('pendix_empresa_bloqueada', {
    p_empresa_id: cliente.empresa_id,
  });
  if (error) {
    console.error('falha ao checar adimplencia', error);
    return false; // falha de checagem não pode derrubar o atendimento
  }
  return data === true;
}
```

- [ ] **Step 3: Barrar o envio logo após identificar o cliente**

Depois da identificação do cliente e antes de buscar pendências:

```ts
  if (await empresaBloqueada(cliente.id)) {
    await enviarMensagem(
      telefone,
      'Seu acesso esta suspenso por falta de pagamento da mensalidade. ' +
        'Assim que a fatura for quitada, o envio de documentos volta ao normal. ' +
        'Acesse o sistema para ver a fatura em aberto.',
    );
    return new Response('empresa bloqueada', { status: 200 });
  }
```

Use o mesmo helper de envio que o arquivo já usa para responder ao cliente — confirme o nome com `grep -n "async function enviar" supabase/functions/whatsapp-webhook/index.ts` e ajuste a chamada acima se o nome ou a assinatura diferirem.

- [ ] **Step 4: Deployar e testar com um cliente bloqueado**

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

Com uma empresa de teste marcada como inadimplente, mande uma mensagem pelo WhatsApp de um cliente dela.
Expected: resposta de suspensão, e **nenhuma** pendência nova em `pendix_pendencias`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "fix: barra envio por WhatsApp de empresa inadimplente"
```

---

### Task 9: Cron de vencimento e alertas

**Files:**
- Create: `supabase/functions/mp-faturas-vencer/index.ts`, `supabase/migrations/0021_cron_faturas.sql`

**Interfaces:**
- Consumes: `_shared/faturas.ts` (`alertasDevidos`).
- Produces: `POST /functions/v1/mp-faturas-vencer`, agendado diariamente.

- [ ] **Step 1: Escrever a função**

Criar `supabase/functions/mp-faturas-vencer/index.ts`:

```ts
// Edge Function: marca faturas vencidas e dispara os alertas do dia.
//
// Agendada por pg_cron + pg_net (migration 0021), mesmo desenho da
// 0015_cron_whatsapp.sql. O BLOQUEIO em si não é escrito aqui — é derivado
// por pendix_empresa_bloqueada(). Esta função só vence e avisa.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { alertasDevidos, type StatusFatura } from '../_shared/faturas.ts';

const TIMEZONE = 'America/Sao_Paulo';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function hojeLocal(): Date {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  return new Date(`${iso}T12:00:00-03:00`);
}

const TEXTOS: Record<string, (valor: number) => string> = {
  'D-3': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} vence em 3 dias.`,
  'D+0': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} vence hoje.`,
  'D+1': (v) => `Sua mensalidade de R$ ${v.toFixed(2)} venceu ontem. O acesso sera suspenso em 2 dias.`,
  'D+3': (v) => `Acesso suspenso por falta de pagamento da mensalidade de R$ ${v.toFixed(2)}.`,
};

Deno.serve(async () => {
  const hoje = hojeLocal();
  const hojeIso = hoje.toISOString().slice(0, 10);

  // 1. Vence o que passou da data e ainda estava aberta.
  await db
    .from('pendix_faturas')
    .update({ status: 'vencida', updated_at: new Date().toISOString() })
    .eq('status', 'aberta')
    .lt('vencimento', hojeIso);

  // 2. Alerta o que tem marco hoje.
  const { data: faturas } = await db
    .from('pendix_faturas')
    .select('id, empresa_id, escritorio_id, valor, vencimento, status, alertas_enviados, link_pagamento')
    .in('status', ['aberta', 'vencida']);

  let enviados = 0;
  for (const f of faturas ?? []) {
    const marcos = alertasDevidos(
      new Date(`${f.vencimento}T12:00:00-03:00`),
      f.status as StatusFatura,
      hoje,
      f.alertas_enviados ?? [],
    );
    if (marcos.length === 0) continue;

    const { data: clientes } = await db
      .from('pendix_clientes')
      .select('telefone')
      .eq('empresa_id', f.empresa_id)
      .not('telefone', 'is', null);

    for (const marco of marcos) {
      const texto = TEXTOS[marco](Number(f.valor)) +
        (f.link_pagamento ? ` Pague aqui: ${f.link_pagamento}` : '');
      for (const c of clientes ?? []) {
        await enviarWhatsapp(c.telefone, texto);
      }
      enviados++;
    }

    await db
      .from('pendix_faturas')
      .update({
        alertas_enviados: [...(f.alertas_enviados ?? []), ...marcos],
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    if (marcos.includes('D+3')) {
      await db.from('pendix_historico').insert({
        escritorio_id: f.escritorio_id,
        acao: 'empresa_bloqueada',
        descricao: `Empresa ${f.empresa_id} bloqueada por fatura ${f.id} vencida`,
        usuario_nome: 'Sistema',
      });
    }
  }

  return new Response(JSON.stringify({ alertas: enviados }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Reaproveitar o envio de WhatsApp**

`enviarWhatsapp` acima ainda não existe neste arquivo. A `send-whatsapp-pendentes` já fala com a Z-API — copie a helper de envio de lá para `supabase/functions/_shared/zapi.ts` e importe nas duas funções, em vez de duplicar.

Run: `grep -n "async function enviar\|ZAPI\|z-api" supabase/functions/send-whatsapp-pendentes/index.ts`

Extraia a função de envio para `_shared/zapi.ts`, troque a chamada na `send-whatsapp-pendentes` pelo import, e importe também aqui. Note que `_shared/zapi.ts` faz rede e lê env — então **não** ganha teste de unidade, diferente de `faturas.ts` e `mercadopago.ts`.

- [ ] **Step 3: Escrever a migration do cron**

Criar `supabase/migrations/0021_cron_faturas.sql`:

```sql
-- PendixWeb — agenda mp-faturas-vencer uma vez por dia, às 9h de Brasília
-- (12h UTC). Mesmo desenho da 0015_cron_whatsapp.sql: pg_cron + pg_net, com
-- a anon key do Vault só para satisfazer o verify_jwt da função.

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
```

- [ ] **Step 4: Deployar e invocar à mão**

```bash
supabase functions deploy mp-faturas-vencer && supabase db reset
curl -s -X POST "$SUPABASE_URL/functions/v1/mp-faturas-vencer" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Expected: JSON `{"alertas":N}`, e faturas com vencimento passado agora em `vencida`.

- [ ] **Step 5: Confirmar que não repete alerta**

Invoque a mesma URL duas vezes seguidas.
Expected: a segunda chamada devolve `{"alertas":0}` — `alertas_enviados` barrou a repetição.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/mp-faturas-vencer/index.ts supabase/functions/_shared/zapi.ts supabase/functions/send-whatsapp-pendentes/index.ts supabase/migrations/0021_cron_faturas.sql
git commit -m "feat: cron diario de vencimento e alertas de fatura"
```

---

### Task 10: Serviço de faturas no front

**Files:**
- Create: `src/pendix/services/faturas.ts`

**Interfaces:**
- Consumes: `src/app/services/supabase.ts`.
- Produces:
  - `type Fatura = { id, empresa_id, competencia, valor, vencimento, status, link_pagamento, pago_em }`
  - `listarFaturas(empresaId?: string): Promise<Fatura[]>`
  - `faturaEmAberto(empresaId: string): Promise<Fatura | null>`
  - `empresaBloqueada(empresaId: string): Promise<boolean>`
  - `criarAssinatura(input: { empresaId, valor, diaCobranca, payerEmail }): Promise<{ initPoint: string }>`

- [ ] **Step 1: Escrever o serviço**

Criar `src/pendix/services/faturas.ts`, seguindo o estilo de `src/pendix/services/empresas.ts`:

```ts
import { supabase } from '../../app/services/supabase';

export type StatusFatura = 'aberta' | 'paga' | 'vencida' | 'cancelada';

export type Fatura = {
  id: string;
  empresa_id: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: StatusFatura;
  link_pagamento: string | null;
  pago_em: string | null;
};

export async function listarFaturas(empresaId?: string): Promise<Fatura[]> {
  let q = supabase
    .from('pendix_faturas')
    .select('id, empresa_id, competencia, valor, vencimento, status, link_pagamento, pago_em')
    .order('competencia', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Fatura[];
}

export async function faturaEmAberto(empresaId: string): Promise<Fatura | null> {
  const { data, error } = await supabase
    .from('pendix_faturas')
    .select('id, empresa_id, competencia, valor, vencimento, status, link_pagamento, pago_em')
    .eq('empresa_id', empresaId)
    .in('status', ['aberta', 'vencida'])
    .order('vencimento', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Fatura) ?? null;
}

/** Pergunta ao banco, não recalcula aqui.
 *
 *  A regra de carência mora em public.pendix_empresa_bloqueada (migration
 *  0020). Reimplementá-la em TypeScript criaria duas verdades que divergem no
 *  dia em que alguém mudar uma só. */
export async function empresaBloqueada(empresaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pendix_empresa_bloqueada', {
    p_empresa_id: empresaId,
  });
  if (error) throw error;
  return data === true;
}

export async function criarAssinatura(input: {
  empresaId: string;
  valor: number;
  diaCobranca: number;
  payerEmail: string;
}): Promise<{ initPoint: string }> {
  const { data, error } = await supabase.functions.invoke('mp-assinatura-criar', {
    body: {
      empresa_id: input.empresaId,
      valor: input.valor,
      dia_cobranca: input.diaCobranca,
      payer_email: input.payerEmail,
    },
  });
  if (error) throw error;
  return { initPoint: (data as { init_point: string }).init_point };
}
```

- [ ] **Step 2: Confirmar que o build passa**

Run: `npm run build`
Expected: build sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/pendix/services/faturas.ts
git commit -m "feat: servico de faturas no front"
```

---

### Task 11: Telas de faturas (escritório e empresa)

**Files:**
- Create: `src/pendix/pages/PendixFinanceiro.tsx`, `src/pendix/pages/PendixMinhasFaturas.tsx`
- Modify: `src/app/routes.tsx`, `src/pendix/pages/PendixRoot.tsx`, `src/pendix/pages/PendixEmpresas.tsx`, `src/pendix/services/notificacoes.ts`

**Interfaces:**
- Consumes: `listarFaturas`, `faturaEmAberto`, `criarAssinatura` (Task 10).
- Produces: rotas `/pendix/app/financeiro` e `/pendix/app/minhas-faturas`.

- [ ] **Step 1: Criar a página**

Criar `src/pendix/pages/PendixFinanceiro.tsx` seguindo o padrão visual de `PendixEmpresas.tsx` (mesmas classes de card, tabela e badge — leia esse arquivo antes de escrever). A tela lista as empresas com valor mensal, status da assinatura e a fatura mais recente, com ação de criar assinatura que abre `initPoint` em nova aba.

- [ ] **Step 2: Registrar a rota**

Em `src/app/routes.tsx`, junto dos outros `lazy`:

```tsx
const PendixFinanceiro = lazy(() => import("../pendix/pages/PendixFinanceiro"));
```

E dentro de `children` da rota `/pendix/app`, depois de `empresas`:

```tsx
      { path: "financeiro", element: <PendixFinanceiro /> },
```

- [ ] **Step 3: Adicionar o item de menu**

Em `src/pendix/pages/PendixRoot.tsx`, adicione "Financeiro" apontando para `/pendix/app/financeiro`, seguindo exatamente o formato dos itens existentes (ícone do `lucide-react`, mesma estrutura de objeto).

- [ ] **Step 4: Campos de mensalidade no cadastro da empresa**

Em `src/pendix/pages/PendixEmpresas.tsx`, adicione ao formulário os campos "Valor da mensalidade" (numérico) e "Dia de vencimento" (1 a 28), gravando em `mensalidade_valor` e `mensalidade_dia_vencimento`.

- [ ] **Step 5: Criar a tela "Minhas faturas" da empresa**

Criar `src/pendix/pages/PendixMinhasFaturas.tsx`: chama `listarFaturas(user.companyId)` e mostra competência, valor, vencimento e status, com botão de pagar na fatura em aberto (`link_pagamento`). Mesmo padrão de tabela do `PendixFinanceiro.tsx`.

Registre a rota em `src/app/routes.tsx`, dentro de `children` da rota `/pendix/app`:

```tsx
      { path: "minhas-faturas", element: <PendixMinhasFaturas /> },
```

No menu de `PendixRoot.tsx`, mostre "Financeiro" para o escritório e "Minhas faturas" para quem tem `user.companyId` — o usuário da empresa não pode ver o financeiro do escritório inteiro.

- [ ] **Step 6: Somar faturas ao sino de notificações**

`public.pendix_notificacoes` existe no banco (colunas: `escritorio_id`, `usuario_id`, `pendencia_id`, `cliente_id`, `tipo`, `titulo`, `mensagem`, `canal`, `status`, `dados jsonb`, `chave_dedupe`, `enviado_em`, `lido_em`, `dispensado_em`, `erro`).

Em vez de derivar no front, a `mp-faturas-vencer` (Task 9) insere a notificação junto com o alerta de WhatsApp, usando `chave_dedupe = 'fatura:' || fatura_id || ':' || marco`. A deduplicação já existe nessa tabela e passa a proteger o alerta de fatura de graça.

Leia `src/pendix/services/notificacoes.ts` antes de editar, para consumir exatamente o mesmo shape que a tela já espera.

- [ ] **Step 7: Verificar no navegador**

```bash
npm run dev
```

Logado como escritório, abra `/pendix/app/financeiro`.
Expected: a tela carrega, "Financeiro" no menu, console sem erro.

Logado como usuário de empresa, abra `/pendix/app/minhas-faturas`.
Expected: só as faturas da própria empresa, e "Financeiro" **não** aparece no menu.

- [ ] **Step 8: Commit**

```bash
git add src/pendix/pages/PendixFinanceiro.tsx src/pendix/pages/PendixMinhasFaturas.tsx src/app/routes.tsx src/pendix/pages/PendixRoot.tsx src/pendix/pages/PendixEmpresas.tsx src/pendix/services/notificacoes.ts
git commit -m "feat: telas de faturas do escritorio e da empresa"
```

---

### Task 12: Tela de bloqueio e guard

**Files:**
- Create: `src/pendix/pages/PendixBloqueado.tsx`, `src/pendix/auth/RequireAdimplente.tsx`
- Modify: `src/app/routes.tsx`

**Interfaces:**
- Consumes: `faturaEmAberto` (Task 10), `useAuth` de `src/app/auth/AuthProvider.tsx`.
- Produces: rota `/pendix/bloqueado`.

- [ ] **Step 1: Criar o guard**

Criar `src/pendix/auth/RequireAdimplente.tsx`, no estilo de `RequirePendixAuth.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../app/auth/AuthProvider';
import { empresaBloqueada } from '../services/faturas';

/** Redireciona o usuário da empresa inadimplente para a tela de bloqueio.
 *
 *  Isto é experiência de uso, NÃO segurança: quem de fato barra a escrita são
 *  as policies da migration 0020 e a checagem na whatsapp-webhook. Aqui a
 *  pessoa entende o que houve e consegue se desbloquear sozinha, em vez de
 *  esbarrar num erro de permissão sem explicação.
 *
 *  A decisão vem do banco por RPC — a regra de carência não é reimplementada
 *  aqui. */
export function RequireAdimplente({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bloqueado, setBloqueado] = useState<boolean | null>(null);

  useEffect(() => {
    // O escritório nunca é bloqueado — ele é o credor.
    if (!user?.companyId) { setBloqueado(false); return; }

    empresaBloqueada(user.companyId)
      .then(setBloqueado)
      .catch(() => setBloqueado(false)); // falha de rede não tranca ninguém
  }, [user?.companyId]);

  if (bloqueado === null) return null;
  if (bloqueado) return <Navigate to="/pendix/bloqueado" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 2: Criar a tela de bloqueio**

Criar `src/pendix/pages/PendixBloqueado.tsx`: mostra a fatura vencida (competência, valor, vencimento) e um botão que abre `link_pagamento`. Se não houver link, instrui a procurar o escritório. Use o visual de `RouteErrorBoundary` em `src/app/routes.tsx:36-63` como referência de estilo.

- [ ] **Step 3: Registrar a rota e envolver o app**

Em `src/app/routes.tsx`, adicione o `lazy` e uma rota **fora** do guard, logo após `/pendix/registro`:

```tsx
  {
    path: "/pendix/bloqueado",
    errorElement: <RouteErrorBoundary />,
    element: (
      <RequirePendixAuth>
        <Suspense fallback={<PageLoader />}>
          <PendixBloqueado />
        </Suspense>
      </RequirePendixAuth>
    ),
  },
```

E na rota `/pendix/app`, envolva `PendixRoot` com o novo guard, por dentro de `RequirePendixAuth`:

```tsx
      <RequirePendixAuth>
        <RequireAdimplente>
          <Suspense fallback={<PageLoader />}>
            <PendixRoot />
          </Suspense>
        </RequireAdimplente>
      </RequirePendixAuth>
```

A tela de bloqueio fica fora do `RequireAdimplente` de propósito — dentro dele, o redirect entraria em laço.

- [ ] **Step 4: Verificar os dois caminhos**

Com uma empresa de teste inadimplente, logue como usuário dela.
Expected: qualquer rota sob `/pendix/app` redireciona para `/pendix/bloqueado`, e a tela mostra valor e vencimento.

Logue como escritório.
Expected: acesso normal, sem redirect.

- [ ] **Step 5: Commit**

```bash
git add src/pendix/pages/PendixBloqueado.tsx src/pendix/auth/RequireAdimplente.tsx src/app/routes.tsx
git commit -m "feat: tela de bloqueio e guard de adimplencia"
```

---

### Task 13: Fatura avulsa

A Task 5 já trata o pagamento de uma avulsa (`tratarPagamentoAvulso` casa `external_reference` com `pendix_faturas.id`), mas nada cria uma. Esta task fecha o ciclo.

**Files:**
- Create: `supabase/functions/mp-fatura-avulsa/index.ts`
- Modify: `src/pendix/services/faturas.ts`, `src/pendix/pages/PendixFinanceiro.tsx`

**Interfaces:**
- Consumes: `pendix_faturas`, `pendix_empresas`.
- Produces: `POST /functions/v1/mp-fatura-avulsa` com `{ empresa_id, valor, descricao, vencimento }`, resposta `{ fatura_id, link_pagamento }`; e `criarFaturaAvulsa(...)` no serviço do front.

- [ ] **Step 1: Escrever a Edge Function**

Criar `supabase/functions/mp-fatura-avulsa/index.ts`:

```ts
// Edge Function: cria uma fatura avulsa (extra ou renegociação) e o link de
// pagamento correspondente via Checkout Pro.
//
// Autenticada pelo JWT do escritório. A fatura nasce PRIMEIRO no nosso banco,
// e o id dela vai como external_reference na preference — é assim que o
// webhook (mercadopago-webhook) sabe qual fatura quitar quando o pagamento
// chegar. Inverter a ordem deixaria pagamento órfão sem fatura para casar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const MP_API = 'https://api.mercadopago.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('metodo nao permitido', { status: 405 });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return new Response('sem token', { status: 401 });

  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: auth } = await comoUsuario.auth.getUser();
  if (!auth?.user) return new Response('token invalido', { status: 401 });

  const { empresa_id, valor, descricao, vencimento } = await req.json();
  if (!empresa_id || !valor || !descricao || !vencimento) {
    return new Response('campos obrigatorios: empresa_id, valor, descricao, vencimento', { status: 400 });
  }
  if (Number(valor) <= 0) return new Response('valor deve ser positivo', { status: 400 });

  // RLS escopa: empresa de outro escritório não volta.
  const { data: empresa } = await comoUsuario
    .from('pendix_empresas')
    .select('id, nome, escritorio_id')
    .eq('id', empresa_id)
    .maybeSingle();
  if (!empresa) return new Response('empresa nao encontrada neste escritorio', { status: 404 });

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // assinatura_id fica null: é o que distingue avulsa de ciclo, e o que tira
  // esta linha da unique parcial por competência.
  const { data: fatura, error } = await db
    .from('pendix_faturas')
    .insert({
      escritorio_id: empresa.escritorio_id,
      empresa_id: empresa.id,
      assinatura_id: null,
      competencia: String(vencimento).slice(0, 8) + '01',
      valor: Number(valor),
      vencimento,
      status: 'aberta',
    })
    .select('id')
    .single();
  if (error) return new Response(`nao foi possivel criar a fatura: ${error.message}`, { status: 500 });

  const preference = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        title: `${descricao} — ${empresa.nome}`,
        quantity: 1,
        unit_price: Number(valor),
        currency_id: 'BRL',
      }],
      external_reference: fatura.id,
      back_urls: { success: `${Deno.env.get('APP_BASE_URL')}/pendix/app/minhas-faturas` },
    }),
  });

  if (!preference.ok) {
    // Sem link a fatura não serve para nada, e deixá-la aberta faria a empresa
    // ser bloqueada por uma cobrança que nunca teve como pagar.
    await db.from('pendix_faturas').delete().eq('id', fatura.id);
    console.error('preference falhou', await preference.text());
    return new Response('nao foi possivel gerar o link de pagamento', { status: 502 });
  }
  const mp = await preference.json();

  await db
    .from('pendix_faturas')
    .update({ link_pagamento: String(mp.init_point ?? '') })
    .eq('id', fatura.id);

  return new Response(
    JSON.stringify({ fatura_id: fatura.id, link_pagamento: mp.init_point }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
```

- [ ] **Step 2: Adicionar ao serviço do front**

Em `src/pendix/services/faturas.ts`:

```ts
export async function criarFaturaAvulsa(input: {
  empresaId: string;
  valor: number;
  descricao: string;
  vencimento: string; // 'YYYY-MM-DD'
}): Promise<{ faturaId: string; linkPagamento: string }> {
  const { data, error } = await supabase.functions.invoke('mp-fatura-avulsa', {
    body: {
      empresa_id: input.empresaId,
      valor: input.valor,
      descricao: input.descricao,
      vencimento: input.vencimento,
    },
  });
  if (error) throw error;
  const r = data as { fatura_id: string; link_pagamento: string };
  return { faturaId: r.fatura_id, linkPagamento: r.link_pagamento };
}
```

- [ ] **Step 3: Botão na tela Financeiro**

Em `src/pendix/pages/PendixFinanceiro.tsx`, adicione "Nova fatura avulsa" abrindo um diálogo com valor, descrição e vencimento, que chama `criarFaturaAvulsa` e mostra o link gerado. Use o `Dialog` de `src/app/components/ui/` já usado nas outras telas.

- [ ] **Step 4: Deployar e criar uma avulsa de teste**

```bash
supabase functions deploy mp-fatura-avulsa
```

Pela tela, crie uma fatura avulsa numa empresa de teste.
Expected: linha nova em `pendix_faturas` com `assinatura_id` nulo e `link_pagamento` preenchido.

- [ ] **Step 5: Confirmar que a unique de competência não atrapalha**

Crie duas faturas avulsas para a mesma empresa no mesmo mês.
Expected: as duas são criadas. A `uq_pendix_faturas_competencia` só vale onde `assinatura_id is not null`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/mp-fatura-avulsa/index.ts src/pendix/services/faturas.ts src/pendix/pages/PendixFinanceiro.tsx
git commit -m "feat: fatura avulsa com link de pagamento"
```

---

### Task 14: Configuração do Mercado Pago e verificação ponta a ponta

**Files:** nenhum. Esta task é configuração e validação.

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: integração funcionando contra credenciais de teste.

- [ ] **Step 1: Buscar as credenciais de teste**

Use a ferramenta MCP `get_credentials` com `application_id: "7440948531782856"` (aplicação `PENDIX`).

**Não imprima, não logue e não commite os valores.** Copie direto para o passo seguinte.

- [ ] **Step 2: Gravar os secrets no Supabase**

```bash
supabase secrets set MP_ACCESS_TOKEN=<access_token de teste>
supabase secrets set MP_WEBHOOK_SECRET=<assinatura secreta do painel MP>
supabase secrets set APP_BASE_URL=https://<dominio-do-app>
```

A assinatura secreta do webhook não vem do `get_credentials` — ela é gerada no painel do Mercado Pago, em Webhooks, e aparece uma única vez.

- [ ] **Step 3: Registrar a URL do webhook**

Use a ferramenta MCP `save_webhook` com:
- `application_id`: `7440948531782856`
- `callback`: `https://ymakiqxrawpmklayqfam.supabase.co/functions/v1/mercadopago-webhook`
- `topics`: `["subscription_preapproval", "subscription_authorized_payment", "payment"]`

- [ ] **Step 4: Criar usuários de teste**

Use a ferramenta MCP `create_test_user` duas vezes: um vendedor e um comprador. O comprador é quem vai autorizar a assinatura.

- [ ] **Step 5: Rodar o fluxo inteiro**

1. Na tela Financeiro, crie a assinatura de uma empresa de teste com o e-mail do comprador de teste.
2. Abra o `init_point` e autorize.
3. Confirme que `pendix_assinaturas.status` virou `authorized` — prova que o webhook `subscription_preapproval` chegou e foi validado.
4. Confirme que uma linha apareceu em `pendix_faturas`.

- [ ] **Step 6: Verificar a suíte inteira**

```bash
npm test && npm run build
```

Expected: todos os testes passam e o build conclui.

- [ ] **Step 7: Commit final e abertura do PR**

```bash
git add -A
git commit -m "chore: configuracao do Mercado Pago verificada ponta a ponta"
```

Não configure credenciais de produção nesta task. A troca de credenciais de teste para produção é decisão do dono do produto, depois da validação fiscal registrada na spec.
