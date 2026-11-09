import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClassId, HallOfFameEntry, Hunter, Season, Title } from '../core/types';
import type { GameRepository } from './repository';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function runMigrations(db: Database.Database, dir: string = MIGRATIONS_DIR): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const rows = db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[];
  const applied = new Set(rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    })();
  }
}

export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}

interface HunterRow {
  user_id: string;
  display_name: string;
  class_id: string;
  rank: number;
  level: number;
  xp: number;
  gold: number;
  rank_reached_at: number;
  last_hunt_at: number | null;
  injured_until: number | null;
  reeval_blocked_until: number | null;
  equipped_title_id: string | null;
  season_id: number;
}

interface TitleRow {
  title_id: string;
  label: string;
  season_id: number;
  earned_at: number;
}

interface SeasonRow {
  id: number;
  number: number;
  started_at: number;
  ends_at: number;
  closed_at: number | null;
}

interface HallRow {
  season_id: number;
  position: number;
  user_id: string;
  display_name: string;
  final_rank: number;
  final_level: number;
}

const toHunter = (r: HunterRow): Hunter => ({
  userId: r.user_id,
  displayName: r.display_name,
  classId: r.class_id as ClassId,
  rank: r.rank,
  level: r.level,
  xp: r.xp,
  gold: r.gold,
  rankReachedAt: r.rank_reached_at,
  lastHuntAt: r.last_hunt_at,
  injuredUntil: r.injured_until,
  reevalBlockedUntil: r.reeval_blocked_until,
  equippedTitleId: r.equipped_title_id,
  seasonId: r.season_id,
});

const toTitle = (r: TitleRow): Title => ({
  titleId: r.title_id,
  label: r.label,
  seasonId: r.season_id,
  earnedAt: r.earned_at,
});

const toSeason = (r: SeasonRow): Season => ({
  id: r.id,
  number: r.number,
  startedAt: r.started_at,
  endsAt: r.ends_at,
  closedAt: r.closed_at,
});

const toHall = (r: HallRow): HallOfFameEntry => ({
  seasonId: r.season_id,
  position: r.position,
  userId: r.user_id,
  displayName: r.display_name,
  finalRank: r.final_rank,
  finalLevel: r.final_level,
});

export class SqliteGameRepository implements GameRepository {
  constructor(private readonly db: Database.Database) {}

  getHunter(userId: string): Hunter | null {
    const r = this.db.prepare('SELECT * FROM hunters WHERE user_id = ?').get(userId) as HunterRow | undefined;
    return r ? toHunter(r) : null;
  }

  saveHunter(h: Hunter): void {
    this.db
      .prepare(
        `INSERT INTO hunters (user_id, display_name, class_id, rank, level, xp, gold, rank_reached_at,
           last_hunt_at, injured_until, reeval_blocked_until, equipped_title_id, season_id)
         VALUES (@userId, @displayName, @classId, @rank, @level, @xp, @gold, @rankReachedAt,
           @lastHuntAt, @injuredUntil, @reevalBlockedUntil, @equippedTitleId, @seasonId)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name, class_id = excluded.class_id, rank = excluded.rank,
           level = excluded.level, xp = excluded.xp, gold = excluded.gold,
           rank_reached_at = excluded.rank_reached_at, last_hunt_at = excluded.last_hunt_at,
           injured_until = excluded.injured_until, reeval_blocked_until = excluded.reeval_blocked_until,
           equipped_title_id = excluded.equipped_title_id, season_id = excluded.season_id`,
      )
      .run(h);
  }

  listHunters(): Hunter[] {
    return (this.db.prepare('SELECT * FROM hunters').all() as HunterRow[]).map(toHunter);
  }

  getTitles(userId: string): Title[] {
    const rows = this.db
      .prepare(
        'SELECT title_id, label, season_id, earned_at FROM hunter_titles WHERE user_id = ? ORDER BY earned_at, title_id',
      )
      .all(userId) as TitleRow[];
    return rows.map(toTitle);
  }

  addTitle(userId: string, t: Title): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO hunter_titles (user_id, title_id, label, season_id, earned_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, t.titleId, t.label, t.seasonId, t.earnedAt);
  }

  getCurrentSeason(): Season | null {
    const r = this.db
      .prepare('SELECT * FROM seasons WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1')
      .get() as SeasonRow | undefined;
    return r ? toSeason(r) : null;
  }

  createSeason(s: Omit<Season, 'id'>): Season {
    const info = this.db
      .prepare('INSERT INTO seasons (number, started_at, ends_at, closed_at) VALUES (?, ?, ?, ?)')
      .run(s.number, s.startedAt, s.endsAt, s.closedAt);
    return { ...s, id: Number(info.lastInsertRowid) };
  }

  markSeasonClosed(id: number, closedAt: number): void {
    this.db.prepare('UPDATE seasons SET closed_at = ? WHERE id = ?').run(closedAt, id);
  }

  addHallOfFame(entries: HallOfFameEntry[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO hall_of_fame (season_id, position, user_id, display_name, final_rank, final_level)
       VALUES (@seasonId, @position, @userId, @displayName, @finalRank, @finalLevel)`,
    );
    for (const e of entries) stmt.run(e);
  }

  getHallOfFame(seasonId: number): HallOfFameEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM hall_of_fame WHERE season_id = ? ORDER BY position')
      .all(seasonId) as HallRow[];
    return rows.map(toHall);
  }

  getItems(userId: string): Record<string, number> {
    const rows = this.db
      .prepare('SELECT item_id, qty FROM hunter_items WHERE user_id = ? ORDER BY item_id')
      .all(userId) as { item_id: string; qty: number }[];
    return Object.fromEntries(rows.map((r) => [r.item_id, r.qty]));
  }

  setItemQty(userId: string, itemId: string, qty: number): void {
    if (qty <= 0) {
      this.db.prepare('DELETE FROM hunter_items WHERE user_id = ? AND item_id = ?').run(userId, itemId);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO hunter_items (user_id, item_id, qty) VALUES (?, ?, ?)
         ON CONFLICT(user_id, item_id) DO UPDATE SET qty = excluded.qty`,
      )
      .run(userId, itemId, qty);
  }

  clearAllItems(): void {
    this.db.prepare('DELETE FROM hunter_items').run();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
