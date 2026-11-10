import { describe, expect, it } from 'vitest';
import {
  joinRaid,
  knockdownChance,
  markAttack,
  openRaid,
  raidDamage,
  reviveWithPotion,
  rollPortalType,
  type Raid,
} from '../../src/core/raid';
import type { ClassId, Hunter } from '../../src/core/types';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const T0 = 1_000_000;

/** Raid azul com os caçadores dados já dentro. */
function joined(...hunters: Hunter[]): Raid {
  let raid = openRaid('azul', 'Goblin', T0, b);
  for (const h of hunters) {
    const r = joinRaid(raid, h, T0);
    if (!r.ok) throw new Error(r.reason);
    raid = r.raid;
  }
  return raid;
}
const started = (raid: Raid): Raid => ({ ...raid, started: true });

describe('raid: abertura e entrada', () => {
  it('sorteia o tipo pelos pesos 60/30/10', () => {
    expect(rollPortalType(b, seqRng([0]))).toBe('azul');
    expect(rollPortalType(b, seqRng([0.59]))).toBe('azul');
    expect(rollPortalType(b, seqRng([0.6]))).toBe('vermelho');
    expect(rollPortalType(b, seqRng([0.89]))).toBe('vermelho');
    expect(rollPortalType(b, seqRng([0.9]))).toBe('quebra');
  });

  it('tipo com peso 0 nunca sai', () => {
    const only = testBalance();
    only.raid.typeWeights = { azul: 0, vermelho: 1, quebra: 0 };
    expect(rollPortalType(only, seqRng([0]))).toBe('vermelho');
    expect(rollPortalType(only, seqRng([0.999]))).toBe('vermelho');
  });

  it('abre com o HP do tipo e 15 rodadas', () => {
    expect(openRaid('vermelho', 'Ogro', T0, b)).toMatchObject({
      type: 'vermelho',
      bossName: 'Ogro',
      hp: 800,
      maxHp: 800,
      openedAt: T0,
      battleStartsAt: T0 + 60_000,
      started: false,
      round: 0,
      totalRounds: 15,
      participants: [],
    });
  });

  it('entrar: só na entrada, uma vez, sem lesão', () => {
    const raid = openRaid('azul', 'Goblin', T0, b);
    const ana = makeHunter({ userId: 'a', displayName: 'ana', level: 3 });
    const r = joinRaid(raid, ana, T0 + 1_000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.raid.participants[0]).toMatchObject({
      userId: 'a', displayName: 'ana', classId: 'guerreiro', rank: 0, level: 3,
      damage: 0, down: false, downSinceRound: null, attacked: false,
    });
    expect(joinRaid(r.raid, ana, T0 + 2_000)).toEqual({ ok: false, reason: 'already' });
    expect(joinRaid(raid, ana, T0 + 60_000)).toEqual({ ok: false, reason: 'closed' });
    expect(joinRaid(started(raid), ana, T0)).toEqual({ ok: false, reason: 'closed' });
    const hurt = makeHunter({ userId: 'b', injuredUntil: T0 + 5_000 });
    expect(joinRaid(raid, hurt, T0)).toEqual({ ok: false, reason: 'injured' });
    expect(joinRaid(raid, { ...hurt, injuredUntil: T0 - 1 }, T0).ok).toBe(true);
  });

  it('!atacar: só participante de pé, com a batalha começada, uma vez por rodada', () => {
    const raid = joined(makeHunter({ userId: 'a', displayName: 'ana' }));
    expect(markAttack(raid, 'a')).toEqual({ ok: false, reason: 'not-started' });
    expect(markAttack(started(raid), 'x')).toEqual({ ok: false, reason: 'not-in-raid' });
    const r = markAttack(started(raid), 'a');
    if (!r.ok) throw new Error(r.reason);
    expect(r.raid.participants[0].attacked).toBe(true);
    expect(markAttack(r.raid, 'a')).toEqual({ ok: false, reason: 'already' });
    const down: Raid = { ...started(raid), participants: [{ ...raid.participants[0], down: true, downSinceRound: 1 }] };
    expect(markAttack(down, 'a')).toEqual({ ok: false, reason: 'down' });
  });

  it('poção levanta só quem caiu', () => {
    const raid = joined(makeHunter({ userId: 'a' }));
    expect(reviveWithPotion(raid, 'a')).toBeNull();
    expect(reviveWithPotion(raid, 'x')).toBeNull();
    const down: Raid = { ...raid, participants: [{ ...raid.participants[0], down: true, downSinceRound: 2 }] };
    expect(reviveWithPotion(down, 'a')!.participants[0]).toMatchObject({ down: false, downSinceRound: null });
  });
});

describe('raid: dano e queda', () => {
  const p = (classId: ClassId, level = 1, attacked = false) => ({ classId, level, attacked });

  it('Guerreiro soma +2 sempre', () => {
    expect(raidDamage(p('guerreiro'), 10, b)).toEqual({ damage: 20, crit: false });
  });

  it('Assassino crita com 18 ou mais', () => {
    expect(raidDamage(p('assassino'), 17, b)).toEqual({ damage: 25, crit: false });
    expect(raidDamage(p('assassino'), 18, b)).toEqual({ damage: 52, crit: true });
  });

  it('!atacar dá +50%, arredondado para baixo', () => {
    expect(raidDamage(p('mago', 1, true), 10, b)).toEqual({ damage: 25, crit: false });
  });

  it('chance de cair = lesão × 0,5; Curandeiro usa a fórmula base', () => {
    expect(knockdownChance('tanque', b)).toBeCloseTo(0.05);
    expect(knockdownChance('guerreiro', b)).toBeCloseTo(0.16);
    expect(knockdownChance('assassino', b)).toBeCloseTo(0.19);
    expect(knockdownChance('mago', b)).toBeCloseTo(0.205);
    expect(knockdownChance('curandeiro', b)).toBeCloseTo(0.175);
  });
});
