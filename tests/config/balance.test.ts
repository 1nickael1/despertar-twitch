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

  it('tem a seção raid com os valores aprovados', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.raid.bossHp).toEqual({ azul: 500, vermelho: 800, quebra: 1000 });
    expect(b.raid.battleMs / b.raid.roundMs).toBe(15);
    expect(b.raid.entryMs).toBe(60_000);
    expect(b.raid.tankInterceptChance).toBe(0.6);
  });

  it('recusa batalha que não é múltiplo da rodada', () => {
    const raw = rawBalance();
    raw.raid.roundMs = 7_000;
    expect(() => parseBalance(raw)).toThrow(/raid\.battleMs/);
  });

  it('recusa todos os pesos de portal zerados', () => {
    const raw = rawBalance();
    raw.raid.typeWeights = { azul: 0, vermelho: 0, quebra: 0 };
    expect(() => parseBalance(raw)).toThrow(/raid\.typeWeights/);
  });

  it('recusa multiplicadores de posição fora de ordem ou abaixo de 1', () => {
    const raw = rawBalance();
    raw.raid.placeMultipliers = [1.25, 2];
    expect(() => parseBalance(raw)).toThrow(/raid\.placeMultipliers/);
    raw.raid.placeMultipliers = [2, 0.5];
    expect(() => parseBalance(raw)).toThrow(/raid\.placeMultipliers/);
  });

  it('tem a seção equipment com os valores aprovados', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.equipment.weapon.names[0]).toBe('Lâmina Enferrujada');
    expect(b.equipment.weapon.forgedBonus[0]).toBe(2);
    expect(b.equipment.armor.forgedFactor[0]).toBe(0.7);
    expect(b.equipment.forge).toEqual({ fragments: 6, goldMultiplier: 2 });
  });

  it('recusa arma forjada que não é mais forte que a da loja', () => {
    const raw = rawBalance();
    raw.equipment.weapon.forgedBonus[3] = raw.equipment.weapon.commonBonus[3];
    expect(() => parseBalance(raw)).toThrow(/equipment\.weapon\.forgedBonus/);
  });

  it('recusa armadura forjada que não protege mais que a da loja', () => {
    const raw = rawBalance();
    raw.equipment.armor.forgedFactor[0] = 0.9;
    expect(() => parseBalance(raw)).toThrow(/equipment\.armor\.forgedFactor/);
  });

  it('recusa equipamento que uma vitória pagaria', () => {
    const raw = rawBalance();
    raw.equipment.weapon.priceMultiplier = 2;
    expect(() => parseBalance(raw)).toThrow(/equipment\.weapon\.priceMultiplier/);
  });

  it('tem a seção duel com os valores aprovados', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.duel.acceptMs).toBe(60_000);
    expect(b.duel.armorDefense.forjada).toBe(2);
    expect(b.duel.fairRankGap).toBe(1);
    expect(b.overlay).toEqual({ resultMs: 20_000, rankingSize: 5 });
  });

  it('recusa duelo sem rodada para vencer', () => {
    const raw = rawBalance();
    raw.duel.roundsToWin = 0;
    expect(() => parseBalance(raw)).toThrow(/duel\.roundsToWin/);
  });
});
