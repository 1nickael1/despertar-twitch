import type { ClassId, Hunter } from './types';

export function createHunter(
  userId: string,
  displayName: string,
  classId: ClassId,
  seasonId: number,
  now: number,
): Hunter {
  return {
    userId,
    displayName,
    classId,
    rank: 0,
    level: 1,
    xp: 0,
    gold: 0,
    rankReachedAt: now,
    lastHuntAt: null,
    injuredUntil: null,
    reevalBlockedUntil: null,
    equippedTitleId: null,
    weaponId: null,
    armorId: null,
    seasonId,
  };
}

export function resetForNewSeason(h: Hunter, seasonId: number, now: number): Hunter {
  return {
    ...h,
    rank: 0,
    level: 1,
    xp: 0,
    gold: 0,
    rankReachedAt: now,
    lastHuntAt: null,
    injuredUntil: null,
    reevalBlockedUntil: null,
    weaponId: null,
    armorId: null,
    seasonId,
  };
}

/** Jogou de verdade nesta temporada (não só digitou !despertar). */
export function hasProgress(h: Hunter): boolean {
  return h.rank > 0 || h.level > 1 || h.xp > 0;
}
