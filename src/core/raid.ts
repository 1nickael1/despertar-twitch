import type { Balance } from '../config/balance';
import type { Rng } from './rng';
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
