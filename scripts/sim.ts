import { BALANCE_PATH, loadBalance } from '../src/config/balance';
import { resolveHunt } from '../src/core/combat';
import { createHunter } from '../src/core/hunter';
import { isAtCap, levelCap, rankFloor } from '../src/core/progression';
import { resolveReevaluation } from '../src/core/reevaluation';
import { createSeededRng } from '../src/core/rng';
import { CLASS_IDS, MAX_RANK, RANKS, type ClassId } from '../src/core/types';

const PLAYERS = 300;
const MAX_HUNTS = 3000;

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
