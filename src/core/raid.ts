import type { Balance } from '../config/balance';
import { chance, pick, rollD20, type Rng } from './rng';
import { applyXp } from './progression';
import { injuryChance, primaryStat } from './stats';
import { PORTAL_TYPES, type ClassId, type Hunter, type PortalType } from './types';

export interface RaidParticipant {
  userId: string;
  displayName: string;
  classId: ClassId;
  /** Rank e nível na hora de entrar: base do dano e da recompensa. */
  rank: number;
  level: number;
  /** Dano total causado nesta raid (placar do ranking). */
  damage: number;
  down: boolean;
  /** Rodada em que caiu: o Curandeiro levanta quem caiu primeiro. */
  downSinceRound: number | null;
  /** Usou !atacar na rodada atual. */
  attacked: boolean;
}

export interface Raid {
  type: PortalType;
  bossName: string;
  maxHp: number;
  hp: number;
  openedAt: number;
  battleStartsAt: number;
  /** A entrada fechou e a batalha foi anunciada. */
  started: boolean;
  /** Rodadas já resolvidas. */
  round: number;
  totalRounds: number;
  /** Em ordem de entrada. */
  participants: RaidParticipant[];
}

export function rollPortalType(b: Balance, rng: Rng): PortalType {
  const w = b.raid.typeWeights;
  const enabled = PORTAL_TYPES.filter((t) => w[t] > 0);
  let r = rng.next() * enabled.reduce((sum, t) => sum + w[t], 0);
  for (const t of enabled) {
    if (r < w[t]) return t;
    r -= w[t];
  }
  return enabled[enabled.length - 1];
}

export function openRaid(type: PortalType, bossName: string, now: number, b: Balance): Raid {
  const hp = b.raid.bossHp[type];
  return {
    type,
    bossName,
    maxHp: hp,
    hp,
    openedAt: now,
    battleStartsAt: now + b.raid.entryMs,
    started: false,
    round: 0,
    totalRounds: b.raid.battleMs / b.raid.roundMs,
    participants: [],
  };
}

export type JoinResult = { ok: true; raid: Raid } | { ok: false; reason: 'closed' | 'already' | 'injured' };

export function joinRaid(raid: Raid, h: Hunter, now: number): JoinResult {
  if (raid.started || now >= raid.battleStartsAt) return { ok: false, reason: 'closed' };
  if (raid.participants.some((p) => p.userId === h.userId)) return { ok: false, reason: 'already' };
  if (h.injuredUntil !== null && h.injuredUntil > now) return { ok: false, reason: 'injured' };
  const p: RaidParticipant = {
    userId: h.userId,
    displayName: h.displayName,
    classId: h.classId,
    rank: h.rank,
    level: h.level,
    damage: 0,
    down: false,
    downSinceRound: null,
    attacked: false,
  };
  return { ok: true, raid: { ...raid, participants: [...raid.participants, p] } };
}

function patchParticipant(raid: Raid, userId: string, patch: Partial<RaidParticipant>): Raid {
  return { ...raid, participants: raid.participants.map((p) => (p.userId === userId ? { ...p, ...patch } : p)) };
}

export type AttackResult =
  | { ok: true; raid: Raid }
  | { ok: false; reason: 'not-in-raid' | 'not-started' | 'down' | 'already' };

export function markAttack(raid: Raid, userId: string): AttackResult {
  const p = raid.participants.find((x) => x.userId === userId);
  if (!p) return { ok: false, reason: 'not-in-raid' };
  if (!raid.started) return { ok: false, reason: 'not-started' };
  if (p.down) return { ok: false, reason: 'down' };
  if (p.attacked) return { ok: false, reason: 'already' };
  return { ok: true, raid: patchParticipant(raid, userId, { attacked: true }) };
}

/** Poção de Cura na batalha: só quem está caído levanta. */
export function reviveWithPotion(raid: Raid, userId: string): Raid | null {
  const p = raid.participants.find((x) => x.userId === userId);
  if (!p || !p.down) return null;
  return patchParticipant(raid, userId, { down: false, downSinceRound: null });
}

/** Chance de cair com o golpe do boss. O Curandeiro, imune a lesão nas caçadas, usa a fórmula base. */
export function knockdownChance(classId: ClassId, b: Balance): number {
  const c = b.classes[classId];
  const base = c.injuryImmune
    ? Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit)
    : injuryChance(classId, b);
  return base * b.raid.knockdownFactor;
}

/** Dano de um golpe: atributo + d20; Guerreiro +2 (boss conta como mais forte); crítico ×2; !atacar +50%. */
export function raidDamage(
  p: Pick<RaidParticipant, 'classId' | 'level' | 'attacked'>,
  roll: number,
  b: Balance,
): { damage: number; crit: boolean } {
  const cls = b.classes[p.classId];
  const crit = cls.critMin !== null && roll >= cls.critMin;
  let damage = primaryStat(p.classId, p.level, b) + cls.bonusVsHigherRank + roll;
  if (crit) damage *= 2;
  if (p.attacked) damage = Math.floor(damage * (1 + b.raid.attackBonus));
  return { damage, crit };
}

export interface RoundReport {
  round: number;
  totalRounds: number;
  groupDamage: number;
  /** Quantos usaram !atacar nesta rodada (e estavam de pé). */
  attackers: number;
  crits: string[];
  hp: number;
  maxHp: number;
  won: boolean;
  /** Golpe do boss; null na vitória ou se ninguém estava de pé. */
  bossHit: { name: string; fell: boolean; tank: boolean } | null;
  revived: { healer: string; target: string }[];
}

/**
 * Uma rodada. Sorteios, na ordem: d20 de cada participante de pé (ordem de entrada),
 * alvo do boss (só com mais de um candidato) e chance de cair. Na vitória o boss não revida.
 */
export function resolveRound(raid: Raid, b: Balance, rng: Rng): { raid: Raid; report: RoundReport } {
  const round = raid.round + 1;
  let groupDamage = 0;
  let attackers = 0;
  const crits: string[] = [];
  // Cópias novas: mudar `target`/`fallen` abaixo não altera a raid de entrada.
  const parts = raid.participants.map((p) => {
    if (p.down) return { ...p, attacked: false };
    const { damage, crit } = raidDamage(p, rollD20(rng), b);
    groupDamage += damage;
    if (p.attacked) attackers++;
    if (crit) crits.push(p.displayName);
    return { ...p, damage: p.damage + damage, attacked: false };
  });
  const hp = Math.max(0, raid.hp - groupDamage);
  const won = hp === 0;
  let bossHit: RoundReport['bossHit'] = null;
  const revived: RoundReport['revived'] = [];

  if (!won) {
    const standing = parts.filter((p) => !p.down);
    if (standing.length > 0) {
      const tanks = standing.filter((p) => p.classId === 'tanque');
      const pool = tanks.length > 0 ? tanks : standing;
      const target = pool.length === 1 ? pool[0] : pick(rng, pool);
      const fell = chance(rng, knockdownChance(target.classId, b));
      if (fell) {
        target.down = true;
        target.downSinceRound = round;
      }
      bossHit = { name: target.displayName, fell, tank: target.classId === 'tanque' };
    }
    // Cada Curandeiro de pé levanta o caído mais antigo (sort estável: empate fica na ordem de entrada).
    for (const healer of parts.filter((p) => !p.down && p.classId === 'curandeiro')) {
      const fallen = parts.filter((p) => p.down).sort((x, y) => x.downSinceRound! - y.downSinceRound!)[0];
      if (!fallen) break;
      fallen.down = false;
      fallen.downSinceRound = null;
      revived.push({ healer: healer.displayName, target: fallen.displayName });
    }
  }

  return {
    raid: { ...raid, hp, round, participants: parts },
    report: { round, totalRounds: raid.totalRounds, groupDamage, attackers, crits, hp, maxHp: raid.maxHp, won, bossHit, revived },
  };
}

/** Ranking de dano: maior primeiro; empate fica na ordem de entrada (sort estável). */
export function rankDamage(raid: Raid): RaidParticipant[] {
  return [...raid.participants].sort((x, y) => y.damage - x.damage);
}

export interface RaidReward {
  userId: string;
  displayName: string;
  /** Posição no ranking de dano, a partir de 1. */
  place: number;
  damage: number;
  xp: number;
  gold: number;
  /** Portal vermelho: quem terminou caído perde XP. */
  xpLoss: number;
}

/** Recompensa = caçada do rank do jogador × tipo × posição. Derrota não paga. */
export function raidRewards(raid: Raid, won: boolean, b: Balance): RaidReward[] {
  const r = b.raid;
  return rankDamage(raid).map((p, i) => {
    const mult = won ? r.rewardMultiplier[raid.type] * (r.placeMultipliers[i] ?? 1) : 0;
    const xpLoss = raid.type === 'vermelho' && p.down ? Math.floor(r.redFallXpHunts * b.hunt.xpByRank[p.rank]) : 0;
    return {
      userId: p.userId,
      displayName: p.displayName,
      place: i + 1,
      damage: p.damage,
      xp: Math.floor(b.hunt.xpByRank[p.rank] * mult),
      gold: Math.floor(b.hunt.goldByRank[p.rank] * mult),
      xpLoss,
    };
  });
}

/** Aplica ouro e XP líquido. XP negativo sai do XP atual, sem nunca descer de nível. */
export function applyRaidReward(
  h: Hunter,
  reward: Pick<RaidReward, 'xp' | 'gold' | 'xpLoss'>,
  b: Balance,
): { hunter: Hunter; levelsGained: number } {
  const withGold: Hunter = { ...h, gold: h.gold + reward.gold };
  const net = reward.xp - reward.xpLoss;
  if (net >= 0) return applyXp(withGold, net, b);
  return { hunter: { ...withGold, xp: Math.max(0, withGold.xp + net) }, levelsGained: 0 };
}

/** Quebra de portal: lesão para todos, mantendo a que terminar mais tarde. */
export function breakPenalty(h: Hunter, now: number, b: Balance): Hunter {
  return { ...h, injuredUntil: Math.max(h.injuredUntil ?? 0, now + b.raid.breakInjuryMs) };
}
