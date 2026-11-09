import type Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAdminAction, type AdminAction } from '../commands/admin';
import { parseCommand } from '../commands/parse';
import type { Balance } from '../config/balance';
import type { Clock } from '../core/clock';
import { isAtCap, xpToNext } from '../core/progression';
import { sortRanking } from '../core/ranking';
import { mathRng, type Rng } from '../core/rng';
import { MAX_RANK, rankLetter, type Hunter } from '../core/types';
import { openDatabase, SqliteGameRepository } from '../data/sqlite-repository';
import { GameService } from '../game/game-service';
import { fmtDuration } from '../game/messages';

const NAME_PATTERN = /^[A-Za-z0-9_]{1,25}$/;
const MAX_BODY_BYTES = 10_000;
const MAX_ADVANCE_MS = 60 * 86_400_000;

export interface HunterView {
  name: string;
  classLabel: string;
  title: string | null;
  rank: string;
  level: number;
  xp: number;
  xpToNext: number | null;
  gold: number;
  potions: number;
  status: string;
}

export interface BenchState {
  now: number;
  offsetMs: number;
  paused: boolean;
  season: { number: number; endsInMs: number };
  hunters: HunterView[];
}

/** Jogo completo com relógio que pode ser adiantado, para testar no navegador. */
export class TestBench {
  private offsetMs = 0;
  private readonly clock: Clock = { now: () => Date.now() + this.offsetMs };
  private db!: Database.Database;
  private repo!: SqliteGameRepository;
  private game!: GameService;

  constructor(
    private readonly balance: Balance,
    private readonly dbFile: string,
    private readonly rng: Rng = mathRng,
  ) {
    this.open();
  }

  private open(): void {
    this.db = openDatabase(this.dbFile);
    this.repo = new SqliteGameRepository(this.db);
    this.game = new GameService({ repo: this.repo, balance: this.balance, rng: this.rng, clock: this.clock });
    this.game.start();
  }

  /** Mensagem de chat simulada. Nunca administra o jogo. */
  command(name: string, text: string): { replies: string[]; ignored: boolean } {
    const cmd = parseCommand(text);
    if (!cmd) return { replies: [], ignored: true };
    return { replies: this.game.handle({ userId: `web:${name.toLowerCase()}`, displayName: name }, cmd), ignored: false };
  }

  /** Simula um comando digitado no terminal do bot. */
  admin(action: AdminAction): { replies: string[] } {
    return { replies: this.game.admin(action) };
  }

  /** Só na bancada local: dá ouro para testar a loja sem caçar por horas. */
  giveGold(name: string, amount: number): boolean {
    const h = this.repo.getHunter(`web:${name.toLowerCase()}`);
    if (!h) return false;
    this.repo.saveHunter({ ...h, gold: h.gold + amount });
    return true;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.db.close();
    if (this.dbFile !== ':memory:') {
      for (const suffix of ['', '-wal', '-shm']) rmSync(this.dbFile + suffix, { force: true });
    }
    this.offsetMs = 0;
    this.open();
  }

  state(): BenchState {
    const now = this.clock.now();
    const season = this.repo.getCurrentSeason();
    const hunters = season ? sortRanking(this.repo.listHunters().filter((h) => h.seasonId === season.id)) : [];
    return {
      now,
      offsetMs: this.offsetMs,
      paused: this.game.isPaused,
      season: { number: season?.number ?? 0, endsInMs: season ? Math.max(0, season.endsAt - now) : 0 },
      hunters: hunters.map((h) => this.view(h, now)),
    };
  }

  private view(h: Hunter, now: number): HunterView {
    const b = this.balance;
    const atCap = isAtCap(h, b);
    let status = 'pronto para caçar';
    if (h.injuredUntil !== null && h.injuredUntil > now) status = `lesionado (${fmtDuration(h.injuredUntil - now)})`;
    else if (h.lastHuntAt !== null && h.lastHuntAt + b.hunt.cooldownMs > now) {
      status = `descansando (${fmtDuration(h.lastHuntAt + b.hunt.cooldownMs - now)})`;
    }
    if (atCap && h.rank < MAX_RANK) status += ' · pode reavaliar';
    const title = h.equippedTitleId
      ? (this.repo.getTitles(h.userId).find((t) => t.titleId === h.equippedTitleId)?.label ?? null)
      : null;
    return {
      name: h.displayName,
      classLabel: b.classes[h.classId].label,
      title,
      rank: rankLetter(h.rank),
      level: h.level,
      xp: h.xp,
      xpToNext: atCap ? null : xpToNext(h.level, b),
      gold: h.gold,
      potions: this.repo.getItems(h.userId).pocao ?? 0,
      status,
    };
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const json = (res: ServerResponse, status: number, data: unknown) =>
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requisição grande demais.');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8') || '{}';
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Corpo da requisição não é um JSON válido.');
  }
}

export function createHandler(bench: TestBench, getIndexHtml: () => string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

      if (req.method === 'GET' && path === '/') return send(res, 200, getIndexHtml(), 'text/html; charset=utf-8');
      if (req.method === 'GET' && path === '/api/state') return json(res, 200, bench.state());

      if (req.method === 'POST' && path === '/api/command') {
        const body = await readJson(req);
        const { name, text } = body;
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
          throw new HttpError(400, 'Nome inválido: use de 1 a 25 letras, números ou _.');
        }
        if (typeof text !== 'string' || text.length > 500) throw new HttpError(400, 'Mensagem inválida.');
        return json(res, 200, bench.command(name, text));
      }

      if (req.method === 'POST' && path === '/api/admin') {
        const { action } = await readJson(req);
        if (!isAdminAction(action)) throw new HttpError(400, 'Ação de terminal inválida.');
        return json(res, 200, bench.admin(action));
      }

      if (req.method === 'POST' && path === '/api/advance') {
        const { ms } = await readJson(req);
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0 || ms > MAX_ADVANCE_MS) {
          throw new HttpError(400, 'Tempo inválido.');
        }
        bench.advance(ms);
        return json(res, 200, bench.state());
      }

      if (req.method === 'POST' && path === '/api/reset') {
        bench.reset();
        return json(res, 200, bench.state());
      }

      if (req.method === 'POST' && path === '/api/give-gold') {
        const { name, amount } = await readJson(req);
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) throw new HttpError(400, 'Nome inválido.');
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 100_000) {
          throw new HttpError(400, 'Quantidade de ouro inválida.');
        }
        if (!bench.giveGold(name, amount)) throw new HttpError(404, 'Essa pessoa ainda não despertou.');
        return json(res, 200, bench.state());
      }

      throw new HttpError(404, 'Rota não encontrada.');
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      console.error('[web] erro:', err instanceof Error ? err.message : err);
      return json(res, 500, { error: 'Erro interno. Veja o terminal do servidor.' });
    }
  };
}
