import { BALANCE_PATH, loadBalance } from '../src/config/balance';
import { resolveHunt } from '../src/core/combat';
import { createHunter } from '../src/core/hunter';
import { isAtCap, levelCap, rankFloor } from '../src/core/progression';
import { resolveReevaluation } from '../src/core/reevaluation';
import { joinRaid, markAttack, openRaid, resolveRound } from '../src/core/raid';
import { chance, createSeededRng } from '../src/core/rng';
import { CLASS_IDS, MAX_RANK, PORTAL_TYPES, RANKS, type ClassId, type PortalType } from '../src/core/types';

const PLAYERS = 300;
const MAX_HUNTS = 3000;

/** Grupo da raid: hoje são os 3 jogadores reais. Edite para testar outros grupos. */
const RAID_PARTY: { classId: ClassId; level: number }[] = [
  { classId: 'guerreiro', level: 4 },
  { classId: 'tanque', level: 3 },
  { classId: 'assassino', level: 2 },
];
const RAID_RUNS = 5000;

const b = loadBalance(BALANCE_PATH);
const seed = Number(process.argv[2] ?? 42);
const rng = createSeededRng(seed);

interface Rate {
  wins: number;
  total: number;
}

const pct = (r: Rate) => (r.total > 0 ? `${Math.round((100 * r.wins) / r.total)}%` : '—');
const avg = (xs: number[]) => (xs.length > 0 ? Math.round(xs.reduce((sum, x) => sum + x, 0) / xs.length) : '—');

function simulateClass(classId: ClassId) {
  const huntsToRank = RANKS.map((): number[] => []);
  const atFloor = RANKS.map((): Rate => ({ wins: 0, total: 0 }));
  const beforeCap = RANKS.map((): Rate => ({ wins: 0, total: 0 }));

  for (let p = 0; p < PLAYERS; p++) {
    let h = createHunter('sim', 'sim', classId, 1, 0);
    let hunts = 0;
    while (h.rank < MAX_RANK && hunts < MAX_HUNTS) {
      if (isAtCap(h, b)) {
        const from = h.rank;
        const r = resolveReevaluation(h, b, rng, 0);
        h = { ...r.hunter, reevalBlockedUntil: null };
        for (let k = from + 1; k <= h.rank; k++) huntsToRank[k].push(hunts);
        continue;
      }
      const { rank, level } = h;
      const o = resolveHunt(h, b, rng, 0);
      hunts++;
      if (level === rankFloor(rank, b)) {
        atFloor[rank].total++;
        if (o.won) atFloor[rank].wins++;
      }
      if (level === levelCap(rank, b) - 1) {
        beforeCap[rank].total++;
        if (o.won) beforeCap[rank].wins++;
      }
      h = { ...o.hunter, injuredUntil: null };
    }
  }

  return RANKS.map((letter, r) => ({
    rank: letter,
    'caçadas até chegar (média)': r === 0 ? 0 : avg(huntsToRank[r]),
    'vitória no piso': pct(atFloor[r]),
    'vitória antes do teto': pct(beforeCap[r]),
  }));
}

console.log(`Simulação: ${PLAYERS} jogadores por classe · seed ${seed}`);
console.log('Meta: ~230 caçadas até o Rank S; ~55% de vitória no piso e ~80% antes do teto.');
for (const classId of CLASS_IDS) {
  console.log(`\n== ${b.classes[classId].label} ==`);
  console.table(simulateClass(classId));
}

function simulateRaid(type: PortalType, attackRate: number): string {
  let wins = 0;
  for (let i = 0; i < RAID_RUNS; i++) {
    let raid = openRaid(type, 'Boss', 0, b);
    RAID_PARTY.forEach((p, k) => {
      const j = joinRaid(raid, { ...createHunter(`p${k}`, `p${k}`, p.classId, 1, 0), level: p.level }, 0, b);
      if (j.ok) raid = j.raid;
    });
    raid = { ...raid, started: true };
    let won = false;
    while (!won && raid.round < raid.totalRounds) {
      for (const p of raid.participants) {
        if (!chance(rng, attackRate)) continue;
        const a = markAttack(raid, p.userId);
        if (a.ok) raid = a.raid;
      }
      const r = resolveRound(raid, b, rng);
      raid = r.raid;
      won = r.report.won;
    }
    if (won) wins++;
  }
  return pct({ wins, total: RAID_RUNS });
}

const party = RAID_PARTY.map((p) => `${b.classes[p.classId].label} F${p.level}`).join(', ');
console.log(`
== Raid (${party}) · ${RAID_RUNS} raids por célula · sem poções ==`);
console.table(
  [0, 0.5, 1].map((rate) => ({
    '!atacar': `${rate * 100}% das rodadas`,
    ...Object.fromEntries(PORTAL_TYPES.map((t) => [`${t} ${b.raid.bossHp[t]} HP`, simulateRaid(t, rate)])),
  })),
);
