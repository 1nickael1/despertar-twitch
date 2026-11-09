import { describe, expect, it } from 'vitest';
import { closeSeason, newSeason } from '../../src/core/season';
import type { Season } from '../../src/core/types';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();
const DAY = 86_400_000;
const season: Season = { id: 1, number: 1, startedAt: 0, endsAt: 14 * DAY, closedAt: null };

describe('temporadas', () => {
  it('newSeason dura durationDays', () => {
    expect(newSeason(2, 1000, b)).toEqual({
      number: 2, startedAt: 1000, endsAt: 1000 + b.season.durationDays * DAY, closedAt: null,
    });
  });

  it('closeSeason: hall da fama, títulos e reset', () => {
    const hunters = [
      makeHunter({ userId: 'ana', displayName: 'ana', rank: 3, level: 17 }),
      makeHunter({ userId: 'bia', displayName: 'bia', rank: 6, level: 33, equippedTitleId: 'velho' }),
      makeHunter({ userId: 'caio', displayName: 'caio', rank: 2, level: 12 }),
      makeHunter({ userId: 'lurker', displayName: 'lurker' }),
      makeHunter({ userId: 'antigo', displayName: 'antigo', seasonId: 0, rank: 6 }),
    ];
    const r = closeSeason(hunters, season, 2, b, 777);

    expect(r.hallOfFame.map((e) => [e.position, e.userId, e.finalRank])).toEqual([
      [1, 'bia', 6], [2, 'ana', 3], [3, 'caio', 2],
    ]);
    expect(r.titles.map((t) => [t.userId, t.title.titleId, t.title.label])).toEqual([
      ['bia', 'top1-t1', 'Top 1 · T1'],
      ['ana', 'top2-t1', 'Top 2 · T1'],
      ['caio', 'top3-t1', 'Top 3 · T1'],
      ['bia', 'rank-s-t1', 'Rank S · T1'],
    ]);
    expect(r.titles.every((t) => t.title.earnedAt === 777 && t.title.seasonId === 1)).toBe(true);

    expect(r.resetHunters).toHaveLength(5);
    for (const h of r.resetHunters) {
      expect(h).toMatchObject({ rank: 0, level: 1, xp: 0, gold: 0, seasonId: 2 });
    }
    expect(r.resetHunters.find((h) => h.userId === 'bia')!.equippedTitleId).toBe('velho');
  });

  it('respeita o tamanho do hall da fama', () => {
    const many = Array.from({ length: b.season.hallOfFameSize + 2 }, (_, i) =>
      makeHunter({ userId: `u${i}`, level: 2 + i }),
    );
    expect(closeSeason(many, season, 2, b, 0).hallOfFame).toHaveLength(b.season.hallOfFameSize);
  });
});
