# Despertar v2 — Portais: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** raids coletivas no chat: portal abre (timer ou `/portal`), o chat entra com `!raid`,
luta 15 rodadas automáticas contra um boss com HP compartilhado e recebe recompensa pelo ranking
de dano.

**Arquitetura:** regras puras em `src/core/raid.ts` (estado entra, estado + relatório saem; sem
banco nem relógio). O `GameService` guarda a raid atual em memória e ganha um `tick()` que usa o
`Clock` injetado: `main.ts` e a tela local chamam o `tick()` a cada 1 s. Configuração na seção
`raid` do `balance.json`, validada com zod.

**Stack:** TypeScript (ESM, `tsx`), vitest, zod 4, better-sqlite3. Comandos rodam a partir de
`despertar/`.

**Spec:** [../specs/2026-11-09-despertar-v2-portais-design.md](../specs/2026-11-09-despertar-v2-portais-design.md)

## Restrições globais

- Administração **só pelo terminal** (e pela rota de terminal da tela local). Nada do chat chega em `admin()`.
- Recusa de comando do terminal **nunca vai ao chat**: `AdminRefusal` é registrada só no terminal (ou volta como HTTP 409 na tela local).
- Twitch não aceita quebra de linha numa mensagem: **ranking = uma mensagem por colocado**, cada linha com a pontuação que explica a posição.
- Mensagens públicas (anúncios) usam o nome sem `@`; respostas diretas a quem mandou o comando usam `@nome`, como já é no projeto.
- Testes que usam `ScriptedRng` precisam prever **cada** sorteio, na ordem; sorteio a mais faz o teste falhar.
- Ordem dos sorteios numa rodada: d20 de cada participante de pé (ordem de entrada) → alvo do boss (só se houver mais de 1 candidato) → chance de cair. Sem golpe do boss na rodada da vitória.
- Ordem dos sorteios ao abrir portal: tipo (só se não veio do terminal) → nome do boss.
- Live: nenhum comando do plano imprime `.env`, tokens ou dados de jogadores além de classe/rank/nível.
- Antes de cada commit: `npm test` e `npm run typecheck` passando.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/core/types.ts` | `PORTAL_TYPES`, `PortalType`, `isPortalType` |
| `config/balance.json`, `src/config/balance.ts` | Seção `raid` + validação |
| `src/core/raid.ts` (novo) | Regras puras da raid |
| `src/commands/parse.ts` | `!raid`, `!atacar` |
| `src/commands/admin.ts` | `AdminCommand` com `/portal [tipo]`, `toAdminCommand` |
| `src/game/messages.ts` | Textos da raid; ranking em várias mensagens |
| `src/game/game-service.ts` | Raid em memória, `tick()`, `AdminRefusal` |
| `src/main.ts` | Relógio de 1 s; recusas no terminal |
| `src/web/server.ts`, `web/index.html` | Tela local com portal, botões e anúncios do relógio |
| `scripts/sim.ts` | Simulação de raid com o grupo configurável |

---

### Task 1: Ramo, docs e seção `raid` no balance

**Files:**
- Modify: `src/core/types.ts` (fim do arquivo)
- Modify: `config/balance.json` (depois de `"shop"`)
- Modify: `src/config/balance.ts` (schema)
- Test: `tests/config/balance.test.ts`

**Interfaces:**
- Produces: `PORTAL_TYPES`, `type PortalType = 'azul' | 'vermelho' | 'quebra'`, `isPortalType(v: unknown): v is PortalType`; `Balance['raid']` com `intervalMs, typeWeights, entryMs, battleMs, roundMs, bossHp, rewardMultiplier, placeMultipliers, attackBonus, knockdownFactor, redFallXpHunts, breakInjuryMs`.

- [ ] **Step 1: Ramo e docs**

```bash
git checkout -b v2-portais
git add docs/
git commit -m "docs: spec e planos da v1, v1.1 e v2 (Portais)"
```

- [ ] **Step 2: Testes que falham**

Adicione ao `describe('balance', ...)` de `tests/config/balance.test.ts`:

```ts
  it('tem a seção raid com os valores aprovados', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.raid.bossHp).toEqual({ azul: 500, vermelho: 800, quebra: 1000 });
    expect(b.raid.battleMs / b.raid.roundMs).toBe(15);
    expect(b.raid.entryMs).toBe(60_000);
  });

  it('recusa batalha que não é múltiplo da rodada', () => {
    const raw = rawBalance();
    raw.raid.roundMs = 7_000;
    expect(() => parseBalance(raw)).toThrow(/raid\.battleMs/);
  });

  it('recusa todos os pesos de portal zerados', () => {
    const raw = rawBalance();
    raw.raid.typeWeights = { azul: 0, vermelho: 0, quebra: 0 };
    expect(() => parseBalance(raw)).toThrow(/raid\.typeWeights/);
  });

  it('recusa multiplicadores de posição fora de ordem ou abaixo de 1', () => {
    const raw = rawBalance();
    raw.raid.placeMultipliers = [1.25, 2];
    expect(() => parseBalance(raw)).toThrow(/raid\.placeMultipliers/);
    raw.raid.placeMultipliers = [2, 0.5];
    expect(() => parseBalance(raw)).toThrow(/raid\.placeMultipliers/);
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/config/balance.test.ts`
Expected: FAIL (`b.raid` é `undefined`).

- [ ] **Step 4: Implementar**

Fim de `src/core/types.ts`:

```ts
export const PORTAL_TYPES = ['azul', 'vermelho', 'quebra'] as const;
export type PortalType = (typeof PORTAL_TYPES)[number];

export function isPortalType(value: unknown): value is PortalType {
  return typeof value === 'string' && (PORTAL_TYPES as readonly string[]).includes(value);
}
```

Em `config/balance.json`, depois do objeto `"shop": {...}` (antes de `"classes"`):

```json
  "raid": {
    "intervalMs": 1800000,
    "typeWeights": { "azul": 60, "vermelho": 30, "quebra": 10 },
    "entryMs": 60000,
    "battleMs": 300000,
    "roundMs": 20000,
    "bossHp": { "azul": 500, "vermelho": 800, "quebra": 1000 },
    "rewardMultiplier": { "azul": 3, "vermelho": 5, "quebra": 6 },
    "placeMultipliers": [2, 1.5, 1.25],
    "attackBonus": 0.5,
    "knockdownFactor": 0.5,
    "redFallXpHunts": 2,
    "breakInjuryMs": 600000
  },
```

Em `src/config/balance.ts`, logo depois de `shopItemSchema`:

```ts
const perPortal = (n: z.ZodNumber) => z.object({ azul: n, vermelho: n, quebra: n });

const raidSchema = z
  .object({
    intervalMs: z.number().int().positive(),
    typeWeights: perPortal(z.number().nonnegative()).refine((w) => w.azul + w.vermelho + w.quebra > 0, {
      message: 'pelo menos um tipo de portal precisa de peso maior que 0',
    }),
    entryMs: z.number().int().positive(),
    battleMs: z.number().int().positive(),
    roundMs: z.number().int().positive(),
    bossHp: perPortal(z.number().int().positive()),
    rewardMultiplier: perPortal(z.number().positive()),
    placeMultipliers: z
      .array(z.number().min(1))
      .refine((m) => m.every((v, i) => i === 0 || v <= m[i - 1]), { message: 'use ordem decrescente (1º ganha mais)' }),
    attackBonus: z.number().nonnegative(),
    knockdownFactor: probability,
    redFallXpHunts: z.number().nonnegative(),
    breakInjuryMs: z.number().int().positive(),
  })
  .refine((r) => r.battleMs % r.roundMs === 0, {
    message: 'battleMs deve ser múltiplo de roundMs',
    path: ['battleMs'],
  });
```

E no `balanceSchema`, depois de `shop: z.object({...}),`:

```ts
  raid: raidSchema,
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: tudo PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts config/balance.json src/config/balance.ts tests/config/balance.test.ts
git commit -m "feat(raid): seção raid no balance.json com validação"
```

---

### Task 2: `core/raid.ts`: abertura, entrada, `!atacar`, dano e queda

**Files:**
- Create: `src/core/raid.ts`
- Test: `tests/core/raid.test.ts`

**Interfaces:**
- Consumes: `Balance['raid']`, `PortalType` (Task 1); `primaryStat`, `injuryChance` (`core/stats`); `Rng` (`core/rng`).
- Produces:
  - `interface RaidParticipant { userId; displayName; classId: ClassId; rank: number; level: number; damage: number; down: boolean; downSinceRound: number | null; attacked: boolean }`
  - `interface Raid { type: PortalType; bossName: string; maxHp: number; hp: number; openedAt: number; battleStartsAt: number; started: boolean; round: number; totalRounds: number; participants: RaidParticipant[] }`
  - `rollPortalType(b, rng): PortalType`
  - `openRaid(type, bossName, now, b): Raid`
  - `joinRaid(raid, h: Hunter, now): { ok: true; raid } | { ok: false; reason: 'closed' | 'already' | 'injured' }`
  - `markAttack(raid, userId): { ok: true; raid } | { ok: false; reason: 'not-in-raid' | 'not-started' | 'down' | 'already' }`
  - `reviveWithPotion(raid, userId): Raid | null`
  - `knockdownChance(classId, b): number`
  - `raidDamage(p: { classId; level; attacked }, roll: number, b): { damage: number; crit: boolean }`

- [ ] **Step 1: Testes que falham**

Crie `tests/core/raid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  joinRaid,
  knockdownChance,
  markAttack,
  openRaid,
  raidDamage,
  reviveWithPotion,
  rollPortalType,
  type Raid,
} from '../../src/core/raid';
import type { ClassId, Hunter } from '../../src/core/types';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const T0 = 1_000_000;

/** Raid azul com os caçadores dados já dentro. */
function joined(...hunters: Hunter[]): Raid {
  let raid = openRaid('azul', 'Goblin', T0, b);
  for (const h of hunters) {
    const r = joinRaid(raid, h, T0);
    if (!r.ok) throw new Error(r.reason);
    raid = r.raid;
  }
  return raid;
}
const started = (raid: Raid): Raid => ({ ...raid, started: true });

describe('raid: abertura e entrada', () => {
  it('sorteia o tipo pelos pesos 60/30/10', () => {
    expect(rollPortalType(b, seqRng([0]))).toBe('azul');
    expect(rollPortalType(b, seqRng([0.59]))).toBe('azul');
    expect(rollPortalType(b, seqRng([0.6]))).toBe('vermelho');
    expect(rollPortalType(b, seqRng([0.89]))).toBe('vermelho');
    expect(rollPortalType(b, seqRng([0.9]))).toBe('quebra');
  });

  it('tipo com peso 0 nunca sai', () => {
    const only = testBalance();
    only.raid.typeWeights = { azul: 0, vermelho: 1, quebra: 0 };
    expect(rollPortalType(only, seqRng([0]))).toBe('vermelho');
    expect(rollPortalType(only, seqRng([0.999]))).toBe('vermelho');
  });

  it('abre com o HP do tipo e 15 rodadas', () => {
    expect(openRaid('vermelho', 'Ogro', T0, b)).toMatchObject({
      type: 'vermelho',
      bossName: 'Ogro',
      hp: 800,
      maxHp: 800,
      openedAt: T0,
      battleStartsAt: T0 + 60_000,
      started: false,
      round: 0,
      totalRounds: 15,
      participants: [],
    });
  });

  it('entrar: só na entrada, uma vez, sem lesão', () => {
    const raid = openRaid('azul', 'Goblin', T0, b);
    const ana = makeHunter({ userId: 'a', displayName: 'ana', level: 3 });
    const r = joinRaid(raid, ana, T0 + 1_000);
    if (!r.ok) throw new Error(r.reason);
    expect(r.raid.participants[0]).toMatchObject({
      userId: 'a', displayName: 'ana', classId: 'guerreiro', rank: 0, level: 3,
      damage: 0, down: false, downSinceRound: null, attacked: false,
    });
    expect(joinRaid(r.raid, ana, T0 + 2_000)).toEqual({ ok: false, reason: 'already' });
    expect(joinRaid(raid, ana, T0 + 60_000)).toEqual({ ok: false, reason: 'closed' });
    expect(joinRaid(started(raid), ana, T0)).toEqual({ ok: false, reason: 'closed' });
    const hurt = makeHunter({ userId: 'b', injuredUntil: T0 + 5_000 });
    expect(joinRaid(raid, hurt, T0)).toEqual({ ok: false, reason: 'injured' });
    expect(joinRaid(raid, { ...hurt, injuredUntil: T0 - 1 }, T0).ok).toBe(true);
  });

  it('!atacar: só participante de pé, com a batalha começada, uma vez por rodada', () => {
    const raid = joined(makeHunter({ userId: 'a', displayName: 'ana' }));
    expect(markAttack(raid, 'a')).toEqual({ ok: false, reason: 'not-started' });
    expect(markAttack(started(raid), 'x')).toEqual({ ok: false, reason: 'not-in-raid' });
    const r = markAttack(started(raid), 'a');
    if (!r.ok) throw new Error(r.reason);
    expect(r.raid.participants[0].attacked).toBe(true);
    expect(markAttack(r.raid, 'a')).toEqual({ ok: false, reason: 'already' });
    const down: Raid = { ...started(raid), participants: [{ ...raid.participants[0], down: true, downSinceRound: 1 }] };
    expect(markAttack(down, 'a')).toEqual({ ok: false, reason: 'down' });
  });

  it('poção levanta só quem caiu', () => {
    const raid = joined(makeHunter({ userId: 'a' }));
    expect(reviveWithPotion(raid, 'a')).toBeNull();
    expect(reviveWithPotion(raid, 'x')).toBeNull();
    const down: Raid = { ...raid, participants: [{ ...raid.participants[0], down: true, downSinceRound: 2 }] };
    expect(reviveWithPotion(down, 'a')!.participants[0]).toMatchObject({ down: false, downSinceRound: null });
  });
});

describe('raid: dano e queda', () => {
  const p = (classId: ClassId, level = 1, attacked = false) => ({ classId, level, attacked });

  it('Guerreiro soma +2 sempre', () => {
    expect(raidDamage(p('guerreiro'), 10, b)).toEqual({ damage: 20, crit: false });
  });

  it('Assassino crita com 18 ou mais', () => {
    expect(raidDamage(p('assassino'), 17, b)).toEqual({ damage: 25, crit: false });
    expect(raidDamage(p('assassino'), 18, b)).toEqual({ damage: 52, crit: true });
  });

  it('!atacar dá +50%, arredondado para baixo', () => {
    expect(raidDamage(p('mago', 1, true), 10, b)).toEqual({ damage: 25, crit: false });
  });

  it('chance de cair = lesão × 0,5; Curandeiro usa a fórmula base', () => {
    expect(knockdownChance('tanque', b)).toBeCloseTo(0.05);
    expect(knockdownChance('guerreiro', b)).toBeCloseTo(0.16);
    expect(knockdownChance('assassino', b)).toBeCloseTo(0.19);
    expect(knockdownChance('mago', b)).toBeCloseTo(0.205);
    expect(knockdownChance('curandeiro', b)).toBeCloseTo(0.175);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL (`Cannot find module '../../src/core/raid'`).

- [ ] **Step 3: Implementar**

Crie `src/core/raid.ts`:

```ts
import type { Balance } from '../config/balance';
import type { Rng } from './rng';
import { injuryChance, primaryStat } from './stats';
import { PORTAL_TYPES, type ClassId, type Hunter, type PortalType } from './types';

export interface RaidParticipant {
  userId: string;
  displayName: string;
  classId: ClassId;
  /** Rank e nível na hora de entrar: base do dano e da recompensa. */
  rank: number;
  level: number;
  /** Dano total causado nesta raid (placar do ranking). */
  damage: number;
  down: boolean;
  /** Rodada em que caiu: o Curandeiro levanta quem caiu primeiro. */
  downSinceRound: number | null;
  /** Usou !atacar na rodada atual. */
  attacked: boolean;
}

export interface Raid {
  type: PortalType;
  bossName: string;
  maxHp: number;
  hp: number;
  openedAt: number;
  battleStartsAt: number;
  /** A entrada fechou e a batalha foi anunciada. */
  started: boolean;
  /** Rodadas já resolvidas. */
  round: number;
  totalRounds: number;
  /** Em ordem de entrada. */
  participants: RaidParticipant[];
}

export function rollPortalType(b: Balance, rng: Rng): PortalType {
  const w = b.raid.typeWeights;
  const enabled = PORTAL_TYPES.filter((t) => w[t] > 0);
  let r = rng.next() * enabled.reduce((sum, t) => sum + w[t], 0);
  for (const t of enabled) {
    if (r < w[t]) return t;
    r -= w[t];
  }
  return enabled[enabled.length - 1];
}

export function openRaid(type: PortalType, bossName: string, now: number, b: Balance): Raid {
  const hp = b.raid.bossHp[type];
  return {
    type,
    bossName,
    maxHp: hp,
    hp,
    openedAt: now,
    battleStartsAt: now + b.raid.entryMs,
    started: false,
    round: 0,
    totalRounds: b.raid.battleMs / b.raid.roundMs,
    participants: [],
  };
}

export type JoinResult = { ok: true; raid: Raid } | { ok: false; reason: 'closed' | 'already' | 'injured' };

export function joinRaid(raid: Raid, h: Hunter, now: number): JoinResult {
  if (raid.started || now >= raid.battleStartsAt) return { ok: false, reason: 'closed' };
  if (raid.participants.some((p) => p.userId === h.userId)) return { ok: false, reason: 'already' };
  if (h.injuredUntil !== null && h.injuredUntil > now) return { ok: false, reason: 'injured' };
  const p: RaidParticipant = {
    userId: h.userId,
    displayName: h.displayName,
    classId: h.classId,
    rank: h.rank,
    level: h.level,
    damage: 0,
    down: false,
    downSinceRound: null,
    attacked: false,
  };
  return { ok: true, raid: { ...raid, participants: [...raid.participants, p] } };
}

function patchParticipant(raid: Raid, userId: string, patch: Partial<RaidParticipant>): Raid {
  return { ...raid, participants: raid.participants.map((p) => (p.userId === userId ? { ...p, ...patch } : p)) };
}

export type AttackResult =
  | { ok: true; raid: Raid }
  | { ok: false; reason: 'not-in-raid' | 'not-started' | 'down' | 'already' };

export function markAttack(raid: Raid, userId: string): AttackResult {
  const p = raid.participants.find((x) => x.userId === userId);
  if (!p) return { ok: false, reason: 'not-in-raid' };
  if (!raid.started) return { ok: false, reason: 'not-started' };
  if (p.down) return { ok: false, reason: 'down' };
  if (p.attacked) return { ok: false, reason: 'already' };
  return { ok: true, raid: patchParticipant(raid, userId, { attacked: true }) };
}

/** Poção de Cura na batalha: só quem está caído levanta. */
export function reviveWithPotion(raid: Raid, userId: string): Raid | null {
  const p = raid.participants.find((x) => x.userId === userId);
  if (!p || !p.down) return null;
  return patchParticipant(raid, userId, { down: false, downSinceRound: null });
}

/** Chance de cair com o golpe do boss. O Curandeiro, imune a lesão nas caçadas, usa a fórmula base. */
export function knockdownChance(classId: ClassId, b: Balance): number {
  const c = b.classes[classId];
  const base = c.injuryImmune
    ? Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit)
    : injuryChance(classId, b);
  return base * b.raid.knockdownFactor;
}

/** Dano de um golpe: atributo + d20; Guerreiro +2 (boss conta como mais forte); crítico ×2; !atacar +50%. */
export function raidDamage(
  p: Pick<RaidParticipant, 'classId' | 'level' | 'attacked'>,
  roll: number,
  b: Balance,
): { damage: number; crit: boolean } {
  const cls = b.classes[p.classId];
  const crit = cls.critMin !== null && roll >= cls.critMin;
  let damage = primaryStat(p.classId, p.level, b) + cls.bonusVsHigherRank + roll;
  if (crit) damage *= 2;
  if (p.attacked) damage = Math.floor(damage * (1 + b.raid.attackBonus));
  return { damage, crit };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/core/raid.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/raid.ts tests/core/raid.test.ts
git commit -m "feat(raid): abertura, entrada, !atacar, dano e chance de queda"
```

---

### Task 3: `core/raid.ts`: resolver uma rodada

**Files:**
- Modify: `src/core/raid.ts` (imports e fim do arquivo)
- Test: `tests/core/raid.test.ts`

**Interfaces:**
- Consumes: tudo da Task 2.
- Produces:
  - `interface RoundReport { round: number; totalRounds: number; groupDamage: number; attackers: number; crits: string[]; hp: number; maxHp: number; won: boolean; bossHit: { name: string; fell: boolean; tank: boolean } | null; revived: { healer: string; target: string }[] }`
  - `resolveRound(raid, b, rng): { raid: Raid; report: RoundReport }`

- [ ] **Step 1: Testes que falham**

No topo de `tests/core/raid.test.ts`, acrescente `resolveRound` ao import de `../../src/core/raid` e `d20` ao import de `../helpers`. No fim do arquivo:

```ts
describe('raid: rodada', () => {
  const ana = makeHunter({ userId: 'a', displayName: 'ana' }); // Guerreiro
  const bia = makeHunter({ userId: 'b', displayName: 'bia', classId: 'tanque' });
  const cris = makeHunter({ userId: 'c', displayName: 'cris', classId: 'curandeiro' });
  const duda = makeHunter({ userId: 'd', displayName: 'duda', classId: 'mago' });

  it('soma o dano, guarda no placar e zera o !atacar', () => {
    let raid = started(joined(ana, duda));
    const a = markAttack(raid, 'a');
    if (!a.ok) throw new Error(a.reason);
    raid = a.raid;
    // ana: (8+2+10)×1,5 = 30 · duda: 7+10 = 17 · alvo sorteado: ana · não cai
    const rng = seqRng([d20(10), d20(10), 0, 0.99]);
    const { raid: next, report } = resolveRound(raid, b, rng);
    expect(report).toMatchObject({
      round: 1, totalRounds: 15, groupDamage: 47, attackers: 1, crits: [], hp: 453, maxHp: 500,
      won: false, bossHit: { name: 'ana', fell: false, tank: false }, revived: [],
    });
    expect(next.participants.map((p) => [p.damage, p.attacked])).toEqual([[30, false], [17, false]]);
    expect(next.round).toBe(1);
    expect(next.hp).toBe(453);
    expect(rng.remaining).toBe(0);
  });

  it('o golpe vai no Tanque de pé, sem sorteio de alvo', () => {
    const raid = started(joined(ana, bia));
    const { raid: next, report } = resolveRound(raid, b, seqRng([d20(1), d20(1), 0]));
    expect(report.bossHit).toEqual({ name: 'bia', fell: true, tank: true });
    expect(next.participants[1]).toMatchObject({ down: true, downSinceRound: 1 });
  });

  it('caído não bate; Curandeiro levanta quem caiu primeiro', () => {
    let raid = started(joined(ana, duda, cris));
    raid = {
      ...raid,
      round: 3,
      participants: raid.participants.map((p) =>
        p.userId === 'a' ? { ...p, down: true, downSinceRound: 3 }
        : p.userId === 'd' ? { ...p, down: true, downSinceRound: 2 }
        : p,
      ),
    };
    // só cris bate (7+1 = 8); alvo único de pé (cris), sem sorteio de alvo; não cai
    const { raid: next, report } = resolveRound(raid, b, seqRng([d20(1), 0.99]));
    expect(report.groupDamage).toBe(8);
    expect(report.revived).toEqual([{ healer: 'cris', target: 'duda' }]);
    expect(next.participants.map((p) => p.down)).toEqual([true, false, false]);
  });

  it('Curandeiro que acabou de cair não levanta ninguém', () => {
    let raid = started(joined(ana, cris));
    raid = { ...raid, participants: raid.participants.map((p) => (p.userId === 'a' ? { ...p, down: true, downSinceRound: 1 } : p)) };
    const { report } = resolveRound(raid, b, seqRng([d20(1), 0]));
    expect(report.bossHit).toEqual({ name: 'cris', fell: true, tank: false });
    expect(report.revived).toEqual([]);
  });

  it('vitória na rodada em que o HP zera, sem golpe do boss', () => {
    const raid: Raid = { ...started(joined(ana)), hp: 15 };
    const rng = seqRng([d20(10)]);
    const { raid: next, report } = resolveRound(raid, b, rng);
    expect(report).toMatchObject({ won: true, hp: 0, bossHit: null });
    expect(next.hp).toBe(0);
    expect(rng.remaining).toBe(0);
  });

  it('crítico aparece no relatório', () => {
    const raid = started(joined(makeHunter({ userId: 'e', displayName: 'edu', classId: 'assassino' })));
    const { report } = resolveRound(raid, b, seqRng([d20(20), 0.99]));
    expect(report.crits).toEqual(['edu']);
    expect(report.groupDamage).toBe(56);
  });

  it('ninguém de pé: sem dano, sem golpe, sem sorteio', () => {
    let raid = started(joined(ana));
    raid = { ...raid, participants: [{ ...raid.participants[0], down: true, downSinceRound: 1 }] };
    const { report } = resolveRound(raid, b, seqRng([]));
    expect(report).toMatchObject({ groupDamage: 0, bossHit: null, won: false, hp: 500 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL (`resolveRound is not a function`).

- [ ] **Step 3: Implementar**

Em `src/core/raid.ts`, troque `import type { Rng } from './rng';` por:

```ts
import { chance, pick, rollD20, type Rng } from './rng';
```

E no fim do arquivo:

```ts
export interface RoundReport {
  round: number;
  totalRounds: number;
  groupDamage: number;
  /** Quantos usaram !atacar nesta rodada (e estavam de pé). */
  attackers: number;
  crits: string[];
  hp: number;
  maxHp: number;
  won: boolean;
  /** Golpe do boss; null na vitória ou se ninguém estava de pé. */
  bossHit: { name: string; fell: boolean; tank: boolean } | null;
  revived: { healer: string; target: string }[];
}

/**
 * Uma rodada. Sorteios, na ordem: d20 de cada participante de pé (ordem de entrada),
 * alvo do boss (só com mais de um candidato) e chance de cair. Na vitória o boss não revida.
 */
export function resolveRound(raid: Raid, b: Balance, rng: Rng): { raid: Raid; report: RoundReport } {
  const round = raid.round + 1;
  let groupDamage = 0;
  let attackers = 0;
  const crits: string[] = [];
  const parts = raid.participants.map((p) => {
    if (p.down) return { ...p, attacked: false };
    const { damage, crit } = raidDamage(p, rollD20(rng), b);
    groupDamage += damage;
    if (p.attacked) attackers++;
    if (crit) crits.push(p.displayName);
    return { ...p, damage: p.damage + damage, attacked: false };
  });
  const hp = Math.max(0, raid.hp - groupDamage);
  const won = hp === 0;
  let bossHit: RoundReport['bossHit'] = null;
  const revived: RoundReport['revived'] = [];

  if (!won) {
    const standing = parts.filter((p) => !p.down);
    if (standing.length > 0) {
      const tanks = standing.filter((p) => p.classId === 'tanque');
      const pool = tanks.length > 0 ? tanks : standing;
      const target = pool.length === 1 ? pool[0] : pick(rng, pool);
      const fell = chance(rng, knockdownChance(target.classId, b));
      if (fell) {
        target.down = true;
        target.downSinceRound = round;
      }
      bossHit = { name: target.displayName, fell, tank: target.classId === 'tanque' };
    }
    // Cada Curandeiro de pé levanta o caído mais antigo (sort estável: empate fica na ordem de entrada).
    for (const healer of parts.filter((p) => !p.down && p.classId === 'curandeiro')) {
      const fallen = parts.filter((p) => p.down).sort((x, y) => x.downSinceRound! - y.downSinceRound!)[0];
      if (!fallen) break;
      fallen.down = false;
      fallen.downSinceRound = null;
      revived.push({ healer: healer.displayName, target: fallen.displayName });
    }
  }

  return {
    raid: { ...raid, hp, round, participants: parts },
    report: { round, totalRounds: raid.totalRounds, groupDamage, attackers, crits, hp, maxHp: raid.maxHp, won, bossHit, revived },
  };
}
```

(`parts` são cópias novas feitas no `map`, então mudar `target`/`fallen` não altera a raid de entrada.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/core/raid.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/raid.ts tests/core/raid.test.ts
git commit -m "feat(raid): resolver rodada (dano, golpe do boss, Tanque e Curandeiro)"
```

---

### Task 4: `core/raid.ts`: ranking, recompensas e penalidades

**Files:**
- Modify: `src/core/raid.ts` (imports e fim do arquivo)
- Test: `tests/core/raid.test.ts`

**Interfaces:**
- Consumes: `Raid`, `RaidParticipant` (Task 2); `applyXp` (`core/progression`).
- Produces:
  - `rankDamage(raid): RaidParticipant[]`
  - `interface RaidReward { userId: string; displayName: string; place: number; damage: number; xp: number; gold: number; xpLoss: number }`
  - `raidRewards(raid, won: boolean, b): RaidReward[]` (ordenado pelo ranking)
  - `applyRaidReward(h, reward: Pick<RaidReward, 'xp' | 'gold' | 'xpLoss'>, b): { hunter: Hunter; levelsGained: number }`
  - `breakPenalty(h, now, b): Hunter`

- [ ] **Step 1: Testes que falham**

Acrescente `applyRaidReward, breakPenalty, raidRewards, rankDamage` ao import de `../../src/core/raid` e `type PortalType` ao import de `../../src/core/types`. No fim do arquivo:

```ts
describe('raid: ranking e recompensas', () => {
  /** Raid com Guerreiros Rank F e o dano já somado. */
  const party = (type: PortalType, specs: [string, number, boolean?][]): Raid => ({
    ...openRaid(type, 'Boss', T0, b),
    started: true,
    participants: specs.map(([name, damage, down = false]) => ({
      userId: name, displayName: name, classId: 'guerreiro', rank: 0, level: 1,
      damage, down, downSinceRound: down ? 1 : null, attacked: false,
    })),
  });

  it('ordena por dano; empate fica com quem entrou primeiro', () => {
    const raid = party('azul', [['ana', 40], ['bia', 90], ['cris', 40]]);
    expect(rankDamage(raid).map((p) => p.displayName)).toEqual(['bia', 'ana', 'cris']);
  });

  it('vitória paga caçada do rank × tipo × posição', () => {
    const raid = party('azul', [['ana', 50], ['bia', 40], ['cris', 30], ['duda', 20]]);
    expect(raidRewards(raid, true, b).map((r) => [r.displayName, r.place, r.damage, r.xp, r.gold, r.xpLoss])).toEqual([
      ['ana', 1, 50, 60, 18, 0],
      ['bia', 2, 40, 45, 13, 0],
      ['cris', 3, 30, 37, 11, 0],
      ['duda', 4, 20, 30, 9, 0],
    ]);
  });

  it('vermelho e quebra usam ×5 e ×6', () => {
    expect(raidRewards(party('vermelho', [['ana', 1]]), true, b)[0]).toMatchObject({ xp: 100, gold: 30 });
    expect(raidRewards(party('quebra', [['ana', 1]]), true, b)[0]).toMatchObject({ xp: 120, gold: 36 });
  });

  it('derrota não paga; no vermelho quem terminou caído perde 2 caçadas', () => {
    expect(raidRewards(party('azul', [['ana', 1, true]]), false, b)[0]).toMatchObject({ xp: 0, gold: 0, xpLoss: 0 });
    const red = raidRewards(party('vermelho', [['ana', 10], ['bia', 5, true]]), false, b);
    expect(red.map((r) => [r.displayName, r.xp, r.xpLoss])).toEqual([['ana', 0, 0], ['bia', 0, 20]]);
  });

  it('aplicar: XP sobe nível; perda desconta da recompensa e nunca desce de nível', () => {
    const h = makeHunter({ level: 1, xp: 0, gold: 5 });
    expect(applyRaidReward(h, { xp: 60, gold: 18, xpLoss: 0 }, b)).toMatchObject({
      hunter: { level: 2, xp: 30, gold: 23 },
      levelsGained: 1,
    });
    // 100 − 20 = 80 XP: nível 1→2 (30) e 2→3 (40), sobram 10
    expect(applyRaidReward(h, { xp: 100, gold: 30, xpLoss: 20 }, b).hunter).toMatchObject({ level: 3, xp: 10 });
    expect(applyRaidReward(makeHunter({ level: 3, xp: 5 }), { xp: 0, gold: 0, xpLoss: 20 }, b)).toMatchObject({
      hunter: { level: 3, xp: 0 },
      levelsGained: 0,
    });
  });

  it('quebra: lesão de 10 min, mantendo a mais longa', () => {
    expect(breakPenalty(makeHunter({ injuredUntil: null }), T0, b).injuredUntil).toBe(T0 + 600_000);
    expect(breakPenalty(makeHunter({ injuredUntil: T0 + 900_000 }), T0, b).injuredUntil).toBe(T0 + 900_000);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL (`rankDamage is not a function`).

- [ ] **Step 3: Implementar**

Em `src/core/raid.ts`, acrescente o import:

```ts
import { applyXp } from './progression';
```

E no fim do arquivo:

```ts
/** Ranking de dano: maior primeiro; empate fica na ordem de entrada (sort estável). */
export function rankDamage(raid: Raid): RaidParticipant[] {
  return [...raid.participants].sort((x, y) => y.damage - x.damage);
}

export interface RaidReward {
  userId: string;
  displayName: string;
  /** Posição no ranking de dano, a partir de 1. */
  place: number;
  damage: number;
  xp: number;
  gold: number;
  /** Portal vermelho: quem terminou caído perde XP. */
  xpLoss: number;
}

/** Recompensa = caçada do rank do jogador × tipo × posição. Derrota não paga. */
export function raidRewards(raid: Raid, won: boolean, b: Balance): RaidReward[] {
  const r = b.raid;
  return rankDamage(raid).map((p, i) => {
    const mult = won ? r.rewardMultiplier[raid.type] * (r.placeMultipliers[i] ?? 1) : 0;
    const xpLoss = raid.type === 'vermelho' && p.down ? Math.floor(r.redFallXpHunts * b.hunt.xpByRank[p.rank]) : 0;
    return {
      userId: p.userId,
      displayName: p.displayName,
      place: i + 1,
      damage: p.damage,
      xp: Math.floor(b.hunt.xpByRank[p.rank] * mult),
      gold: Math.floor(b.hunt.goldByRank[p.rank] * mult),
      xpLoss,
    };
  });
}

/** Aplica ouro e XP líquido. XP negativo sai do XP atual, sem nunca descer de nível. */
export function applyRaidReward(
  h: Hunter,
  reward: Pick<RaidReward, 'xp' | 'gold' | 'xpLoss'>,
  b: Balance,
): { hunter: Hunter; levelsGained: number } {
  const withGold: Hunter = { ...h, gold: h.gold + reward.gold };
  const net = reward.xp - reward.xpLoss;
  if (net >= 0) return applyXp(withGold, net, b);
  return { hunter: { ...withGold, xp: Math.max(0, withGold.xp + net) }, levelsGained: 0 };
}

/** Quebra de portal: lesão para todos, mantendo a que terminar mais tarde. */
export function breakPenalty(h: Hunter, now: number, b: Balance): Hunter {
  return { ...h, injuredUntil: Math.max(h.injuredUntil ?? 0, now + b.raid.breakInjuryMs) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/core/raid.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/raid.ts tests/core/raid.test.ts
git commit -m "feat(raid): ranking de dano, recompensas e penalidades"
```

---

### Task 5: Comandos `!raid`, `!atacar` e `/portal`

**Files:**
- Modify: `src/commands/parse.ts`
- Modify: `src/commands/admin.ts` (arquivo inteiro)
- Modify: `src/game/game-service.ts` (import, nova classe `AdminRefusal`, método `admin`)
- Modify: `src/main.ts` (bloco do terminal)
- Modify: `src/web/server.ts` (import, `TestBench.admin`, rota `/api/admin`)
- Test: `tests/commands/parse.test.ts`, `tests/commands/admin.test.ts`, `tests/game/game-service.test.ts`, `tests/web/server.test.ts`

**Interfaces:**
- Consumes: `isPortalType`, `PortalType` (Task 1).
- Produces:
  - `Command` ganha `{ kind: 'raid' }` e `{ kind: 'atacar' }`.
  - `type AdminCommand = { action: 'pausar' } | { action: 'retomar' } | { action: 'encerrar-temporada' } | { action: 'portal'; portal: PortalType | null }`
  - `parseAdminLine(line): AdminCommand | null`, `toAdminCommand(action: unknown, arg: unknown): AdminCommand | null`
  - `class AdminRefusal extends Error` exportada de `game/game-service.ts`
  - `GameService.admin(cmd: AdminCommand): string[]` (o caso `portal` é ligado de verdade na Task 7)

- [ ] **Step 1: Testes que falham**

Em `tests/commands/parse.test.ts`, dentro do `describe`:

```ts
  it('raid e atacar', () => {
    expect(parseCommand('!raid')).toEqual({ kind: 'raid' });
    expect(parseCommand('!RAID')).toEqual({ kind: 'raid' });
    expect(parseCommand('!atacar')).toEqual({ kind: 'atacar' });
  });
```

Substitua o conteúdo de `tests/commands/admin.test.ts` por:

```ts
import { describe, expect, it } from 'vitest';
import { isAdminLine, parseAdminLine, toAdminCommand } from '../../src/commands/admin';

describe('comandos do terminal', () => {
  it.each([
    ['/pausar', { action: 'pausar' }],
    ['  /RETOMAR ', { action: 'retomar' }],
    ['/encerrar-temporada', { action: 'encerrar-temporada' }],
    ['/portal', { action: 'portal', portal: null }],
    ['/portal azul', { action: 'portal', portal: 'azul' }],
    ['/PORTAL  Vermelho', { action: 'portal', portal: 'vermelho' }],
    ['/portal quebra', { action: 'portal', portal: 'quebra' }],
  ])('%j → %j', (line, cmd) => {
    expect(parseAdminLine(line)).toEqual(cmd);
  });

  it.each(['pausar', '!rpg pausar', '/xyz', '', ' / pausar', '/portal roxo', '/pausar agora'])('rejeita %j', (line) => {
    expect(parseAdminLine(line)).toBeNull();
  });

  it('isAdminLine reconhece linhas que começam com /', () => {
    expect(isAdminLine(' /qualquer')).toBe(true);
    expect(isAdminLine('ana: !cacar')).toBe(false);
  });

  it('toAdminCommand valida o que vem da tela local', () => {
    expect(toAdminCommand('portal', 'azul')).toEqual({ action: 'portal', portal: 'azul' });
    expect(toAdminCommand('portal', undefined)).toEqual({ action: 'portal', portal: null });
    expect(toAdminCommand('portal', 'roxo')).toBeNull();
    expect(toAdminCommand('apagar-tudo', undefined)).toBeNull();
    expect(toAdminCommand('pausar', 'x')).toBeNull();
    expect(toAdminCommand('pausar', undefined)).toEqual({ action: 'pausar' });
  });
});
```

Em `tests/game/game-service.test.ts`, troque as chamadas antigas:
- `game.admin('pausar')` → `game.admin({ action: 'pausar' })` (2 lugares)
- `game.admin('retomar')` → `game.admin({ action: 'retomar' })`
- `game.admin('encerrar-temporada')` → `game.admin({ action: 'encerrar-temporada' })` (2 lugares)

Em `tests/web/server.test.ts`, no teste `'administração só pela rota do terminal, nunca pelo chat'`, antes do `});` final:

```ts
    expect((await post('/api/admin', { action: 'portal', portal: 'roxo' })).status).toBe(400);
    expect((await post('/api/admin', { action: 'retomar' })).status).toBe(200);
    // sem ninguém despertado o portal é recusado: 409, e a recusa não vira mensagem de chat
    const refused = await post('/api/admin', { action: 'portal' });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toMatch(/^Recusado: /);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/commands tests/game/game-service.test.ts tests/web`
Expected: FAIL (`toAdminCommand` não existe; `!raid` vira `null`).

- [ ] **Step 3: Implementar**

`src/commands/parse.ts`:
- No tipo `Command`, acrescente `| { kind: 'raid' }` e `| { kind: 'atacar' }`.
- No `ALIASES`, acrescente `['raid', 'raid'],` e `['atacar', 'atacar'],`.
- No `switch (name)`, acrescente `case 'raid':` e `case 'atacar':` à lista de casos que fazem `return { kind: name };`.

Substitua `src/commands/admin.ts` por:

```ts
import { isPortalType, type PortalType } from '../core/types';

/**
 * Comandos de administração. Chegam SÓ pelo terminal onde o bot roda (nunca pelo chat):
 * quem não está no PC do streamer não tem como pausar, encerrar a temporada ou abrir portal.
 */
export type AdminCommand =
  | { action: 'pausar' }
  | { action: 'retomar' }
  | { action: 'encerrar-temporada' }
  | { action: 'portal'; portal: PortalType | null };

export type AdminAction = AdminCommand['action'];

export const ADMIN_HELP =
  'Comandos do terminal: /pausar · /retomar · /encerrar-temporada · /portal [azul|vermelho|quebra]';

export function isAdminLine(line: string): boolean {
  return line.trim().startsWith('/');
}

/** "/pausar", "/portal", "/portal vermelho"... (sem diferenciar maiúsculas). */
export function parseAdminLine(line: string): AdminCommand | null {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;
  const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  return toAdminCommand(head, arg === '' ? undefined : arg);
}

/** Monta o comando a partir de ação + argumento. Usado pelo terminal e pela tela local. */
export function toAdminCommand(action: unknown, arg: unknown): AdminCommand | null {
  const noArg = arg === undefined || arg === null;
  if (action === 'pausar' || action === 'retomar' || action === 'encerrar-temporada') {
    return noArg ? { action } : null;
  }
  if (action === 'portal') {
    if (noArg) return { action, portal: null };
    return isPortalType(arg) ? { action, portal: arg } : null;
  }
  return null;
}
```

`src/game/game-service.ts`:
- Troque `import type { AdminAction } from '../commands/admin';` por `import type { AdminCommand } from '../commands/admin';`.
- Logo depois de `interface GameDeps {...}`, acrescente:

```ts
/** Pedido do terminal que não pode ser atendido agora. O motivo vai só para o terminal, nunca ao chat. */
export class AdminRefusal extends Error {}
```

- Substitua o método `admin` por:

```ts
  /** Administração. Só o terminal do bot chama isto; nenhum caminho do chat chega aqui. */
  admin(cmd: AdminCommand): string[] {
    const now = this.deps.clock.now();
    switch (cmd.action) {
      case 'pausar':
        this.paused = true;
        return [msg.paused()];
      case 'retomar':
        this.paused = false;
        return [msg.resumed()];
      case 'encerrar-temporada': {
        const rolled = this.ensureSeason(now);
        return rolled.length > 0 ? rolled : this.rollSeason(this.currentSeason(), now);
      }
      case 'portal':
        throw new AdminRefusal('ninguém despertou ainda.');
    }
  }
```

(A Task 7 troca o caso `portal` pela abertura de verdade.)

`src/main.ts`:
- Acrescente `AdminRefusal` ao import: `import { AdminRefusal, GameService } from './game/game-service';`.
- No `terminal.on('line', ...)`, substitua do `const action = parseAdminLine(line);` até o fim do `catch` por:

```ts
    const cmd = parseAdminLine(line);
    if (!cmd) {
      console.log(`[admin] comando desconhecido. ${ADMIN_HELP}`);
      return;
    }
    try {
      for (const reply of game.admin(cmd)) outbound.enqueue(reply);
      console.log(`[admin] ok: ${line.trim()}`);
    } catch (err) {
      if (err instanceof AdminRefusal) console.log(`[admin] recusado: ${err.message}`);
      else console.error('[admin] erro:', err instanceof Error ? err.message : err);
    }
```

`src/web/server.ts`:
- Troque `import { isAdminAction, type AdminAction } from '../commands/admin';` por `import { toAdminCommand, type AdminCommand } from '../commands/admin';`.
- Troque `import { GameService } from '../game/game-service';` por `import { AdminRefusal, GameService } from '../game/game-service';`.
- `TestBench.admin`:

```ts
  /** Simula um comando digitado no terminal do bot. */
  admin(cmd: AdminCommand): { replies: string[] } {
    return { replies: this.game.admin(cmd) };
  }
```

- Rota `/api/admin`:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands src/game/game-service.ts src/main.ts src/web/server.ts tests/commands tests/game/game-service.test.ts tests/web/server.test.ts
git commit -m "feat(raid): comandos !raid, !atacar e /portal no terminal"
```

---

### Task 6: Mensagens da raid e ranking uma linha por colocado

**Files:**
- Modify: `src/game/messages.ts`
- Modify: `src/game/game-service.ts` (métodos `dispatch` e `ranking`)
- Test: `tests/game/messages.test.ts`, `tests/game/game-service.test.ts`

**Interfaces:**
- Consumes: `RoundReport`, `RaidReward` (Tasks 3–4), `PortalType` (Task 1).
- Produces (em `msg`): `ranking(...): string[]` (agora várias mensagens; `RankingEntry` ganha `xp`), `portalOpened(type, boss, hp, entryMs)`, `raidJoined(n, count)`, `raidNone(n)`, `raidEntryClosed(n)`, `raidInjured(n, ms)`, `raidBattleStarted(boss, count, rounds, roundMs, bonusPct)`, `raidRound(boss, report)`, `raidVictory(type, boss, rewards): string[]`, `raidDefeat(type, boss, hp)`, `raidRedFallen(entries)`, `raidBreak(boss, injuryMs)`, `portalClosedEmpty(type)`, `raidCancelled()`, `inRaid(n)`, `raidRevived(n, label, left)`, `attackNoRaid(n)`, `attackNotIn(n)`, `attackNotStarted(n)`, `attackDown(n)`.

- [ ] **Step 1: Testes que falham**

Em `tests/game/messages.test.ts`, substitua o teste `'ranking vazio e preenchido'` por:

```ts
  it('ranking: uma mensagem por colocado, com a pontuação que explica a posição', () => {
    expect(msg.ranking(1, [])).toEqual([expect.stringContaining('ninguém')]);
    expect(
      msg.ranking(1, [
        { name: 'ana', title: null, rank: 3, level: 17, xp: 35 },
        { name: 'bia', title: 'Rank S · T1', rank: 2, level: 12, xp: 80 },
      ]),
    ).toEqual([
      '🏆 Ranking da Temporada 1 (ordem: rank, nível, XP)',
      '1º ana — Rank C · Nv 17 · 35 XP',
      '2º [Rank S · T1] bia — Rank D · Nv 12 · 80 XP',
    ]);
  });
```

E acrescente:

```ts
  it('portal aberto explica a regra do tipo e o tempo de entrada', () => {
    expect(msg.portalOpened('azul', 'Goblin', 500, 60_000)).toBe(
      '🔵 PORTAL AZUL abriu! Boss: Goblin (500 HP). Raid normal. Digite !raid em 1min para entrar.',
    );
    expect(msg.portalOpened('vermelho', 'Ogro', 800, 60_000)).toContain('quem terminar caído perde XP');
    expect(msg.portalOpened('quebra', 'Hidra', 1000, 60_000)).toContain('TODOS os caçadores ficam lesionados');
  });

  it('resumo da rodada', () => {
    expect(
      msg.raidRound('Goblin', {
        round: 3, totalRounds: 15, groupDamage: 64, attackers: 2, crits: ['edu'], hp: 312, maxHp: 500, won: false,
        bossHit: { name: 'ana', fell: true, tank: false }, revived: [{ healer: 'cris', target: 'ana' }],
      }),
    ).toBe('Rodada 3/15: grupo causou 64 de dano (2 com !atacar) · 💥 crítico de edu · Goblin: 312/500 HP · 💀 ana caiu! · ✨ cris levantou ana');
    expect(
      msg.raidRound('Goblin', {
        round: 1, totalRounds: 15, groupDamage: 20, attackers: 0, crits: [], hp: 480, maxHp: 500, won: false,
        bossHit: { name: 'bia', fell: false, tank: true }, revived: [],
      }),
    ).toBe('Rodada 1/15: grupo causou 20 de dano · Goblin: 480/500 HP · 🛡️ bia segurou o golpe');
  });

  it('vitória: ranking de dano um por linha', () => {
    const rw = (place: number, name: string, damage: number, xp: number, gold: number) =>
      ({ userId: name, displayName: name, place, damage, xp, gold, xpLoss: 0 });
    expect(msg.raidVictory('azul', 'Goblin', [rw(1, 'ana', 50, 60, 18), rw(2, 'bia', 40, 45, 13)])).toEqual([
      '🏆 Goblin foi derrotado! 🔵 PORTAL AZUL limpo. Ranking de dano:',
      '1º ana — 50 de dano → +60 XP, +18 ouro',
      '2º bia — 40 de dano → +45 XP, +13 ouro',
    ]);
    const lines = msg.raidVictory('azul', 'Goblin', [1, 2, 3, 4, 5, 6, 7].map((i) => rw(i, `p${i}`, 100 - i, 30, 9)));
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe('…e mais 2 caçadores também receberam recompensa.');
  });

  it('derrota, quebra e caídos do vermelho', () => {
    expect(msg.raidDefeat('azul', 'Goblin', 120)).toBe('💨 O tempo acabou: Goblin sobreviveu com 120 HP e o 🔵 PORTAL AZUL se fechou.');
    expect(msg.raidBreak('Hidra', 600_000)).toBe('⚠️ QUEBRA! Hidra escapou do portal. Todos os caçadores estão lesionados por 10min.');
    expect(msg.raidRedFallen([{ name: 'bia', xp: 20 }])).toBe('🔴 Quem terminou caído perdeu XP: bia (-20 XP)');
  });
```

Em `tests/game/game-service.test.ts`:
- No teste `'comandos diferentes do mesmo tipo não contam como repetidos'`, troque as duas linhas `toHaveLength(1)` por `.not.toEqual([])`:

```ts
    expect(game.handle(ana, parseCommand('!ranking')!)).not.toEqual([]);
    clock.advance(500);
    expect(game.handle(ana, parseCommand('!ranking eu')!)).not.toEqual([]);
```

- No teste `'ranking mostra o top e a posição própria'`, troque as três linhas do `top` por:

```ts
    const top = say(ana, '!ranking');
    expect(top[1]).toBe('1º ana — Rank D · Nv 1 · 0 XP');
    expect(top[2]).toBe('2º bia — Rank F · Nv 1 · 0 XP');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/game`
Expected: FAIL (`msg.portalOpened is not a function`; ranking ainda é uma string).

- [ ] **Step 3: Implementar**

Em `src/game/messages.ts`:
- Imports:

```ts
import type { HuntOutcome } from '../core/combat';
import type { RaidReward, RoundReport } from '../core/raid';
import { rankLetter, type PortalType } from '../core/types';
```

- `RankingEntry` ganha `xp: number;`.
- Depois de `const R = rankLetter;`:

```ts
const PORTAL_LABEL: Record<PortalType, string> = {
  azul: '🔵 PORTAL AZUL',
  vermelho: '🔴 PORTAL VERMELHO',
  quebra: '⚠️ QUEBRA DE PORTAL',
};
const PORTAL_RULE: Record<PortalType, string> = {
  azul: 'Raid normal.',
  vermelho: 'Ninguém sai até acabar; quem terminar caído perde XP.',
  quebra: 'Se não limparem a tempo, TODOS os caçadores ficam lesionados!',
};
const hunters = (count: number) => `${count} ${count === 1 ? 'caçador' : 'caçadores'}`;
```

- Substitua `ranking:` por:

```ts
  /** Uma mensagem por colocado (a Twitch não aceita quebra de linha). */
  ranking: (seasonNumber: number, entries: RankingEntry[]): string[] =>
    entries.length === 0
      ? [`🏆 T${seasonNumber}: ninguém no ranking ainda. Seja o primeiro com !despertar!`]
      : [
          `🏆 Ranking da Temporada ${seasonNumber} (ordem: rank, nível, XP)`,
          ...entries.map((e, i) => `${i + 1}º ${titled(e.title)}${e.name} — Rank ${R(e.rank)} · Nv ${e.level} · ${e.xp} XP`),
        ],
```

- Antes de `paused:`, acrescente:

```ts
  portalOpened: (type: PortalType, boss: string, hp: number, entryMs: number) =>
    `${PORTAL_LABEL[type]} abriu! Boss: ${boss} (${hp} HP). ${PORTAL_RULE[type]} Digite !raid em ${fmtDuration(entryMs)} para entrar.`,
  raidJoined: (n: string, count: number) => `${at(n)} entrou no portal! (${hunters(count)})`,
  raidNone: (n: string) => `${at(n)} não há portal aberto agora. Fique de olho no chat!`,
  raidEntryClosed: (n: string) => `${at(n)} a entrada do portal já fechou. Espere o próximo!`,
  raidInjured: (n: string, ms: number) =>
    `${at(n)} você está lesionado e não pode entrar (${fmtDuration(ms)}). Uma !usar pocao resolve.`,
  raidBattleStarted: (boss: string, count: number, rounds: number, roundMs: number, bonusPct: number) =>
    `⚔️ A batalha contra ${boss} começou! ${hunters(count)} · ${rounds} rodadas de ${fmtDuration(roundMs)} · ` +
    `use !atacar em cada rodada para +${bonusPct}% de dano`,
  raidRound: (boss: string, r: RoundReport) => {
    const parts = [`Rodada ${r.round}/${r.totalRounds}: grupo causou ${r.groupDamage} de dano${r.attackers > 0 ? ` (${r.attackers} com !atacar)` : ''}`];
    if (r.crits.length > 0) parts.push(`💥 crítico de ${r.crits.join(', ')}`);
    parts.push(`${boss}: ${r.hp}/${r.maxHp} HP`);
    if (r.bossHit) {
      parts.push(
        r.bossHit.fell ? `💀 ${r.bossHit.name} caiu!`
        : r.bossHit.tank ? `🛡️ ${r.bossHit.name} segurou o golpe`
        : `${r.bossHit.name} desviou do golpe`,
      );
    }
    for (const v of r.revived) parts.push(`✨ ${v.healer} levantou ${v.target}`);
    return parts.join(' · ');
  },
  /** Ranking de dano: uma mensagem por colocado, com o dano que explica a posição. */
  raidVictory: (type: PortalType, boss: string, rewards: RaidReward[]): string[] => [
    `🏆 ${boss} foi derrotado! ${PORTAL_LABEL[type]} limpo. Ranking de dano:`,
    ...rewards.slice(0, 5).map((r) => `${r.place}º ${r.displayName} — ${r.damage} de dano → +${r.xp} XP, +${r.gold} ouro`),
    ...(rewards.length > 5 ? [`…e mais ${rewards.length - 5} caçadores também receberam recompensa.`] : []),
  ],
  raidDefeat: (type: PortalType, boss: string, hp: number) =>
    `💨 O tempo acabou: ${boss} sobreviveu com ${hp} HP e o ${PORTAL_LABEL[type]} se fechou.`,
  raidRedFallen: (entries: { name: string; xp: number }[]) =>
    `🔴 Quem terminou caído perdeu XP: ${entries.map((e) => `${e.name} (-${e.xp} XP)`).join(' · ')}`,
  raidBreak: (boss: string, injuryMs: number) =>
    `⚠️ QUEBRA! ${boss} escapou do portal. Todos os caçadores estão lesionados por ${fmtDuration(injuryMs)}.`,
  portalClosedEmpty: (type: PortalType) => `${PORTAL_LABEL[type]} se fechou: ninguém entrou.`,
  raidCancelled: () => '🌀 O portal se fechou sem resultado (raid cancelada).',
  inRaid: (n: string) => `${at(n)} você está dentro do portal! Caçadas só depois da raid.`,
  raidRevived: (n: string, label: string, left: number) =>
    `${at(n)} 🧪 usou ${label} e voltou à batalha! Restam ${left}.`,
  attackNoRaid: (n: string) => `${at(n)} não há batalha agora. Use !atacar durante uma raid.`,
  attackNotIn: (n: string) => `${at(n)} você não está nesta raid. Entre com !raid quando o próximo portal abrir.`,
  attackNotStarted: (n: string) => `${at(n)} a batalha ainda não começou. Espere a entrada fechar.`,
  attackDown: (n: string) => `${at(n)} você caiu! Só volta à luta com um Curandeiro ou !usar pocao.`,
```

- Em `help`, troque `· !inventario'` por `· !inventario · !raid · !atacar'`.

Em `src/game/game-service.ts`:
- No primeiro `switch` de `dispatch`, troque `return [this.ranking(author, cmd.self)];` por `return this.ranking(author, cmd.self);`.
- Substitua o método `ranking` por:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game tests/game
git commit -m "feat(raid): mensagens da raid; ranking em uma mensagem por colocado"
```

---

### Task 7: Raid no `GameService` (`tick()`, entrada, rodadas, fim)

**Files:**
- Modify: `src/game/game-service.ts`
- Create: `tests/game/game-service-raid.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `GameService.tick(): string[]` — anúncios do relógio do jogo (virada de temporada, portal, rodadas, fim).
  - `get currentRaid(): Raid | null`, `get nextPortalAt(): number | null`
  - `admin({ action: 'portal', portal })` abre portal ou lança `AdminRefusal` ("o jogo está pausado; use /retomar antes." · "já existe um portal aberto." · "ninguém despertou ainda.").

- [ ] **Step 1: Testes que falham**

Crie `tests/game/game-service-raid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import type { Balance } from '../../src/config/balance';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { AdminRefusal, GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const bia: Author = { userId: 'u-bia', displayName: 'bia' };
const cris: Author = { userId: 'u-cris', displayName: 'cris' };
const GUERREIRO = 0;
const CURANDEIRO = 0.7;
const MIN = 60_000;
const BOSS = 0; // primeiro nome da lista de monstros

function setup(tweak: (b: Balance) => void = () => {}) {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  tweak(b);
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  /** Avança 3 s (fora da janela anti-duplicado) e envia o comando. */
  const say = (author: Author, text: string): string[] => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  const awaken = (author: Author, classRoll = GUERREIRO) => {
    rng.push(classRoll);
    return say(author, '!despertar');
  };
  /** Avança o relógio e roda o relógio do jogo. */
  const tickAfter = (ms: number): string[] => {
    clock.advance(ms);
    return game.tick();
  };
  const portal = (type: 'azul' | 'vermelho' | 'quebra') => {
    rng.push(BOSS);
    return game.admin({ action: 'portal', portal: type });
  };
  return { repo, clock, rng, b, game, say, awaken, tickAfter, portal };
}

describe('GameService: raid', () => {
  it('o timer abre um portal 30 min depois; sem caçadores, reagenda', () => {
    const { rng, game, awaken, tickAfter } = setup();
    expect(tickAfter(30 * MIN)).toEqual([]);
    expect(game.currentRaid).toBeNull();
    awaken(ana);
    rng.push(0, BOSS); // tipo (azul) e boss
    expect(tickAfter(30 * MIN).join('\n')).toContain('PORTAL AZUL');
    expect(game.currentRaid?.type).toBe('azul');
  });

  it('/portal com e sem tipo, e recusas', () => {
    const s = setup();
    expect(() => s.game.admin({ action: 'portal', portal: null })).toThrow(AdminRefusal);
    s.awaken(ana);
    expect(s.portal('vermelho')[0]).toContain('PORTAL VERMELHO');
    expect(() => s.game.admin({ action: 'portal', portal: 'azul' })).toThrow(/já existe/);

    const t = setup();
    t.awaken(ana);
    t.rng.push(0.95, BOSS); // tipo sorteado: quebra
    expect(t.game.admin({ action: 'portal', portal: null })[0]).toContain('QUEBRA DE PORTAL');

    const u = setup();
    u.awaken(ana);
    u.game.admin({ action: 'pausar' });
    expect(() => u.game.admin({ action: 'portal', portal: 'azul' })).toThrow(/pausado/);
  });

  it('!raid só na entrada; repetido não responde; lesionado é recusado', () => {
    const { repo, clock, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    awaken(bia);
    repo.saveHunter({ ...repo.getHunter('u-bia')!, injuredUntil: clock.t + 10 * MIN });
    portal('azul');
    expect(say(ana, '!raid')[0]).toContain('entrou no portal');
    expect(say(ana, '!raid')).toEqual([]);
    expect(say(bia, '!raid')[0]).toContain('lesionado');
    expect(say(ana, '!cacar')[0]).toContain('dentro do portal');
    expect(tickAfter(MIN).join('\n')).toContain('A batalha contra');
    awaken(cris);
    expect(say(cris, '!raid')[0]).toContain('já fechou');
  });

  it('ninguém entrou: azul fecha sem efeito; quebra lesiona todo mundo', () => {
    const a = setup();
    a.awaken(ana);
    a.portal('azul');
    expect(a.tickAfter(MIN).join('\n')).toContain('ninguém entrou');
    expect(a.game.currentRaid).toBeNull();
    expect(a.repo.getHunter('u-ana')!.injuredUntil).toBeNull();

    const q = setup();
    q.awaken(ana);
    q.portal('quebra');
    expect(q.tickAfter(MIN).join('\n')).toContain('QUEBRA!');
    expect(q.repo.getHunter('u-ana')!.injuredUntil).toBe(q.clock.t + 10 * MIN);
  });

  it('rodadas com !atacar, vitória e recompensa pelo ranking de dano', () => {
    const { repo, rng, game, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.bossHp.azul = 60;
    });
    awaken(ana);
    awaken(bia);
    portal('azul');
    say(ana, '!raid');
    say(bia, '!raid');
    tickAfter(MIN); // entrada fecha
    expect(say(ana, '!atacar')).toEqual([]);
    // rodada 1: ana 20×1,5 = 30, bia 20 → 10 HP; boss mira ana (sorteio 0) e erra
    rng.push(d20(10), d20(10), 0, 0.99);
    expect(tickAfter(20_000)[0]).toBe('Rodada 1/15: grupo causou 50 de dano (1 com !atacar) · Goblin: 10/60 HP · ana desviou do golpe');
    // rodada 2: 20 + 20 → vitória, sem golpe do boss
    rng.push(d20(10), d20(10));
    const out = tickAfter(20_000);
    expect(out).toContain('🏆 Goblin foi derrotado! 🔵 PORTAL AZUL limpo. Ranking de dano:');
    expect(out).toContain('1º ana — 50 de dano → +60 XP, +18 ouro');
    expect(out).toContain('2º bia — 40 de dano → +45 XP, +13 ouro');
    expect(game.currentRaid).toBeNull();
    expect(repo.getHunter('u-ana')).toMatchObject({ level: 2, xp: 30, gold: 18 });
    expect(repo.getHunter('u-bia')).toMatchObject({ level: 2, xp: 15, gold: 13 });
  });

  it('boss derruba, Curandeiro levanta, poção levanta e é gasta', () => {
    const { repo, rng, game, say, awaken, tickAfter, portal } = setup();
    awaken(ana);
    awaken(cris, CURANDEIRO);
    portal('azul');
    say(ana, '!raid');
    say(cris, '!raid');
    tickAfter(MIN);
    // rodada 1: boss mira ana (0) e ela cai (0); cris levanta ana
    rng.push(d20(1), d20(1), 0, 0);
    const r1 = tickAfter(20_000)[0];
    expect(r1).toContain('💀 ana caiu!');
    expect(r1).toContain('✨ cris levantou ana');
    // rodada 2: boss mira cris (0,6 → índice 1) e ela cai; ninguém levanta
    rng.push(d20(1), d20(1), 0.6, 0);
    expect(tickAfter(20_000)[0]).toContain('💀 cris caiu!');
    repo.setItemQty('u-cris', 'pocao', 1);
    expect(say(cris, '!usar pocao')[0]).toContain('voltou à batalha');
    expect(repo.getItems('u-cris').pocao ?? 0).toBe(0);
    expect(game.currentRaid!.participants.find((p) => p.userId === 'u-cris')!.down).toBe(false);
  });

  it('!atacar fora da raid avisa uma vez só', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!atacar')[0]).toContain('não há batalha');
    expect(say(ana, '!atacar')).toEqual([]);
  });

  it('vermelho: tempo acabou e quem terminou caído perde XP sem descer de nível', () => {
    const { repo, rng, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.battleMs = b.raid.roundMs; // uma rodada só
    });
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, xp: 5 });
    portal('vermelho');
    say(ana, '!raid');
    tickAfter(MIN);
    rng.push(d20(1), 0); // 11 de dano; único alvo cai
    const out = tickAfter(20_000).join('\n');
    expect(out).toContain('Goblin sobreviveu com 789 HP');
    expect(out).toContain('🔴 Quem terminou caído perdeu XP: ana (-20 XP)');
    expect(repo.getHunter('u-ana')).toMatchObject({ level: 1, xp: 0 });
  });

  it('/pausar cancela a raid; /retomar reagenda o portal', () => {
    const { clock, game, say, awaken, portal } = setup();
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    expect(game.admin({ action: 'pausar' }).join('\n')).toContain('cancelada');
    expect(game.currentRaid).toBeNull();
    game.admin({ action: 'retomar' });
    expect(game.nextPortalAt).toBe(clock.t + 30 * MIN);
  });

  it('virada de temporada cancela a raid', () => {
    const { game, awaken, portal } = setup();
    awaken(ana);
    portal('azul');
    expect(game.admin({ action: 'encerrar-temporada' }).join('\n')).toContain('cancelada');
    expect(game.currentRaid).toBeNull();
  });

  it('tick atrasado resolve todas as rodadas vencidas, em ordem', () => {
    const { rng, say, awaken, tickAfter, portal } = setup((b) => {
      b.raid.bossHp.azul = 10_000;
    });
    awaken(ana);
    portal('azul');
    say(ana, '!raid');
    rng.push(d20(1), 0.99, d20(1), 0.99, d20(1), 0.99);
    const out = tickAfter(2 * MIN).join('\n');
    expect(out).toContain('A batalha contra');
    expect(out).toContain('Rodada 3/15');
    expect(out).not.toContain('Rodada 4/15');
  });
});
```

(Contas: o nome do boss vem de `monsters[0][0]` = "Goblin" porque todos são Rank F. Guerreiro F1 com d20 10 = 8 + 2 + 10 = 20. No vermelho, 800 − 11 = 789.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/game/game-service-raid.test.ts`
Expected: FAIL (`game.tick is not a function`).

- [ ] **Step 3: Implementar**

Em `src/game/game-service.ts`:

Imports novos:

```ts
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
```

e troque `import { CLASS_IDS, MAX_RANK, type Hunter, type Season } from '../core/types';` por:

```ts
import { CLASS_IDS, MAX_RANK, type Hunter, type PortalType, type Season } from '../core/types';
```

`BLOCKED_WHEN_PAUSED` passa a ser:

```ts
const BLOCKED_WHEN_PAUSED = new Set<Command['kind']>(['despertar', 'cacar', 'reavaliar', 'comprar', 'usar', 'raid', 'atacar']);
```

Campos novos na classe (depois de `notifiedUntil`):

```ts
  /** Raid em andamento. Só em memória: reiniciar o bot cancela a raid. */
  private raid: Raid | null = null;
  private nextPortal: number | null = null;
```

Substitua `start()` e acrescente os getters:

```ts
  /** Garante uma temporada ativa (e vira a temporada se já acabou) e agenda o primeiro portal. Devolve anúncios. */
  start(): string[] {
    const now = this.deps.clock.now();
    this.nextPortal ??= now + this.deps.balance.raid.intervalMs;
    return this.ensureSeason(now);
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
```

`rollSeason` passa a cancelar a raid:

```ts
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
```

No `admin`, troque os casos `pausar`, `retomar` e `portal`:

```ts
      case 'pausar':
        this.paused = true;
        return [msg.paused(), ...this.cancelRaid(now)];
      case 'retomar':
        this.paused = false;
        this.nextPortal = now + this.deps.balance.raid.intervalMs;
        return [msg.resumed()];
```

```ts
      case 'portal':
        return this.openPortal(cmd.portal, now);
```

No segundo `switch (cmd.kind)` de `dispatch`, acrescente:

```ts
      case 'raid':
        return this.joinRaidCommand(h, now);
      case 'atacar':
        return this.attack(h);
```

No começo de `hunt(h, now)`:

```ts
    if (this.inRaid(h.userId)) return [msg.inRaid(h.displayName)];
```

Em `useItem`, logo depois de `if (have < 1) return msg.noItem(h.displayName, label);`:

```ts
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
```

Nova seção na classe, depois de `// ---------- loja ----------` e seus métodos:

```ts
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
        msg.raidBattleStarted(raid.bossName, raid.participants.length, raid.totalRounds, b.raid.roundMs, Math.round(b.raid.attackBonus * 100)),
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS (inclui os testes antigos do `GameService`).

- [ ] **Step 5: Commit**

```bash
git add src/game/game-service.ts tests/game/game-service-raid.test.ts
git commit -m "feat(raid): portal, entrada, rodadas e fim da raid no GameService"
```

---

### Task 8: Relógio no bot e tela local com portal

**Files:**
- Modify: `src/main.ts`
- Modify: `src/web/server.ts` (`BenchState`, `TestBench`)
- Modify: `web/index.html`
- Test: `tests/web/server.test.ts`

**Interfaces:**
- Consumes: `GameService.tick()`, `currentRaid`, `nextPortalAt` (Task 7).
- Produces: `BenchState` ganha `announcements: string[]`, `raid: RaidView | null`, `nextPortalInMs: number | null`.

- [ ] **Step 1: Testes que falham**

Em `tests/web/server.test.ts`:
- Acrescente ao tipo de retorno de `state` os campos `announcements: string[]` e `raid: { phase: string; round: number; hp: number } | null`.
- Substitua o teste `'avançar até o fim da temporada vira a temporada'` por:

```ts
  it('avançar até o fim da temporada vira a temporada (o relógio do jogo anuncia)', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    rng.push(0, 0); // o relógio do jogo também abre o portal atrasado: tipo e boss
    const s = (await (await post('/api/advance', { ms: testBalance().season.durationDays * 86_400_000 })).json()) as {
      season: { number: number };
      announcements: string[];
    };
    expect(s.season.number).toBe(2);
    expect(s.announcements.join('\n')).toContain('Temporada 1 encerrada');
    expect(s.announcements.join('\n')).toContain('PORTAL AZUL');
  });
```

- E acrescente:

```ts
  it('portal pelo terminal, !raid e rodada aparecem no estado', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    rng.push(0); // boss
    const opened = (await (await post('/api/admin', { action: 'portal', portal: 'azul' })).json()) as { replies: string[] };
    expect(opened.replies[0]).toContain('PORTAL AZUL');
    expect((await post('/api/admin', { action: 'portal', portal: 'azul' })).status).toBe(409);
    expect((await command('ana', '!raid')).replies[0]).toContain('entrou no portal');
    rng.push(d20(10), 0.99); // rodada 1: 20 de dano; boss erra
    const s = (await (await post('/api/advance', { ms: 80_000 })).json()) as {
      raid: { phase: string; round: number; hp: number };
      announcements: string[];
    };
    expect(s.raid).toMatchObject({ phase: 'batalha', round: 1, hp: 480 });
    expect(s.announcements.join('\n')).toContain('Rodada 1/15');
    expect((await state()).announcements).toEqual([]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/web/server.test.ts`
Expected: FAIL (`announcements` não existe).

- [ ] **Step 3: Implementar**

`src/main.ts`:
- Antes do `process.on('SIGINT', ...)`: `let ticker: NodeJS.Timeout | undefined;`
- Dentro do handler de SIGINT, primeira linha: `clearInterval(ticker);`
- Depois de `for (const announcement of game.start()) outbound.enqueue(announcement);`:

```ts
  // Relógio do jogo: abre portais e resolve as rodadas mesmo sem ninguém digitar.
  ticker = setInterval(() => {
    try {
      for (const announcement of game.tick()) outbound.enqueue(announcement);
    } catch (err) {
      console.error('[jogo] erro no relógio do jogo:', err instanceof Error ? err.message : err);
    }
  }, 1_000);
```

`src/web/server.ts`:
- Import: `import type { PortalType } from '../core/types';` (junto do import de `../core/types`, que vira `import { MAX_RANK, rankLetter, type Hunter, type PortalType } from '../core/types';`).
- Antes de `BenchState`:

```ts
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
```

- Em `BenchState`, acrescente:

```ts
  /** Anúncios do relógio do jogo desde a última leitura (portal, rodadas, temporada). */
  announcements: string[];
  raid: RaidView | null;
  nextPortalInMs: number | null;
```

- Em `TestBench`: campo `private pending: string[] = [];`; em `reset()`, antes de `this.open();`, `this.pending = [];`; e:

```ts
  /** Roda o relógio do jogo; os anúncios ficam guardados até a página pedir o estado. */
  private tick(): void {
    this.pending.push(...this.game.tick());
  }
```

- Em `state()`, primeira linha `this.tick();`, e no objeto devolvido:

```ts
      announcements: this.pending.splice(0),
      raid: this.raidView(now),
      nextPortalInMs: this.game.nextPortalAt === null ? null : Math.max(0, this.game.nextPortalAt - now),
```

- Novo método em `TestBench`:

```ts
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
```

`web/index.html`:
- CSS, antes de `</style>`:

```css
  ul.raiders { margin: 8px 0 0; padding-left: 18px; font-family: var(--mono); font-size: 13px; }
```

- Botões do chat, depois de `!inventario`:

```html
        <button type="button" data-cmd="!raid">!raid</button>
        <button type="button" data-cmd="!atacar">!atacar</button>
```

- Botões do terminal, depois de `/encerrar-temporada`:

```html
        <button type="button" data-admin="portal">/portal</button>
        <button type="button" data-admin="portal" data-portal="azul">/portal azul</button>
        <button type="button" data-admin="portal" data-portal="vermelho">/portal vermelho</button>
        <button type="button" data-admin="portal" data-portal="quebra">/portal quebra</button>
```

- Painel novo entre "Terminal do streamer" e "Tempo":

```html
    <section class="panel">
      <h2>Portal</h2>
      <div class="season" id="portal">Carregando…</div>
      <ul class="raiders" id="raiders"></ul>
    </section>
```

- Botões de tempo, antes de `+3 min (cooldown)`:

```html
        <button type="button" data-advance="20000">+20 s (rodada)</button>
        <button type="button" data-advance="60000">+1 min (entrada)</button>
        <button type="button" data-advance="1800000">+30 min (próximo portal)</button>
```

- No `render(state)`, logo depois de `lastState = state;`:

```js
    for (const a of state.announcements || []) line('bot', 'bot:', a);
    const portal = $('portal');
    const raiders = $('raiders');
    raiders.textContent = '';
    if (!state.raid) {
      portal.textContent = state.nextPortalInMs === null ? 'Nenhum portal agendado.' : `Próximo portal em ${fmt(state.nextPortalInMs)}`;
    } else {
      const r = state.raid;
      portal.textContent = r.phase === 'entrada'
        ? `${r.type.toUpperCase()} · ${r.bossName} · ${r.maxHp} HP · entrada fecha em ${fmt(r.nextInMs)}`
        : `${r.type.toUpperCase()} · ${r.bossName} · ${r.hp}/${r.maxHp} HP · rodada ${r.round}/${r.totalRounds} · próxima em ${fmt(r.nextInMs)}`;
      for (const p of r.participants) {
        const li = document.createElement('li');
        li.textContent = `${p.down ? '💀' : '⚔️'} ${p.name} (${p.classLabel}) — ${p.damage} de dano`;
        raiders.append(li);
      }
    }
```

- `sendAdmin` passa a receber o tipo:

```js
  function sendAdmin(action, portal) {
    queue = queue.then(async () => {
      line('user mod', 'terminal:', `/${action}${portal ? ` ${portal}` : ''}`);
      try {
        const r = await api('/api/admin', portal ? { action, portal } : { action });
        for (const reply of r.replies) line('bot', 'bot:', reply);
      } catch (err) {
        line('err', '', err.message);
      }
      await refresh();
    });
  }
```

- Listener: `btn.addEventListener('click', () => sendAdmin(btn.dataset.admin, btn.dataset.portal));`
- Antes de `line('sys', '', 'Escolha um nome...')`:

```js
  // Relógio do jogo: a página pergunta o estado a cada 1 s (na mesma fila dos envios, para o chat não embaralhar).
  setInterval(() => { queue = queue.then(refresh); }, 1000);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Conferir na tela local**

Run: `npm run dev:web` e abra `http://127.0.0.1:3210`. Desperte 3 nomes, clique `/portal azul`, mande `!raid` com cada um, clique `+1 min (entrada)` e depois `+20 s (rodada)` algumas vezes usando `!atacar`. Esperado: o painel Portal mostra HP e rodada; o chat mostra o resumo de cada rodada e, na vitória, o ranking de dano **uma linha por colocado**. Teste também `!ranking`: cabeçalho + uma linha por caçador com rank, nível e XP. Pare o servidor no fim.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/web/server.ts web/index.html tests/web/server.test.ts
git commit -m "feat(raid): relógio do jogo no bot e portal na tela local"
```

---

### Task 9: Simulação de raid e ROADMAP

**Files:**
- Modify: `scripts/sim.ts`
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: `openRaid`, `joinRaid`, `markAttack`, `resolveRound` (Tasks 2–3); `PORTAL_TYPES` (Task 1).

- [ ] **Step 1: Implementar a simulação**

Em `scripts/sim.ts`, acrescente aos imports:

```ts
import { joinRaid, markAttack, openRaid, resolveRound } from '../src/core/raid';
```

E junte aos imports que já existem:
- `import { chance, createSeededRng } from '../src/core/rng';`
- `import { CLASS_IDS, MAX_RANK, PORTAL_TYPES, RANKS, type ClassId, type PortalType } from '../src/core/types';`

Depois das constantes do topo:

```ts
/** Grupo da raid: hoje são os 3 jogadores reais. Edite para testar outros grupos. */
const RAID_PARTY: { classId: ClassId; level: number }[] = [
  { classId: 'guerreiro', level: 4 },
  { classId: 'tanque', level: 3 },
  { classId: 'assassino', level: 2 },
];
const RAID_RUNS = 5000;
```

E no fim do arquivo:

```ts
function simulateRaid(type: PortalType, attackRate: number): string {
  let wins = 0;
  for (let i = 0; i < RAID_RUNS; i++) {
    let raid = openRaid(type, 'Boss', 0, b);
    RAID_PARTY.forEach((p, k) => {
      const j = joinRaid(raid, { ...createHunter(`p${k}`, `p${k}`, p.classId, 1, 0), level: p.level }, 0);
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
console.log(`\n== Raid (${party}) · ${RAID_RUNS} raids por célula · sem poções ==`);
console.table(
  [0, 0.5, 1].map((rate) => ({
    '!atacar': `${rate * 100}% das rodadas`,
    ...Object.fromEntries(PORTAL_TYPES.map((t) => [`${t} ${b.raid.bossHp[t]} HP`, simulateRaid(t, rate)])),
  })),
);
```

(O rótulo usa "F" porque o grupo atual é Rank F; mude se testar outros ranks.)

- [ ] **Step 2: Rodar**

Run: `npm run sim`
Expected: a tabela de raid aparece no fim. Para o grupo atual, a chance de vitória deve ficar perto da spec (seção 8) ou um pouco acima: azul ≈ 90–98%, vermelho ≈ 70–92%, quebra ≈ 30–85%, subindo com `!atacar`. Se ficar muito diferente, pare e investigue antes de mexer nos números.

- [ ] **Step 3: ROADMAP**

Em `docs/ROADMAP.md`:
- Linha da v2 na tabela de status: `| **v2 — Portais** | Raids coletivas: !raid, !atacar, /portal, portal azul / vermelho / quebra, ranking de dano | ✅ no ramo v2-portais |`
- Acrescente na tabela de documentos: `| [plans/2026-11-09-despertar-v2-portais.md](plans/2026-11-09-despertar-v2-portais.md) | Plano executado da v2 |`
- Em "Pendências fora das versões", acrescente: `- **HP do boss escalando** com número de jogadores e rank, quando o chat crescer (spec v2, seção 11).`

- [ ] **Step 4: Verificação final e commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add scripts/sim.ts docs/ROADMAP.md
git commit -m "feat(raid): simulação de raid no npm run sim; ROADMAP da v2"
```
