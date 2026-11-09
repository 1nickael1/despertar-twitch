import { describe, expect, it } from 'vitest';
import { maxWinGoldMultiplier } from '../../src/config/balance';
import { buyItem, findItem, healHunter, itemPrice } from '../../src/core/shop';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();
const NOW = 100_000;

describe('loja', () => {
  it('acha o item pelo id ou pelo nome, com ou sem acento', () => {
    expect(findItem('pocao', b)).toBe('pocao');
    expect(findItem('POÇÃO', b)).toBe('pocao');
    expect(findItem('poção de cura', b)).toBe('pocao');
    expect(findItem('espada', b)).toBeNull();
    expect(findItem('', b)).toBeNull();
  });

  it('preço acompanha o rank', () => {
    const m = b.shop.items.pocao.priceMultiplier;
    expect(itemPrice('pocao', 0, b)).toBe(Math.ceil(m * b.hunt.goldByRank[0]));
    expect(itemPrice('pocao', 6, b)).toBe(Math.ceil(m * b.hunt.goldByRank[6]));
  });

  it('nenhuma vitória, nem crítica, paga uma poção em nenhum rank', () => {
    const maxWin = maxWinGoldMultiplier(b);
    b.hunt.goldByRank.forEach((gold, rank) => {
      expect(itemPrice('pocao', rank, b)).toBeGreaterThan(gold * maxWin);
    });
  });

  it('compra desconta o ouro', () => {
    const price = itemPrice('pocao', 0, b);
    const r = buyItem(makeHunter({ gold: price * 3 + 1 }), 'pocao', 3, b);
    expect(r).toMatchObject({ ok: true, total: price * 3 });
    if (r.ok) expect(r.hunter.gold).toBe(1);
  });

  it('recusa sem ouro suficiente', () => {
    const price = itemPrice('pocao', 0, b);
    expect(buyItem(makeHunter({ gold: price - 1 }), 'pocao', 1, b)).toEqual({ ok: false, reason: 'gold', total: price });
  });

  it.each([0, -1, 1.5, 999])('recusa quantidade %s', (qty) => {
    expect(buyItem(makeHunter({ gold: 1_000_000 }), 'pocao', qty, b)).toEqual({
      ok: false, reason: 'qty', max: b.shop.maxPerPurchase,
    });
  });

  it('cura zera descanso, lesão e bloqueio da reavaliação', () => {
    const h = makeHunter({ lastHuntAt: NOW, injuredUntil: NOW + 1000, reevalBlockedUntil: NOW + 1000 });
    const r = healHunter(h, NOW, b);
    expect(r.healed).toBe(true);
    expect(r.hunter).toMatchObject({ lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null });
  });

  it.each([
    ['descanso', { lastHuntAt: NOW }],
    ['lesão', { injuredUntil: NOW + 1 }],
    ['reavaliação', { reevalBlockedUntil: NOW + 1 }],
  ])('qualquer espera ativa conta (%s)', (_name, waits) => {
    expect(healHunter(makeHunter(waits), NOW, b).healed).toBe(true);
  });

  it('sem nenhuma espera ativa, não cura', () => {
    const h = makeHunter({ lastHuntAt: NOW - b.hunt.cooldownMs, injuredUntil: NOW - 1, reevalBlockedUntil: NOW });
    const r = healHunter(h, NOW, b);
    expect(r.healed).toBe(false);
    expect(r.hunter).toBe(h);
  });
});
