import { adminClient, saveState, runWithConcurrency, withRetry } from './_common.mjs';

const NUM_USERS = Number(process.env.LOADTEST_NUM_USERS || 500);
const SEED_CONCURRENCY = Number(process.env.LOADTEST_SEED_CONCURRENCY || 25);
const PASSWORD = 'Loadtest#Pendix2026!';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const EMAIL_DOMAIN = 'pendixloadtest.invalid';

const ROLES = ['contador', 'dono_escritorio', 'acesso_completo'];

async function main() {
  const admin = adminClient();

  console.log(`Criando escritório de teste (run ${RUN_ID})...`);
  const { data: escritorio, error: escErr } = await admin
    .from('empresas')
    .insert({ nome: `__LOADTEST__ ${RUN_ID}`, plano: 'pro' })
    .select()
    .single();
  if (escErr) throw escErr;
  const escritorioId = escritorio.id;
  console.log(`Escritório criado: ${escritorioId}`);

  console.log(`Criando ${NUM_USERS} usuários (concorrência=${SEED_CONCURRENCY})...`);
  const indices = Array.from({ length: NUM_USERS }, (_, i) => i + 1);
  let created = 0;
  const users = await runWithConcurrency(indices, SEED_CONCURRENCY, async (i) => {
    const email = `lt-${RUN_ID}-u${String(i).padStart(4, '0')}@${EMAIL_DOMAIN}`;
    const nome = `LoadTest User ${i}`;
    const role = ROLES[i % ROLES.length];

    const { data: authUser, error: authErr } = await withRetry(() =>
      admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nome, role, escritorio_id: escritorioId },
      }).then(({ data, error }) => {
        if (error) throw error;
        return { data, error };
      })
    );

    const userId = authUser.user.id;
    // O trigger on_auth_user_created -> pendix_handle_new_user() já cria a
    // linha em public.usuarios a partir do user_metadata acima (nome, role,
    // escritorio_id) — nada a inserir manualmente aqui.

    created++;
    if (created % 50 === 0) console.log(`  ${created}/${NUM_USERS} criados`);

    return { index: i, id: userId, email, password: PASSWORD, role };
  });

  saveState({
    runId: RUN_ID,
    escritorioId,
    createdAt: new Date().toISOString(),
    users,
  });

  console.log(`\nPronto. ${users.length} usuários criados no escritório ${escritorioId}.`);
  console.log(`Estado salvo. Agora rode: node scripts/loadtest/2-run.mjs`);
}

main().catch(err => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
