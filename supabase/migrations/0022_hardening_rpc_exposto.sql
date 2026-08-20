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

-- Função de trigger: ninguém deve poder chamá-la diretamente. O Postgres a
-- dispara como dono da tabela, então revogar de todos não afeta o cadastro.
revoke execute on function public.pendix_handle_new_user() from public, anon, authenticated;

-- ── ATENÇÃO: por que há grant depois do revoke ───────────────────────────
--
-- pendix_current_escritorio_id() e pendix_is_admin() são chamadas DENTRO das
-- expressões de policy RLS de praticamente toda tabela pendix_*.
--
-- Expressão de policy é avaliada com os privilégios de QUEM FAZ A QUERY, não
-- do dono da tabela. `security definer` muda o que a função enxerga por
-- dentro; não muda quem pode chamá-la.
--
-- Em 2026-08-20 o ACL destas funções era:
--   =X/postgres  anon=X/postgres  authenticated=X/postgres  service_role=X/postgres
-- ou seja, `authenticated` tem grant EXPLÍCITO — não herdado do PUBLIC.
-- Logo, `revoke from public, anon` sozinho já seria seguro aqui.
--
-- Os grants abaixo são defensivos, não corretivos: tornam a intenção
-- explícita e mantêm a migration correta em qualquer ambiente onde o
-- privilégio venha só por herança do PUBLIC, caso em que o revoke sem
-- regrant quebraria toda leitura e escrita autenticada do app.

revoke execute on function public.pendix_current_escritorio_id() from public, anon;
grant  execute on function public.pendix_current_escritorio_id() to authenticated, service_role;

revoke execute on function public.pendix_is_admin() from public, anon;
grant  execute on function public.pendix_is_admin() to authenticated, service_role;

-- ── VERIFICAÇÃO OBRIGATÓRIA APÓS APLICAR ─────────────────────────────────
-- Logue no app como usuário comum e abra Pendências. Se a lista carregar,
-- os grants estão certos. Se aparecer "permission denied for function",
-- rode o rollback abaixo IMEDIATAMENTE.
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────
-- grant execute on function public.pendix_handle_new_user() to anon, authenticated;
-- grant execute on function public.pendix_current_escritorio_id() to public;
-- grant execute on function public.pendix_is_admin() to public;
