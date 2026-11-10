import type Database from 'better-sqlite3';
import { rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { toAdminCommand, type AdminCommand } from '../commands/admin';
import { parseCommand } from '../commands/parse';
import type { Balance } from '../config/balance';
import type { Clock } from '../core/clock';
import { equipmentById, ownedFragments } from '../core/equipment';
import { isAtCap, xpToNext } from '../core/progression';
import { sortRanking } from '../core/ranking';
import { mathRng, type Rng } from '../core/rng';
import { MAX_RANK, rankLetter, type Hunter, type PortalType } from '../core/types';
import { openDatabase, SqliteGameRepository } from '../data/sqlite-repository';
import { AdminRefusal, GameService } from '../game/game-service';
import { fmtDuration, msg } from '../game/messages';
import { OverlayHub } from '../overlay/hub';
import { handleOverlayRoute } from '../overlay/server';
import { buildOverlaySnapshot, type OverlaySnapshot } from '../overlay/snapshot';

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
  /** Arma e armadura equipadas ('—' = nada). */
  gear: string;
  /** Fragmentos por rank ('—' = nenhum). */
  fragments: string;
  status: string;
}

export interface RaidView {
  type: PortalType;
  bossName: string;
  hp: number;
  maxHp: number;
  phase: 'entrada' | 'batalha';
  round: number;
  totalRounds: number;
  /** Até a entrada fechar (entrada) ou até a próxima rodada (batalha). */
  nextInMs: number;
  participants: { name: string; classLabel: string; damage: number; down: boolean }[];
}

export interface BenchState {
  now: number;
  offsetMs: number;
  paused: boolean;
  season: { number: number; endsInMs: number };
  hunters: HunterView[];
  /** Anúncios do relógio do jogo desde a última leitura (portal, rodadas, temporada). */
  announcements: string[];
  raid: RaidView | null;
  nextPortalInMs: number | null;
}

/** Jogo completo com relógio que pode ser adiantado, para testar no navegador. */
export class TestBench {
  private offsetMs = 0;
  private pending: string[] = [];
  /** Overlay ligado ao jogo de teste (o relógio adiantado vale para ele também). */
  readonly overlay = new OverlayHub(() => this.overlaySnapshot());
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
  admin(cmd: AdminCommand): { replies: string[] } {
    return { replies: this.game.admin(cmd) };
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
    this.pending = [];
    this.open();
  }

  /** Roda o relógio do jogo; os anúncios ficam guardados até a página pedir o estado. */
  private tick(): void {
    this.pending.push(...this.game.tick());
  }

  overlaySnapshot(): OverlaySnapshot {
    return buildOverlaySnapshot(this.game, this.repo, this.balance, this.clock.now());
  }

  /** Relógio do jogo sem a página aberta: guarda os anúncios para a página e atualiza o overlay. */
  pulse(): void {
    this.tick();
    this.overlay.publish();
  }

  state(): BenchState {
    this.tick();
    const now = this.clock.now();
    const season = this.repo.getCurrentSeason();
    const hunters = season ? sortRanking(this.repo.listHunters().filter((h) => h.seasonId === season.id)) : [];
    return {
      now,
      offsetMs: this.offsetMs,
      paused: this.game.isPaused,
      season: { number: season?.number ?? 0, endsInMs: season ? Math.max(0, season.endsAt - now) : 0 },
      hunters: hunters.map((h) => this.view(h, now)),
      announcements: this.pending.splice(0),
      raid: this.raidView(now),
      nextPortalInMs: this.game.nextPortalAt === null ? null : Math.max(0, this.game.nextPortalAt - now),
    };
  }

  private raidView(now: number): RaidView | null {
    const raid = this.game.currentRaid;
    if (!raid) return null;
    const b = this.balance;
    const nextAt = raid.started ? raid.battleStartsAt + (raid.round + 1) * b.raid.roundMs : raid.battleStartsAt;
    return {
      type: raid.type,
      bossName: raid.bossName,
      hp: raid.hp,
      maxHp: raid.maxHp,
      phase: raid.started ? 'batalha' : 'entrada',
      round: raid.round,
      totalRounds: raid.totalRounds,
      nextInMs: Math.max(0, nextAt - now),
      participants: raid.participants.map((p) => ({
        name: p.displayName,
        classLabel: b.classes[p.classId].label,
        damage: p.damage,
        down: p.down,
      })),
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
    const owned = this.repo.getItems(h.userId);
    const gear = msg.statusGear(
      h.weaponId ? equipmentById(h.weaponId, b) : null,
      h.armorId ? equipmentById(h.armorId, b) : null,
    );
    const fragments = ownedFragments(owned)
      .map((f) => `${rankLetter(f.rank)} ×${f.qty}`)
      .join(' ');
    return {
      name: h.displayName,
      classLabel: b.classes[h.classId].label,
      title,
      rank: rankLetter(h.rank),
      level: h.level,
      xp: h.xp,
      xpToNext: atCap ? null : xpToNext(h.level, b),
      gold: h.gold,
      potions: owned.pocao ?? 0,
      gear: gear || '—',
      fragments: fragments || '—',
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

export function createHandler(bench: TestBench, getIndexHtml: () => string, getOverlayHtml: () => string = () => '') {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    try {
      if (handleOverlayRoute(req, res, bench.overlay, getOverlayHtml)) return;

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
        const { action, portal } = await readJson(req);
        const cmd = toAdminCommand(action, portal);
        if (!cmd) throw new HttpError(400, 'Ação de terminal inválida.');
        try {
          return json(res, 200, bench.admin(cmd));
        } catch (err) {
          if (err instanceof AdminRefusal) throw new HttpError(409, `Recusado: ${err.message}`);
          throw err;
        }
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
    } finally {
      // Qualquer chamada da página pode ter mudado o jogo: o overlay recebe o estado novo se mudou.
      if (path.startsWith('/api/')) bench.overlay.publish();
    }
  };
}
