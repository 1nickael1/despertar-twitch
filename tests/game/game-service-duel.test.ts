import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const bia: Author = { userId: 'u-bia', displayName: 'Bia' };
const caio: Author = { userId: 'u-caio', displayName: 'caio' };
const MIN = 60_000;

function setup() {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const game = new GameService({ repo, balance: testBalance(), rng, clock });
  game.start();
  const say = (author: Author, text: string): string[] => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  for (const author of [ana, bia, caio]) {
    rng.push(0); // todos Guerreiros (base 8 no nível 1)
    say(author, '!despertar');
  }
  const patch = (userId: string, p: Record<string, unknown>) => repo.saveHunter({ ...repo.getHunter(userId)!, ...p });
  const gold = (userId: string) => repo.getHunter(userId)!.gold;
  return { repo, clock, rng, game, say, patch, gold };
}

describe('GameService: duelo', () => {
  it('recusas do desafio', () => {
    const { say, patch } = setup();
    expect(say(ana, '!duelo')[0]).toContain('use: !duelo');
    expect(say(ana, '!duelo @ana')[0]).toContain('consigo mesmo');
    expect(say(ana, '!duelo @zeca')[0]).toContain('zeca ainda não despertou');
    expect(say(ana, '!duelo @bia 20')[0]).toContain('ana não tem 20 ouro');
    patch('u-ana', { gold: 20 });
    expect(say(ana, '!duelo @bia 20')[0]).toContain('Bia não tem 20 ouro');
  });

  it('desafio aceito: melhor de 3, ouro troca de mão e os dois entram em cooldown', () => {
    const { rng, say, patch, gold } = setup();
    patch('u-ana', { gold: 30 });
    patch('u-bia', { gold: 30 });
    expect(say(ana, '!duelo @BIA 20')[0]).toBe('⚔️ @ana desafiou @Bia para um duelo valendo 20 ouro! @Bia: !aceitar ou !recusar (1min)');
    rng.push(d20(10), d20(1), d20(10), d20(1));
    expect(say(bia, '!aceitar')[0]).toBe(
      '⚔️ DUELO ana × Bia (20 ouro) · R1: ana 18 × 9 Bia · R2: ana 18 × 9 Bia · 🏆 ana venceu por 2×0 e levou 40 ouro!',
    );
    expect(gold('u-ana')).toBe(50);
    expect(gold('u-bia')).toBe(10);
    expect(say(ana, '!duelo @caio')[0]).toContain('você acabou de duelar');
    expect(say(caio, '!duelo @bia')[0]).toContain('Bia acabou de duelar');
  });

  it('um desafio pendente por vez; recusar', () => {
    const { say } = setup();
    say(ana, '!duelo @bia');
    expect(say(caio, '!duelo @bia')[0]).toContain('desafio pendente');
    expect(say(caio, '!duelo @ana')[0]).toContain('desafio pendente');
    expect(say(bia, '!recusar')[0]).toBe('@ana Bia recusou o duelo.');
    expect(say(bia, '!aceitar')[0]).toContain('nenhum desafio');
  });

  it('desafio expira pelo relógio do jogo', () => {
    const { clock, game, say } = setup();
    say(ana, '!duelo @bia');
    clock.advance(MIN);
    expect(game.tick()).toContain('⌛ O desafio de ana para Bia expirou.');
    expect(say(bia, '!aceitar')[0]).toContain('nenhum desafio');
  });

  it('2+ ranks de diferença: só pela honra, ninguém ganha nem perde ouro', () => {
    const { rng, say, patch, gold } = setup();
    patch('u-caio', { rank: 2, gold: 50 });
    expect(say(ana, '!duelo @caio 20')[0]).toContain('só pela honra (2+ ranks de diferença)');
    rng.push(d20(1), d20(20), d20(1), d20(20));
    expect(say(caio, '!aceitar')[0]).toContain('🏆 caio venceu por 2×0!');
    expect(gold('u-ana')).toBe(0);
    expect(gold('u-caio')).toBe(50);
  });

  it('ouro conferido de novo no aceite', () => {
    const { say, patch } = setup();
    patch('u-ana', { gold: 20 });
    patch('u-bia', { gold: 20 });
    say(ana, '!duelo @bia 20');
    patch('u-ana', { gold: 0 });
    expect(say(bia, '!aceitar')[0]).toBe('⚔️ Duelo entre ana e Bia cancelado: alguém não tem mais 20 ouro.');
  });

  it('ninguém duela de dentro de um portal; pausado não responde', () => {
    const { rng, game, say } = setup();
    rng.push(0); // boss
    game.admin({ action: 'portal', portal: 'azul' });
    say(ana, '!raid');
    expect(say(ana, '!duelo @bia')[0]).toContain('portal');
    expect(say(bia, '!duelo @ana')[0]).toContain('portal');
    game.admin({ action: 'pausar' });
    expect(say(bia, '!duelo @caio')).toEqual([]);
  });
});
