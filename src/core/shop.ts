import type { Balance } from '../config/balance';
import { normalizeText } from './text';
import type { Hunter } from './types';

export type ItemId = keyof Balance['shop']['items'];

export function itemIds(b: Balance): ItemId[] {
  return Object.keys(b.shop.items) as ItemId[];
}

/** Aceita o id ("pocao") ou o nome ("Poção de Cura"), com ou sem acento. */
export function findItem(query: string, b: Balance): ItemId | null {
  const q = normalizeText(query.trim());
  if (!q) return null;
  return itemIds(b).find((id) => id === q || normalizeText(b.shop.items[id].label) === q) ?? null;
}

export function itemPrice(itemId: ItemId, rank: number, b: Balance): number {
  return Math.ceil(b.shop.items[itemId].priceMultiplier * b.hunt.goldByRank[rank]);
}

export type BuyResult =
  | { ok: true; hunter: Hunter; total: number }
  | { ok: false; reason: 'qty'; max: number }
  | { ok: false; reason: 'gold'; total: number };

export function buyItem(h: Hunter, itemId: ItemId, qty: number, b: Balance): BuyResult {
  const max = b.shop.maxPerPurchase;
  if (!Number.isInteger(qty) || qty < 1 || qty > max) return { ok: false, reason: 'qty', max };
  const total = itemPrice(itemId, h.rank, b) * qty;
  if (h.gold < total) return { ok: false, reason: 'gold', total };
  return { ok: true, hunter: { ...h, gold: h.gold - total }, total };
}

export function hasActiveWaits(h: Hunter, now: number, b: Balance): boolean {
  return (
    (h.lastHuntAt !== null && h.lastHuntAt + b.hunt.cooldownMs > now) ||
    (h.injuredUntil !== null && h.injuredUntil > now) ||
    (h.reevalBlockedUntil !== null && h.reevalBlockedUntil > now)
  );
}

/** Poção de Cura: zera as três esperas. Sem espera ativa, nada muda (a poção não deve ser gasta). */
export function healHunter(h: Hunter, now: number, b: Balance): { healed: boolean; hunter: Hunter } {
  if (!hasActiveWaits(h, now, b)) return { healed: false, hunter: h };
  return { healed: true, hunter: { ...h, lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null } };
}
