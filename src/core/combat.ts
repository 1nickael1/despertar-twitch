import type { Balance } from '../config/balance';
import { applyXp } from './progression';
import { chance, pick, rollD20, type Rng } from './rng';
import { injuryChance, primaryStat } from './stats';
import { MAX_RANK, type Hunter } from './types';

export interface HuntOutcome {
  monsterName: string;
  monsterRank: number;
  playerRoll: number;
  playerPower: number;
  monsterPower: number;
  won: boolean;
  crit: boolean;
  xpGained: number;
  goldGained: number;
  injured: boolean;
  levelsGained: number;
  hunter: Hunter;
}

function rollMonsterRank(h: Hunter, b: Balance, rng: Rng): number {
  const r = rng.next();
  const c = b.hunt.monsterRankChances;
  const offset = r < c.lower ? -1 : r < c.lower + c.same ? 0 : 1;
  return Math.min(MAX_RANK, Math.max(0, h.rank + offset));
}

/**
 * Ordem dos sorteios: rank do monstro, nome, d20 do jogador, d20 do monstro,
 * e (só em derrota com chance > 0) lesão.
 */
export function resolveHunt(h: Hunter, b: Balance, rng: Rng, now: number): HuntOutcome {
  const cls = b.classes[h.classId];
  const monsterRank = rollMonsterRank(h, b, rng);
  const monsterName = pick(rng, b.monsters[monsterRank]);
  const playerRoll = rollD20(rng);
  const bonus = monsterRank > h.rank ? cls.bonusVsHigherRank : 0;
  const playerPower = primaryStat(h.classId, h.level, b) + bonus + playerRoll;
  const monsterPower = b.hunt.difficultyByRank[monsterRank] + rollD20(rng);
  const won = playerPower >= monsterPower;
  const base = { monsterName, monsterRank, playerRoll, playerPower, monsterPower };
  const hunted: Hunter = { ...h, lastHuntAt: now };

  if (won) {
    const crit = cls.critMin !== null && playerRoll >= cls.critMin;
    const mult = crit ? 2 : 1;
    const xpGained = b.hunt.xpByRank[monsterRank] * mult;
    const goldGained = b.hunt.goldByRank[monsterRank] * mult;
    const { hunter, levelsGained } = applyXp({ ...hunted, gold: hunted.gold + goldGained }, xpGained, b);
    return { ...base, won, crit, xpGained, goldGained, injured: false, levelsGained, hunter };
  }

  const xpGained = Math.floor(b.hunt.xpByRank[monsterRank] * cls.lossXpFraction);
  const p = injuryChance(h.classId, b);
  const injured = p > 0 && chance(rng, p);
  const afterLoss: Hunter = injured ? { ...hunted, injuredUntil: now + b.hunt.injuryMs } : hunted;
  const { hunter, levelsGained } = applyXp(afterLoss, xpGained, b);
  return { ...base, won, crit: false, xpGained, goldGained: 0, injured, levelsGained, hunter };
}
