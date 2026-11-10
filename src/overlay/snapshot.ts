import type { Balance } from '../config/balance';
import type { RoundReport } from '../core/raid';
import { sortRanking } from '../core/ranking';
import { rankLetter, type ClassId, type PortalType, type RankLetter } from '../core/types';
import type { GameRepository } from '../data/repository';
import type { GameService, RaidOutcome } from '../game/game-service';

/** Tudo o que o painel do overlay precisa para se desenhar. A página não guarda estado próprio. */
export interface OverlaySnapshot {
  /** A página corrige o próprio relógio por esta diferença (vale também para o relógio adiantado da tela de teste). */
  serverNow: number;
  paused: boolean;
  season: number;
  nextPortalAt: number | null;
  ranking: { name: string; classId: ClassId; rank: RankLetter; level: number; xp: number }[];
  raid: null | {
    type: PortalType;
    bossName: string;
    hp: number;
    maxHp: number;
    phase: 'entrada' | 'batalha';
    battleStartsAt: number;
    round: number;
    totalRounds: number;
    nextRoundAt: number | null;
    participants: { name: string; classId: ClassId; damage: number; down: boolean }[];
    lastRound: RoundReport | null;
  };
  result: null | {
    type: PortalType;
    bossName: string;
    outcome: RaidOutcome;
    hp: number;
    maxHp: number;
    podium: { name: string; classId: ClassId; damage: number; xp: number; gold: number }[];
    fragmentsEach: number;
    fragmentsTop: number;
    until: number;
  };
}

export function buildOverlaySnapshot(game: GameService, repo: GameRepository, b: Balance, now: number): OverlaySnapshot {
  const season = repo.getCurrentSeason();
  const ranked = season ? sortRanking(repo.listHunters().filter((h) => h.seasonId === season.id)) : [];
  const raid = game.currentRaid;
  const ending = game.lastRaidEnding;
  const showEnding = !raid && ending !== null && now < ending.endedAt + b.overlay.resultMs;

  return {
    serverNow: now,
    paused: game.isPaused,
    season: season?.number ?? 0,
    nextPortalAt: game.nextPortalAt,
    ranking: ranked.slice(0, b.overlay.rankingSize).map((h) => ({
      name: h.displayName,
      classId: h.classId,
      rank: rankLetter(h.rank),
      level: h.level,
      xp: h.xp,
    })),
    raid: raid && {
      type: raid.type,
      bossName: raid.bossName,
      hp: raid.hp,
      maxHp: raid.maxHp,
      phase: raid.started ? 'batalha' : 'entrada',
      battleStartsAt: raid.battleStartsAt,
      round: raid.round,
      totalRounds: raid.totalRounds,
      nextRoundAt:
        raid.started && raid.round < raid.totalRounds ? raid.battleStartsAt + (raid.round + 1) * b.raid.roundMs : null,
      participants: raid.participants.map((p) => ({ name: p.displayName, classId: p.classId, damage: p.damage, down: p.down })),
      lastRound: game.lastRaidRound,
    },
    result: showEnding
      ? {
          type: ending.type,
          bossName: ending.bossName,
          outcome: ending.outcome,
          hp: ending.hp,
          maxHp: ending.maxHp,
          podium: ending.outcome === 'vitoria'
            ? ending.rewards.slice(0, 3).map((r) => ({
                name: r.displayName,
                classId: ending.participants.find((p) => p.userId === r.userId)?.classId ?? 'guerreiro',
                damage: r.damage,
                xp: r.xp,
                gold: r.gold,
              }))
            : [],
          fragmentsEach: ending.rewards[1]?.fragments ?? ending.rewards[0]?.fragments ?? 0,
          fragmentsTop: ending.rewards[0]?.fragments ?? 0,
          until: ending.endedAt + b.overlay.resultMs,
        }
      : null,
  };
}
