import type { Balance } from '../config/balance';
import { equipmentById, weaponBonus } from './equipment';
import { rollD20, type Rng } from './rng';
import { primaryStat } from './stats';
import type { Hunter } from './types';

/** A aposta só vale entre ranks próximos; com diferença maior o duelo é só pela honra. */
export function duelStake(a: Pick<Hunter, 'rank'>, c: Pick<Hunter, 'rank'>, bet: number, b: Balance): number {
  return Math.abs(a.rank - c.rank) <= b.duel.fairRankGap ? bet : 0;
}

/** No duelo a armadura vira defesa: comum +1, forjada +2 (balance.json). */
export function armorDefense(h: Pick<Hunter, 'armorId'>, b: Balance): number {
  const armor = h.armorId ? equipmentById(h.armorId, b) : null;
  return armor ? b.duel.armorDefense[armor.quality] : 0;
}

/** Poder sem o dado: atributo principal + arma + defesa da armadura. */
export function duelBase(h: Hunter, b: Balance): number {
  return primaryStat(h.classId, h.level, b) + weaponBonus(h, b) + armorDefense(h, b);
}

export interface DuelRound {
  challenger: number;
  target: number;
}

export interface DuelResult {
  /** Só as rodadas que contaram (empates são repetidos e não entram). */
  rounds: DuelRound[];
  challengerWins: number;
  targetWins: number;
  winner: 'challenger' | 'target';
}

/** Melhor de N (roundsToWin). Sorteios por rodada: d20 do desafiante, depois do desafiado. */
export function resolveDuel(challenger: Hunter, target: Hunter, b: Balance, rng: Rng): DuelResult {
  const baseC = duelBase(challenger, b);
  const baseT = duelBase(target, b);
  const rounds: DuelRound[] = [];
  let challengerWins = 0;
  let targetWins = 0;
  while (challengerWins < b.duel.roundsToWin && targetWins < b.duel.roundsToWin) {
    const c = baseC + rollD20(rng);
    const t = baseT + rollD20(rng);
    if (c === t) continue;
    rounds.push({ challenger: c, target: t });
    if (c > t) challengerWins++;
    else targetWins++;
  }
  return { rounds, challengerWins, targetWins, winner: challengerWins > targetWins ? 'challenger' : 'target' };
}

export function settleDuel(winner: Hunter, loser: Hunter, stake: number): { winner: Hunter; loser: Hunter } {
  return { winner: { ...winner, gold: winner.gold + stake }, loser: { ...loser, gold: loser.gold - stake } };
}
