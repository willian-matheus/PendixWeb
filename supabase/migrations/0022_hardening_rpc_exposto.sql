-- PendixWeb — fecha funções `security definer` expostas como RPC público.
--
-- NÃO faz parte da feature de cobrança. Está separada de propósito: mexe em
-- superfície de autenticação, então pode ser aplicada e revertida sozinha.
--
-- Origem: linter de segurança do Supabase (get_advisors, tipo security) no
-- projeto ymakiqxrawpmklayqfam, em 2026-08-20. Três funções `security
-- definer` estavam executáveis pelo papel `anon` via /rest/v1/rpc/, ou seja,
-- chamáveis por qualquer um SEM LOGIN.
--
-- A mais séria é pendix_handle_new_user(): é função de TRIGGER de cadastro,
-- roda com privilégio elevado e não tem motivo nenhum para ser alcançável
-- pela API REST. Função de trigger é chamada pelo Postgres, nunca por
-- cliente.
--
-- As outras duas devolvem nulo/falso para anon, então o risco é menor — mas
-- expor helper de autorização a quem não está autenticado não tem upside.
--
-- RISCO DESTA MIGRATION: se alguma parte do app chamar essas funções via
-- supabase.rpc(), passará a receber erro de permissão. Antes de aplicar,
-- confirme que não há chamada:
--   grep -rn "rpc('pendix_handle_new_user'\|rpc('pendix_is_admin'\|rpc('pendix_current_escritorio_id'" src/
-- Em 2026-08-20 esse grep não retornava nada.

-- Função de trigger: ninguém deve poder chamá-la diretamente.
revoke execute on function public.pendix_handle_new_user() from public, anon, authenticated;

-- Helpers de RLS: usados DENTRO de policies, onde a revogação não se aplica.
-- O Postgres avalia a policy como o dono da tabela, então revogar aqui não
-- quebra nenhuma policy existente — só fecha a porta da API REST.
revoke execute on function public.pendix_current_escritorio_id() from public, anon;
revoke execute on function public.pendix_is_admin() from public, anon;

-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- grant execute on function public.pendix_handle_new_user() to anon, authenticated;
-- grant execute on function public.pendix_current_escritorio_id() to anon;
-- grant execute on function public.pendix_is_admin() to anon;
