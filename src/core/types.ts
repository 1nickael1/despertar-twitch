export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type RankLetter = (typeof RANKS)[number];
export const MAX_RANK = RANKS.length - 1;

export const CLASS_IDS = ['guerreiro', 'mago', 'assassino', 'curandeiro', 'tanque'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface Hunter {
  userId: string;
  displayName: string;
  classId: ClassId;
  rank: number;
  level: number;
  xp: number;
  gold: number;
  rankReachedAt: number;
  lastHuntAt: number | null;
  injuredUntil: number | null;
  reevalBlockedUntil: number | null;
  equippedTitleId: string | null;
  seasonId: number;
}

export interface Title {
  titleId: string;
  label: string;
  seasonId: number;
  earnedAt: number;
}

export interface Season {
  id: number;
  number: number;
  startedAt: number;
  endsAt: number;
  closedAt: number | null;
}

export interface HallOfFameEntry {
  seasonId: number;
  position: number;
  userId: string;
  displayName: string;
  finalRank: number;
  finalLevel: number;
}

export function rankLetter(rank: number): RankLetter {
  return RANKS[rank];
}

export const PORTAL_TYPES = ['azul', 'vermelho', 'quebra'] as const;
export type PortalType = (typeof PORTAL_TYPES)[number];

export function isPortalType(value: unknown): value is PortalType {
  return typeof value === 'string' && (PORTAL_TYPES as readonly string[]).includes(value);
}
