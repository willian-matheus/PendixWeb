import { adminClient } from './_common.mjs';

const ESCRITORIO_ID = process.argv[2];
if (!ESCRITORIO_ID) {
  console.error('uso: node _cleanup-orphan.mjs <escritorio_id>');
  process.exit(1);
}

const admin = adminClient();
const { data: rows, error } = await admin.from('usuarios').select('id, email').eq('escritorio_id', ESCRITORIO_ID);
if (error) throw error;
console.log(`Removendo ${rows.length} usuários órfãos do escritório ${ESCRITORIO_ID}...`);
for (const r of rows) {
  const { error: delErr } = await admin.auth.admin.deleteUser(r.id);
  if (delErr) console.error(`  falha ${r.email}: ${delErr.message}`);
}
const { error: escErr } = await admin.from('empresas').delete().eq('id', ESCRITORIO_ID);
if (escErr) throw escErr;
console.log('Escritório órfão removido.');
