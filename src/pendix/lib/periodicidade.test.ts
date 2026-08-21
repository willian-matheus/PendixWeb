/**
 * Testes da periodicidade das pendências.
 *
 * Cópia literal de PendixApp/lib/periodicidade.test.ts, rodando contra a cópia
 * web do módulo. É de propósito: a mesma pendência é criada aqui e recebida no
 * celular, então as duas implementações têm que concordar em cada data. Se um
 * teste passa lá e falha aqui, os dois lados divergiram.
 *
 * Roda no Node puro (sem Vite, sem React) — o módulo testado não importa nada
 * do app de propósito:
 *
 *   npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  avancarCompetencia,
  calcularProximaOcorrencia,
  descreverPeriodicidade,
  ehRecorrente,
  somarDias,
  somarMeses,
  somarMesesPreservandoFimDeMes,
  PERIODICIDADE_OPTS,
  type PendixPeriodicidade,
} from './periodicidade.ts';

// ── Aritmética de datas ─────────────────────────────────────────────────────

test('somarDias atravessa a virada do mês e do ano', () => {
  assert.equal(somarDias('2026-08-28', 7), '2026-09-04');
  assert.equal(somarDias('2026-12-25', 15), '2027-01-09');
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29'); // bissexto
});

test('somarMeses grampeia o dia no último dia do mês de destino', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2028-01-31', 1), '2028-02-29'); // bissexto
  assert.equal(somarMeses('2026-03-31', 1), '2026-04-30');
  assert.equal(somarMeses('2026-08-15', 12), '2027-08-15');
});

test('somarMesesPreservandoFimDeMes mantém "fim do mês" em vez de travar no dia 28', () => {
  assert.equal(somarMesesPreservandoFimDeMes('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMesesPreservandoFimDeMes('2026-02-28', 1), '2026-03-31');
  assert.equal(somarMesesPreservandoFimDeMes('2026-04-30', 1), '2026-05-31');
  // dia comum não é tratado como fim de mês
  assert.equal(somarMesesPreservandoFimDeMes('2026-01-15', 1), '2026-02-15');
});

test('avancarCompetencia vira o ano', () => {
  assert.equal(avancarCompetencia('2026-08', 1), '2026-09');
  assert.equal(avancarCompetencia('2026-12', 1), '2027-01');
  assert.equal(avancarCompetencia('2026-11', 3), '2027-02');
  assert.equal(avancarCompetencia('2026-08', 12), '2027-08');
});

// ── Próxima ocorrência ──────────────────────────────────────────────────────

const BASE = {
  competencia: '2026-08',
  data_limite: '2026-08-20',
  data_inicio_cobranca: '2026-08-01',
  datas_notificacao: ['2026-08-10', '2026-08-15'],
};

test('mensal avança competência e todas as datas em um mês', () => {
  const p = calcularProximaOcorrencia({ ...BASE, periodicidade: 'mensal' });
  assert.deepEqual(p, {
    competencia: '2026-09',
    data_limite: '2026-09-20',
    data_inicio_cobranca: '2026-09-01',
    datas_notificacao: ['2026-09-10', '2026-09-15'],
  });
});

test('trimestral, semestral e anual usam o passo certo', () => {
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: 'trimestral' })!.competencia, '2026-11');
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: 'semestral' })!.data_limite, '2027-02-20');
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: 'anual' })!.competencia, '2027-08');
});

test('semanal anda em dias e a competência acompanha o mês do novo vencimento', () => {
  const p = calcularProximaOcorrencia({
    competencia: '2026-08',
    data_limite: '2026-08-28',
    data_inicio_cobranca: '2026-08-25',
    datas_notificacao: ['2026-08-26'],
    periodicidade: 'semanal',
  })!;
  assert.equal(p.data_limite, '2026-09-04');
  assert.equal(p.competencia, '2026-09');
  assert.equal(p.data_inicio_cobranca, '2026-09-01');
  assert.deepEqual(p.datas_notificacao, ['2026-09-02']);
});

test('quinzenal sem vencimento deduz a competência do 1º dia da competência atual', () => {
  const p = calcularProximaOcorrencia({ competencia: '2026-08', periodicidade: 'quinzenal' })!;
  assert.equal(p.competencia, '2026-08'); // 2026-08-01 + 15 dias = 16/08
  assert.equal(p.data_limite, undefined);
  assert.deepEqual(p.datas_notificacao, []);

  const virada = calcularProximaOcorrencia({ competencia: '2026-08', data_limite: '2026-08-25', periodicidade: 'quinzenal' })!;
  assert.equal(virada.data_limite, '2026-09-09');
  assert.equal(virada.competencia, '2026-09');
});

test('pendência única (ou sem periodicidade) não gera próxima', () => {
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: 'unica' }), null);
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: null }), null);
  assert.equal(calcularProximaOcorrencia({ ...BASE }), null);
  assert.equal(calcularProximaOcorrencia({ ...BASE, periodicidade: 'lunar' }), null);
});

test('campos ausentes ou inválidos não viram datas inválidas', () => {
  const p = calcularProximaOcorrencia({
    competencia: '2026-08',
    data_limite: null,
    data_inicio_cobranca: '',
    datas_notificacao: ['2026-08-10', 'amanhã', '2026-02-30'],
    periodicidade: 'mensal',
  })!;
  assert.equal(p.data_limite, undefined);
  assert.equal(p.data_inicio_cobranca, undefined);
  assert.deepEqual(p.datas_notificacao, ['2026-09-10']); // lixo descartado
  assert.equal(p.competencia, '2026-09');
});

test('competência inválida falha alto em vez de gerar lixo', () => {
  assert.throws(
    () => calcularProximaOcorrencia({ competencia: '08/2026', periodicidade: 'mensal' }),
    /Compet[êe]ncia inv[áa]lida/,
  );
});

// ── Corrente de recorrências (o que o app realmente faz ao longo do ano) ─────

test('12 ciclos mensais a partir do fim de janeiro ficam sempre no fim do mês', () => {
  let atual = {
    competencia: '2026-01',
    data_limite: '2026-01-31',
    data_inicio_cobranca: '2026-01-05',
    datas_notificacao: ['2026-01-20'],
    periodicidade: 'mensal' as PendixPeriodicidade,
  };

  const vencimentos: string[] = [];
  const competencias: string[] = [];
  for (let i = 0; i < 12; i++) {
    const p = calcularProximaOcorrencia(atual)!;
    vencimentos.push(p.data_limite!);
    competencias.push(p.competencia);
    atual = { ...atual, ...p, data_limite: p.data_limite!, data_inicio_cobranca: p.data_inicio_cobranca! };
  }

  assert.deepEqual(competencias, [
    '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
    '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01',
  ]);
  assert.deepEqual(vencimentos, [
    '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31',
    '2026-08-31', '2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31',
  ]);
  // a data de início de cobrança (dia comum) não escorrega
  assert.equal(atual.data_inicio_cobranca, '2027-01-05');
});

// ── Auxiliares de UI ────────────────────────────────────────────────────────

test('ehRecorrente separa única de recorrente', () => {
  assert.equal(ehRecorrente('unica'), false);
  assert.equal(ehRecorrente(undefined), false);
  assert.equal(ehRecorrente('mensal'), true);
  assert.equal(ehRecorrente('anual'), true);
});

test('descreverPeriodicidade dá texto pronto para a tela', () => {
  assert.equal(descreverPeriodicidade('mensal'), 'Repete mensalmente');
  assert.equal(descreverPeriodicidade('quinzenal'), 'Repete a cada 15 dias');
  assert.equal(descreverPeriodicidade('unica'), null);
});

test('as opções do Select cobrem todas as periodicidades aceitas pelo banco', () => {
  // Mesma lista dos CHECKs de `periodicidade` e `cobranca_frequencia` em
  // supabase/migrations/20260820024021_pendix_cobranca_automatica.sql
  assert.deepEqual(
    PERIODICIDADE_OPTS.map((o) => o.value),
    [
      'unica', 'diaria', 'semanal', 'quinzenal', 'mensal', 'bimestral',
      'trimestral', 'quadrimestral', 'semestral', 'anual', 'bienal',
    ],
  );
});
