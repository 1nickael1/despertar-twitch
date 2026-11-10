import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import { levelCap } from '../../src/core/progression';
import { itemPrice } from '../../src/core/shop';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const bia: Author = { userId: 'u-bia', displayName: 'bia' };

const WIN = [0.5, 0, d20(20), d20(1)];
const LOSS_INJURED = [0.5, 0, d20(1), d20(20), 0];
const CLASS_GUERREIRO = 0;
const CLASS_MAGO = 0.3;
const DAY = 86_400_000;

function setup() {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  /** Avança 3s (fora da janela anti-duplicado) e envia o comando. */
  const say = (author: Author, text: string): string[] => {
    const cmd = parseCommand(text);
    if (!cmd) throw new Error(`comando inválido no teste: ${text}`);
    clock.advance(3_000);
    return game.handle(author, cmd);
  };
  const awaken = (author: Author, classRoll = CLASS_GUERREIRO) => {
    rng.push(classRoll);
    return say(author, '!despertar');
  };
  return { repo, clock, rng, b, game, say, awaken };
}

describe('GameService', () => {
  it('start cria a temporada 1 uma única vez', () => {
    const { repo, game, say } = setup();
    game.start();
    expect(repo.getCurrentSeason()!.number).toBe(1);
    expect(say(ana, '!temporada')[0]).toContain('Temporada 1');
  });

  it('pede !despertar para quem não despertou', () => {
    const { say } = setup();
    expect(say(ana, '!cacar')[0]).toContain('!despertar');
  });

  it('despertar cria caçador Rank F com classe sorteada, uma vez só', () => {
    const { repo, say, awaken } = setup();
    expect(awaken(ana)[0]).toContain('Guerreiro Rank F');
    expect(repo.getHunter('u-ana')).toMatchObject({ rank: 0, level: 1, classId: 'guerreiro' });
    expect(say(ana, '!despertar')[0]).toContain('já despertou');
  });

  it('caçada vence, salva e aplica cooldown avisando uma vez só', () => {
    const { repo, rng, clock, b, say, awaken } = setup();
    awaken(ana);
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain(`+${b.hunt.xpByRank[0]} XP`);
    expect(repo.getHunter('u-ana')!.xp).toBe(b.hunt.xpByRank[0]);
    expect(say(ana, '!cacar')[0]).toContain('descansando');
    expect(say(ana, '!cacar')).toEqual([]);
    clock.advance(b.hunt.cooldownMs);
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
  });

  it('lesão impede caçar mesmo depois do cooldown', () => {
    const { rng, clock, b, say, awaken } = setup();
    awaken(ana);
    rng.push(...LOSS_INJURED);
    expect(say(ana, '!cacar')[0]).toContain('lesionado');
    clock.advance(b.hunt.cooldownMs);
    expect(say(ana, '!cacar')[0]).toContain('Volta a caçar');
  });

  it('comando repetido dentro da janela é ignorado', () => {
    const { game, clock } = setup();
    const status = parseCommand('!status')!;
    expect(game.handle(ana, status)).toHaveLength(1);
    clock.advance(500);
    expect(game.handle(ana, status)).toEqual([]);
  });

  it('comandos diferentes do mesmo tipo não contam como repetidos', () => {
    const { game, clock } = setup();
    expect(game.handle(ana, parseCommand('!ranking')!)).not.toEqual([]);
    clock.advance(500);
    expect(game.handle(ana, parseCommand('!ranking eu')!)).not.toEqual([]);
  });

  it('reavaliar abaixo do teto explica o nível necessário', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!reavaliar')[0]).toContain(`nível ${levelCap(0, b)}`);
  });

  it('reavaliar no teto promove', () => {
    const { repo, rng, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, level: levelCap(0, b) });
    rng.push(0.99, 0);
    expect(say(ana, '!reavaliar')[0]).toContain('Rank E');
    expect(repo.getHunter('u-ana')!.rank).toBe(1);
  });

  it('pausa pelo terminal bloqueia ações e libera consultas', () => {
    const { game, rng, say, awaken } = setup();
    awaken(ana);
    expect(game.admin({ action: 'pausar' })[0]).toContain('pausado');
    expect(game.isPaused).toBe(true);
    expect(say(ana, '!cacar')).toEqual([]);
    expect(say(ana, '!status')).toHaveLength(1);
    expect(game.admin({ action: 'retomar' })[0]).toContain('voltou');
    expect(game.isPaused).toBe(false);
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
  });

  it('virada de temporada anuncia, entrega títulos e reseta', () => {
    const { repo, clock, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, rank: 3, level: 17 });
    awaken(bia, CLASS_MAGO);
    clock.advance(b.season.durationDays * DAY);
    const out = say(ana, '!status');
    expect(out[0]).toContain('Temporada 1 encerrada');
    expect(out[1]).toContain('Temporada 2');
    expect(out[2]).toContain('Guerreiro Rank F');
    expect(repo.getCurrentSeason()!.number).toBe(2);
    expect(repo.getTitles('u-ana').map((t) => t.label)).toContain('Top 1 · T1');
    expect(repo.getTitles('u-bia')).toEqual([]);
    expect(repo.getHallOfFame(1).map((e) => e.userId)).toEqual(['u-ana']);
  });

  it('o terminal pode forçar o fim da temporada', () => {
    const { game } = setup();
    expect(game.admin({ action: 'encerrar-temporada' })[0]).toContain('Temporada 1 encerrada');
  });

  it('títulos: listar, equipar por número e nome, remover', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!titulos')[0]).toContain('ainda não tem títulos');
    repo.addTitle('u-ana', { titleId: 'top1-t1', label: 'Top 1 · T1', seasonId: 1, earnedAt: 0 });
    expect(say(ana, '!titulos')[0]).toContain('1) Top 1 · T1');
    expect(say(ana, '!titulo 1')[0]).toContain('equipado');
    expect(say(ana, '!status')[0]).toContain('[Top 1 · T1]');
    expect(say(ana, '!titulo nenhum')[0]).toContain('removido');
    expect(say(ana, '!titulo top 1')[0]).toContain('equipado');
    expect(say(ana, '!titulo 9')[0]).toContain('não encontrado');
  });

  it('ranking mostra o top e a posição própria', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, rank: 2 });
    awaken(bia, CLASS_MAGO);
    const top = say(ana, '!ranking');
    expect(top).toHaveLength(1);
    expect(top[0]).toContain('🥇 ana — D · Nv 1 · 0 XP ‖ 🥈 bia — F · Nv 1 · 0 XP');
    expect(say(bia, '!ranking eu')[0]).toContain('2º de 2');
  });

  it('loja mostra o preço para o rank de quem pede', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!loja')[0]).toContain(`${itemPrice('pocao', 0, b)} ouro`);
  });

  it('comprar sem ouro suficiente', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!comprar pocao')[0]).toContain('ouro insuficiente');
  });

  it('comprar desconta o ouro e guarda as poções', () => {
    const { repo, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 100 });
    expect(say(ana, '!comprar pocao 3')[0]).toContain('3×');
    expect(repo.getHunter('u-ana')!.gold).toBe(100 - 3 * itemPrice('pocao', 0, b));
    expect(repo.getItems('u-ana')).toEqual({ pocao: 3 });
  });

  it('comprar: quantidade fora do limite, item que não existe e sem item', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, `!comprar pocao ${b.shop.maxPerPurchase + 1}`)[0]).toContain('quantidade inválida');
    expect(say(ana, '!comprar espada')[0]).toContain('não existe');
    expect(say(ana, '!comprar')[0]).toContain('!comprar pocao');
  });

  it('usar poção zera as três esperas, sem cooldown próprio', () => {
    const { repo, rng, clock, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({
      ...repo.getHunter('u-ana')!,
      lastHuntAt: clock.now(), injuredUntil: clock.now() + 600_000, reevalBlockedUntil: clock.now() + 600_000,
    });
    repo.setItemQty('u-ana', 'pocao', 2);
    const out = say(ana, '!usar pocao')[0];
    expect(out).toContain('zerados');
    expect(out).toContain('Restam 1');
    expect(repo.getHunter('u-ana')).toMatchObject({ lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null });
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
    expect(say(ana, '!pocao')[0]).toContain('Restam 0');
  });

  it('sem espera ativa a poção não é gasta', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.setItemQty('u-ana', 'pocao', 1);
    expect(say(ana, '!usar pocao')[0]).toContain('guardada');
    expect(repo.getItems('u-ana')).toEqual({ pocao: 1 });
  });

  it('usar sem ter poção', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!usar pocao')[0]).toContain('não tem');
  });

  it('inventário mostra ouro e itens', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 42 });
    repo.setItemQty('u-ana', 'pocao', 2);
    const out = say(ana, '!inventario')[0];
    expect(out).toContain('42 ouro');
    expect(out).toContain('Poção de Cura ×2');
  });

  it('pausado: comprar e usar bloqueados; loja e inventário liberados', () => {
    const { game, repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 100 });
    game.admin({ action: 'pausar' });
    expect(say(ana, '!comprar pocao')).toEqual([]);
    expect(say(ana, '!usar pocao')).toEqual([]);
    expect(say(ana, '!loja')).toHaveLength(1);
    expect(say(ana, '!inventario')).toHaveLength(1);
  });

  it('fim da temporada zera os itens', () => {
    const { game, repo, awaken } = setup();
    awaken(ana);
    repo.setItemQty('u-ana', 'pocao', 3);
    game.admin({ action: 'encerrar-temporada' });
    expect(repo.getItems('u-ana')).toEqual({});
  });

  it('atualiza o nome exibido quando a pessoa troca de nick', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    say({ ...ana, displayName: 'Ana_Nova' }, '!status');
    expect(repo.getHunter('u-ana')!.displayName).toBe('Ana_Nova');
  });
});
