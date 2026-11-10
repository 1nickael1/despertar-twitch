import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import type { Balance } from '../../src/config/balance';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { buildOverlaySnapshot } from '../../src/overlay/snapshot';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const MIN = 60_000;
const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const bia: Author = { userId: 'u-bia', displayName: 'bia' };

function setup(tweak: (b: Balance) => void = () => {}) {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  tweak(b);
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  const say = (author: Author, text: string) => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  const awaken = (author: Author, classRoll = 0) => {
    rng.push(classRoll);
    say(author, '!despertar');
  };
  const tickAfter = (ms: number) => {
    clock.advance(ms);
    return game.tick();
  };
  const portal = (type: 'azul' | 'vermelho' | 'quebra') => {
    rng.push(0); // boss
    game.admin({ action: 'portal', portal: type });
  };
  const snap = () => buildOverlaySnapshot(game, repo, b, clock.t);
  return { repo, clock, rng, b, game, say, awaken, tickAfter, portal, snap };
}

describe('overlay: estado do painel', () => {
  it('sem raid: top 5 na ordem do ranking, próximo portal e pausa', () => {
    const { repo, game, awaken, snap, clock } = setup();
    const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    names.forEach((n, i) => {
      awaken({ userId: `u-${n}`, displayName: n });
      repo.saveHunter({ ...repo.getHunter(`u-${n}`)!, level: 1 + i });
    });
    const s = snap();
    expect(s.serverNow).toBe(clock.t);
    expect(s.season).toBe(1);
    expect(s.paused).toBe(false);
    expect(s.nextPortalAt).toBe(game.nextPortalAt);
    expect(s.ranking.map((r) => r.name)).toEqual(['a7', 'a6', 'a5', 'a4', 'a3']);
    expect(s.ranking[0]).toEqual({ name: 'a7', classId: 'guerreiro', rank: 'F', level: 7, xp: 0 });
    expect(s.raid).toBeNull();
    expect(s.result).toBeNull();
    game.admin({ action: 'pausar' });
    expect(snap().paused).toBe(true);
  });

  it('entrada: tipo, boss, HP e quem entrou com a classe', () => {
    const { say, awaken, portal, snap, game } = setup();
    awaken(ana);
    awaken(bia, 0.9); // Tanque
    portal('vermelho');
    say(bia, '!raid');
    const s = snap();
    expect(s.raid).toMatchObject({
      type: 'vermelho', bossName: 'Goblin', hp: 800, maxHp: 800, phase: 'entrada',
      battleStartsAt: game.currentRaid!.battleStartsAt, round: 0, totalRounds: 15, nextRoundAt: null, lastRound: null,
      participants: [{ name: 'bia', classId: 'tanque', damage: 0, down: false }],
    });
  });

  it('batalha: rodada, próxima rodada, última rodada e caídos', () => {
    const { rng, say, awaken, portal, tickAfter, snap } = setup();
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    tickAfter(MIN);
    rng.push(d20(1), 0); // 11 de dano; ana cai (único alvo)... e todos caídos encerra a raid
    tickAfter(20_000);
    expect(snap().raid).toBeNull();
    expect(snap().result).toMatchObject({ outcome: 'todos-caidos', hp: 489 });

    const t = setup();
    t.awaken(ana);
    t.awaken(bia);
    t.portal('azul');
    t.say(ana, '!raid');
    t.say(bia, '!raid');
    t.tickAfter(MIN);
    t.rng.push(d20(1), d20(1), 0, 0); // 22 de dano; boss mira ana e ela cai
    t.tickAfter(20_000);
    const raid = t.snap().raid!;
    expect(raid).toMatchObject({ phase: 'batalha', round: 1, hp: 478 });
    expect(raid.nextRoundAt).toBe(t.game.currentRaid!.battleStartsAt + 2 * 20_000);
    expect(raid.lastRound).toMatchObject({ round: 1, groupDamage: 22, bossHit: { name: 'ana', fell: true } });
    expect(raid.participants).toEqual([
      { name: 'ana', classId: 'guerreiro', damage: 11, down: true },
      { name: 'bia', classId: 'guerreiro', damage: 11, down: false },
    ]);
  });

  it('vitória: pódio com classe, fragmentos e prazo; some depois de 20 s', () => {
    const { rng, clock, say, awaken, portal, tickAfter, snap } = setup((b) => {
      b.raid.bossHp.azul = 20;
    });
    awaken(ana);
    awaken(bia, 0.9);
    portal('azul');
    say(ana, '!raid');
    say(bia, '!raid');
    tickAfter(MIN);
    rng.push(d20(10), d20(1)); // ana 20 + bia 9: vitória na rodada 1
    tickAfter(20_000);
    const s = snap();
    expect(s.raid).toBeNull();
    expect(s.result).toEqual({
      type: 'azul', bossName: 'Goblin', outcome: 'vitoria', hp: 0, maxHp: 20,
      podium: [
        { name: 'ana', classId: 'guerreiro', damage: 20, xp: 60, gold: 18 },
        { name: 'bia', classId: 'tanque', damage: 9, xp: 45, gold: 13 },
      ],
      fragmentsEach: 1, fragmentsTop: 2,
      until: clock.t + 20_000,
    });
    clock.advance(20_000);
    expect(snap().result).toBeNull();
  });

  it('portal vazio também aparece como resultado', () => {
    const { awaken, portal, tickAfter, snap } = setup();
    awaken(ana);
    portal('azul');
    tickAfter(MIN);
    expect(snap().result).toMatchObject({ outcome: 'vazio', podium: [], fragmentsEach: 0, fragmentsTop: 0 });
  });
});
