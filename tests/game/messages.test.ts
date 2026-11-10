import { describe, expect, it } from 'vitest';
import type { HuntOutcome } from '../../src/core/combat';
import { fmtDuration, gearPower, msg } from '../../src/game/messages';
import { makeHunter } from '../helpers';

const outcome = (o: Partial<HuntOutcome> = {}): HuntOutcome => ({
  monsterName: 'Lobo de Gelo', monsterRank: 1, playerRoll: 15, playerPower: 27, monsterPower: 21,
  won: true, crit: false, xpGained: 15, goldGained: 5, injured: false, levelsGained: 0,
  fragmentRank: null, hunter: makeHunter(), ...o,
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

  it('ranking: pódio completo, 4º em diante compacto, numa mensagem só', () => {
    expect(msg.ranking(1, [])).toEqual([expect.stringContaining('ninguém')]);
    const entry = (name: string, rank: number, level: number, xp: number, title: string | null = null) =>
      ({ name, title, rank, level, xp });
    expect(
      msg.ranking(1, [
        entry('ana', 3, 17, 35),
        entry('bia', 2, 12, 80, 'Rank S · T1'),
        entry('caio', 0, 3, 12),
        entry('duda', 0, 2, 5),
      ]),
    ).toEqual([
      '🏆 Ranking T1 (rank › nível › XP) ‖ 🥇 ana — C · Nv 17 · 35 XP ‖ 🥈 [Rank S · T1] bia — D · Nv 12 · 80 XP' +
        ' ‖ 🥉 caio — F · Nv 3 · 12 XP ‖ 4º duda F·2·5',
    ]);
  });

  it('ranking: top 10 cabe numa mensagem só', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `cacador${i + 1}`, title: null, rank: 0, level: 5, xp: 40 }));
    const out = msg.ranking(1, ten);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('‖ 10º cacador10 F·5·40');
    expect(out[0].length).toBeLessThanOrEqual(500);
  });

  it('ranking muito longo continua numa 2ª mensagem, cortando entre colocados', () => {
    const long = Array.from({ length: 10 }, (_, i) => ({
      name: `nome_bem_comprido_${i + 1}`.padEnd(25, 'x'),
      title: 'Rank S · T1 · Lenda',
      rank: 6,
      level: 40,
      xp: 9999,
    }));
    const out = msg.ranking(1, long);
    expect(out).toHaveLength(2);
    for (const m of out) expect(m.length).toBeLessThanOrEqual(500);
    expect(out[1].startsWith('(cont.) ')).toBe(true);
    // nenhum colocado foi cortado no meio
    expect(out.join(' ‖ ').match(/nome_bem_comprido_/g)).toHaveLength(10);
  });

  it('portal aberto explica a regra do tipo e o tempo de entrada', () => {
    expect(msg.portalOpened('azul', 'Goblin', 500, 60_000)).toBe(
      '🔵 PORTAL AZUL abriu! Boss: Goblin (500 HP). Raid normal. Digite !raid em 1min para entrar.',
    );
    expect(msg.portalOpened('vermelho', 'Ogro', 800, 60_000)).toContain('quem terminar caído perde XP');
    expect(msg.portalOpened('quebra', 'Hidra', 1000, 60_000)).toContain('TODOS os caçadores ficam lesionados');
  });

  it('resumo da rodada', () => {
    expect(
      msg.raidRound('Goblin', {
        round: 3, totalRounds: 15, groupDamage: 64, attackers: 2, crits: ['edu'], hp: 312, maxHp: 500, won: false,
        bossHit: { name: 'ana', fell: true, tank: false }, revived: [{ healer: 'cris', target: 'ana' }],
      }),
    ).toBe('Rodada 3/15: grupo causou 64 de dano (2 com !atacar) · 💥 crítico de edu · Goblin: 312/500 HP · 💀 ana caiu! · ✨ cris levantou ana');
    expect(
      msg.raidRound('Goblin', {
        round: 1, totalRounds: 15, groupDamage: 20, attackers: 0, crits: [], hp: 480, maxHp: 500, won: false,
        bossHit: { name: 'bia', fell: false, tank: true }, revived: [],
      }),
    ).toBe('Rodada 1/15: grupo causou 20 de dano · Goblin: 480/500 HP · 🛡️ bia segurou o golpe');
  });

  it('vitória: ranking de dano em uma mensagem só', () => {
    const rw = (place: number, name: string, damage: number, xp: number, gold: number) =>
      ({ userId: name, displayName: name, place, damage, xp, gold, xpLoss: 0, rank: 0, fragments: place === 1 ? 2 : 1 });
    expect(msg.raidVictory('azul', 'Goblin', [rw(1, 'ana', 50, 60, 18), rw(2, 'bia', 40, 45, 13)])).toEqual([
      '🏆 Goblin derrotado! 🔵 PORTAL AZUL limpo · 💎 +1 cada (1º +2) ‖ 🥇 ana — 50 de dano → +60 XP, +18 ouro ‖ 🥈 bia — 40 de dano → +45 XP, +13 ouro',
    ]);
    // top 10: pódio completo, 4º–10º compacto, o resto resumido; cabe no limite da Twitch
    const many = msg.raidVictory('azul', 'Goblin', Array.from({ length: 12 }, (_, i) => rw(i + 1, `jogador${i + 1}`, 100 - i, 30, 9)));
    expect(many).toHaveLength(1);
    expect(many[0]).toContain('‖ 🥉 jogador3 — 98 de dano → +30 XP, +9 ouro');
    expect(many[0]).toContain('‖ 4º jogador4 97 (+30 XP +9 ouro)');
    expect(many[0]).toContain('‖ 10º jogador10 91 (+30 XP +9 ouro)');
    expect(many[0]).not.toContain('jogador11');
    expect(many[0].endsWith(' ‖ +2 caçadores também receberam recompensa')).toBe(true);
    expect(many[0].length).toBeLessThanOrEqual(500); // limite de mensagem da Twitch
  });

  it('equipamento: vitória com fragmento, status, loja e inventário', () => {
    const sword = { id: 'arma-f-forjada', slot: 'arma' as const, rank: 0, quality: 'forjada' as const, label: 'Lâmina Enferrujada ★', value: 2 };
    const leather = { id: 'armadura-f-comum', slot: 'armadura' as const, rank: 0, quality: 'comum' as const, label: 'Couro Gasto', value: 0.85 };
    expect(msg.huntWin('ana', outcome({ fragmentRank: 1 }))).toBe(
      '@ana ⚔️ venceu um Lobo de Gelo [E] (27 vs 21) — +15 XP, +5 ouro · 💎 +1 Fragmento E',
    );
    expect(gearPower(sword)).toBe('+2 dano');
    expect(gearPower(leather)).toBe('×0,85 lesão');
    expect(msg.statusGear(sword, leather)).toBe('⚔️ Lâmina Enferrujada ★ +2 · 🛡️ Couro Gasto ×0,85');
    expect(msg.statusGear(null, null)).toBe('');
    expect(msg.status('ana', { title: null, classLabel: 'Guerreiro', rank: 0, level: 2, xpText: '5/40 XP', gold: 3,
      state: '✅ pronto para caçar', gear: '⚔️ Lâmina Enferrujada ★ +2' })).toBe(
      '@ana Guerreiro Rank F · Nv 2 (5/40 XP) · 3 ouro · ⚔️ Lâmina Enferrujada ★ +2 · ✅ pronto para caçar',
    );
    expect(msg.inventory('ana', 4, [], [{ rank: 0, qty: 4 }, { rank: 1, qty: 1 }], [
      { item: sword, equipped: true }, { item: leather, equipped: false },
    ])).toBe('@ana 🎒 4 ouro · 💎 F ×4 E ×1 · 1) ⚔️ Lâmina Enferrujada ★ [F] ✅ · 2) 🛡️ Couro Gasto [F]');
  });

  it('equipamento: comprar, forjar, equipar e recusas', () => {
    const common = { id: 'arma-f-comum', slot: 'arma' as const, rank: 0, quality: 'comum' as const, label: 'Lâmina Enferrujada', value: 1 };
    const forged = { ...common, id: 'arma-f-forjada', quality: 'forjada' as const, label: 'Lâmina Enferrujada ★', value: 2 };
    expect(msg.boughtGear('ana', common, 18, true, 2)).toBe(
      '@ana 🛒 comprou ⚔️ Lâmina Enferrujada [F] (+1 dano) por 18 ouro · equipado ✅ · ouro: 2',
    );
    expect(msg.boughtGear('ana', common, 18, false, 2)).toContain('guardado no !inventario');
    expect(msg.forged('ana', forged, { fragments: 6, gold: 6 }, true, 1)).toBe(
      '@ana 🔨 forjou ⚔️ Lâmina Enferrujada ★ [F] (+2 dano) com 6 💎 F e 6 ouro · equipado ✅ · sobram 1 💎 F',
    );
    expect(msg.alreadyOwn('ana', common)).toBe('@ana você já tem ⚔️ Lâmina Enferrujada [F].');
    expect(msg.forgeUsage('ana')).toBe('@ana use: !forjar arma|armadura [rank] (ex.: !forjar arma F)');
    expect(msg.forgeRank('ana', 0)).toBe('@ana você só pode forjar até o seu rank (F).');
    expect(msg.forgeFragments('ana', 0, 2, 6)).toBe('@ana faltam fragmentos: precisa de 6 💎 F e tem 2.');
    expect(msg.forgeGold('ana', 6, 1)).toBe('@ana ouro insuficiente para forjar: custa 6 e você tem 1.');
    expect(msg.equipUsage('ana')).toBe('@ana use: !equipar <número ou nome> (veja o !inventario)');
    expect(msg.equipNotFound('ana')).toBe('@ana você não tem esse item. Veja o !inventario.');
    expect(msg.equipRank('ana', { ...common, rank: 1, label: 'Espada de Ferro' })).toBe(
      '@ana ⚔️ Espada de Ferro [E] (+1 dano) é de rank acima do seu.',
    );
    expect(msg.equipped('ana', forged)).toBe('@ana ✅ equipou ⚔️ Lâmina Enferrujada ★ [F] (+2 dano).');
    expect(msg.help()).toContain('!forjar');
    expect(msg.help()).toContain('!equipar');
  });

  it('derrota, quebra e caídos do vermelho', () => {
    expect(msg.raidDefeat('azul', 'Goblin', 120)).toBe('💨 O tempo acabou: Goblin sobreviveu com 120 HP e o 🔵 PORTAL AZUL se fechou.');
    expect(msg.raidBreak('Hidra', 600_000)).toBe('⚠️ QUEBRA! Hidra escapou do portal. Todos os caçadores estão lesionados por 10min.');
    expect(msg.raidRedFallen([{ name: 'bia', xp: 20 }])).toBe('🔴 Quem terminou caído perdeu XP: bia (-20 XP)');
    expect(msg.raidWiped('vermelho', 'Ogro', 640)).toBe('💀 Todos caíram! Ogro venceu com 640 HP e o 🔴 PORTAL VERMELHO se fechou.');
  });

  it('lista de títulos marca o equipado', () => {
    const t = msg.titlesList('ana', [{ label: 'Top 2 · T1', equipped: false }, { label: 'Top 1 · T2', equipped: true }]);
    expect(t).toContain('1) Top 2 · T1');
    expect(t).toContain('2) Top 1 · T2 ✅');
  });

  it('loja, compra e inventário', () => {
    expect(msg.shop('ana', 1, [{ id: 'pocao', label: 'Poção de Cura', description: 'zera tudo', price: 13 }])).toBe(
      '@ana 🛒 Loja (preços do Rank E): Poção de Cura — 13 ouro (zera tudo) · use !comprar pocao',
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
