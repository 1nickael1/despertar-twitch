import { describe, expect, it } from 'vitest';
import type { HuntOutcome } from '../../src/core/combat';
import { fmtDuration, msg } from '../../src/game/messages';
import { makeHunter } from '../helpers';

const outcome = (o: Partial<HuntOutcome> = {}): HuntOutcome => ({
  monsterName: 'Lobo de Gelo', monsterRank: 1, playerRoll: 15, playerPower: 27, monsterPower: 21,
  won: true, crit: false, xpGained: 15, goldGained: 5, injured: false, levelsGained: 0,
  hunter: makeHunter(), ...o,
});

describe('fmtDuration', () => {
  it.each([
    [0, '0s'],
    [1, '1s'],
    [45_000, '45s'],
    [150_000, '2min 30s'],
    [180_000, '3min'],
    [3_900_000, '1h 5min'],
    [(9 * 86_400 + 4 * 3_600) * 1000, '9d 4h'],
  ])('%i ms → %s', (ms, expected) => {
    expect(fmtDuration(ms)).toBe(expected);
  });
});

describe('msg', () => {
  it('vitória mostra monstro, rank, rolagens e ganhos', () => {
    const t = msg.huntWin('ana', outcome());
    expect(t).toBe('@ana ⚔️ venceu um Lobo de Gelo [E] (27 vs 21) — +15 XP, +5 ouro');
  });

  it('vitória crítica é destacada', () => {
    expect(msg.huntWin('ana', outcome({ crit: true }))).toContain('CRÍTICO');
  });

  it('derrota com lesão e XP de consolo', () => {
    const t = msg.huntLoss('ana', outcome({ won: false, injured: true, xpGained: 7, playerPower: 9, monsterPower: 25 }), 600_000);
    expect(t).toContain('derrotado por um Lobo de Gelo [E] (9 vs 25)');
    expect(t).toContain('+7 XP de consolo');
    expect(t).toContain('lesionado por 10min');
  });

  it('status', () => {
    const t = msg.status('ana', { title: 'Top 1 · T1', classLabel: 'Assassino', rank: 1, level: 7,
      xpText: '40/90 XP', gold: 32, state: '✅ pronto para caçar' });
    expect(t).toBe('@ana [Top 1 · T1] Assassino Rank E · Nv 7 (40/90 XP) · 32 ouro · ✅ pronto para caçar');
  });

  it('ranking vazio e preenchido', () => {
    expect(msg.ranking(1, [])).toContain('ninguém');
    const t = msg.ranking(1, [
      { name: 'ana', title: null, rank: 3, level: 17 },
      { name: 'bia', title: 'Rank S · T1', rank: 2, level: 12 },
    ]);
    expect(t).toBe('🏆 T1: 1. ana (C·17) 2. [Rank S · T1] bia (D·12)');
  });

  it('lista de títulos marca o equipado', () => {
    const t = msg.titlesList('ana', [{ label: 'Top 2 · T1', equipped: false }, { label: 'Top 1 · T2', equipped: true }]);
    expect(t).toContain('1) Top 2 · T1');
    expect(t).toContain('2) Top 1 · T2 ✅');
  });

  it('loja, compra e inventário', () => {
    expect(msg.shop('ana', 1, [{ id: 'pocao', label: 'Poção de Cura', description: 'zera tudo', price: 13 }])).toBe(
      '@ana 🛒 Loja (preços do Rank E): Poção de Cura — 13 ouro (zera tudo) · use !comprar pocao [quantidade]',
    );
    expect(msg.bought('ana', 'Poção de Cura', 2, 26, 3, 4)).toBe(
      '@ana 🧪 comprou 2× Poção de Cura por 26 ouro. Agora tem 3 · ouro: 4',
    );
    expect(msg.inventory('ana', 4, [])).toBe('@ana 🎒 4 ouro · nenhum item');
    expect(msg.inventory('ana', 4, [{ label: 'Poção de Cura', qty: 3 }])).toBe('@ana 🎒 4 ouro · Poção de Cura ×3');
  });

  it('ajuda lista os comandos da loja', () => {
    expect(msg.help()).toContain('!loja');
    expect(msg.help()).toContain('!usar pocao');
  });

  it('re-despertar e fim de temporada', () => {
    expect(msg.reawakening('ana', 1, 3)).toBe('🌌 RE-DESPERTAR! @ana saltou de Rank E para Rank C!');
    expect(msg.seasonEnded(1, ['ana', 'bia'])).toContain('Temporada 1 encerrada');
    expect(msg.seasonEnded(1, [])).toContain('Ninguém');
  });
});
