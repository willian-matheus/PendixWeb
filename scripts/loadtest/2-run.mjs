import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadState, anonClient, percentile, REPORT_DIR, runWithConcurrency } from './_common.mjs';

// Unbounded (all 500 at once) hits the Free-tier gateway's burst protection
// on /auth/v1/token before the app's write path is ever exercised. Set this
// to stagger logins and get signal on the rest of the stack instead.
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 0) || Infinity;

// Workload per simulated user: sign in, then run the same lifecycle a real
// office user would — cadastrar cliente, configurar documento recorrente,
// gerar pendência do mês, marcar como recebida, registrar no histórico.
const STEPS = ['signIn', 'criarCliente', 'criarDocConfig', 'criarPendencia', 'atualizarStatus', 'registrarHistorico'];

function nowCompetencia() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function runUser(userRec, escritorioId) {
  const timings = {};
  const errors = {};
  const client = anonClient();

  async function step(name, fn) {
    const t0 = performance.now();
    try {
      const result = await fn();
      timings[name] = performance.now() - t0;
      return result;
    } catch (err) {
      timings[name] = performance.now() - t0;
      errors[name] = err?.message || String(err);
      throw err;
    }
  }

  try {
    await step('signIn', async () => {
      const { error } = await client.auth.signInWithPassword({
        email: userRec.email,
        password: userRec.password,
      });
      if (error) throw error;
    });

    const cliente = await step('criarCliente', async () => {
      const { data, error } = await client.from('pendix_clientes').insert({
        escritorio_id: escritorioId,
        nome: `Cliente de ${userRec.email}`,
        responsavel: userRec.email,
        telefone: '11999999999',
        email: `cliente-${userRec.index}@pendixloadtest.invalid`,
        regime: 'simples_nacional',
        status: 'ativo',
        observacoes: 'Criado por teste de carga',
      }).select().single();
      if (error) throw error;
      return data;
    });

    const doc = await step('criarDocConfig', async () => {
      const { data, error } = await client.from('pendix_documentos_config').insert({
        escritorio_id: escritorioId,
        cliente_id: cliente.id,
        nome: 'Extrato Bancário',
        frequencia: 'mensal',
        dia_limite: 20,
        prioridade: 'media',
        ativo: true,
      }).select().single();
      if (error) throw error;
      return data;
    });

    const pendencia = await step('criarPendencia', async () => {
      const competencia = nowCompetencia();
      const { data, error } = await client.from('pendix_pendencias').insert({
        escritorio_id: escritorioId,
        cliente_id: cliente.id,
        documento_id: doc.id,
        nome_documento: doc.nome,
        competencia,
        status: 'pendente',
        data_limite: `${competencia}-20`,
      }).select().single();
      if (error) throw error;
      return data;
    });

    await step('atualizarStatus', async () => {
      const { error } = await client.from('pendix_pendencias')
        .update({ status: 'recebido', data_recebimento: new Date().toISOString() })
        .eq('id', pendencia.id);
      if (error) throw error;
    });

    await step('registrarHistorico', async () => {
      const { error } = await client.from('pendix_historico').insert({
        escritorio_id: escritorioId,
        pendencia_id: pendencia.id,
        cliente_id: cliente.id,
        acao: 'status_alterado',
        descricao: 'Pendência marcada como recebida (teste de carga)',
        usuario_nome: userRec.email,
      });
      if (error) throw error;
    });

    return { index: userRec.index, ok: true, timings, errors };
  } catch (err) {
    return { index: userRec.index, ok: false, timings, errors, failedAt: Object.keys(errors)[0] };
  }
}

function summarizeStep(name, results) {
  const values = results
    .filter(r => r.timings[name] !== undefined)
    .map(r => r.timings[name])
    .sort((a, b) => a - b);
  const failures = results.filter(r => r.errors[name]).length;
  const errorSamples = [...new Set(results.filter(r => r.errors[name]).map(r => r.errors[name]))].slice(0, 3);
  return {
    step: name,
    attempts: values.length + failures - (values.length && failures ? 0 : 0),
    ok: values.length,
    failures,
    p50Ms: Math.round(percentile(values, 50)),
    p95Ms: Math.round(percentile(values, 95)),
    p99Ms: Math.round(percentile(values, 99)),
    maxMs: values.length ? Math.round(values[values.length - 1]) : 0,
    errorSamples,
  };
}

async function main() {
  const state = loadState();
  const { escritorioId, users, runId } = state;

  const concurrencyLabel = Number.isFinite(CONCURRENCY) ? CONCURRENCY : users.length;
  console.log(`Disparando ${users.length} usuários (concorrência=${concurrencyLabel}) contra o escritório ${escritorioId}...`);
  const t0 = performance.now();

  const results = Number.isFinite(CONCURRENCY)
    ? await runWithConcurrency(users, CONCURRENCY, u => runUser(u, escritorioId))
    : await Promise.all(users.map(u => runUser(u, escritorioId)));

  const wallMs = performance.now() - t0;
  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;

  const perStep = STEPS.map(name => summarizeStep(name, results));

  const failuresByStep = {};
  for (const r of results) {
    if (!r.ok && r.failedAt) failuresByStep[r.failedAt] = (failuresByStep[r.failedAt] || 0) + 1;
  }

  const report = {
    runId,
    escritorioId,
    totalUsers: users.length,
    wallClockMs: Math.round(wallMs),
    usersOk: okCount,
    usersFailed: failCount,
    throughputUsersPerSec: Number((users.length / (wallMs / 1000)).toFixed(2)),
    perStep,
    failuresByStep,
    finishedAt: new Date().toISOString(),
  };

  const reportPath = join(REPORT_DIR, `loadtest-report-${runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== RESULTADO ===');
  console.log(`Tempo total (wall clock): ${report.wallClockMs} ms`);
  console.log(`Usuários com fluxo 100% completo: ${okCount}/${users.length}`);
  console.log(`Usuários com falha em algum passo: ${failCount}/${users.length}`);
  console.log(`Throughput: ${report.throughputUsersPerSec} fluxos completos/seg\n`);
  console.log('Latência por etapa (ms) — p50 / p95 / p99 / max, falhas:');
  for (const s of perStep) {
    console.log(`  ${s.step.padEnd(18)} p50=${s.p50Ms} p95=${s.p95Ms} p99=${s.p99Ms} max=${s.maxMs}  falhas=${s.failures}`);
    if (s.errorSamples.length) console.log(`    exemplos de erro: ${s.errorSamples.join(' | ')}`);
  }
  console.log(`\nRelatório completo salvo em: ${reportPath}`);
  console.log('Rode node scripts/loadtest/3-teardown.mjs para limpar os dados de teste.');
}

main().catch(err => {
  console.error('Falha ao rodar o teste de carga:', err);
  process.exit(1);
});
