# PendixWeb

Aplicação standalone do módulo Pendix (gestão de pendências de documentos), extraída do projeto Flash20.

## Rodando o projeto

```bash
npm i
cp .env.example .env
```

Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` com as credenciais do projeto Supabase.

```bash
npm run dev
```

## Stack

React 18 + TypeScript + Vite, Tailwind CSS v4, Radix UI, Supabase (auth e dados). Sem backend próprio — toda a persistência é via Supabase.
