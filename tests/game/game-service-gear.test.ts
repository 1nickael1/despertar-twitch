import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import type { Balance } from '../../src/config/balance';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const MIN = 60_000;

function setup(tweak: (b: Balance) => void = () => {}) {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  tweak(b);
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  const say = (author: Author, text: string): string[] => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  rng.push(0); // ana desperta como Guerreiro
  say(ana, '!despertar');
  const patch = (p: Record<string, unknown>) => repo.saveHunter({ ...repo.getHunter('u-ana')!, ...p });
  return { repo, clock, rng, b, game, say, patch };
}

describe('GameService: equipamento', () => {
  it('loja lista poção, arma e armadura do rank', () => {
    const { say } = setup();
    const out = say(ana, '!loja')[0];
    expect(out).toContain('Lâmina Enferrujada [F] — 18 ouro (+1 dano)');
    expect(out).toContain('Couro Gasto [F] — 15 ouro (×0,85 lesão)');
    expect(out).toContain('use !comprar pocao | arma | armadura');
  });

  it('comprar arma: sem ouro, compra e equipa, não compra de novo', () => {
    const { repo, say, patch } = setup();
    expect(say(ana, '!comprar arma')[0]).toContain('ouro insuficiente');
    patch({ gold: 20 });
    expect(say(ana, '!comprar arma')[0]).toContain('equipado ✅');
    expect(repo.getHunter('u-ana')).toMatchObject({ gold: 2, weaponId: 'arma-f-comum' });
    expect(repo.getItems('u-ana')).toEqual({ 'arma-f-comum': 1 });
    patch({ gold: 20 });
    expect(say(ana, '!comprar arma')[0]).toContain('já tem');
  });

  it('forjar: usa fragmentos e ouro, troca a arma comum pela forjada', () => {
    const { repo, say, patch } = setup();
    expect(say(ana, '!forjar')[0]).toContain('use: !forjar');
    expect(say(ana, '!forjar arma')[0]).toContain('precisa de 6 💎 F e tem 0');
    expect(say(ana, '!forjar arma e')[0]).toContain('só pode forjar até o seu rank (F)');
    patch({ gold: 10, weaponId: 'arma-f-comum' });
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    repo.setItemQty('u-ana', 'frag-f', 6);
    expect(say(ana, '!forjar arma')[0]).toContain('forjou ⚔️ Lâmina Enferrujada ★ [F]');
    expect(repo.getHunter('u-ana')).toMatchObject({ gold: 4, weaponId: 'arma-f-forjada' });
    expect(repo.getItems('u-ana')).toEqual({ 'arma-f-comum': 1, 'arma-f-forjada': 1 });
  });

  it('equipar por número e nome; recusa rank acima e item que não tem', () => {
    const { repo, say } = setup();
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    repo.setItemQty('u-ana', 'arma-f-forjada', 1);
    repo.setItemQty('u-ana', 'arma-e-comum', 1);
    expect(say(ana, '!equipar')[0]).toContain('use: !equipar');
    expect(say(ana, '!equipar 2')[0]).toContain('equipou ⚔️ Lâmina Enferrujada ★');
    expect(repo.getHunter('u-ana')!.weaponId).toBe('arma-f-forjada');
    expect(say(ana, '!equipar lamina comum')[0]).toContain('equipou ⚔️ Lâmina Enferrujada [F]');
    expect(say(ana, '!equipar espada')[0]).toContain('rank acima');
    expect(say(ana, '!equipar 9')[0]).toContain('não tem esse item');
  });

  it('status e inventário mostram equipamento e fragmentos', () => {
    const { repo, say, patch } = setup();
    patch({ weaponId: 'arma-f-forjada' });
    repo.setItemQty('u-ana', 'arma-f-forjada', 1);
    repo.setItemQty('u-ana', 'frag-f', 3);
    expect(say(ana, '!status')[0]).toContain('· ⚔️ Lâmina Enferrujada ★ +2 ·');
    expect(say(ana, '!inventario')[0]).toContain('💎 F ×3 · 1) ⚔️ Lâmina Enferrujada ★ [F] ✅');
  });

  it('caçada vencida guarda o fragmento; a arma ajuda a vencer', () => {
    const { repo, rng, say, patch } = setup();
    patch({ weaponId: 'arma-f-forjada' });
    // 8 + 2 (arma) + 5 = 15 contra 7 + 8 = 15: vence só por causa da arma; sorteio 0 = dropa
    rng.push(0.5, 0, d20(5), d20(8), 0);
    expect(say(ana, '!cacar')[0]).toContain('💎 +1 Fragmento F');
    expect(repo.getItems('u-ana')).toEqual({ 'frag-f': 1 });
  });

  it('raid vencida dá fragmentos (1 + 1 do 1º lugar no azul)', () => {
    const { repo, rng, clock, game, say } = setup((b) => {
      b.raid.bossHp.azul = 10;
    });
    rng.push(0); // boss
    game.admin({ action: 'portal', portal: 'azul' });
    say(ana, '!raid');
    clock.advance(MIN);
    game.tick();
    rng.push(d20(10));
    clock.advance(20_000);
    expect(game.tick().join('\n')).toContain('💎 +2');
    expect(repo.getItems('u-ana')).toEqual({ 'frag-f': 2 });
  });

  it('pausado bloqueia forjar e equipar; fim da temporada tira o equipamento', () => {
    const { repo, game, say, patch } = setup();
    patch({ weaponId: 'arma-f-comum', armorId: 'armadura-f-comum' });
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    game.admin({ action: 'pausar' });
    expect(say(ana, '!forjar arma')).toEqual([]);
    expect(say(ana, '!equipar 1')).toEqual([]);
    game.admin({ action: 'retomar' });
    game.admin({ action: 'encerrar-temporada' });
    expect(repo.getHunter('u-ana')).toMatchObject({ weaponId: null, armorId: null });
    expect(repo.getItems('u-ana')).toEqual({});
  });
});
