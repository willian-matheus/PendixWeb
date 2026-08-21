-- Renomeia o valor de role 'dono_escritorio' para 'master'. A partir de
-- agora só existe um papel administrativo real (admin/super_admin) e todo
-- o restante (donos de escritório cadastrados normalmente) é 'master'.
--
-- Aplicada em produção em 2026-08-20, junto com a 0019, na migration
-- `rename_dono_escritorio_to_master_and_harden_auth`. Duas coisas foram
-- corrigidas aqui em relação à versão original deste arquivo, que nunca
-- chegou a rodar:
--
-- 1. ORDEM. O `add constraint` vinha ANTES do `update`. Como o CHECK é
--    validado no ato contra as linhas existentes — que ainda eram
--    'dono_escritorio' — ele estourava com 23514 e a migration inteira
--    revertia. A 0019 e a 0020 ficaram represadas atrás disso por semanas.
--    O `update` tem que vir primeiro.
--
-- 2. O `pendix_handle_new_user` que este arquivo instalava lia `role` e
--    `escritorio_id` de `raw_user_meta_data` — objeto controlado pelo
--    cliente. Isso deixaria qualquer cadastro público nascer 'super_admin'
--    dentro de um escritório alheio. Foi removido daqui: quem define o
--    gatilho é a 0019, e só ela, com a role fixa e escritório sempre novo.

alter table public.usuarios drop constraint if exists usuarios_role_check;

update public.usuarios set role = 'master' where role = 'dono_escritorio';

alter table public.usuarios add constraint usuarios_role_check
  check (role in ('admin', 'super_admin', 'master', 'contador', 'cliente_empresa', 'acesso_completo', 'visualizador'));
