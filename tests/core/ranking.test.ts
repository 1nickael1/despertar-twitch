import { describe, expect, it } from 'vitest';
import { sortRanking } from '../../src/core/ranking';
import { makeHunter } from '../helpers';

describe('ranking', () => {
  it('ordena por rank, nível, XP e quem chegou primeiro', () => {
    const hs = [
      makeHunter({ userId: 'nivel-menor', rank: 2, level: 11 }),
      makeHunter({ userId: 'rank-maior', rank: 3, level: 15 }),
      makeHunter({ userId: 'chegou-depois', rank: 2, level: 12, xp: 5, rankReachedAt: 200 }),
      makeHunter({ userId: 'xp-maior', rank: 2, level: 12, xp: 9 }),
      makeHunter({ userId: 'chegou-antes', rank: 2, level: 12, xp: 5, rankReachedAt: 100 }),
    ];
    expect(sortRanking(hs).map((h) => h.userId)).toEqual([
      'rank-maior', 'xp-maior', 'chegou-antes', 'chegou-depois', 'nivel-menor',
    ]);
  });

  it('não altera o array original', () => {
    const hs = [makeHunter({ userId: 'a' }), makeHunter({ userId: 'b', rank: 1 })];
    sortRanking(hs);
    expect(hs.map((h) => h.userId)).toEqual(['a', 'b']);
  });
});
