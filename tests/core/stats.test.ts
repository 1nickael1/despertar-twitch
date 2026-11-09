import { describe, expect, it } from 'vitest';
import { injuryChance, primaryStat } from '../../src/core/stats';
import { testBalance } from '../helpers';

const b = testBalance();

describe('atributos', () => {
  it('atributo principal = base + crescimento × (nível − 1), arredondado para baixo', () => {
    const c = b.classes.guerreiro;
    expect(primaryStat('guerreiro', 1, b)).toBe(Math.floor(c.base));
    expect(primaryStat('guerreiro', 10, b)).toBe(Math.floor(c.base + c.growth * 9));
  });

  it('lesão: fórmula por VIT com mínimo', () => {
    const c = b.classes.guerreiro;
    const expected = Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit);
    expect(injuryChance('guerreiro', b)).toBeCloseTo(expected);
  });

  it('Curandeiro nunca se lesiona; Tanque tem chance fixa', () => {
    expect(injuryChance('curandeiro', b)).toBe(0);
    expect(injuryChance('tanque', b)).toBe(b.classes.tanque.fixedInjuryChance);
  });
});
