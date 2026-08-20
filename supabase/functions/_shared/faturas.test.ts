import { describe, it, expect } from 'vitest';
import { calcularVencimento, estaBloqueada, alertasDevidos, CARENCIA_DIAS } from './faturas';

const d = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

describe('calcularVencimento', () => {
  it('usa o dia de cobranca dentro do mes da competencia', () => {
    expect(calcularVencimento(d('2026-03-01'), 10).toISOString().slice(0, 10)).toBe('2026-03-10');
  });

  it('funciona em fevereiro com dia 28', () => {
    expect(calcularVencimento(d('2026-02-01'), 28).toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('rejeita dia fora de 1..28', () => {
    expect(() => calcularVencimento(d('2026-03-01'), 31)).toThrow();
    expect(() => calcularVencimento(d('2026-03-01'), 0)).toThrow();
  });
});

describe('estaBloqueada', () => {
  it('nao bloqueia fatura paga, por mais vencida que esteja', () => {
    expect(estaBloqueada(d('2026-01-10'), 'paga', d('2026-08-20'))).toBe(false);
  });

  it('nao bloqueia fatura cancelada', () => {
    expect(estaBloqueada(d('2026-01-10'), 'cancelada', d('2026-08-20'))).toBe(false);
  });

  it('nao bloqueia no dia do vencimento', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-10'))).toBe(false);
  });

  it('nao bloqueia no penultimo dia da carencia', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-12'))).toBe(false);
  });

  it('bloqueia exatamente em D+3, o primeiro dia apos a carencia', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-03-13'))).toBe(true);
  });

  it('segue bloqueada depois de D+3', () => {
    expect(estaBloqueada(d('2026-03-10'), 'vencida', d('2026-04-01'))).toBe(true);
  });

  it('a carencia declarada e de 3 dias', () => {
    expect(CARENCIA_DIAS).toBe(3);
  });
});

describe('alertasDevidos', () => {
  it('avisa 3 dias antes do vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-07'), [])).toEqual(['D-3']);
  });

  it('avisa no dia do vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-10'), [])).toEqual(['D+0']);
  });

  it('avisa no dia seguinte ao vencimento', () => {
    expect(alertasDevidos(d('2026-03-10'), 'vencida', d('2026-03-11'), [])).toEqual(['D+1']);
  });

  it('avisa no dia do bloqueio', () => {
    expect(alertasDevidos(d('2026-03-10'), 'vencida', d('2026-03-13'), [])).toEqual(['D+3']);
  });

  it('nao repete alerta ja enviado', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-07'), ['D-3'])).toEqual([]);
  });

  it('nao alerta fatura paga', () => {
    expect(alertasDevidos(d('2026-03-10'), 'paga', d('2026-03-13'), [])).toEqual([]);
  });

  it('nao alerta em dia sem marco', () => {
    expect(alertasDevidos(d('2026-03-10'), 'aberta', d('2026-03-05'), [])).toEqual([]);
  });
});
