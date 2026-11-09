import type { Hunter } from './types';

export function compareHunters(a: Hunter, b: Hunter): number {
  return b.rank - a.rank || b.level - a.level || b.xp - a.xp || a.rankReachedAt - b.rankReachedAt;
}

export function sortRanking(hunters: Hunter[]): Hunter[] {
  return [...hunters].sort(compareHunters);
}
