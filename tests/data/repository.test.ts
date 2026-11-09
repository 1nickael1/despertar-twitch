import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import type { GameRepository } from '../../src/data/repository';
import { openDatabase, runMigrations, SqliteGameRepository } from '../../src/data/sqlite-repository';
import { makeHunter } from '../helpers';

const factories: [string, () => GameRepository][] = [
  ['memória', () => new MemoryGameRepository()],
  ['sqlite', () => new SqliteGameRepository(openDatabase(':memory:'))],
];

describe.each(factories)('GameRepository (%s)', (_name, make) => {
  let repo: GameRepository;
  beforeEach(() => {
    repo = make();
  });

  it('salva e lê caçador, incluindo nulos', () => {
    const h = makeHunter({ userId: 'u1', lastHuntAt: 123, equippedTitleId: null });
    repo.saveHunter(h);
    expect(repo.getHunter('u1')).toEqual(h);
    expect(repo.getHunter('nao-existe')).toBeNull();
  });

  it('saveHunter atualiza registro existente', () => {
    repo.saveHunter(makeHunter({ userId: 'u1', xp: 1 }));
    repo.saveHunter(makeHunter({ userId: 'u1', xp: 99, displayName: 'novo' }));
    expect(repo.getHunter('u1')).toMatchObject({ xp: 99, displayName: 'novo' });
    expect(repo.listHunters()).toHaveLength(1);
  });

  it('objeto devolvido não altera o armazenado', () => {
    repo.saveHunter(makeHunter({ userId: 'u1' }));
    const h = repo.getHunter('u1')!;
    h.xp = 999;
    expect(repo.getHunter('u1')!.xp).toBe(0);
  });

  it('títulos: ignora duplicado e ordena por data e id', () => {
    repo.addTitle('u1', { titleId: 'top1-t1', label: 'Top 1 · T1', seasonId: 1, earnedAt: 10 });
    repo.addTitle('u1', { titleId: 'rank-s-t1', label: 'Rank S · T1', seasonId: 1, earnedAt: 10 });
    repo.addTitle('u1', { titleId: 'top1-t1', label: 'Top 1 · T1', seasonId: 1, earnedAt: 10 });
    repo.addTitle('u1', { titleId: 'top2-t0', label: 'Top 2 · T0', seasonId: 0, earnedAt: 5 });
    expect(repo.getTitles('u1').map((t) => t.titleId)).toEqual(['top2-t0', 'rank-s-t1', 'top1-t1']);
    expect(repo.getTitles('outro')).toEqual([]);
  });

  it('temporadas: atual é a mais recente em aberto', () => {
    expect(repo.getCurrentSeason()).toBeNull();
    const s1 = repo.createSeason({ number: 1, startedAt: 0, endsAt: 100, closedAt: null });
    const s2 = repo.createSeason({ number: 2, startedAt: 100, endsAt: 200, closedAt: null });
    expect(s2.id).not.toBe(s1.id);
    expect(repo.getCurrentSeason()).toEqual(s2);
    repo.markSeasonClosed(s2.id, 150);
    expect(repo.getCurrentSeason()).toEqual(s1);
  });

  it('hall da fama por temporada, ordenado por posição', () => {
    repo.addHallOfFame([
      { seasonId: 1, position: 2, userId: 'b', displayName: 'b', finalRank: 3, finalLevel: 15 },
      { seasonId: 1, position: 1, userId: 'a', displayName: 'a', finalRank: 6, finalLevel: 33 },
      { seasonId: 2, position: 1, userId: 'c', displayName: 'c', finalRank: 1, finalLevel: 6 },
    ]);
    expect(repo.getHallOfFame(1).map((e) => e.userId)).toEqual(['a', 'b']);
  });

  it('transaction devolve o valor da função', () => {
    expect(repo.transaction(() => 42)).toBe(42);
  });

  it('itens: grava, atualiza, remove com zero e limpa tudo', () => {
    expect(repo.getItems('u1')).toEqual({});
    repo.setItemQty('u1', 'pocao', 3);
    repo.setItemQty('u2', 'pocao', 1);
    expect(repo.getItems('u1')).toEqual({ pocao: 3 });
    repo.setItemQty('u1', 'pocao', 2);
    expect(repo.getItems('u1')).toEqual({ pocao: 2 });
    repo.setItemQty('u1', 'pocao', 0);
    expect(repo.getItems('u1')).toEqual({});
    repo.clearAllItems();
    expect(repo.getItems('u2')).toEqual({});
  });
});

describe('SQLite', () => {
  it('transaction desfaz tudo se der erro', () => {
    const repo = new SqliteGameRepository(openDatabase(':memory:'));
    expect(() =>
      repo.transaction(() => {
        repo.saveHunter(makeHunter({ userId: 'u1' }));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(repo.getHunter('u1')).toBeNull();
  });

  it('migrações podem rodar de novo sem erro', () => {
    const db = openDatabase(':memory:');
    expect(() => runMigrations(db)).not.toThrow();
  });
});
