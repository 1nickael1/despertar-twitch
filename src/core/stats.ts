import type { Balance } from '../config/balance';
import type { ClassId } from './types';

export function primaryStat(classId: ClassId, level: number, b: Balance): number {
  const c = b.classes[classId];
  return Math.floor(c.base + c.growth * (level - 1));
}

export function injuryChance(classId: ClassId, b: Balance): number {
  const c = b.classes[classId];
  if (c.injuryImmune) return 0;
  if (c.fixedInjuryChance !== null) return c.fixedInjuryChance;
  return Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit);
}
