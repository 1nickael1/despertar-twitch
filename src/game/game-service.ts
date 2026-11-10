import type { AdminCommand } from '../commands/admin';
import { normalizeText, type Command } from '../commands/parse';
import type { Balance } from '../config/balance';
import type { Clock } from '../core/clock';
import { resolveHunt } from '../core/combat';
import { createHunter } from '../core/hunter';
import { isAtCap, levelCap, xpToNext } from '../core/progression';
import {
  applyRaidReward,
  breakPenalty,
  joinRaid,
  markAttack,
  openRaid,
  raidRewards,
  resolveRound,
  reviveWithPotion,
  rollPortalType,
  type Raid,
} from '../core/raid';
import { sortRanking } from '../core/ranking';
import { resolveReevaluation } from '../core/reevaluation';
import { pick, type Rng } from '../core/rng';
import { closeSeason, newSeason } from '../core/season';
import { buyItem, findItem, healHunter, itemIds, itemPrice } from '../core/shop';
import { CLASS_IDS, MAX_RANK, type Hunter, type PortalType, type Season } from '../core/types';
import type { GameRepository } from '../data/repository';
import { fmtDuration, msg } from './messages';

/** Quem fala no chat. De propósito não existe "moderador": o chat nunca administra o jogo. */
export interface Author {
  userId: string;
  displayName: string;
}

export interface GameDeps {
  repo: GameRepository;
  balance: Balance;
  rng: Rng;
  clock: Clock;
}

/** Pedido do terminal que não pode ser atendido agora. O motivo vai só para o terminal, nunca ao chat. */
export class AdminRefusal extends Error {}

const BLOCKED_WHEN_PAUSED = new Set<Command['kind']>([
  'despertar',
  'cacar',
  'reavaliar',
  'comprar',
  'usar',
  'raid',
  'atacar',
]);

export class GameService {
  private paused = false;
  private readonly lastCommandAt = new Map<string, number>();
  private readonly notifiedUntil = new Map<string, number>();
  /** Raid em andamento. Só em memória: reiniciar o bot cancela a raid. */
  private raid: Raid | null = null;
  private nextPortal: number | null = null;

  constructor(private readonly deps: GameDeps) {}

  /** Garante uma temporada ativa (e vira a temporada se já acabou) e agenda o primeiro portal. Devolve anúncios. */
  start(): string[] {
    const now = this.deps.clock.now();
    this.nextPortal ??= now + this.deps.balance.raid.intervalMs;
    return this.ensureSeason(now);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get currentRaid(): Raid | null {
    return this.raid;
  }

  get nextPortalAt(): number | null {
    return this.nextPortal;
  }

  /** Relógio do jogo: chamado a cada 1 s. Vira temporada, abre portal e resolve rodadas. Devolve anúncios. */
  tick(): string[] {
    const now = this.deps.clock.now();
    const out = this.ensureSeason(now);
    if (this.paused) return out;
    if (this.raid) return [...out, ...this.advanceRaid(now)];
    if (this.nextPortal !== null && now >= this.nextPortal) {
      if (this.deps.repo.listHunters().length === 0) this.nextPortal = now + this.deps.balance.raid.intervalMs;
      else out.push(...this.openPortal(null, now));
    }
    return out;
  }

  /** Comandos vindos do chat. */
  handle(author: Author, cmd: Command): string[] {
    const now = this.deps.clock.now();
    if (this.isDuplicate(author.userId, cmd, now)) return [];
    const announcements = this.ensureSeason(now);
    if (this.paused && BLOCKED_WHEN_PAUSED.has(cmd.kind)) return announcements;
    return [...announcements, ...this.dispatch(author, cmd, now)];
  }

  // ---------- infraestrutura ----------

  /** Repetido = mesmo comando com os mesmos argumentos (pausar ≠ retomar, !titulo 1 ≠ !titulo 2). */
  private isDuplicate(userId: string, cmd: Command, now: number): boolean {
    const key = `${userId}:${JSON.stringify(cmd)}`;
    const last = this.lastCommandAt.get(key);
    this.lastCommandAt.set(key, now);
    return last !== undefined && now - last < this.deps.balance.chat.duplicateWindowMs;
  }

  /** Responde só na primeira vez para cada janela de bloqueio (evita flood de "espere"). */
  private notifyOnce(key: string, until: number, text: string): string[] {
    if (this.notifiedUntil.get(key) === until) return [];
    this.notifiedUntil.set(key, until);
    return [text];
  }

  private currentSeason(): Season {
    const s = this.deps.repo.getCurrentSeason();
    if (!s) throw new Error('Nenhuma temporada ativa');
    return s;
  }

  private ensureSeason(now: number): string[] {
    const current = this.deps.repo.getCurrentSeason();
    if (!current) {
      this.deps.repo.createSeason(newSeason(1, now, this.deps.balance));
      return [];
    }
    return now >= current.endsAt ? this.rollSeason(current, now) : [];
  }

  private rollSeason(current: Season, now: number): string[] {
    const { repo, balance } = this.deps;
    const announcements = repo.transaction(() => {
      const next = repo.createSeason(newSeason(current.number + 1, now, balance));
      const result = closeSeason(repo.listHunters(), current, next.id, balance, now);
      repo.markSeasonClosed(current.id, now);
      repo.addHallOfFame(result.hallOfFame);
      for (const t of result.titles) repo.addTitle(t.userId, t.title);
      for (const h of result.resetHunters) repo.saveHunter(h);
      repo.clearAllItems();
      const podium = result.hallOfFame.slice(0, 3).map((e) => e.displayName);
      return [msg.seasonEnded(current.number, podium), msg.seasonStarted(next.number, next.endsAt - now)];
    });
    return [...announcements, ...this.cancelRaid(now)];
  }

  /** Administração. Só o terminal do bot chama isto; nenhum caminho do chat chega aqui. */
  admin(cmd: AdminCommand): string[] {
    const now = this.deps.clock.now();
    switch (cmd.action) {
      case 'pausar':
        this.paused = true;
        return [msg.paused(), ...this.cancelRaid(now)];
      case 'retomar':
        this.paused = false;
        this.nextPortal = now + this.deps.balance.raid.intervalMs;
        return [msg.resumed()];
      case 'encerrar-temporada': {
        const rolled = this.ensureSeason(now);
        return rolled.length > 0 ? rolled : this.rollSeason(this.currentSeason(), now);
      }
      case 'portal':
        return this.openPortal(cmd.portal, now);
    }
  }

  // ---------- comandos ----------

  private dispatch(author: Author, cmd: Command, now: number): string[] {
    switch (cmd.kind) {
      case 'despertar':
        return [this.awaken(author, now)];
      case 'temporada': {
        const s = this.currentSeason();
        return [msg.season(s.number, s.endsAt - now)];
      }
      case 'ajuda':
        return [msg.help()];
      case 'ranking':
        return this.ranking(author, cmd.self);
      default:
        break;
    }

    const stored = this.deps.repo.getHunter(author.userId);
    if (!stored) return [msg.notAwakened(author.displayName)];
    const h = this.syncName(stored, author.displayName);

    switch (cmd.kind) {
      case 'cacar':
        return this.hunt(h, now);
      case 'reavaliar':
        return this.reevaluate(h, now);
      case 'status':
        return [this.status(h, now)];
      case 'titulos':
        return [this.listTitles(h)];
      case 'titulo':
        return [this.equipTitle(h, cmd.arg)];
      case 'loja':
        return [this.shop(h)];
      case 'comprar':
        return [this.buy(h, cmd.item, cmd.qty)];
      case 'usar':
        return [this.useItem(h, cmd.item, now)];
      case 'inventario':
        return [this.inventory(h)];
      case 'raid':
        return this.joinRaidCommand(h, now);
      case 'atacar':
        return this.attack(h);
      default:
        return [];
    }
  }

  // ---------- raid ----------

  private inRaid(userId: string): boolean {
    return this.raid?.participants.some((p) => p.userId === userId) ?? false;
  }

  /** Abre um portal agora. Pelo terminal, recusa com AdminRefusal (o motivo não vai ao chat). */
  private openPortal(type: PortalType | null, now: number): string[] {
    const { repo, balance: b, rng } = this.deps;
    if (this.paused) throw new AdminRefusal('o jogo está pausado; use /retomar antes.');
    if (this.raid) throw new AdminRefusal('já existe um portal aberto.');
    const hunters = repo.listHunters();
    if (hunters.length === 0) throw new AdminRefusal('ninguém despertou ainda.');
    const portalType = type ?? rollPortalType(b, rng);
    const strongest = Math.max(...hunters.map((h) => h.rank));
    this.raid = openRaid(portalType, pick(rng, b.monsters[strongest]), now, b);
    this.nextPortal = null;
    return [msg.portalOpened(portalType, this.raid.bossName, this.raid.maxHp, b.raid.entryMs)];
  }

  /** Fecha a entrada e resolve as rodadas que já venceram (todas, se o bot atrasou). */
  private advanceRaid(now: number): string[] {
    const b = this.deps.balance;
    let raid = this.raid!;
    const out: string[] = [];
    if (!raid.started) {
      if (now < raid.battleStartsAt) return [];
      if (raid.participants.length === 0) return this.finishRaid(raid, false, now);
      raid = { ...raid, started: true };
      out.push(
        msg.raidBattleStarted(
          raid.bossName,
          raid.participants.length,
          raid.totalRounds,
          b.raid.roundMs,
          Math.round(b.raid.attackBonus * 100),
        ),
      );
    }
    while (raid.round < raid.totalRounds && now >= raid.battleStartsAt + (raid.round + 1) * b.raid.roundMs) {
      const { raid: next, report } = resolveRound(raid, b, this.deps.rng);
      raid = next;
      out.push(msg.raidRound(raid.bossName, report));
      if (report.won) return [...out, ...this.finishRaid(raid, true, now)];
    }
    this.raid = raid;
    if (raid.round >= raid.totalRounds) out.push(...this.finishRaid(raid, false, now));
    return out;
  }

  /** Grava recompensas, perdas e lesões numa transação só e agenda o próximo portal. */
  private finishRaid(raid: Raid, won: boolean, now: number): string[] {
    const { repo, balance: b } = this.deps;
    this.raid = null;
    this.nextPortal = now + b.raid.intervalMs;
    if (raid.participants.length === 0 && raid.type !== 'quebra') return [msg.portalClosedEmpty(raid.type)];
    const rewards = raidRewards(raid, won, b);
    const broke = !won && raid.type === 'quebra';
    repo.transaction(() => {
      for (const r of rewards) {
        const h = repo.getHunter(r.userId);
        if (h) repo.saveHunter(applyRaidReward(h, r, b).hunter);
      }
      if (broke) for (const h of repo.listHunters()) repo.saveHunter(breakPenalty(h, now, b));
    });
    const out: string[] = [];
    if (won) out.push(...msg.raidVictory(raid.type, raid.bossName, rewards));
    else if (broke) out.push(msg.raidBreak(raid.bossName, b.raid.breakInjuryMs));
    else out.push(msg.raidDefeat(raid.type, raid.bossName, raid.hp));
    const fallen = rewards.filter((r) => r.xpLoss > 0);
    if (fallen.length > 0) out.push(msg.raidRedFallen(fallen.map((r) => ({ name: r.displayName, xp: r.xpLoss }))));
    return out;
  }

  /** Pausa e virada de temporada: a raid some sem recompensa e sem penalidade. */
  private cancelRaid(now: number): string[] {
    if (!this.raid) return [];
    this.raid = null;
    this.nextPortal = now + this.deps.balance.raid.intervalMs;
    return [msg.raidCancelled()];
  }

  private joinRaidCommand(h: Hunter, now: number): string[] {
    if (!this.raid) return this.notifyOnce(`${h.userId}:raid`, this.nextPortal ?? 0, msg.raidNone(h.displayName));
    const r = joinRaid(this.raid, h, now);
    if (r.ok) {
      this.raid = r.raid;
      return [msg.raidJoined(h.displayName, r.raid.participants.length)];
    }
    switch (r.reason) {
      case 'already':
        return [];
      case 'injured':
        return [msg.raidInjured(h.displayName, h.injuredUntil! - now)];
      case 'closed':
        return this.notifyOnce(`${h.userId}:raid`, this.raid.openedAt, msg.raidEntryClosed(h.displayName));
    }
  }

  /** !atacar responde só nos erros (e uma vez); quando dá certo, o resumo da rodada conta. */
  private attack(h: Hunter): string[] {
    if (!this.raid) return this.notifyOnce(`${h.userId}:atacar`, this.nextPortal ?? 0, msg.attackNoRaid(h.displayName));
    const r = markAttack(this.raid, h.userId);
    if (r.ok) {
      this.raid = r.raid;
      return [];
    }
    const at = this.raid.openedAt;
    switch (r.reason) {
      case 'already':
        return [];
      case 'not-in-raid':
        return this.notifyOnce(`${h.userId}:atacar`, at, msg.attackNotIn(h.displayName));
      case 'not-started':
        return this.notifyOnce(`${h.userId}:atacar:espera`, at, msg.attackNotStarted(h.displayName));
      case 'down':
        return this.notifyOnce(`${h.userId}:atacar:caido`, at, msg.attackDown(h.displayName));
    }
  }

  // ---------- loja ----------

  private shop(h: Hunter): string {
    const b = this.deps.balance;
    const entries = itemIds(b).map((id) => ({
      id,
      label: b.shop.items[id].label,
      description: b.shop.items[id].description,
      price: itemPrice(id, h.rank, b),
    }));
    return msg.shop(h.displayName, h.rank, entries);
  }

  private buy(h: Hunter, itemQuery: string, qty: number): string {
    const { repo, balance: b } = this.deps;
    if (!itemQuery) return msg.buyUsage(h.displayName);
    const id = findItem(itemQuery, b);
    if (!id) return msg.itemNotFound(h.displayName);
    const label = b.shop.items[id].label;
    const r = buyItem(h, id, qty, b);
    if (!r.ok) {
      return r.reason === 'qty'
        ? msg.buyQty(h.displayName, r.max)
        : msg.notEnoughGold(h.displayName, label, qty, r.total, h.gold);
    }
    const owned = (repo.getItems(h.userId)[id] ?? 0) + qty;
    repo.transaction(() => {
      repo.saveHunter(r.hunter);
      repo.setItemQty(h.userId, id, owned);
    });
    return msg.bought(h.displayName, label, qty, r.total, owned, r.hunter.gold);
  }

  private useItem(h: Hunter, itemQuery: string, now: number): string {
    const { repo, balance: b } = this.deps;
    if (!itemQuery) return msg.useUsage(h.displayName);
    const id = findItem(itemQuery, b);
    if (!id) return msg.itemNotFound(h.displayName);
    const label = b.shop.items[id].label;
    const have = repo.getItems(h.userId)[id] ?? 0;
    if (have < 1) return msg.noItem(h.displayName, label);
    const revived = this.raid ? reviveWithPotion(this.raid, h.userId) : null;
    if (revived) {
      const healed = healHunter(h, now, b).hunter;
      repo.transaction(() => {
        repo.saveHunter(healed);
        repo.setItemQty(h.userId, id, have - 1);
      });
      this.raid = revived;
      return msg.raidRevived(h.displayName, label, have - 1);
    }
    const r = healHunter(h, now, b);
    if (!r.healed) return msg.nothingToHeal(h.displayName, label);
    repo.transaction(() => {
      repo.saveHunter(r.hunter);
      repo.setItemQty(h.userId, id, have - 1);
    });
    return msg.healed(h.displayName, label, have - 1);
  }

  private inventory(h: Hunter): string {
    const b = this.deps.balance;
    const owned = this.deps.repo.getItems(h.userId);
    const items = itemIds(b)
      .filter((id) => (owned[id] ?? 0) > 0)
      .map((id) => ({ label: b.shop.items[id].label, qty: owned[id] }));
    return msg.inventory(h.displayName, h.gold, items);
  }

  private syncName(h: Hunter, displayName: string): Hunter {
    if (h.displayName === displayName) return h;
    const updated = { ...h, displayName };
    this.deps.repo.saveHunter(updated);
    return updated;
  }

  private classLabel(h: Hunter): string {
    return this.deps.balance.classes[h.classId].label;
  }

  private titleLabel(h: Hunter): string | null {
    if (!h.equippedTitleId) return null;
    return this.deps.repo.getTitles(h.userId).find((t) => t.titleId === h.equippedTitleId)?.label ?? null;
  }

  private awaken(author: Author, now: number): string {
    const { repo, rng } = this.deps;
    const existing = repo.getHunter(author.userId);
    if (existing) return msg.alreadyAwakened(author.displayName, this.classLabel(existing), existing.rank);
    const classId = pick(rng, CLASS_IDS);
    const h = createHunter(author.userId, author.displayName, classId, this.currentSeason().id, now);
    repo.saveHunter(h);
    return msg.awakened(author.displayName, this.classLabel(h));
  }

  private hunt(h: Hunter, now: number): string[] {
    const b = this.deps.balance;
    if (this.inRaid(h.userId)) return [msg.inRaid(h.displayName)];
    if (h.injuredUntil !== null && h.injuredUntil > now) {
      return this.notifyOnce(`${h.userId}:injured`, h.injuredUntil, msg.injured(h.displayName, h.injuredUntil - now));
    }
    const readyAt = h.lastHuntAt === null ? 0 : h.lastHuntAt + b.hunt.cooldownMs;
    if (readyAt > now) {
      return this.notifyOnce(`${h.userId}:cooldown`, readyAt, msg.onCooldown(h.displayName, readyAt - now));
    }
    const o = resolveHunt(h, b, this.deps.rng, now);
    this.deps.repo.saveHunter(o.hunter);
    let text = o.won ? msg.huntWin(h.displayName, o) : msg.huntLoss(h.displayName, o, b.hunt.injuryMs);
    if (o.levelsGained > 0) {
      text += msg.levelUpSuffix(o.hunter.level);
      if (isAtCap(o.hunter, b) && o.hunter.rank < MAX_RANK) text += msg.capReachedSuffix();
    }
    return [text];
  }

  private reevaluate(h: Hunter, now: number): string[] {
    const b = this.deps.balance;
    if (h.rank >= MAX_RANK) return [msg.reevalAlreadyS(h.displayName)];
    if (!isAtCap(h, b)) return [msg.reevalNotAtCap(h.displayName, h.level, levelCap(h.rank, b))];
    if (h.reevalBlockedUntil !== null && h.reevalBlockedUntil > now) {
      return this.notifyOnce(
        `${h.userId}:reeval`,
        h.reevalBlockedUntil,
        msg.reevalBlocked(h.displayName, h.reevalBlockedUntil - now),
      );
    }
    const r = resolveReevaluation(h, b, this.deps.rng, now);
    this.deps.repo.saveHunter(r.hunter);
    switch (r.kind) {
      case 'success':
        return [msg.reevalSuccess(h.displayName, r.toRank)];
      case 'reawakening':
        return [msg.reawakening(h.displayName, r.fromRank, r.toRank)];
      case 'failure':
        return [msg.reevalFail(h.displayName, b.reevaluation.failBlockMs)];
    }
  }

  private status(h: Hunter, now: number): string {
    const b = this.deps.balance;
    const atCap = isAtCap(h, b);
    let state: string;
    if (h.injuredUntil !== null && h.injuredUntil > now) {
      state = `🩹 lesionado (${fmtDuration(h.injuredUntil - now)})`;
    } else if (h.lastHuntAt !== null && h.lastHuntAt + b.hunt.cooldownMs > now) {
      state = `💤 descansando (${fmtDuration(h.lastHuntAt + b.hunt.cooldownMs - now)})`;
    } else {
      state = '✅ pronto para caçar';
    }
    if (atCap && h.rank < MAX_RANK) state += ' · ⭐ pronto para !reavaliar';
    return msg.status(h.displayName, {
      title: this.titleLabel(h),
      classLabel: this.classLabel(h),
      rank: h.rank,
      level: h.level,
      xpText: atCap ? `${h.xp} XP guardado` : `${h.xp}/${xpToNext(h.level, b)} XP`,
      gold: h.gold,
      state,
    });
  }

  private ranking(author: Author, self: boolean): string[] {
    const season = this.currentSeason();
    const ranked = sortRanking(this.deps.repo.listHunters().filter((h) => h.seasonId === season.id));
    if (self) {
      const pos = ranked.findIndex((h) => h.userId === author.userId);
      return [pos < 0 ? msg.notAwakened(author.displayName) : msg.rankingSelf(author.displayName, pos + 1, ranked.length)];
    }
    return msg.ranking(
      season.number,
      ranked.slice(0, 5).map((h) => ({ name: h.displayName, title: this.titleLabel(h), rank: h.rank, level: h.level, xp: h.xp })),
    );
  }

  private listTitles(h: Hunter): string {
    const titles = this.deps.repo.getTitles(h.userId);
    if (titles.length === 0) return msg.titlesEmpty(h.displayName);
    return msg.titlesList(
      h.displayName,
      titles.map((t) => ({ label: t.label, equipped: t.titleId === h.equippedTitleId })),
    );
  }

  private equipTitle(h: Hunter, arg: string): string {
    const { repo } = this.deps;
    const wanted = normalizeText(arg.trim());
    if (wanted === 'nenhum') {
      repo.saveHunter({ ...h, equippedTitleId: null });
      return msg.titleRemoved(h.displayName);
    }
    const titles = repo.getTitles(h.userId);
    const index = /^\d+$/.test(wanted)
      ? Number(wanted) - 1
      : titles.findIndex((t) => normalizeText(t.label).includes(wanted));
    const title = titles[index];
    if (!title) return msg.titleNotFound(h.displayName);
    repo.saveHunter({ ...h, equippedTitleId: title.titleId });
    return msg.titleEquipped(h.displayName, title.label);
  }
}
