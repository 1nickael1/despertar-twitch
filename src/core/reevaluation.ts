import type { Balance } from '../config/balance';
import { applyXp, rankFloor } from './progression';
import { chance, type Rng } from './rng';
import { MAX_RANK, type Hunter } from './types';

export type ReevalOutcome =
  | { kind: 'success' | 'reawakening'; hunter: Hunter; fromRank: number; toRank: number }
  | { kind: 'failure'; hunter: Hunter; blockedUntil: number };

function promote(h: Hunter, toRank: number, now: number, b: Balance): Hunter {
  const level = Math.max(h.level, rankFloor(toRank, b));
  const promoted: Hunter = { ...h, rank: toRank, level, rankReachedAt: now, reevalBlockedUntil: null };
  return applyXp(promoted, 0, b).hunter;
}

/** Pré-condição: caçador no teto do rank e abaixo de S. */
export function resolveReevaluation(h: Hunter, b: Balance, rng: Rng, now: number): ReevalOutcome {
  const fromRank = h.rank;
  if (chance(rng, b.reevaluation.reawakenChance)) {
    const toRank = Math.min(MAX_RANK, h.rank + b.reevaluation.reawakenJump);
    return { kind: 'reawakening', hunter: promote(h, toRank, now, b), fromRank, toRank };
  }
  if (chance(rng, b.reevaluation.successChance)) {
    const toRank = h.rank + 1;
    return { kind: 'success', hunter: promote(h, toRank, now, b), fromRank, toRank };
  }
  const blockedUntil = now + b.reevaluation.failBlockMs;
  return { kind: 'failure', hunter: { ...h, reevalBlockedUntil: blockedUntil }, blockedUntil };
}
