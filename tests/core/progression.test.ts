import { describe, expect, it } from 'vitest';
import { applyXp, isAtCap, levelCap, rankFloor, xpToNext } from '../../src/core/progression';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();

describe('progressão', () => {
  it('xpToNext = base + perLevel × nível', () => {
    expect(xpToNext(1, b)).toBe(b.xpCurve.base + b.xpCurve.perLevel);
    expect(xpToNext(7, b)).toBe(b.xpCurve.base + 7 * b.xpCurve.perLevel);
  });

  it('teto e piso de cada rank', () => {
    expect(levelCap(0, b)).toBe(b.levelCaps[0]);
    expect(rankFloor(0, b)).toBe(1);
    expect(rankFloor(1, b)).toBe(b.levelCaps[0]);
    expect(rankFloor(6, b)).toBe(b.levelCaps[5]);
  });

  it('sobe um nível e carrega o resto', () => {
    const r = applyXp(makeHunter(), xpToNext(1, b) + 3, b);
    expect(r.hunter.level).toBe(2);
    expect(r.hunter.xp).toBe(3);
    expect(r.levelsGained).toBe(1);
  });

  it('sobe vários níveis de uma vez', () => {
    const r = applyXp(makeHunter(), xpToNext(1, b) + xpToNext(2, b), b);
    expect(r.hunter.level).toBe(3);
    expect(r.hunter.xp).toBe(0);
    expect(r.levelsGained).toBe(2);
  });

  it('no teto do rank o XP fica guardado', () => {
    const cap = levelCap(0, b);
    const r = applyXp(makeHunter({ level: cap }), 500, b);
    expect(r.hunter.level).toBe(cap);
    expect(r.hunter.xp).toBe(500);
    expect(r.levelsGained).toBe(0);
    expect(isAtCap(r.hunter, b)).toBe(true);
  });

  it('nunca passa do teto, mesmo com muito XP', () => {
    const r = applyXp(makeHunter(), 1_000_000, b);
    expect(r.hunter.level).toBe(levelCap(0, b));
    expect(r.hunter.xp).toBeGreaterThan(0);
  });

  it('isAtCap é falso abaixo do teto', () => {
    expect(isAtCap(makeHunter({ level: levelCap(0, b) - 1 }), b)).toBe(false);
  });
});
