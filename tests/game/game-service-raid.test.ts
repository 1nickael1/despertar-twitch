import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import type { Balance } from '../../src/config/balance';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { AdminRefusal, GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const bia: Author = { userId: 'u-bia', displayName: 'bia' };
const cris: Author = { userId: 'u-cris', displayName: 'cris' };
const GUERREIRO = 0;
const CURANDEIRO = 0.7;
const MIN = 60_000;
const BOSS = 0; // primeiro nome da lista de monstros

function setup(tweak: (b: Balance) => void = () => {}) {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  tweak(b);
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  /** Avança 3 s (fora da janela anti-duplicado) e envia o comando. */
  const say = (author: Author, text: string): string[] => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  const awaken = (author: Author, classRoll = GUERREIRO) => {
    rng.push(classRoll);
    return say(author, '!despertar');
  };
  /** Avança o relógio e roda o relógio do jogo. */
  const tickAfter = (ms: number): string[] => {
    clock.advance(ms);
    return game.tick();
  };
  const portal = (type: 'azul' | 'vermelho' | 'quebra') => {
    rng.push(BOSS);
    return game.admin({ action: 'portal', portal: type });
  };
  return { repo, clock, rng, b, game, say, awaken, tickAfter, portal };
}

describe('GameService: raid', () => {
  it('o timer abre um portal 30 min depois; sem caçadores, reagenda', () => {
    const { rng, game, awaken, tickAfter } = setup();
    expect(tickAfter(30 * MIN)).toEqual([]);
    expect(game.currentRaid).toBeNull();
    awaken(ana);
    rng.push(0, BOSS); // tipo (azul) e boss
    expect(tickAfter(30 * MIN).join('\n')).toContain('PORTAL AZUL');
    expect(game.currentRaid?.type).toBe('azul');
  });

  it('/portal com e sem tipo, e recusas', () => {
    const s = setup();
    expect(() => s.game.admin({ action: 'portal', portal: null })).toThrow(AdminRefusal);
    s.awaken(ana);
    expect(s.portal('vermelho')[0]).toContain('PORTAL VERMELHO');
    expect(() => s.game.admin({ action: 'portal', portal: 'azul' })).toThrow(/já existe/);

    const t = setup();
    t.awaken(ana);
    t.rng.push(0.95, BOSS); // tipo sorteado: quebra
    expect(t.game.admin({ action: 'portal', portal: null })[0]).toContain('QUEBRA DE PORTAL');

    const u = setup();
    u.awaken(ana);
    u.game.admin({ action: 'pausar' });
    expect(() => u.game.admin({ action: 'portal', portal: 'azul' })).toThrow(/pausado/);
  });

  it('!raid só na entrada; repetido não responde; lesionado é recusado', () => {
    const { repo, clock, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    awaken(bia);
    repo.saveHunter({ ...repo.getHunter('u-bia')!, injuredUntil: clock.t + 10 * MIN });
    portal('azul');
    expect(say(ana, '!raid')[0]).toContain('entrou no portal');
    expect(say(ana, '!raid')).toEqual([]);
    expect(say(bia, '!raid')[0]).toContain('lesionado');
    expect(say(ana, '!cacar')[0]).toContain('dentro do portal');
    expect(tickAfter(MIN).join('\n')).toContain('A batalha contra');
    awaken(cris);
    expect(say(cris, '!raid')[0]).toContain('já fechou');
  });

  it('ninguém entrou: azul fecha sem efeito; quebra lesiona todo mundo', () => {
    const a = setup();
    a.awaken(ana);
    a.portal('azul');
    expect(a.tickAfter(MIN).join('\n')).toContain('ninguém entrou');
    expect(a.game.currentRaid).toBeNull();
    expect(a.repo.getHunter('u-ana')!.injuredUntil).toBeNull();

    const q = setup();
    q.awaken(ana);
    q.portal('quebra');
    expect(q.tickAfter(MIN).join('\n')).toContain('QUEBRA!');
    expect(q.repo.getHunter('u-ana')!.injuredUntil).toBe(q.clock.t + 10 * MIN);
  });

  it('rodadas com !atacar, vitória e recompensa pelo ranking de dano', () => {
    const { repo, rng, game, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.bossHp.azul = 60;
    });
    awaken(ana);
    awaken(bia);
    portal('azul');
    say(ana, '!raid');
    say(bia, '!raid');
    tickAfter(MIN); // entrada fecha
    expect(say(ana, '!atacar')).toEqual([]);
    // rodada 1: ana 20×1,5 = 30, bia 20 → 10 HP; boss mira ana (sorteio 0) e erra
    rng.push(d20(10), d20(10), 0, 0.99);
    expect(tickAfter(20_000)[0]).toBe('Rodada 1/15: grupo causou 50 de dano (1 com !atacar) · Goblin: 10/60 HP · ana desviou do golpe');
    // rodada 2: 20 + 20 → vitória, sem golpe do boss
    rng.push(d20(10), d20(10));
    const out = tickAfter(20_000);
    expect(out).toContain('🏆 Goblin foi derrotado! 🔵 PORTAL AZUL limpo. Ranking de dano:');
    expect(out).toContain('1º ana — 50 de dano → +60 XP, +18 ouro');
    expect(out).toContain('2º bia — 40 de dano → +45 XP, +13 ouro');
    expect(game.currentRaid).toBeNull();
    expect(repo.getHunter('u-ana')).toMatchObject({ level: 2, xp: 30, gold: 18 });
    expect(repo.getHunter('u-bia')).toMatchObject({ level: 2, xp: 15, gold: 13 });
  });

  it('boss derruba, Curandeiro levanta, poção levanta e é gasta', () => {
    const { repo, rng, game, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    awaken(cris, CURANDEIRO);
    portal('azul');
    say(ana, '!raid');
    say(cris, '!raid');
    tickAfter(MIN);
    // rodada 1: boss mira ana (0) e ela cai (0); cris levanta ana
    rng.push(d20(1), d20(1), 0, 0);
    const r1 = tickAfter(20_000)[0];
    expect(r1).toContain('💀 ana caiu!');
    expect(r1).toContain('✨ cris levantou ana');
    // rodada 2: boss mira cris (0,6 → índice 1) e ela cai; ninguém levanta
    rng.push(d20(1), d20(1), 0.6, 0);
    expect(tickAfter(20_000)[0]).toContain('💀 cris caiu!');
    repo.setItemQty('u-cris', 'pocao', 1);
    expect(say(cris, '!usar pocao')[0]).toContain('voltou à batalha');
    expect(repo.getItems('u-cris').pocao ?? 0).toBe(0);
    expect(game.currentRaid!.participants.find((p) => p.userId === 'u-cris')!.down).toBe(false);
  });

  it('!atacar fora da raid avisa uma vez só', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!atacar')[0]).toContain('não há batalha');
    expect(say(ana, '!atacar')).toEqual([]);
  });

  it('vermelho: tempo acabou e quem terminou caído perde XP sem descer de nível', () => {
    const { repo, rng, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.battleMs = b.raid.roundMs; // uma rodada só
    });
    awaken(ana);
    awaken(bia);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, xp: 5 });
    portal('vermelho');
    say(ana, '!raid');
    say(bia, '!raid');
    tickAfter(MIN);
    rng.push(d20(1), d20(1), 0, 0); // 22 de dano; boss mira ana e ela cai; bia segue de pé
    const out = tickAfter(20_000).join('\n');
    expect(out).toContain('Goblin sobreviveu com 778 HP');
    expect(out).toContain('🔴 Quem terminou caído perdeu XP: ana (-20 XP)');
    expect(repo.getHunter('u-ana')).toMatchObject({ level: 1, xp: 0 });
  });

  it('todos caídos: a raid acaba na hora como derrota', () => {
    const { rng, game, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    tickAfter(MIN);
    rng.push(d20(1), 0); // único participante cai na rodada 1
    const out = tickAfter(20_000);
    expect(out[0]).toContain('💀 ana caiu!');
    expect(out[1]).toBe('💀 Todos caíram! Goblin venceu com 489 HP e o 🔵 PORTAL AZUL se fechou.');
    expect(game.currentRaid).toBeNull();
    expect(tickAfter(20_000)).toEqual([]); // nenhuma rodada vazia depois
  });

  it('todos caídos no vermelho: todos perdem XP', () => {
    const { repo, rng, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, xp: 25 });
    portal('vermelho');
    say(ana, '!raid');
    tickAfter(MIN);
    rng.push(d20(1), 0);
    const out = tickAfter(20_000).join('\n');
    expect(out).toContain('Todos caíram!');
    expect(out).toContain('ana (-20 XP)');
    expect(repo.getHunter('u-ana')!.xp).toBe(5);
  });

  it('/pausar cancela a raid; /retomar reagenda o portal', () => {
    const { clock, game, say, awaken, portal } = setup();
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    expect(game.admin({ action: 'pausar' }).join('\n')).toContain('cancelada');
    expect(game.currentRaid).toBeNull();
    game.admin({ action: 'retomar' });
    expect(game.nextPortalAt).toBe(clock.t + 30 * MIN);
  });

  it('virada de temporada cancela a raid', () => {
    const { game, awaken, portal } = setup();
    awaken(ana);
    portal('azul');
    expect(game.admin({ action: 'encerrar-temporada' }).join('\n')).toContain('cancelada');
    expect(game.currentRaid).toBeNull();
  });

  it('tick atrasado resolve todas as rodadas vencidas, em ordem', () => {
    const { rng, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.bossHp.azul = 10_000;
    });
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    rng.push(d20(1), 0.99, d20(1), 0.99, d20(1), 0.99);
    const out = tickAfter(2 * MIN).join('\n');
    expect(out).toContain('A batalha contra');
    expect(out).toContain('Rodada 3/15');
    expect(out).not.toContain('Rodada 4/15');
  });
});
