import type { Balance } from '../config/balance';
import type { Hunter } from './types';

export function xpToNext(level: number, b: Balance): number {
  return b.xpCurve.base + b.xpCurve.perLevel * level;
}

export function levelCap(rank: number, b: Balance): number {
  return b.levelCaps[rank];
}

/** Nível em que se entra num rank: teto do rank anterior (F começa no 1). */
export function rankFloor(rank: number, b: Balance): number {
  return rank === 0 ? 1 : b.levelCaps[rank - 1];
}

export function isAtCap(h: Hunter, b: Balance): boolean {
  return h.level >= levelCap(h.rank, b);
}

export interface XpResult {
  hunter: Hunter;
  levelsGained: number;
}

/** Soma XP e sobe níveis até o teto do rank; acima do teto o XP fica guardado. */
export function applyXp(h: Hunter, amount: number, b: Balance): XpResult {
  const cap = levelCap(h.rank, b);
  let level = h.level;
  let xp = h.xp + amount;
  let levelsGained = 0;
  while (level < cap && xp >= xpToNext(level, b)) {
    xp -= xpToNext(level, b);
    level++;
    levelsGained++;
  }
  return { hunter: { ...h, level, xp }, levelsGained };
}
