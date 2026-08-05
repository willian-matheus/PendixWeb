import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string || '';

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const urlOk = isValidUrl(supabaseUrl);
const keyOk = !!supabaseAnonKey && !supabaseAnonKey.startsWith('<');

if (!urlOk || !keyOk) {
  console.error(
    '⚠️ Supabase não configurado corretamente. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env'
  );
}

const validUrl = urlOk ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = keyOk ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);

export default supabase;