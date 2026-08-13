import { unlinkSync } from 'node:fs';
import { adminClient, loadState, runWithConcurrency, STATE_FILE } from './_common.mjs';

const DELETE_CONCURRENCY = Number(process.env.LOADTEST_DELETE_CONCURRENCY || 25);

async function main() {
  const admin = adminClient();
  const state = loadState();
  const { escritorioId, users } = state;

  console.log(`Limpando dados de teste do escritório ${escritorioId}...`);

  for (const table of ['pendix_historico', 'pendix_pendencias', 'pendix_documentos_config', 'pendix_clientes']) {
    const { error, count } = await admin
      .from(table)
      .delete({ count: 'exact' })
      .eq('escritorio_id', escritorioId);
    if (error) throw error;
    console.log(`  ${table}: ${count ?? 0} linhas removidas`);
  }

  const { error: usuariosErr, count: usuariosCount } = await admin
    .from('usuarios')
    .delete({ count: 'exact' })
    .eq('escritorio_id', escritorioId);
  if (usuariosErr) throw usuariosErr;
  console.log(`  usuarios: ${usuariosCount ?? 0} linhas removidas`);

  console.log(`Removendo ${users.length} usuários de auth...`);
  let removed = 0;
  await runWithConcurrency(users, DELETE_CONCURRENCY, async (u) => {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error && !/user not found/i.test(error.message)) {
      console.error(`  falha ao remover ${u.email}: ${error.message}`);
    } else {
      removed++;
    }
  });
  console.log(`  ${removed}/${users.length} usuários removidos`);

  const { error: escErr } = await admin.from('empresas').delete().eq('id', escritorioId);
  if (escErr) throw escErr;
  console.log(`  escritório de teste removido`);

  unlinkSync(STATE_FILE);
  console.log('\nLimpeza concluída. Banco voltou ao estado anterior ao teste.');
}

main().catch(err => {
  console.error('Falha na limpeza:', err);
  console.error('O arquivo de estado NÃO foi apagado — rode de novo depois de corrigir, ou limpe manualmente pelo escritorio_id acima.');
  process.exit(1);
});
