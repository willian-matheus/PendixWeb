import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Node 20 has no native WebSocket global; @supabase/supabase-js's realtime
// client requires one to even construct, though this script never uses realtime.
if (!globalThis.WebSocket) {
  const { default: WS } = await import('ws');
  globalThis.WebSocket = WS;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile(join(REPO_ROOT, '.env'));
export function env(name) {
  return process.env[name] ?? fileEnv[name];
}

export const SUPABASE_URL = env('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = env('VITE_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

export function requireServiceRole() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '\nFalta SUPABASE_SERVICE_ROLE_KEY no .env.\n' +
      'Pegue em Supabase Dashboard > Project Settings > API > service_role key\n' +
      'e adicione uma linha no .env (raiz do projeto):\n' +
      '  SUPABASE_SERVICE_ROLE_KEY="...."\n' +
      'Nunca commite essa chave nem cole ela no chat.\n'
    );
    process.exit(1);
  }
}

export function adminClient() {
  requireServiceRole();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SCRATCHPAD = env('LOADTEST_SCRATCHPAD') ||
  'C:\\Users\\supweb15\\AppData\\Local\\Temp\\claude\\C--Users-supweb15-Documents-GitHub-PendixWeb\\e019dc13-9298-4748-bb9d-c2d3415da9da\\scratchpad';
export const STATE_FILE = join(SCRATCHPAD, 'loadtest-state.json');
export const REPORT_DIR = SCRATCHPAD;

export function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function loadState() {
  if (!existsSync(STATE_FILE)) {
    console.error(`\nNenhum estado de teste encontrado em ${STATE_FILE}.\nRode 1-seed.mjs primeiro.\n`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

// Runs `items` through `worker` with at most `limit` in flight at once.
export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

export async function withRetry(fn, { retries = 4, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.code;
      const isRateLimited = status === 429 || /rate limit/i.test(err?.message ?? '');
      if (!isRateLimited || attempt === retries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}
