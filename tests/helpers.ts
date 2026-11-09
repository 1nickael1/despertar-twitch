import { BALANCE_PATH, loadBalance, type Balance } from '../src/config/balance';
import type { Clock } from '../src/core/clock';
import { createHunter } from '../src/core/hunter';
import type { Rng } from '../src/core/rng';
import type { Hunter } from '../src/core/types';

/** Rng que devolve valores na ordem dada. Falha se o código sortear mais do que o teste previu. */
export class ScriptedRng implements Rng {
  private values: number[] = [];
  push(...values: number[]): this {
    this.values.push(...values);
    return this;
  }
  next(): number {
    const v = this.values.shift();
    if (v === undefined) throw new Error('ScriptedRng sem valores: o teste não previu este sorteio');
    return v;
  }
  get remaining(): number {
    return this.values.length;
  }
}

export const seqRng = (values: number[]): ScriptedRng => new ScriptedRng().push(...values);

/** Valor de Rng que produz exatamente `face` em rollD20. */
export const d20 = (face: number): number => (face - 1) / 20 + 0.01;

export const testBalance = (): Balance => loadBalance(BALANCE_PATH);

export const makeHunter = (overrides: Partial<Hunter> = {}): Hunter => ({
  ...createHunter('u1', 'ana', 'guerreiro', 1, 0),
  ...overrides,
});

export class FakeClock implements Clock {
  constructor(public t = 1_000_000) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
