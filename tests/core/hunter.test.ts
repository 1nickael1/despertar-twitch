import { describe, expect, it } from 'vitest';
import { createHunter, hasProgress, resetForNewSeason } from '../../src/core/hunter';
import { makeHunter } from '../helpers';

describe('hunter', () => {
  it('createHunter começa no Rank F nível 1 sem nada', () => {
    const h = createHunter('u9', 'bia', 'mago', 3, 500);
    expect(h).toEqual({
      userId: 'u9', displayName: 'bia', classId: 'mago', rank: 0, level: 1, xp: 0, gold: 0,
      rankReachedAt: 500, lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null,
      equippedTitleId: null, weaponId: null, armorId: null, seasonId: 3,
    });
  });

  it('resetForNewSeason zera progresso e mantém identidade, classe e título', () => {
    const h = makeHunter({ rank: 4, level: 22, xp: 90, gold: 300, lastHuntAt: 1, injuredUntil: 2,
      reevalBlockedUntil: 3, equippedTitleId: 'top1-t1', classId: 'tanque',
      weaponId: 'arma-c-forjada', armorId: 'armadura-c-comum' });
    const r = resetForNewSeason(h, 2, 999);
    expect(r).toMatchObject({ rank: 0, level: 1, xp: 0, gold: 0, rankReachedAt: 999, lastHuntAt: null,
      injuredUntil: null, reevalBlockedUntil: null, seasonId: 2, equippedTitleId: 'top1-t1',
      classId: 'tanque', userId: h.userId, displayName: h.displayName, weaponId: null, armorId: null });
  });

  it('hasProgress', () => {
    expect(hasProgress(makeHunter())).toBe(false);
    expect(hasProgress(makeHunter({ xp: 1 }))).toBe(true);
    expect(hasProgress(makeHunter({ level: 2 }))).toBe(true);
    expect(hasProgress(makeHunter({ rank: 1 }))).toBe(true);
  });
});
