import { describe, expect, it } from 'vitest';
import {
  armorFactor,
  buyEquipment,
  canEquip,
  equip,
  equipmentById,
  equipmentPrice,
  findOwnedEquipment,
  forgeCost,
  forgeEquipment,
  fragmentId,
  fragmentRank,
  getEquipment,
  isBetter,
  ownedEquipment,
  ownedFragments,
  raidFragmentsFor,
  rollFragmentDrop,
  weaponBonus,
} from '../../src/core/equipment';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();

describe('equipamento: catálogo', () => {
  it('ids, nomes e valores por rank e qualidade', () => {
    expect(getEquipment('arma', 0, 'comum', b)).toEqual({
      id: 'arma-f-comum', slot: 'arma', rank: 0, quality: 'comum', label: 'Lâmina Enferrujada', value: 1,
    });
    expect(getEquipment('arma', 0, 'forjada', b)).toMatchObject({ id: 'arma-f-forjada', label: 'Lâmina Enferrujada ★', value: 2 });
    expect(getEquipment('armadura', 3, 'forjada', b)).toMatchObject({ id: 'armadura-c-forjada', label: 'Peitoral de Aço ★', value: 0.7 });
    expect(equipmentById('armadura-s-comum', b)).toMatchObject({ rank: 6, label: 'Manto do Monarca', value: 0.85 });
    expect(equipmentById('pocao', b)).toBeNull();
    expect(fragmentId(2)).toBe('frag-d');
    expect(fragmentRank('frag-d')).toBe(2);
    expect(fragmentRank('arma-f-comum')).toBeNull();
  });

  it('bônus da arma e fator da armadura do caçador', () => {
    expect(weaponBonus(makeHunter(), b)).toBe(0);
    expect(armorFactor(makeHunter(), b)).toBe(1);
    expect(weaponBonus(makeHunter({ weaponId: 'arma-f-forjada' }), b)).toBe(2);
    expect(armorFactor(makeHunter({ armorId: 'armadura-f-comum' }), b)).toBe(0.85);
  });

  it('equipar: rank do item ≤ rank do caçador; "melhor" por bônus ou fator', () => {
    const swordE = getEquipment('arma', 1, 'comum', b);
    expect(canEquip(swordE, makeHunter({ rank: 0 }))).toBe(false);
    expect(canEquip(swordE, makeHunter({ rank: 1 }))).toBe(true);
    const forged = getEquipment('arma', 0, 'forjada', b);
    expect(isBetter(forged, makeHunter(), b)).toBe(true);
    expect(isBetter(forged, makeHunter({ weaponId: 'arma-f-comum' }), b)).toBe(true);
    expect(isBetter(getEquipment('arma', 0, 'comum', b), makeHunter({ weaponId: 'arma-f-forjada' }), b)).toBe(false);
    expect(isBetter(getEquipment('armadura', 0, 'forjada', b), makeHunter({ armorId: 'armadura-f-comum' }), b)).toBe(true);
    expect(equip(makeHunter(), forged).weaponId).toBe('arma-f-forjada');
  });

  it('preços e custo da forja seguem o ouro do rank', () => {
    expect(equipmentPrice('arma', 0, b)).toBe(18);
    expect(equipmentPrice('armadura', 0, b)).toBe(15);
    expect(forgeCost(0, b)).toEqual({ fragments: 6, gold: 6 });
  });
});

describe('equipamento: loja e forja', () => {
  it('compra o comum do rank atual e equipa se for melhor', () => {
    const r = buyEquipment(makeHunter({ gold: 20 }), 'arma', {}, b);
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ price: 18, equipped: true, item: { id: 'arma-f-comum' } });
    expect(r.hunter).toMatchObject({ gold: 2, weaponId: 'arma-f-comum' });
    const keep = buyEquipment(makeHunter({ gold: 20, weaponId: 'arma-f-forjada' }), 'arma', {}, b);
    expect(keep.ok && keep.equipped).toBe(false);
    expect(keep.ok && keep.hunter.weaponId).toBe('arma-f-forjada');
  });

  it('compra recusa: já tem, falta ouro', () => {
    expect(buyEquipment(makeHunter({ gold: 99 }), 'arma', { 'arma-f-comum': 1 }, b)).toMatchObject({ ok: false, reason: 'owned' });
    expect(buyEquipment(makeHunter({ gold: 5 }), 'armadura', {}, b)).toMatchObject({ ok: false, reason: 'gold', price: 15 });
  });

  it('forja o rank atual por padrão, gasta fragmentos e ouro, equipa', () => {
    const r = forgeEquipment(makeHunter({ gold: 10 }), 'arma', null, { 'frag-f': 7 }, b);
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ item: { id: 'arma-f-forjada' }, fragmentsLeft: 1, cost: { fragments: 6, gold: 6 }, equipped: true });
    expect(r.hunter).toMatchObject({ gold: 4, weaponId: 'arma-f-forjada' });
  });

  it('forja rank menor quando pedido; recusa rank acima, já tem, fragmentos e ouro', () => {
    const rankE = makeHunter({ rank: 1, gold: 50 });
    const low = forgeEquipment(rankE, 'armadura', 0, { 'frag-f': 6 }, b);
    expect(low.ok && low.item.id).toBe('armadura-f-forjada');
    expect(forgeEquipment(makeHunter(), 'arma', 1, { 'frag-e': 9 }, b)).toEqual({ ok: false, reason: 'rank', maxRank: 0 });
    expect(forgeEquipment(makeHunter({ gold: 50 }), 'arma', null, { 'frag-f': 9, 'arma-f-forjada': 1 }, b)).toMatchObject({
      ok: false,
      reason: 'owned',
    });
    expect(forgeEquipment(makeHunter({ gold: 50 }), 'arma', null, { 'frag-f': 2 }, b)).toEqual({
      ok: false, reason: 'fragments', rank: 0, have: 2, need: 6,
    });
    expect(forgeEquipment(makeHunter({ gold: 1 }), 'arma', null, { 'frag-f': 6 }, b)).toEqual({ ok: false, reason: 'gold', have: 1, need: 6 });
  });
});

describe('equipamento: inventário', () => {
  const owned = { 'armadura-f-comum': 1, 'arma-f-forjada': 1, 'arma-f-comum': 1, 'frag-e': 1, 'frag-f': 4, pocao: 2 };

  it('lista equipamentos em ordem fixa e fragmentos por rank', () => {
    expect(ownedEquipment(owned, b).map((i) => i.id)).toEqual(['arma-f-comum', 'arma-f-forjada', 'armadura-f-comum']);
    expect(ownedFragments(owned)).toEqual([{ rank: 0, qty: 4 }, { rank: 1, qty: 1 }]);
  });

  it('acha por número, nome sem acento, "forjada" ou "★" e letra do rank', () => {
    expect(findOwnedEquipment('2', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('lamina', owned, b)?.id).toBe('arma-f-comum');
    expect(findOwnedEquipment('Lâmina forjada', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('★', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('couro f', owned, b)?.id).toBe('armadura-f-comum');
    expect(findOwnedEquipment('9', owned, b)).toBeNull();
    expect(findOwnedEquipment('espada', owned, b)).toBeNull();
  });
});

describe('equipamento: fragmentos', () => {
  it('drop da caçada pela chance; raid por tipo com bônus do 1º', () => {
    expect(rollFragmentDrop(seqRng([0.49]), b)).toBe(true);
    expect(rollFragmentDrop(seqRng([0.5]), b)).toBe(false);
    expect(raidFragmentsFor('azul', 1, b)).toBe(2);
    expect(raidFragmentsFor('azul', 2, b)).toBe(1);
    expect(raidFragmentsFor('vermelho', 3, b)).toBe(2);
    expect(raidFragmentsFor('quebra', 1, b)).toBe(4);
  });
});
