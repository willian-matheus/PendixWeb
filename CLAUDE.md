# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm i

# Start dev server
npm run dev

# Build for production
npm run build
```

Vite serves the frontend on port 5173. There is no lint or test command configured.

## Environment Variables

Create a `.env` file at the root (see `.env.example`) with:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Architecture

PendixWeb is a standalone extraction of the "Pendix" module from the Flash20 project — a document-pendency tracker for accounting offices and their client companies. It is a single-backend React SPA:

- React 18 + TypeScript, bundled with Vite
- Routing: `react-router` v7 with lazy-loaded pages in `src/app/routes.tsx`. `/` redirects to `/pendix`.
- UI: Tailwind CSS v4 + Radix UI primitives (components in `src/app/components/ui/`)
- `@` alias resolves to `src/`
- **Supabase** (`src/app/services/supabase.ts`) is the only backend — auth and all CRUD go directly through the Supabase JS client. There is no local API server.

### App structure
- `src/pendix/pages/` — the actual screens: `PendixLanding`, `PendixLogin`, `PendixRoot` (layout with its own sidebar nav), `PendixDashboard`, `PendixClientes`, `PendixPendencias`, `PendixHistorico`
- `src/pendix/services/pendix.ts` — all Supabase queries for the `pendix_clientes`, `pendix_documentos_config`, `pendix_pendencias`, and `pendix_historico` tables
- `src/pendix/auth/RequirePendixAuth.tsx` — route guard redirecting to `/pendix/login` when unauthenticated
- `src/app/auth/AuthProvider.tsx`, `src/app/theme/ThemeProvider.tsx` — shared cross-cutting context, reused from the original Flash20 app

### Auth flow
`AuthProvider` authenticates exclusively via Supabase Auth. On sign-in, the Supabase JWT is stored in `localStorage['flash_token']` and the user profile is cached in `localStorage['flash_user']`. Theme (dark/light) is persisted in `localStorage['flash_theme']`.

### Key domain concepts
- **Escritório** (accounting office) = the tenant; most `pendix_*` rows are scoped by `escritorio_id`, except for `admin`/`super_admin` users who see everything
- **Pendix Cliente** = a client company of the escritório that owes recurring documents
- **Documento Config** = a recurring document requirement per cliente (frequency, due day, priority)
- **Pendência** = a single instance of a required document for a given competência (period), with a status lifecycle: `pendente` → `em_analise`/`recebido`/`rejeitado`/`cancelado`
- **Histórico** = an audit trail of actions taken on clientes/pendências

### State management
No global state library. State lives in React component state or is fetched directly from Supabase inside each page. `AuthContext` and `ThemeContext` are the only cross-cutting contexts.
