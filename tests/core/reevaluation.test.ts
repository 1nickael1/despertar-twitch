import { describe, expect, it } from 'vitest';
import { levelCap, rankFloor, xpToNext } from '../../src/core/progression';
import { resolveReevaluation } from '../../src/core/reevaluation';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const NOW = 50_000;
const NO_REAWAKEN = 0.99;
const atCapF = (overrides = {}) => makeHunter({ level: levelCap(0, b), ...overrides });

describe('resolveReevaluation', () => {
  it('sucesso sobe 1 rank e marca a data', () => {
    const r = resolveReevaluation(atCapF({ xp: 7 }), b, seqRng([NO_REAWAKEN, 0]), NOW);
    expect(r.kind).toBe('success');
    if (r.kind === 'failure') throw new Error('esperava sucesso');
    expect(r.fromRank).toBe(0);
    expect(r.toRank).toBe(1);
    expect(r.hunter.rank).toBe(1);
    expect(r.hunter.level).toBe(levelCap(0, b));
    expect(r.hunter.xp).toBe(7);
    expect(r.hunter.rankReachedAt).toBe(NOW);
  });

  it('sucesso aplica o XP guardado', () => {
    const cap = levelCap(0, b);
    const r = resolveReevaluation(atCapF({ xp: xpToNext(cap, b) + 1 }), b, seqRng([NO_REAWAKEN, 0]), NOW);
    expect(r.hunter.level).toBe(cap + 1);
    expect(r.hunter.xp).toBe(1);
  });

  it('falha bloqueia nova tentativa sem perder XP', () => {
    const r = resolveReevaluation(atCapF({ xp: 40 }), b, seqRng([NO_REAWAKEN, 0.99]), NOW);
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error('esperava falha');
    expect(r.blockedUntil).toBe(NOW + b.reevaluation.failBlockMs);
    expect(r.hunter.reevalBlockedUntil).toBe(r.blockedUntil);
    expect(r.hunter.rank).toBe(0);
    expect(r.hunter.xp).toBe(40);
  });

  it('Re-despertar pula ranks e leva ao piso do novo rank', () => {
    const rng = seqRng([0]);
    const r = resolveReevaluation(atCapF(), b, rng, NOW);
    expect(r.kind).toBe('reawakening');
    if (r.kind === 'failure') throw new Error('esperava re-despertar');
    expect(r.toRank).toBe(b.reevaluation.reawakenJump);
    expect(r.hunter.level).toBe(rankFloor(r.toRank, b));
    expect(rng.remaining).toBe(0);
  });

  it('Re-despertar no Rank A para no S', () => {
    const r = resolveReevaluation(makeHunter({ rank: 5, level: levelCap(5, b) }), b, seqRng([0]), NOW);
    if (r.kind === 'failure') throw new Error('esperava re-despertar');
    expect(r.toRank).toBe(6);
    expect(r.hunter.rank).toBe(6);
  });
});
