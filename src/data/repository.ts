import type { HallOfFameEntry, Hunter, Season, Title } from '../core/types';

export interface GameRepository {
  getHunter(userId: string): Hunter | null;
  /** Insere ou atualiza. */
  saveHunter(h: Hunter): void;
  listHunters(): Hunter[];
  /** Ordenado por earnedAt e depois titleId. */
  getTitles(userId: string): Title[];
  /** Ignora título que o jogador já tem. */
  addTitle(userId: string, title: Title): void;
  /** Temporada em aberto mais recente. */
  getCurrentSeason(): Season | null;
  createSeason(s: Omit<Season, 'id'>): Season;
  markSeasonClosed(id: number, closedAt: number): void;
  addHallOfFame(entries: HallOfFameEntry[]): void;
  getHallOfFame(seasonId: number): HallOfFameEntry[];
  /** Itens do jogador com quantidade > 0, por id. */
  getItems(userId: string): Record<string, number>;
  /** Quantidade <= 0 remove o item. */
  setItemQty(userId: string, itemId: string, qty: number): void;
  /** Fim da temporada: ninguém fica com item. */
  clearAllItems(): void;
  transaction<T>(fn: () => T): T;
}
