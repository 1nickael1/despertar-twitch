import { describe, expect, it } from 'vitest';
import { armorDefense, duelBase, duelStake, resolveDuel, settleDuel } from '../../src/core/duel';
import { d20, makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const warrior = makeHunter({ userId: 'a', displayName: 'ana' }); // Guerreiro F1: base 8
const mage = makeHunter({ userId: 'b', displayName: 'bia', classId: 'mago' }); // Mago F1: base 7

describe('duelo', () => {
  it('aposta vale com até 1 rank de diferença; com 2+ vira 0', () => {
    expect(duelStake({ rank: 0 }, { rank: 0 }, 20, b)).toBe(20);
    expect(duelStake({ rank: 2 }, { rank: 1 }, 20, b)).toBe(20);
    expect(duelStake({ rank: 3 }, { rank: 1 }, 20, b)).toBe(0);
  });

  it('defesa da armadura pela qualidade; base soma atributo, arma e defesa', () => {
    expect(armorDefense(makeHunter(), b)).toBe(0);
    expect(armorDefense(makeHunter({ armorId: 'armadura-f-comum' }), b)).toBe(1);
    expect(armorDefense(makeHunter({ armorId: 'armadura-f-forjada' }), b)).toBe(2);
    expect(duelBase(makeHunter({ weaponId: 'arma-f-forjada', armorId: 'armadura-f-forjada' }), b)).toBe(12);
  });

  it('melhor de 3: 2×0 para o desafiante', () => {
    const rng = seqRng([d20(10), d20(1), d20(10), d20(1)]);
    const r = resolveDuel(warrior, mage, b, rng);
    expect(r).toEqual({
      rounds: [{ challenger: 18, target: 8 }, { challenger: 18, target: 8 }],
      challengerWins: 2,
      targetWins: 0,
      winner: 'challenger',
    });
    expect(rng.remaining).toBe(0);
  });

  it('empate repete a rodada; 2×1', () => {
    // 13 × 13 (empate, descartada) · 9 × 27 · 28 × 8 · 28 × 8
    const rng = seqRng([d20(5), d20(6), d20(1), d20(20), d20(20), d20(1), d20(20), d20(1)]);
    const r = resolveDuel(warrior, mage, b, rng);
    expect(r.rounds).toEqual([{ challenger: 9, target: 27 }, { challenger: 28, target: 8 }, { challenger: 28, target: 8 }]);
    expect(r).toMatchObject({ challengerWins: 2, targetWins: 1, winner: 'challenger' });
    expect(rng.remaining).toBe(0);
  });

  it('o perdedor paga a aposta ao vencedor', () => {
    const s = settleDuel(makeHunter({ gold: 30 }), makeHunter({ userId: 'x', gold: 25 }), 20);
    expect(s.winner.gold).toBe(50);
    expect(s.loser.gold).toBe(5);
  });
});
