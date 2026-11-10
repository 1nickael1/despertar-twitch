import type { Balance } from '../config/balance';
import { chance, type Rng } from './rng';
import { normalizeText } from './text';
import { RANKS, rankLetter, type EquipmentSlot, type Hunter, type PortalType, type RankLetter } from './types';

export type Quality = 'comum' | 'forjada';

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  rank: number;
  quality: Quality;
  label: string;
  /** Arma: bônus de poder. Armadura: fator da chance de lesão (caçada) e de cair (raid). */
  value: number;
}

type Owned = Record<string, number>;

const ID_PATTERN = /^(arma|armadura)-([fedcbas])-(comum|forjada)$/;
const FRAGMENT_PATTERN = /^frag-([fedcbas])$/;
const rankFromLetter = (letter: string) => RANKS.indexOf(letter.toUpperCase() as RankLetter);

export const equipmentId = (slot: EquipmentSlot, rank: number, quality: Quality) =>
  `${slot}-${rankLetter(rank).toLowerCase()}-${quality}`;
export const fragmentId = (rank: number) => `frag-${rankLetter(rank).toLowerCase()}`;

export function fragmentRank(itemId: string): number | null {
  const m = FRAGMENT_PATTERN.exec(itemId);
  return m ? rankFromLetter(m[1]) : null;
}

export function getEquipment(slot: EquipmentSlot, rank: number, quality: Quality, b: Balance): EquipmentItem {
  const forged = quality === 'forjada';
  const w = b.equipment.weapon;
  const a = b.equipment.armor;
  const value =
    slot === 'arma' ? (forged ? w.forgedBonus : w.commonBonus)[rank] : (forged ? a.forgedFactor : a.commonFactor)[rank];
  const name = (slot === 'arma' ? w : a).names[rank];
  return { id: equipmentId(slot, rank, quality), slot, rank, quality, label: forged ? `${name} ★` : name, value };
}

export function equipmentById(id: string, b: Balance): EquipmentItem | null {
  const m = ID_PATTERN.exec(id);
  return m ? getEquipment(m[1] as EquipmentSlot, rankFromLetter(m[2]), m[3] as Quality, b) : null;
}

export function weaponBonus(h: Pick<Hunter, 'weaponId'>, b: Balance): number {
  return h.weaponId ? (equipmentById(h.weaponId, b)?.value ?? 0) : 0;
}

export function armorFactor(h: Pick<Hunter, 'armorId'>, b: Balance): number {
  return h.armorId ? (equipmentById(h.armorId, b)?.value ?? 1) : 1;
}

export function canEquip(item: EquipmentItem, h: Pick<Hunter, 'rank'>): boolean {
  return item.rank <= h.rank;
}

/** Espaço vazio: qualquer item é melhor. Arma: bônus maior. Armadura: fator menor. */
export function isBetter(item: EquipmentItem, h: Pick<Hunter, 'weaponId' | 'armorId'>, b: Balance): boolean {
  const currentId = item.slot === 'arma' ? h.weaponId : h.armorId;
  const current = currentId ? equipmentById(currentId, b) : null;
  if (!current) return true;
  return item.slot === 'arma' ? item.value > current.value : item.value < current.value;
}

export function equip(h: Hunter, item: EquipmentItem): Hunter {
  return item.slot === 'arma' ? { ...h, weaponId: item.id } : { ...h, armorId: item.id };
}

export function equipmentPrice(slot: EquipmentSlot, rank: number, b: Balance): number {
  const mult = slot === 'arma' ? b.equipment.weapon.priceMultiplier : b.equipment.armor.priceMultiplier;
  return Math.ceil(mult * b.hunt.goldByRank[rank]);
}

export function forgeCost(rank: number, b: Balance): { fragments: number; gold: number } {
  return {
    fragments: b.equipment.forge.fragments,
    gold: Math.ceil(b.equipment.forge.goldMultiplier * b.hunt.goldByRank[rank]),
  };
}

export type BuyEquipmentResult =
  | { ok: true; hunter: Hunter; item: EquipmentItem; price: number; equipped: boolean }
  | { ok: false; reason: 'owned'; item: EquipmentItem }
  | { ok: false; reason: 'gold'; item: EquipmentItem; price: number };

/** A loja só vende o comum do rank atual. Equipa sozinho se for melhor. */
export function buyEquipment(h: Hunter, slot: EquipmentSlot, owned: Owned, b: Balance): BuyEquipmentResult {
  const item = getEquipment(slot, h.rank, 'comum', b);
  if ((owned[item.id] ?? 0) > 0) return { ok: false, reason: 'owned', item };
  const price = equipmentPrice(slot, h.rank, b);
  if (h.gold < price) return { ok: false, reason: 'gold', item, price };
  const paid: Hunter = { ...h, gold: h.gold - price };
  const equipped = isBetter(item, paid, b);
  return { ok: true, hunter: equipped ? equip(paid, item) : paid, item, price, equipped };
}

export type ForgeResult =
  | {
      ok: true;
      hunter: Hunter;
      item: EquipmentItem;
      cost: { fragments: number; gold: number };
      fragmentsLeft: number;
      equipped: boolean;
    }
  | { ok: false; reason: 'rank'; maxRank: number }
  | { ok: false; reason: 'owned'; item: EquipmentItem }
  | { ok: false; reason: 'fragments'; rank: number; have: number; need: number }
  | { ok: false; reason: 'gold'; have: number; need: number };

/** Forja do rank pedido (padrão: atual), que precisa ser ≤ rank do caçador. Equipa sozinho se for melhor. */
export function forgeEquipment(
  h: Hunter,
  slot: EquipmentSlot,
  rank: number | null,
  owned: Owned,
  b: Balance,
): ForgeResult {
  const r = rank ?? h.rank;
  if (r > h.rank) return { ok: false, reason: 'rank', maxRank: h.rank };
  const item = getEquipment(slot, r, 'forjada', b);
  if ((owned[item.id] ?? 0) > 0) return { ok: false, reason: 'owned', item };
  const cost = forgeCost(r, b);
  const have = owned[fragmentId(r)] ?? 0;
  if (have < cost.fragments) return { ok: false, reason: 'fragments', rank: r, have, need: cost.fragments };
  if (h.gold < cost.gold) return { ok: false, reason: 'gold', have: h.gold, need: cost.gold };
  const paid: Hunter = { ...h, gold: h.gold - cost.gold };
  const equipped = isBetter(item, paid, b);
  return {
    ok: true,
    hunter: equipped ? equip(paid, item) : paid,
    item,
    cost,
    fragmentsLeft: have - cost.fragments,
    equipped,
  };
}

const QUALITY_ORDER: Record<Quality, number> = { comum: 0, forjada: 1 };

/** Equipamentos possuídos em ordem fixa: é a numeração do !inventario e do !equipar <número>. */
export function ownedEquipment(owned: Owned, b: Balance): EquipmentItem[] {
  return Object.keys(owned)
    .filter((id) => (owned[id] ?? 0) > 0)
    .map((id) => equipmentById(id, b))
    .filter((i): i is EquipmentItem => i !== null)
    .sort(
      (x, y) =>
        (x.slot === y.slot ? 0 : x.slot === 'arma' ? -1 : 1) ||
        x.rank - y.rank ||
        QUALITY_ORDER[x.quality] - QUALITY_ORDER[y.quality],
    );
}

export function ownedFragments(owned: Owned): { rank: number; qty: number }[] {
  return Object.entries(owned)
    .map(([id, qty]) => ({ rank: fragmentRank(id), qty }))
    .filter((f): f is { rank: number; qty: number } => f.rank !== null && f.qty > 0)
    .sort((x, y) => x.rank - y.rank);
}

/**
 * `!equipar 2` (número do !inventario) ou palavras do nome, sem acento. "forjada"/"★" escolhem a
 * forjada, "comum" a da loja e uma letra sozinha é o rank ("couro f").
 */
export function findOwnedEquipment(query: string, owned: Owned, b: Balance): EquipmentItem | null {
  const list = ownedEquipment(owned, b);
  const q = normalizeText(query.trim());
  if (/^\d+$/.test(q)) return list[Number(q) - 1] ?? null;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return (
    list.find((item) => {
      const words = normalizeText(`${item.label} ${item.slot} ${item.quality} ${rankLetter(item.rank)}`).split(/\s+/);
      return tokens.every((t) => words.some((w) => (t.length === 1 ? w === t : w.startsWith(t))));
    }) ?? null
  );
}

export function rollFragmentDrop(rng: Rng, b: Balance): boolean {
  return chance(rng, b.equipment.fragmentDropChance);
}

export function raidFragmentsFor(type: PortalType, place: number, b: Balance): number {
  return b.equipment.raidFragments[type] + (place === 1 ? b.equipment.raidTopDamageBonusFragments : 0);
}
