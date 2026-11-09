import type { HallOfFameEntry, Hunter, Season, Title } from '../core/types';
import type { GameRepository } from './repository';

const byEarned = (a: Title, b: Title) => a.earnedAt - b.earnedAt || a.titleId.localeCompare(b.titleId);

/** Implementação em memória para testes. transaction() não desfaz nada. */
export class MemoryGameRepository implements GameRepository {
  private hunters = new Map<string, Hunter>();
  private titles = new Map<string, Title[]>();
  private seasons: Season[] = [];
  private hall: HallOfFameEntry[] = [];
  private items = new Map<string, Map<string, number>>();

  getHunter(userId: string): Hunter | null {
    const h = this.hunters.get(userId);
    return h ? { ...h } : null;
  }

  saveHunter(h: Hunter): void {
    this.hunters.set(h.userId, { ...h });
  }

  listHunters(): Hunter[] {
    return [...this.hunters.values()].map((h) => ({ ...h }));
  }

  getTitles(userId: string): Title[] {
    return (this.titles.get(userId) ?? []).map((t) => ({ ...t })).sort(byEarned);
  }

  addTitle(userId: string, title: Title): void {
    const list = this.titles.get(userId) ?? [];
    if (!list.some((t) => t.titleId === title.titleId)) list.push({ ...title });
    this.titles.set(userId, list);
  }

  getCurrentSeason(): Season | null {
    const open = this.seasons.filter((s) => s.closedAt === null);
    const last = open[open.length - 1];
    return last ? { ...last } : null;
  }

  createSeason(s: Omit<Season, 'id'>): Season {
    const season = { ...s, id: this.seasons.length + 1 };
    this.seasons.push(season);
    return { ...season };
  }

  markSeasonClosed(id: number, closedAt: number): void {
    const s = this.seasons.find((x) => x.id === id);
    if (s) s.closedAt = closedAt;
  }

  addHallOfFame(entries: HallOfFameEntry[]): void {
    this.hall.push(...entries.map((e) => ({ ...e })));
  }

  getHallOfFame(seasonId: number): HallOfFameEntry[] {
    return this.hall
      .filter((e) => e.seasonId === seasonId)
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ ...e }));
  }

  getItems(userId: string): Record<string, number> {
    return Object.fromEntries(this.items.get(userId) ?? []);
  }

  setItemQty(userId: string, itemId: string, qty: number): void {
    const bag = this.items.get(userId) ?? new Map<string, number>();
    if (qty > 0) bag.set(itemId, qty);
    else bag.delete(itemId);
    this.items.set(userId, bag);
  }

  clearAllItems(): void {
    this.items.clear();
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }
}
