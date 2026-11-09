import type { Balance } from '../config/balance';
import { hasProgress, resetForNewSeason } from './hunter';
import { sortRanking } from './ranking';
import { MAX_RANK, type HallOfFameEntry, type Hunter, type Season, type Title } from './types';

const DAY_MS = 86_400_000;

export function newSeason(number: number, now: number, b: Balance): Omit<Season, 'id'> {
  return { number, startedAt: now, endsAt: now + b.season.durationDays * DAY_MS, closedAt: null };
}

export interface GrantedTitle {
  userId: string;
  title: Title;
}

export interface SeasonCloseResult {
  hallOfFame: HallOfFameEntry[];
  titles: GrantedTitle[];
  resetHunters: Hunter[];
}

export function closeSeason(
  hunters: Hunter[],
  season: Season,
  nextSeasonId: number,
  b: Balance,
  now: number,
): SeasonCloseResult {
  const ranked = sortRanking(hunters.filter((h) => h.seasonId === season.id && hasProgress(h)));

  const hallOfFame = ranked.slice(0, b.season.hallOfFameSize).map((h, i) => ({
    seasonId: season.id,
    position: i + 1,
    userId: h.userId,
    displayName: h.displayName,
    finalRank: h.rank,
    finalLevel: h.level,
  }));

  const grant = (userId: string, titleId: string, label: string): GrantedTitle => ({
    userId,
    title: { titleId, label, seasonId: season.id, earnedAt: now },
  });
  const n = season.number;
  const titles = [
    ...ranked.slice(0, 3).map((h, i) => grant(h.userId, `top${i + 1}-t${n}`, `Top ${i + 1} · T${n}`)),
    ...ranked.filter((h) => h.rank === MAX_RANK).map((h) => grant(h.userId, `rank-s-t${n}`, `Rank S · T${n}`)),
  ];

  const resetHunters = hunters.map((h) => resetForNewSeason(h, nextSeasonId, now));
  return { hallOfFame, titles, resetHunters };
}
