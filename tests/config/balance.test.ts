import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_PATH, loadBalance, parseBalance } from '../../src/config/balance';
import { CLASS_IDS } from '../../src/core/types';

const rawBalance = () => JSON.parse(readFileSync(BALANCE_PATH, 'utf8'));

describe('balance', () => {
  it('carrega o balance.json do projeto', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.levelCaps).toHaveLength(7);
    expect(b.monsters).toHaveLength(7);
    expect(Object.keys(b.classes)).toEqual([...CLASS_IDS]);
  });

  it('rejeita config inválida apontando o campo', () => {
    const raw = rawBalance();
    raw.levelCaps = [5, 10];
    expect(() => parseBalance(raw)).toThrow(/levelCaps/);
  });

  it('rejeita chances de monstro que não somam 1', () => {
    const raw = rawBalance();
    raw.hunt.monsterRankChances.same = 0.5;
    expect(() => parseBalance(raw)).toThrow(/monsterRankChances/);
  });

  it('tem a loja com a Poção de Cura', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.shop.items.pocao.label).toBe('Poção de Cura');
    expect(b.shop.maxPerPurchase).toBeGreaterThanOrEqual(1);
  });

  it('recusa preço que uma vitória (mesmo crítica) pagaria', () => {
    const raw = rawBalance();
    raw.shop.items.pocao.priceMultiplier = 2;
    expect(() => parseBalance(raw)).toThrow(/shop\.items\.pocao\.priceMultiplier/);
  });

  it('sem nenhuma classe com crítico, basta passar de 1', () => {
    const raw = rawBalance();
    for (const c of Object.values(raw.classes) as { critMin: number | null }[]) c.critMin = null;
    raw.shop.items.pocao.priceMultiplier = 1.5;
    expect(() => parseBalance(raw)).not.toThrow();
  });
});
