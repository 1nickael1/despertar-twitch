import { describe, expect, it } from 'vitest';
import { resolveHunt } from '../../src/core/combat';
import { xpToNext } from '../../src/core/progression';
import { primaryStat } from '../../src/core/stats';
import { d20, makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const NOW = 10_000;
const SAME_RANK = 0.5;
const LOWER_RANK = 0;
const HIGHER_RANK = 0.99;

describe('resolveHunt', () => {
  it('vitória: XP e ouro do rank do monstro, marca a caçada', () => {
    const rng = seqRng([SAME_RANK, 0, d20(20), d20(1)]);
    const o = resolveHunt(makeHunter(), b, rng, NOW);
    expect(o.won).toBe(true);
    expect(o.monsterRank).toBe(0);
    expect(o.monsterName).toBe(b.monsters[0][0]);
    expect(o.xpGained).toBe(b.hunt.xpByRank[0]);
    expect(o.goldGained).toBe(b.hunt.goldByRank[0]);
    expect(o.hunter.xp).toBe(b.hunt.xpByRank[0]);
    expect(o.hunter.gold).toBe(b.hunt.goldByRank[0]);
    expect(o.hunter.lastHuntAt).toBe(NOW);
    expect(o.injured).toBe(false);
    expect(rng.remaining).toBe(0);
  });

  it('derrota com lesão', () => {
    const rng = seqRng([SAME_RANK, 0, d20(1), d20(20), 0]);
    const o = resolveHunt(makeHunter(), b, rng, NOW);
    expect(o.won).toBe(false);
    expect(o.xpGained).toBe(0);
    expect(o.injured).toBe(true);
    expect(o.hunter.injuredUntil).toBe(NOW + b.hunt.injuryMs);
  });

  it('derrota sem lesão', () => {
    const o = resolveHunt(makeHunter(), b, seqRng([SAME_RANK, 0, d20(1), d20(20), 0.99]), NOW);
    expect(o.won).toBe(false);
    expect(o.injured).toBe(false);
    expect(o.hunter.injuredUntil).toBeNull();
  });

  it('Curandeiro: derrota dá XP parcial e não sorteia lesão', () => {
    const rng = seqRng([SAME_RANK, 0, d20(1), d20(20)]);
    const o = resolveHunt(makeHunter({ classId: 'curandeiro' }), b, rng, NOW);
    expect(o.won).toBe(false);
    expect(o.injured).toBe(false);
    expect(o.xpGained).toBe(Math.floor(b.hunt.xpByRank[0] * b.classes.curandeiro.lossXpFraction));
  });

  it('Assassino: crítico dobra XP e ouro', () => {
    const critMin = b.classes.assassino.critMin!;
    const o = resolveHunt(makeHunter({ classId: 'assassino' }), b, seqRng([SAME_RANK, 0, d20(critMin), d20(1)]), NOW);
    expect(o.won).toBe(true);
    expect(o.crit).toBe(true);
    expect(o.xpGained).toBe(b.hunt.xpByRank[0] * 2);
    expect(o.goldGained).toBe(b.hunt.goldByRank[0] * 2);
  });

  it('Assassino: abaixo da faixa de crítico não critica', () => {
    const critMin = b.classes.assassino.critMin!;
    const o = resolveHunt(makeHunter({ classId: 'assassino' }), b, seqRng([SAME_RANK, 0, d20(critMin - 1), d20(1)]), NOW);
    expect(o.crit).toBe(false);
  });

  it('Guerreiro ganha bônus contra monstro de rank acima', () => {
    const o = resolveHunt(makeHunter(), b, seqRng([HIGHER_RANK, 0, d20(4), d20(1)]), NOW);
    expect(o.monsterRank).toBe(1);
    expect(o.playerPower).toBe(primaryStat('guerreiro', 1, b) + b.classes.guerreiro.bonusVsHigherRank + 4);
    expect(o.monsterPower).toBe(b.hunt.difficultyByRank[1] + 1);
  });

  it('Mago não tem esse bônus', () => {
    // Sem o bônus o Mago perde aqui, então o código também sorteia a lesão (0.99 = sem lesão).
    const o = resolveHunt(makeHunter({ classId: 'mago' }), b, seqRng([HIGHER_RANK, 0, d20(4), d20(1), 0.99]), NOW);
    expect(o.playerPower).toBe(primaryStat('mago', 1, b) + 4);
  });

  it('rank do monstro fica dentro de F..S', () => {
    const atF = resolveHunt(makeHunter({ rank: 0 }), b, seqRng([LOWER_RANK, 0, d20(10), d20(10)]), NOW);
    expect(atF.monsterRank).toBe(0);
    const atS = resolveHunt(makeHunter({ rank: 6, level: 30 }), b, seqRng([HIGHER_RANK, 0, d20(10), d20(10)]), NOW);
    expect(atS.monsterRank).toBe(6);
  });

  it('vitória pode subir de nível', () => {
    const h = makeHunter({ xp: xpToNext(1, b) - 1 });
    const o = resolveHunt(h, b, seqRng([SAME_RANK, 0, d20(20), d20(1)]), NOW);
    expect(o.levelsGained).toBe(1);
    expect(o.hunter.level).toBe(2);
  });
});
