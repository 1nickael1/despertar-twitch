# Despertar v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot de chat da Twitch com um RPG de caçadores ranqueados (F→S), jogável por comandos, com temporadas, títulos e ranking.

**Architecture:** Núcleo de regras puro em `src/core/` (sem I/O; recebe `Rng` e `now` injetados). `GameService` orquestra comandos → regras → `GameRepository` → respostas em texto. Adaptadores de chat (Twitch via tmi.js e console local) ficam atrás da interface `ChatClient`; uma `OutboundQueue` limita a taxa de mensagens.

**Tech Stack:** Node.js ≥ 20, TypeScript (executado com `tsx`), Vitest, zod, better-sqlite3, tmi.js, dotenv.

**Spec:** `despertar/docs/specs/2026-11-09-despertar-rpg-design.md`

## Global Constraints

- Todo o código fica em `despertar/` (relativo à raiz do workspace `lives-twitch`). Todos os comandos `npm`/`npx` rodam **dentro de `despertar/`**.
- ESM (`"type": "module"`), TypeScript `strict`, imports sem extensão (`moduleResolution: Bundler`).
- Números de balanceamento **só** em `despertar/config/balance.json` — nunca hardcoded em `src/`. Testes leem valores do balance em vez de repetir literais, para que ajustes de balanceamento não quebrem testes.
- Datas são `number` em epoch ms em todo lugar (código e SQLite `INTEGER`).
- Ranks são `number` 0–6 (0=F … 6=S). Letras só na apresentação.
- Texto voltado ao chat em português, uma linha, começando com `@nome` quando dirigido a alguém, máx. 500 caracteres.
- **Modo live (obrigatório):** nunca imprimir, logar ou commitar token/segredos. `.env` no `.gitignore`; só `.env.example` (placeholders) é versionado. Não rodar comandos que exibam variáveis de ambiente.
- Git: o workspace **ainda não é repositório**. Antes do primeiro commit, pedir aprovação ao usuário para `git init` na raiz `lives-twitch/`. Se recusado, pular os passos de commit.

## File Structure

```
despertar/
  package.json · tsconfig.json · .gitignore · .env.example
  config/balance.json            — todos os números do jogo
  migrations/001_init.sql        — schema SQLite
  src/core/types.ts              — Rank, ClassId, Hunter, Title, Season, HallOfFameEntry
  src/core/rng.ts                — Rng, seed, d20, chance, pick
  src/core/clock.ts              — Clock
  src/core/hunter.ts             — createHunter, resetForNewSeason, hasProgress
  src/core/progression.ts        — curva de XP, tetos, pisos, applyXp
  src/core/stats.ts              — atributo principal, chance de lesão
  src/core/combat.ts             — resolveHunt
  src/core/reevaluation.ts       — resolveReevaluation
  src/core/ranking.ts            — ordenação
  src/core/season.ts             — newSeason, closeSeason
  src/config/balance.ts          — schema zod + loadBalance
  src/config/env.ts              — leitura/mascaramento de credenciais
  src/data/repository.ts         — interface GameRepository
  src/data/memory-repository.ts  — implementação em memória (testes)
  src/data/sqlite-repository.ts  — implementação SQLite + migrações
  src/commands/parse.ts          — texto → Command
  src/game/messages.ts           — todos os textos do chat
  src/game/game-service.ts       — orquestração
  src/chat/types.ts              — ChatClient, IncomingMessage
  src/chat/outbound-queue.ts     — fila com limite de taxa
  src/chat/console-client.ts     — chat de mentira no terminal
  src/chat/twitch-client.ts      — tmi.js
  src/main.ts                    — composição e boot
  scripts/sim.ts                 — simulador de balanceamento
  tests/helpers.ts               — ScriptedRng, d20, FakeClock, makeHunter, testBalance
  tests/**.test.ts
```

---

### Task 1: Scaffold do projeto + configuração de balanceamento

**Files:**
- Create: `despertar/package.json`, `despertar/tsconfig.json`, `despertar/.gitignore`, `despertar/.env.example`
- Create: `despertar/config/balance.json`
- Create: `despertar/src/core/types.ts`
- Create: `despertar/src/config/balance.ts`
- Test: `despertar/tests/config/balance.test.ts`

**Interfaces:**
- Produces: `RANKS`, `MAX_RANK`, `CLASS_IDS`, `type ClassId`, `type Hunter`, `type Title`, `type Season`, `type HallOfFameEntry`, `rankLetter(rank: number): string` (types.ts); `BALANCE_PATH: string`, `type Balance`, `type ClassBalance`, `parseBalance(raw: unknown): Balance`, `loadBalance(path: string): Balance` (balance.ts)

- [ ] **Step 1: Verificar Node**

Run: `node --version`
Expected: `v20.x` ou superior. Se menor, parar e avisar o usuário.

- [ ] **Step 2: Criar `despertar/package.json`**

```json
{
  "name": "despertar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx src/main.ts",
    "dev:console": "tsx src/main.ts --console",
    "sim": "tsx scripts/sim.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Instalar dependências**

Run (em `despertar/`):
```bash
npm install zod better-sqlite3 tmi.js dotenv
npm install -D typescript tsx vitest @types/node @types/better-sqlite3 @types/tmi.js
```
Expected: instala sem erro. Se `better-sqlite3` falhar ao compilar no Windows, avisar o usuário (provável Node sem binário pré-compilado; usar a versão LTS do Node).

- [ ] **Step 4: Criar `despertar/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 5: Criar `despertar/.gitignore` e `despertar/.env.example`**

`.gitignore`:
```
node_modules/
/data/
.env
```

`.env.example`:
```
# Copie para .env e preencha FORA DA LIVE. Nunca mostre o .env na tela.
# Recomendado: conta separada para o bot. Escopos do token: chat:read chat:edit
TWITCH_BOT_USERNAME=nome_da_conta_do_bot
TWITCH_OAUTH_TOKEN=cole_o_token_aqui
TWITCH_CHANNEL=nome_do_seu_canal
```

- [ ] **Step 6: Criar `despertar/src/core/types.ts`**

```ts
export const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type RankLetter = (typeof RANKS)[number];
export const MAX_RANK = RANKS.length - 1;

export const CLASS_IDS = ['guerreiro', 'mago', 'assassino', 'curandeiro', 'tanque'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export interface Hunter {
  userId: string;
  displayName: string;
  classId: ClassId;
  rank: number;
  level: number;
  xp: number;
  gold: number;
  rankReachedAt: number;
  lastHuntAt: number | null;
  injuredUntil: number | null;
  reevalBlockedUntil: number | null;
  equippedTitleId: string | null;
  seasonId: number;
}

export interface Title {
  titleId: string;
  label: string;
  seasonId: number;
  earnedAt: number;
}

export interface Season {
  id: number;
  number: number;
  startedAt: number;
  endsAt: number;
  closedAt: number | null;
}

export interface HallOfFameEntry {
  seasonId: number;
  position: number;
  userId: string;
  displayName: string;
  finalRank: number;
  finalLevel: number;
}

export function rankLetter(rank: number): RankLetter {
  return RANKS[rank];
}
```

- [ ] **Step 7: Escrever o teste que falha — `despertar/tests/config/balance.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE_PATH, loadBalance, parseBalance } from '../../src/config/balance';
import { CLASS_IDS } from '../../src/core/types';

const rawBalance = () => JSON.parse(readFileSync(BALANCE_PATH, 'utf8'));

describe('balance', () => {
  it('carrega o balance.json do projeto', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.levelCaps).toHaveLength(7);
    expect(b.monsters).toHaveLength(7);
    expect(Object.keys(b.classes)).toEqual([...CLASS_IDS]);
  });

  it('rejeita config inválida apontando o campo', () => {
    const raw = rawBalance();
    raw.levelCaps = [5, 10];
    expect(() => parseBalance(raw)).toThrow(/levelCaps/);
  });

  it('rejeita chances de monstro que não somam 1', () => {
    const raw = rawBalance();
    raw.hunt.monsterRankChances.same = 0.5;
    expect(() => parseBalance(raw)).toThrow(/monsterRankChances/);
  });
});
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `npx vitest run tests/config/balance.test.ts`
Expected: FAIL — não encontra `src/config/balance`.

- [ ] **Step 9: Criar `despertar/config/balance.json`**

> 🎙️ Bom momento para a live: os nomes de monstros e classes podem ser escritos com o chat.

```json
{
  "levelCaps": [5, 10, 15, 20, 25, 30, 40],
  "xpCurve": { "base": 20, "perLevel": 10 },
  "hunt": {
    "cooldownMs": 180000,
    "injuryMs": 600000,
    "monsterRankChances": { "lower": 0.15, "same": 0.7, "higher": 0.15 },
    "xpByRank": [10, 15, 22, 32, 45, 60, 80],
    "goldByRank": [3, 5, 8, 12, 18, 25, 35],
    "difficultyByRank": [7, 13, 20, 28, 35, 43, 50],
    "baseInjuryChance": 0.5,
    "injuryPerVit": 0.03,
    "minInjuryChance": 0.1
  },
  "reevaluation": {
    "successChance": 0.7,
    "failBlockMs": 1200000,
    "reawakenChance": 0.01,
    "reawakenJump": 2
  },
  "season": { "durationDays": 14, "hallOfFameSize": 10 },
  "chat": { "messageIntervalMs": 1600, "duplicateWindowMs": 2000 },
  "classes": {
    "guerreiro": { "label": "Guerreiro", "primary": "FOR", "base": 8, "growth": 1.5, "vit": 6, "bonusVsHigherRank": 2, "critMin": null, "injuryImmune": false, "fixedInjuryChance": null, "lossXpFraction": 0 },
    "mago": { "label": "Mago", "primary": "INT", "base": 7, "growth": 1.8, "vit": 3, "bonusVsHigherRank": 0, "critMin": null, "injuryImmune": false, "fixedInjuryChance": null, "lossXpFraction": 0 },
    "assassino": { "label": "Assassino", "primary": "AGI", "base": 8, "growth": 1.5, "vit": 4, "bonusVsHigherRank": 0, "critMin": 18, "injuryImmune": false, "fixedInjuryChance": null, "lossXpFraction": 0 },
    "curandeiro": { "label": "Curandeiro", "primary": "INT", "base": 7, "growth": 1.4, "vit": 5, "bonusVsHigherRank": 0, "critMin": null, "injuryImmune": true, "fixedInjuryChance": null, "lossXpFraction": 0.5 },
    "tanque": { "label": "Tanque", "primary": "VIT", "base": 8, "growth": 1.4, "vit": 10, "bonusVsHigherRank": 0, "critMin": null, "injuryImmune": false, "fixedInjuryChance": 0.1, "lossXpFraction": 0.25 }
  },
  "monsters": [
    ["Goblin", "Rato Gigante", "Slime Ácido", "Morcego das Cavernas"],
    ["Lobo de Gelo", "Goblin Arqueiro", "Aranha Venenosa", "Esqueleto Soldado"],
    ["Orc Guerreiro", "Ghoul", "Golem de Barro", "Harpia"],
    ["Ogro", "Cavaleiro Sem Cabeça", "Lagarto de Fogo", "Xamã Orc"],
    ["Troll da Montanha", "Wyvern", "Lich Aprendiz", "Minotauro"],
    ["Hidra", "Cavaleiro da Morte", "Gigante de Gelo", "Quimera"],
    ["Dragão Ancestral", "Rei Demônio", "Titã de Pedra", "Leviatã"]
  ]
}
```

- [ ] **Step 10: Criar `despertar/src/config/balance.ts`**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const BALANCE_PATH = fileURLToPath(new URL('../../config/balance.json', import.meta.url));

const probability = z.number().min(0).max(1);
const perRank = z.array(z.number().nonnegative()).length(7);

const classSchema = z.object({
  label: z.string().min(1),
  primary: z.enum(['FOR', 'AGI', 'INT', 'VIT']),
  base: z.number().positive(),
  growth: z.number().nonnegative(),
  vit: z.number().nonnegative(),
  bonusVsHigherRank: z.number().nonnegative(),
  critMin: z.number().int().min(1).max(20).nullable(),
  injuryImmune: z.boolean(),
  fixedInjuryChance: probability.nullable(),
  lossXpFraction: probability,
});

export const balanceSchema = z.object({
  levelCaps: z.array(z.number().int().positive()).length(7),
  xpCurve: z.object({ base: z.number().int().nonnegative(), perLevel: z.number().int().nonnegative() }),
  hunt: z.object({
    cooldownMs: z.number().int().positive(),
    injuryMs: z.number().int().positive(),
    monsterRankChances: z
      .object({ lower: probability, same: probability, higher: probability })
      .refine((c) => Math.abs(c.lower + c.same + c.higher - 1) < 1e-9, {
        message: 'lower + same + higher deve somar 1',
      }),
    xpByRank: perRank,
    goldByRank: perRank,
    difficultyByRank: perRank,
    baseInjuryChance: probability,
    injuryPerVit: z.number().nonnegative(),
    minInjuryChance: probability,
  }),
  reevaluation: z.object({
    successChance: probability,
    failBlockMs: z.number().int().positive(),
    reawakenChance: probability,
    reawakenJump: z.number().int().min(1),
  }),
  season: z.object({ durationDays: z.number().positive(), hallOfFameSize: z.number().int().positive() }),
  chat: z.object({
    messageIntervalMs: z.number().int().nonnegative(),
    duplicateWindowMs: z.number().int().nonnegative(),
  }),
  classes: z.object({
    guerreiro: classSchema,
    mago: classSchema,
    assassino: classSchema,
    curandeiro: classSchema,
    tanque: classSchema,
  }),
  monsters: z.array(z.array(z.string().min(1)).min(1)).length(7),
});

export type Balance = z.infer<typeof balanceSchema>;
export type ClassBalance = z.infer<typeof classSchema>;

export function parseBalance(raw: unknown): Balance {
  const result = balanceSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`balance.json inválido:\n${lines.join('\n')}`);
  }
  return result.data;
}

export function loadBalance(path: string): Balance {
  return parseBalance(JSON.parse(readFileSync(path, 'utf8')));
}
```

- [ ] **Step 11: Rodar e ver passar**

Run: `npx vitest run tests/config/balance.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 12: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 13: Commit** (ver Global Constraints sobre `git init`)

```bash
git add despertar/package.json despertar/package-lock.json despertar/tsconfig.json despertar/.gitignore despertar/.env.example despertar/config despertar/src despertar/tests
git commit -m "feat(despertar): scaffold do projeto e configuração de balanceamento"
```

---

### Task 2: RNG, caçador e progressão

**Files:**
- Create: `despertar/src/core/rng.ts`, `despertar/src/core/hunter.ts`, `despertar/src/core/progression.ts`
- Create: `despertar/tests/helpers.ts`
- Test: `despertar/tests/core/rng.test.ts`, `despertar/tests/core/hunter.test.ts`, `despertar/tests/core/progression.test.ts`

**Interfaces:**
- Consumes: `Hunter`, `ClassId`, `Balance`, `BALANCE_PATH`, `loadBalance` (Task 1)
- Produces:
  - `interface Rng { next(): number }`, `createSeededRng(seed: number): Rng`, `mathRng: Rng`, `rollD20(rng: Rng): number`, `chance(rng: Rng, p: number): boolean`, `pick<T>(rng: Rng, items: readonly T[]): T`
  - `createHunter(userId: string, displayName: string, classId: ClassId, seasonId: number, now: number): Hunter`, `resetForNewSeason(h: Hunter, seasonId: number, now: number): Hunter`, `hasProgress(h: Hunter): boolean`
  - `xpToNext(level: number, b: Balance): number`, `levelCap(rank: number, b: Balance): number`, `rankFloor(rank: number, b: Balance): number`, `isAtCap(h: Hunter, b: Balance): boolean`, `interface XpResult { hunter: Hunter; levelsGained: number }`, `applyXp(h: Hunter, amount: number, b: Balance): XpResult`
  - tests/helpers.ts: `class ScriptedRng implements Rng { push(...values: number[]): this }`, `seqRng(values: number[]): ScriptedRng`, `d20(face: number): number`, `testBalance(): Balance`, `makeHunter(overrides?: Partial<Hunter>): Hunter`

- [ ] **Step 1: Criar `despertar/tests/helpers.ts`**

```ts
import { BALANCE_PATH, loadBalance, type Balance } from '../src/config/balance';
import { createHunter } from '../src/core/hunter';
import type { Rng } from '../src/core/rng';
import type { Hunter } from '../src/core/types';

/** Rng que devolve valores na ordem dada. Falha se o código sortear mais do que o teste previu. */
export class ScriptedRng implements Rng {
  private values: number[] = [];
  push(...values: number[]): this {
    this.values.push(...values);
    return this;
  }
  next(): number {
    const v = this.values.shift();
    if (v === undefined) throw new Error('ScriptedRng sem valores: o teste não previu este sorteio');
    return v;
  }
  get remaining(): number {
    return this.values.length;
  }
}

export const seqRng = (values: number[]): ScriptedRng => new ScriptedRng().push(...values);

/** Valor de Rng que produz exatamente `face` em rollD20. */
export const d20 = (face: number): number => (face - 1) / 20 + 0.01;

export const testBalance = (): Balance => loadBalance(BALANCE_PATH);

export const makeHunter = (overrides: Partial<Hunter> = {}): Hunter => ({
  ...createHunter('u1', 'ana', 'guerreiro', 1, 0),
  ...overrides,
});
```

- [ ] **Step 2: Escrever testes que falham**

`despertar/tests/core/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chance, createSeededRng, pick, rollD20 } from '../../src/core/rng';
import { d20, seqRng } from '../helpers';

describe('rng', () => {
  it('mesma seed gera a mesma sequência, em [0,1)', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rollD20 cobre 1..20', () => {
    const rng = createSeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rollD20(rng));
    expect([...seen].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('helper d20 produz a face pedida', () => {
    expect(rollD20(seqRng([d20(1)]))).toBe(1);
    expect(rollD20(seqRng([d20(17)]))).toBe(17);
    expect(rollD20(seqRng([d20(20)]))).toBe(20);
  });

  it('chance e pick', () => {
    expect(chance(seqRng([0.29]), 0.3)).toBe(true);
    expect(chance(seqRng([0.3]), 0.3)).toBe(false);
    expect(pick(seqRng([0.99]), ['a', 'b', 'c'])).toBe('c');
    expect(pick(seqRng([0]), ['a', 'b', 'c'])).toBe('a');
  });
});
```

`despertar/tests/core/hunter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createHunter, hasProgress, resetForNewSeason } from '../../src/core/hunter';
import { makeHunter } from '../helpers';

describe('hunter', () => {
  it('createHunter começa no Rank F nível 1 sem nada', () => {
    const h = createHunter('u9', 'bia', 'mago', 3, 500);
    expect(h).toEqual({
      userId: 'u9', displayName: 'bia', classId: 'mago', rank: 0, level: 1, xp: 0, gold: 0,
      rankReachedAt: 500, lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null,
      equippedTitleId: null, seasonId: 3,
    });
  });

  it('resetForNewSeason zera progresso e mantém identidade, classe e título', () => {
    const h = makeHunter({ rank: 4, level: 22, xp: 90, gold: 300, lastHuntAt: 1, injuredUntil: 2,
      reevalBlockedUntil: 3, equippedTitleId: 'top1-t1', classId: 'tanque' });
    const r = resetForNewSeason(h, 2, 999);
    expect(r).toMatchObject({ rank: 0, level: 1, xp: 0, gold: 0, rankReachedAt: 999, lastHuntAt: null,
      injuredUntil: null, reevalBlockedUntil: null, seasonId: 2, equippedTitleId: 'top1-t1',
      classId: 'tanque', userId: h.userId, displayName: h.displayName });
  });

  it('hasProgress', () => {
    expect(hasProgress(makeHunter())).toBe(false);
    expect(hasProgress(makeHunter({ xp: 1 }))).toBe(true);
    expect(hasProgress(makeHunter({ level: 2 }))).toBe(true);
    expect(hasProgress(makeHunter({ rank: 1 }))).toBe(true);
  });
});
```

`despertar/tests/core/progression.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyXp, isAtCap, levelCap, rankFloor, xpToNext } from '../../src/core/progression';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();

describe('progressão', () => {
  it('xpToNext = base + perLevel × nível', () => {
    expect(xpToNext(1, b)).toBe(b.xpCurve.base + b.xpCurve.perLevel);
    expect(xpToNext(7, b)).toBe(b.xpCurve.base + 7 * b.xpCurve.perLevel);
  });

  it('teto e piso de cada rank', () => {
    expect(levelCap(0, b)).toBe(b.levelCaps[0]);
    expect(rankFloor(0, b)).toBe(1);
    expect(rankFloor(1, b)).toBe(b.levelCaps[0]);
    expect(rankFloor(6, b)).toBe(b.levelCaps[5]);
  });

  it('sobe um nível e carrega o resto', () => {
    const r = applyXp(makeHunter(), xpToNext(1, b) + 3, b);
    expect(r.hunter.level).toBe(2);
    expect(r.hunter.xp).toBe(3);
    expect(r.levelsGained).toBe(1);
  });

  it('sobe vários níveis de uma vez', () => {
    const r = applyXp(makeHunter(), xpToNext(1, b) + xpToNext(2, b), b);
    expect(r.hunter.level).toBe(3);
    expect(r.hunter.xp).toBe(0);
    expect(r.levelsGained).toBe(2);
  });

  it('no teto do rank o XP fica guardado', () => {
    const cap = levelCap(0, b);
    const r = applyXp(makeHunter({ level: cap }), 500, b);
    expect(r.hunter.level).toBe(cap);
    expect(r.hunter.xp).toBe(500);
    expect(r.levelsGained).toBe(0);
    expect(isAtCap(r.hunter, b)).toBe(true);
  });

  it('nunca passa do teto, mesmo com muito XP', () => {
    const r = applyXp(makeHunter(), 1_000_000, b);
    expect(r.hunter.level).toBe(levelCap(0, b));
    expect(r.hunter.xp).toBeGreaterThan(0);
  });

  it('isAtCap é falso abaixo do teto', () => {
    expect(isAtCap(makeHunter({ level: levelCap(0, b) - 1 }), b)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/core`
Expected: FAIL — módulos `rng`, `hunter`, `progression` não existem.

- [ ] **Step 4: Implementar `despertar/src/core/rng.ts`**

```ts
/** Fonte de aleatoriedade injetável. next() devolve um número em [0, 1). */
export interface Rng {
  next(): number;
}

/** mulberry32: pequeno, rápido e determinístico para a mesma seed. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const mathRng: Rng = { next: () => Math.random() };

export function rollD20(rng: Rng): number {
  return Math.floor(rng.next() * 20) + 1;
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)];
}
```

- [ ] **Step 5: Implementar `despertar/src/core/hunter.ts`**

```ts
import type { ClassId, Hunter } from './types';

export function createHunter(
  userId: string,
  displayName: string,
  classId: ClassId,
  seasonId: number,
  now: number,
): Hunter {
  return {
    userId,
    displayName,
    classId,
    rank: 0,
    level: 1,
    xp: 0,
    gold: 0,
    rankReachedAt: now,
    lastHuntAt: null,
    injuredUntil: null,
    reevalBlockedUntil: null,
    equippedTitleId: null,
    seasonId,
  };
}

export function resetForNewSeason(h: Hunter, seasonId: number, now: number): Hunter {
  return {
    ...h,
    rank: 0,
    level: 1,
    xp: 0,
    gold: 0,
    rankReachedAt: now,
    lastHuntAt: null,
    injuredUntil: null,
    reevalBlockedUntil: null,
    seasonId,
  };
}

/** Jogou de verdade nesta temporada (não só digitou !despertar). */
export function hasProgress(h: Hunter): boolean {
  return h.rank > 0 || h.level > 1 || h.xp > 0;
}
```

- [ ] **Step 6: Implementar `despertar/src/core/progression.ts`**

```ts
import type { Balance } from '../config/balance';
import type { Hunter } from './types';

export function xpToNext(level: number, b: Balance): number {
  return b.xpCurve.base + b.xpCurve.perLevel * level;
}

export function levelCap(rank: number, b: Balance): number {
  return b.levelCaps[rank];
}

/** Nível em que se entra num rank: teto do rank anterior (F começa no 1). */
export function rankFloor(rank: number, b: Balance): number {
  return rank === 0 ? 1 : b.levelCaps[rank - 1];
}

export function isAtCap(h: Hunter, b: Balance): boolean {
  return h.level >= levelCap(h.rank, b);
}

export interface XpResult {
  hunter: Hunter;
  levelsGained: number;
}

/** Soma XP e sobe níveis até o teto do rank; acima do teto o XP fica guardado. */
export function applyXp(h: Hunter, amount: number, b: Balance): XpResult {
  const cap = levelCap(h.rank, b);
  let level = h.level;
  let xp = h.xp + amount;
  let levelsGained = 0;
  while (level < cap && xp >= xpToNext(level, b)) {
    xp -= xpToNext(level, b);
    level++;
    levelsGained++;
  }
  return { hunter: { ...h, level, xp }, levelsGained };
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run tests/core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add despertar/src/core despertar/tests
git commit -m "feat(despertar): rng determinístico, caçador e curva de progressão"
```

---

### Task 3: Atributos e combate (`resolveHunt`)

**Files:**
- Create: `despertar/src/core/stats.ts`, `despertar/src/core/combat.ts`
- Test: `despertar/tests/core/stats.test.ts`, `despertar/tests/core/combat.test.ts`

**Interfaces:**
- Consumes: `Rng`, `rollD20`, `chance`, `pick` (Task 2); `applyXp` (Task 2); `Balance` (Task 1); `Hunter`, `ClassId`, `MAX_RANK` (Task 1)
- Produces:
  - `primaryStat(classId: ClassId, level: number, b: Balance): number` (já arredondado para baixo)
  - `injuryChance(classId: ClassId, b: Balance): number`
  - `interface HuntOutcome { monsterName: string; monsterRank: number; playerRoll: number; playerPower: number; monsterPower: number; won: boolean; crit: boolean; xpGained: number; goldGained: number; injured: boolean; levelsGained: number; hunter: Hunter }`
  - `resolveHunt(h: Hunter, b: Balance, rng: Rng, now: number): HuntOutcome`
  - **Ordem dos sorteios** (os testes dependem dela): 1) rank do monstro, 2) nome do monstro, 3) d20 do jogador, 4) d20 do monstro, 5) lesão — só em derrota e só se a chance de lesão > 0.

- [ ] **Step 1: Escrever testes que falham**

`despertar/tests/core/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { injuryChance, primaryStat } from '../../src/core/stats';
import { testBalance } from '../helpers';

const b = testBalance();

describe('atributos', () => {
  it('atributo principal = base + crescimento × (nível − 1), arredondado para baixo', () => {
    const c = b.classes.guerreiro;
    expect(primaryStat('guerreiro', 1, b)).toBe(Math.floor(c.base));
    expect(primaryStat('guerreiro', 10, b)).toBe(Math.floor(c.base + c.growth * 9));
  });

  it('lesão: fórmula por VIT com mínimo', () => {
    const c = b.classes.guerreiro;
    const expected = Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit);
    expect(injuryChance('guerreiro', b)).toBeCloseTo(expected);
  });

  it('Curandeiro nunca se lesiona; Tanque tem chance fixa', () => {
    expect(injuryChance('curandeiro', b)).toBe(0);
    expect(injuryChance('tanque', b)).toBe(b.classes.tanque.fixedInjuryChance);
  });
});
```

`despertar/tests/core/combat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveHunt } from '../../src/core/combat';
import { xpToNext } from '../../src/core/progression';
import { primaryStat } from '../../src/core/stats';
import { d20, makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const NOW = 10_000;
const SAME_RANK = 0.5;
const LOWER_RANK = 0;
const HIGHER_RANK = 0.99;

describe('resolveHunt', () => {
  it('vitória: XP e ouro do rank do monstro, marca a caçada', () => {
    const rng = seqRng([SAME_RANK, 0, d20(20), d20(1)]);
    const o = resolveHunt(makeHunter(), b, rng, NOW);
    expect(o.won).toBe(true);
    expect(o.monsterRank).toBe(0);
    expect(o.monsterName).toBe(b.monsters[0][0]);
    expect(o.xpGained).toBe(b.hunt.xpByRank[0]);
    expect(o.goldGained).toBe(b.hunt.goldByRank[0]);
    expect(o.hunter.xp).toBe(b.hunt.xpByRank[0]);
    expect(o.hunter.gold).toBe(b.hunt.goldByRank[0]);
    expect(o.hunter.lastHuntAt).toBe(NOW);
    expect(o.injured).toBe(false);
    expect(rng.remaining).toBe(0);
  });

  it('derrota com lesão', () => {
    const rng = seqRng([SAME_RANK, 0, d20(1), d20(20), 0]);
    const o = resolveHunt(makeHunter(), b, rng, NOW);
    expect(o.won).toBe(false);
    expect(o.xpGained).toBe(0);
    expect(o.injured).toBe(true);
    expect(o.hunter.injuredUntil).toBe(NOW + b.hunt.injuryMs);
  });

  it('derrota sem lesão', () => {
    const o = resolveHunt(makeHunter(), b, seqRng([SAME_RANK, 0, d20(1), d20(20), 0.99]), NOW);
    expect(o.won).toBe(false);
    expect(o.injured).toBe(false);
    expect(o.hunter.injuredUntil).toBeNull();
  });

  it('Curandeiro: derrota dá XP parcial e não sorteia lesão', () => {
    const rng = seqRng([SAME_RANK, 0, d20(1), d20(20)]);
    const o = resolveHunt(makeHunter({ classId: 'curandeiro' }), b, rng, NOW);
    expect(o.won).toBe(false);
    expect(o.injured).toBe(false);
    expect(o.xpGained).toBe(Math.floor(b.hunt.xpByRank[0] * b.classes.curandeiro.lossXpFraction));
  });

  it('Assassino: crítico dobra XP e ouro', () => {
    const critMin = b.classes.assassino.critMin!;
    const o = resolveHunt(makeHunter({ classId: 'assassino' }), b, seqRng([SAME_RANK, 0, d20(critMin), d20(1)]), NOW);
    expect(o.won).toBe(true);
    expect(o.crit).toBe(true);
    expect(o.xpGained).toBe(b.hunt.xpByRank[0] * 2);
    expect(o.goldGained).toBe(b.hunt.goldByRank[0] * 2);
  });

  it('Assassino: abaixo da faixa de crítico não critica', () => {
    const critMin = b.classes.assassino.critMin!;
    const o = resolveHunt(makeHunter({ classId: 'assassino' }), b, seqRng([SAME_RANK, 0, d20(critMin - 1), d20(1)]), NOW);
    expect(o.crit).toBe(false);
  });

  it('Guerreiro ganha bônus contra monstro de rank acima', () => {
    const o = resolveHunt(makeHunter(), b, seqRng([HIGHER_RANK, 0, d20(4), d20(1)]), NOW);
    expect(o.monsterRank).toBe(1);
    expect(o.playerPower).toBe(primaryStat('guerreiro', 1, b) + b.classes.guerreiro.bonusVsHigherRank + 4);
    expect(o.monsterPower).toBe(b.hunt.difficultyByRank[1] + 1);
  });

  it('Mago não tem esse bônus', () => {
    // Sem o bônus o Mago perde aqui, então o código também sorteia a lesão (0.99 = sem lesão).
    const o = resolveHunt(makeHunter({ classId: 'mago' }), b, seqRng([HIGHER_RANK, 0, d20(4), d20(1), 0.99]), NOW);
    expect(o.playerPower).toBe(primaryStat('mago', 1, b) + 4);
  });

  it('rank do monstro fica dentro de F..S', () => {
    const atF = resolveHunt(makeHunter({ rank: 0 }), b, seqRng([LOWER_RANK, 0, d20(10), d20(10)]), NOW);
    expect(atF.monsterRank).toBe(0);
    const atS = resolveHunt(makeHunter({ rank: 6, level: 30 }), b, seqRng([HIGHER_RANK, 0, d20(10), d20(10)]), NOW);
    expect(atS.monsterRank).toBe(6);
  });

  it('vitória pode subir de nível', () => {
    const h = makeHunter({ xp: xpToNext(1, b) - 1 });
    const o = resolveHunt(h, b, seqRng([SAME_RANK, 0, d20(20), d20(1)]), NOW);
    expect(o.levelsGained).toBe(1);
    expect(o.hunter.level).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/stats.test.ts tests/core/combat.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `despertar/src/core/stats.ts`**

```ts
import type { Balance } from '../config/balance';
import type { ClassId } from './types';

export function primaryStat(classId: ClassId, level: number, b: Balance): number {
  const c = b.classes[classId];
  return Math.floor(c.base + c.growth * (level - 1));
}

export function injuryChance(classId: ClassId, b: Balance): number {
  const c = b.classes[classId];
  if (c.injuryImmune) return 0;
  if (c.fixedInjuryChance !== null) return c.fixedInjuryChance;
  return Math.max(b.hunt.minInjuryChance, b.hunt.baseInjuryChance - c.vit * b.hunt.injuryPerVit);
}
```

- [ ] **Step 4: Implementar `despertar/src/core/combat.ts`**

```ts
import type { Balance } from '../config/balance';
import { applyXp } from './progression';
import { chance, pick, rollD20, type Rng } from './rng';
import { injuryChance, primaryStat } from './stats';
import { MAX_RANK, type Hunter } from './types';

export interface HuntOutcome {
  monsterName: string;
  monsterRank: number;
  playerRoll: number;
  playerPower: number;
  monsterPower: number;
  won: boolean;
  crit: boolean;
  xpGained: number;
  goldGained: number;
  injured: boolean;
  levelsGained: number;
  hunter: Hunter;
}

function rollMonsterRank(h: Hunter, b: Balance, rng: Rng): number {
  const r = rng.next();
  const c = b.hunt.monsterRankChances;
  const offset = r < c.lower ? -1 : r < c.lower + c.same ? 0 : 1;
  return Math.min(MAX_RANK, Math.max(0, h.rank + offset));
}

/**
 * Ordem dos sorteios: rank do monstro, nome, d20 do jogador, d20 do monstro,
 * e (só em derrota com chance > 0) lesão.
 */
export function resolveHunt(h: Hunter, b: Balance, rng: Rng, now: number): HuntOutcome {
  const cls = b.classes[h.classId];
  const monsterRank = rollMonsterRank(h, b, rng);
  const monsterName = pick(rng, b.monsters[monsterRank]);
  const playerRoll = rollD20(rng);
  const bonus = monsterRank > h.rank ? cls.bonusVsHigherRank : 0;
  const playerPower = primaryStat(h.classId, h.level, b) + bonus + playerRoll;
  const monsterPower = b.hunt.difficultyByRank[monsterRank] + rollD20(rng);
  const won = playerPower >= monsterPower;
  const base = { monsterName, monsterRank, playerRoll, playerPower, monsterPower };
  const hunted: Hunter = { ...h, lastHuntAt: now };

  if (won) {
    const crit = cls.critMin !== null && playerRoll >= cls.critMin;
    const mult = crit ? 2 : 1;
    const xpGained = b.hunt.xpByRank[monsterRank] * mult;
    const goldGained = b.hunt.goldByRank[monsterRank] * mult;
    const { hunter, levelsGained } = applyXp({ ...hunted, gold: hunted.gold + goldGained }, xpGained, b);
    return { ...base, won, crit, xpGained, goldGained, injured: false, levelsGained, hunter };
  }

  const xpGained = Math.floor(b.hunt.xpByRank[monsterRank] * cls.lossXpFraction);
  const p = injuryChance(h.classId, b);
  const injured = p > 0 && chance(rng, p);
  const afterLoss: Hunter = injured ? { ...hunted, injuredUntil: now + b.hunt.injuryMs } : hunted;
  const { hunter, levelsGained } = applyXp(afterLoss, xpGained, b);
  return { ...base, won, crit: false, xpGained, goldGained: 0, injured, levelsGained, hunter };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add despertar/src/core despertar/tests/core
git commit -m "feat(despertar): atributos por classe e resolução de caçada"
```

---

### Task 4: Reavaliação e Re-despertar

**Files:**
- Create: `despertar/src/core/reevaluation.ts`
- Test: `despertar/tests/core/reevaluation.test.ts`

**Interfaces:**
- Consumes: `applyXp`, `rankFloor` (Task 2); `Rng`, `chance` (Task 2); `MAX_RANK`, `Hunter` (Task 1)
- Produces:
  - `type ReevalOutcome = { kind: 'success' | 'reawakening'; hunter: Hunter; fromRank: number; toRank: number } | { kind: 'failure'; hunter: Hunter; blockedUntil: number }`
  - `resolveReevaluation(h: Hunter, b: Balance, rng: Rng, now: number): ReevalOutcome` — pré-condição (garantida por quem chama): `isAtCap(h) && h.rank < MAX_RANK`.
  - **Ordem dos sorteios:** 1) Re-despertar; 2) sucesso (só se não houve Re-despertar).

- [ ] **Step 1: Escrever o teste que falha — `despertar/tests/core/reevaluation.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { levelCap, rankFloor, xpToNext } from '../../src/core/progression';
import { resolveReevaluation } from '../../src/core/reevaluation';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();
const NOW = 50_000;
const NO_REAWAKEN = 0.99;
const atCapF = (overrides = {}) => makeHunter({ level: levelCap(0, b), ...overrides });

describe('resolveReevaluation', () => {
  it('sucesso sobe 1 rank e marca a data', () => {
    const r = resolveReevaluation(atCapF({ xp: 7 }), b, seqRng([NO_REAWAKEN, 0]), NOW);
    expect(r.kind).toBe('success');
    if (r.kind === 'failure') throw new Error('esperava sucesso');
    expect(r.fromRank).toBe(0);
    expect(r.toRank).toBe(1);
    expect(r.hunter.rank).toBe(1);
    expect(r.hunter.level).toBe(levelCap(0, b));
    expect(r.hunter.xp).toBe(7);
    expect(r.hunter.rankReachedAt).toBe(NOW);
  });

  it('sucesso aplica o XP guardado', () => {
    const cap = levelCap(0, b);
    const r = resolveReevaluation(atCapF({ xp: xpToNext(cap, b) + 1 }), b, seqRng([NO_REAWAKEN, 0]), NOW);
    expect(r.hunter.level).toBe(cap + 1);
    expect(r.hunter.xp).toBe(1);
  });

  it('falha bloqueia nova tentativa sem perder XP', () => {
    const r = resolveReevaluation(atCapF({ xp: 40 }), b, seqRng([NO_REAWAKEN, 0.99]), NOW);
    expect(r.kind).toBe('failure');
    if (r.kind !== 'failure') throw new Error('esperava falha');
    expect(r.blockedUntil).toBe(NOW + b.reevaluation.failBlockMs);
    expect(r.hunter.reevalBlockedUntil).toBe(r.blockedUntil);
    expect(r.hunter.rank).toBe(0);
    expect(r.hunter.xp).toBe(40);
  });

  it('Re-despertar pula ranks e leva ao piso do novo rank', () => {
    const rng = seqRng([0]);
    const r = resolveReevaluation(atCapF(), b, rng, NOW);
    expect(r.kind).toBe('reawakening');
    if (r.kind === 'failure') throw new Error('esperava re-despertar');
    expect(r.toRank).toBe(b.reevaluation.reawakenJump);
    expect(r.hunter.level).toBe(rankFloor(r.toRank, b));
    expect(rng.remaining).toBe(0);
  });

  it('Re-despertar no Rank A para no S', () => {
    const r = resolveReevaluation(makeHunter({ rank: 5, level: levelCap(5, b) }), b, seqRng([0]), NOW);
    if (r.kind === 'failure') throw new Error('esperava re-despertar');
    expect(r.toRank).toBe(6);
    expect(r.hunter.rank).toBe(6);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/reevaluation.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `despertar/src/core/reevaluation.ts`**

```ts
import type { Balance } from '../config/balance';
import { applyXp, rankFloor } from './progression';
import { chance, type Rng } from './rng';
import { MAX_RANK, type Hunter } from './types';

export type ReevalOutcome =
  | { kind: 'success' | 'reawakening'; hunter: Hunter; fromRank: number; toRank: number }
  | { kind: 'failure'; hunter: Hunter; blockedUntil: number };

function promote(h: Hunter, toRank: number, now: number, b: Balance): Hunter {
  const level = Math.max(h.level, rankFloor(toRank, b));
  const promoted: Hunter = { ...h, rank: toRank, level, rankReachedAt: now, reevalBlockedUntil: null };
  return applyXp(promoted, 0, b).hunter;
}

/** Pré-condição: caçador no teto do rank e abaixo de S. */
export function resolveReevaluation(h: Hunter, b: Balance, rng: Rng, now: number): ReevalOutcome {
  const fromRank = h.rank;
  if (chance(rng, b.reevaluation.reawakenChance)) {
    const toRank = Math.min(MAX_RANK, h.rank + b.reevaluation.reawakenJump);
    return { kind: 'reawakening', hunter: promote(h, toRank, now, b), fromRank, toRank };
  }
  if (chance(rng, b.reevaluation.successChance)) {
    const toRank = h.rank + 1;
    return { kind: 'success', hunter: promote(h, toRank, now, b), fromRank, toRank };
  }
  const blockedUntil = now + b.reevaluation.failBlockMs;
  return { kind: 'failure', hunter: { ...h, reevalBlockedUntil: blockedUntil }, blockedUntil };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add despertar/src/core/reevaluation.ts despertar/tests/core/reevaluation.test.ts
git commit -m "feat(despertar): teste de reavaliação e re-despertar"
```

---

### Task 5: Ranking e temporadas

**Files:**
- Create: `despertar/src/core/ranking.ts`, `despertar/src/core/season.ts`
- Test: `despertar/tests/core/ranking.test.ts`, `despertar/tests/core/season.test.ts`

**Interfaces:**
- Consumes: `resetForNewSeason`, `hasProgress` (Task 2); `Hunter`, `Season`, `Title`, `HallOfFameEntry`, `MAX_RANK` (Task 1)
- Produces:
  - `compareHunters(a: Hunter, b: Hunter): number`, `sortRanking(hunters: Hunter[]): Hunter[]`
  - `newSeason(number: number, now: number, b: Balance): Omit<Season, 'id'>`
  - `interface GrantedTitle { userId: string; title: Title }`
  - `interface SeasonCloseResult { hallOfFame: HallOfFameEntry[]; titles: GrantedTitle[]; resetHunters: Hunter[] }`
  - `closeSeason(hunters: Hunter[], season: Season, nextSeasonId: number, b: Balance, now: number): SeasonCloseResult`
  - IDs de título: `top{1|2|3}-t{número}`, `rank-s-t{número}`; rótulos `Top N · T{número}`, `Rank S · T{número}`.

- [ ] **Step 1: Escrever testes que falham**

`despertar/tests/core/ranking.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sortRanking } from '../../src/core/ranking';
import { makeHunter } from '../helpers';

describe('ranking', () => {
  it('ordena por rank, nível, XP e quem chegou primeiro', () => {
    const hs = [
      makeHunter({ userId: 'nivel-menor', rank: 2, level: 11 }),
      makeHunter({ userId: 'rank-maior', rank: 3, level: 15 }),
      makeHunter({ userId: 'chegou-depois', rank: 2, level: 12, xp: 5, rankReachedAt: 200 }),
      makeHunter({ userId: 'xp-maior', rank: 2, level: 12, xp: 9 }),
      makeHunter({ userId: 'chegou-antes', rank: 2, level: 12, xp: 5, rankReachedAt: 100 }),
    ];
    expect(sortRanking(hs).map((h) => h.userId)).toEqual([
      'rank-maior', 'xp-maior', 'chegou-antes', 'chegou-depois', 'nivel-menor',
    ]);
  });

  it('não altera o array original', () => {
    const hs = [makeHunter({ userId: 'a' }), makeHunter({ userId: 'b', rank: 1 })];
    sortRanking(hs);
    expect(hs.map((h) => h.userId)).toEqual(['a', 'b']);
  });
});
```

`despertar/tests/core/season.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { closeSeason, newSeason } from '../../src/core/season';
import type { Season } from '../../src/core/types';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();
const DAY = 86_400_000;
const season: Season = { id: 1, number: 1, startedAt: 0, endsAt: 14 * DAY, closedAt: null };

describe('temporadas', () => {
  it('newSeason dura durationDays', () => {
    expect(newSeason(2, 1000, b)).toEqual({
      number: 2, startedAt: 1000, endsAt: 1000 + b.season.durationDays * DAY, closedAt: null,
    });
  });

  it('closeSeason: hall da fama, títulos e reset', () => {
    const hunters = [
      makeHunter({ userId: 'ana', displayName: 'ana', rank: 3, level: 17 }),
      makeHunter({ userId: 'bia', displayName: 'bia', rank: 6, level: 33, equippedTitleId: 'velho' }),
      makeHunter({ userId: 'caio', displayName: 'caio', rank: 2, level: 12 }),
      makeHunter({ userId: 'lurker', displayName: 'lurker' }),
      makeHunter({ userId: 'antigo', displayName: 'antigo', seasonId: 0, rank: 6 }),
    ];
    const r = closeSeason(hunters, season, 2, b, 777);

    expect(r.hallOfFame.map((e) => [e.position, e.userId, e.finalRank])).toEqual([
      [1, 'bia', 6], [2, 'ana', 3], [3, 'caio', 2],
    ]);
    expect(r.titles.map((t) => [t.userId, t.title.titleId, t.title.label])).toEqual([
      ['bia', 'top1-t1', 'Top 1 · T1'],
      ['ana', 'top2-t1', 'Top 2 · T1'],
      ['caio', 'top3-t1', 'Top 3 · T1'],
      ['bia', 'rank-s-t1', 'Rank S · T1'],
    ]);
    expect(r.titles.every((t) => t.title.earnedAt === 777 && t.title.seasonId === 1)).toBe(true);

    expect(r.resetHunters).toHaveLength(5);
    for (const h of r.resetHunters) {
      expect(h).toMatchObject({ rank: 0, level: 1, xp: 0, gold: 0, seasonId: 2 });
    }
    expect(r.resetHunters.find((h) => h.userId === 'bia')!.equippedTitleId).toBe('velho');
  });

  it('respeita o tamanho do hall da fama', () => {
    const many = Array.from({ length: b.season.hallOfFameSize + 2 }, (_, i) =>
      makeHunter({ userId: `u${i}`, level: 2 + i }),
    );
    expect(closeSeason(many, season, 2, b, 0).hallOfFame).toHaveLength(b.season.hallOfFameSize);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/core/ranking.test.ts tests/core/season.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `despertar/src/core/ranking.ts`**

```ts
import type { Hunter } from './types';

export function compareHunters(a: Hunter, b: Hunter): number {
  return b.rank - a.rank || b.level - a.level || b.xp - a.xp || a.rankReachedAt - b.rankReachedAt;
}

export function sortRanking(hunters: Hunter[]): Hunter[] {
  return [...hunters].sort(compareHunters);
}
```

- [ ] **Step 4: Implementar `despertar/src/core/season.ts`**

```ts
import type { Balance } from '../config/balance';
import { hasProgress, resetForNewSeason } from './hunter';
import { sortRanking } from './ranking';
import { MAX_RANK, type HallOfFameEntry, type Hunter, type Season, type Title } from './types';

const DAY_MS = 86_400_000;

export function newSeason(number: number, now: number, b: Balance): Omit<Season, 'id'> {
  return { number, startedAt: now, endsAt: now + b.season.durationDays * DAY_MS, closedAt: null };
}

export interface GrantedTitle {
  userId: string;
  title: Title;
}

export interface SeasonCloseResult {
  hallOfFame: HallOfFameEntry[];
  titles: GrantedTitle[];
  resetHunters: Hunter[];
}

export function closeSeason(
  hunters: Hunter[],
  season: Season,
  nextSeasonId: number,
  b: Balance,
  now: number,
): SeasonCloseResult {
  const ranked = sortRanking(hunters.filter((h) => h.seasonId === season.id && hasProgress(h)));

  const hallOfFame = ranked.slice(0, b.season.hallOfFameSize).map((h, i) => ({
    seasonId: season.id,
    position: i + 1,
    userId: h.userId,
    displayName: h.displayName,
    finalRank: h.rank,
    finalLevel: h.level,
  }));

  const grant = (userId: string, titleId: string, label: string): GrantedTitle => ({
    userId,
    title: { titleId, label, seasonId: season.id, earnedAt: now },
  });
  const n = season.number;
  const titles = [
    ...ranked.slice(0, 3).map((h, i) => grant(h.userId, `top${i + 1}-t${n}`, `Top ${i + 1} · T${n}`)),
    ...ranked.filter((h) => h.rank === MAX_RANK).map((h) => grant(h.userId, `rank-s-t${n}`, `Rank S · T${n}`)),
  ];

  const resetHunters = hunters.map((h) => resetForNewSeason(h, nextSeasonId, now));
  return { hallOfFame, titles, resetHunters };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add despertar/src/core despertar/tests/core
git commit -m "feat(despertar): ranking e encerramento de temporada"
```

---

### Task 6: Persistência — `GameRepository` (memória + SQLite)

**Files:**
- Create: `despertar/src/data/repository.ts`, `despertar/src/data/memory-repository.ts`, `despertar/src/data/sqlite-repository.ts`
- Create: `despertar/migrations/001_init.sql`
- Test: `despertar/tests/data/repository.test.ts`

**Interfaces:**
- Consumes: `Hunter`, `ClassId`, `Title`, `Season`, `HallOfFameEntry` (Task 1)
- Produces:
  ```ts
  interface GameRepository {
    getHunter(userId: string): Hunter | null;
    saveHunter(h: Hunter): void;            // upsert
    listHunters(): Hunter[];
    getTitles(userId: string): Title[];     // ordenado por earnedAt, depois titleId
    addTitle(userId: string, title: Title): void; // ignora duplicado
    getCurrentSeason(): Season | null;      // a mais recente com closedAt null
    createSeason(s: Omit<Season, 'id'>): Season;
    markSeasonClosed(id: number, closedAt: number): void;
    addHallOfFame(entries: HallOfFameEntry[]): void;
    getHallOfFame(seasonId: number): HallOfFameEntry[]; // por posição
    transaction<T>(fn: () => T): T;
  }
  ```
  `class MemoryGameRepository implements GameRepository`; `openDatabase(file: string): Database.Database`; `runMigrations(db: Database.Database, dir?: string): void`; `class SqliteGameRepository implements GameRepository { constructor(db: Database.Database) }`

- [ ] **Step 1: Escrever o teste que falha — `despertar/tests/data/repository.test.ts`**

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/data`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Criar `despertar/migrations/001_init.sql`**

```sql
CREATE TABLE hunters (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  level INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  rank_reached_at INTEGER NOT NULL,
  last_hunt_at INTEGER,
  injured_until INTEGER,
  reeval_blocked_until INTEGER,
  equipped_title_id TEXT,
  season_id INTEGER NOT NULL
);

CREATE TABLE hunter_titles (
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  label TEXT NOT NULL,
  season_id INTEGER NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, title_id)
);

CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE hall_of_fame (
  season_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  final_rank INTEGER NOT NULL,
  final_level INTEGER NOT NULL,
  PRIMARY KEY (season_id, position)
);
```

- [ ] **Step 4: Criar `despertar/src/data/repository.ts`**

```ts
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
  transaction<T>(fn: () => T): T;
}
```

- [ ] **Step 5: Criar `despertar/src/data/memory-repository.ts`**

```ts
import type { HallOfFameEntry, Hunter, Season, Title } from '../core/types';
import type { GameRepository } from './repository';

const byEarned = (a: Title, b: Title) => a.earnedAt - b.earnedAt || a.titleId.localeCompare(b.titleId);

/** Implementação em memória para testes. transaction() não desfaz nada. */
export class MemoryGameRepository implements GameRepository {
  private hunters = new Map<string, Hunter>();
  private titles = new Map<string, Title[]>();
  private seasons: Season[] = [];
  private hall: HallOfFameEntry[] = [];

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

  transaction<T>(fn: () => T): T {
    return fn();
  }
}
```

- [ ] **Step 6: Criar `despertar/src/data/sqlite-repository.ts`**

```ts
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

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run tests/data`
Expected: PASS (as duas implementações + bloco SQLite).

- [ ] **Step 8: Typecheck e commit**

Run: `npm run typecheck` → sem erros.
```bash
git add despertar/migrations despertar/src/data despertar/tests/data
git commit -m "feat(despertar): repositório em memória e SQLite com migrações"
```

---

### Task 7: Parser de comandos

**Files:**
- Create: `despertar/src/commands/parse.ts`
- Test: `despertar/tests/commands/parse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type AdminAction = 'pausar' | 'retomar' | 'encerrar-temporada';
  type Command =
    | { kind: 'despertar' } | { kind: 'cacar' } | { kind: 'status' } | { kind: 'reavaliar' }
    | { kind: 'ranking'; self: boolean } | { kind: 'titulos' } | { kind: 'titulo'; arg: string }
    | { kind: 'temporada' } | { kind: 'ajuda' } | { kind: 'admin'; action: AdminAction };
  normalizeText(s: string): string;   // sem acentos, minúsculo
  parseCommand(text: string): Command | null;
  ```

- [ ] **Step 1: Escrever o teste que falha — `despertar/tests/commands/parse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeText, parseCommand } from '../../src/commands/parse';

describe('parseCommand', () => {
  it.each(['!cacar', '!caçar', '!CAÇAR', '  !hunt  '])('%s → cacar', (t) => {
    expect(parseCommand(t)).toEqual({ kind: 'cacar' });
  });

  it('aliases', () => {
    expect(parseCommand('!perfil')).toEqual({ kind: 'status' });
    expect(parseCommand('!comandos')).toEqual({ kind: 'ajuda' });
    expect(parseCommand('!despertar')).toEqual({ kind: 'despertar' });
    expect(parseCommand('!reavaliar')).toEqual({ kind: 'reavaliar' });
    expect(parseCommand('!temporada')).toEqual({ kind: 'temporada' });
  });

  it('ranking com e sem "eu"', () => {
    expect(parseCommand('!ranking')).toEqual({ kind: 'ranking', self: false });
    expect(parseCommand('!ranking eu')).toEqual({ kind: 'ranking', self: true });
  });

  it('títulos', () => {
    expect(parseCommand('!titulos')).toEqual({ kind: 'titulos' });
    expect(parseCommand('!titulo')).toEqual({ kind: 'titulos' });
    expect(parseCommand('!titulo 2')).toEqual({ kind: 'titulo', arg: '2' });
    expect(parseCommand('!título Top 1')).toEqual({ kind: 'titulo', arg: 'Top 1' });
  });

  it('moderação', () => {
    expect(parseCommand('!rpg pausar')).toEqual({ kind: 'admin', action: 'pausar' });
    expect(parseCommand('!rpg retomar')).toEqual({ kind: 'admin', action: 'retomar' });
    expect(parseCommand('!rpg encerrar-temporada')).toEqual({ kind: 'admin', action: 'encerrar-temporada' });
    expect(parseCommand('!rpg xyz')).toBeNull();
  });

  it.each(['', 'oi', '!', '!naoexiste', '!constructor', '!toString', 'cacar'])('ignora %j', (t) => {
    expect(parseCommand(t)).toBeNull();
  });

  it('normalizeText remove acentos e caixa', () => {
    expect(normalizeText('Título ÇA')).toBe('titulo ca');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/commands`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `despertar/src/commands/parse.ts`**

```ts
export type AdminAction = 'pausar' | 'retomar' | 'encerrar-temporada';

export type Command =
  | { kind: 'despertar' }
  | { kind: 'cacar' }
  | { kind: 'status' }
  | { kind: 'reavaliar' }
  | { kind: 'ranking'; self: boolean }
  | { kind: 'titulos' }
  | { kind: 'titulo'; arg: string }
  | { kind: 'temporada' }
  | { kind: 'ajuda' }
  | { kind: 'admin'; action: AdminAction };

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Map (e não objeto literal) para que "!constructor" e afins não casem com o protótipo.
const ALIASES = new Map<string, string>([
  ['despertar', 'despertar'],
  ['cacar', 'cacar'],
  ['hunt', 'cacar'],
  ['status', 'status'],
  ['perfil', 'status'],
  ['reavaliar', 'reavaliar'],
  ['ranking', 'ranking'],
  ['rank', 'ranking'],
  ['titulos', 'titulos'],
  ['titulo', 'titulo'],
  ['temporada', 'temporada'],
  ['ajuda', 'ajuda'],
  ['comandos', 'ajuda'],
  ['rpg', 'rpg'],
]);

const ADMIN_ACTIONS: readonly AdminAction[] = ['pausar', 'retomar', 'encerrar-temporada'];

export function parseCommand(text: string): Command | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;
  const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const name = ALIASES.get(normalizeText(head));
  if (!name) return null;
  const argRaw = rest.join(' ').trim();
  const arg = normalizeText(argRaw);

  switch (name) {
    case 'despertar':
    case 'cacar':
    case 'status':
    case 'reavaliar':
    case 'titulos':
    case 'temporada':
    case 'ajuda':
      return { kind: name };
    case 'ranking':
      return { kind: 'ranking', self: arg === 'eu' };
    case 'titulo':
      return argRaw ? { kind: 'titulo', arg: argRaw } : { kind: 'titulos' };
    case 'rpg': {
      const action = ADMIN_ACTIONS.find((a) => a === arg);
      return action ? { kind: 'admin', action } : null;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/commands`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add despertar/src/commands despertar/tests/commands
git commit -m "feat(despertar): parser de comandos com aliases e acentos"
```

---

### Task 8: Textos do chat (`messages.ts`)

> 🎙️ **Contribuição ao vivo:** este arquivo concentra toda a "voz" do jogo. O código abaixo é o padrão funcional; é um ótimo trecho para o streamer reescrever com o chat (emojis, piadas, referências da comunidade), mantendo as assinaturas e os testes.

**Files:**
- Create: `despertar/src/game/messages.ts`
- Test: `despertar/tests/game/messages.test.ts`

**Interfaces:**
- Consumes: `rankLetter` (Task 1); `HuntOutcome` (Task 3)
- Produces: `fmtDuration(ms: number): string`; `interface StatusView { title: string | null; classLabel: string; rank: number; level: number; xpText: string; gold: number; state: string }`; `interface RankingEntry { name: string; title: string | null; rank: number; level: number }`; objeto `msg` com as funções listadas no código.

- [ ] **Step 1: Escrever o teste que falha — `despertar/tests/game/messages.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { HuntOutcome } from '../../src/core/combat';
import { fmtDuration, msg } from '../../src/game/messages';
import { makeHunter } from '../helpers';

const outcome = (o: Partial<HuntOutcome> = {}): HuntOutcome => ({
  monsterName: 'Lobo de Gelo', monsterRank: 1, playerRoll: 15, playerPower: 27, monsterPower: 21,
  won: true, crit: false, xpGained: 15, goldGained: 5, injured: false, levelsGained: 0,
  hunter: makeHunter(), ...o,
});

describe('fmtDuration', () => {
  it.each([
    [0, '0s'],
    [1, '1s'],
    [45_000, '45s'],
    [150_000, '2min 30s'],
    [180_000, '3min'],
    [3_900_000, '1h 5min'],
    [(9 * 86_400 + 4 * 3_600) * 1000, '9d 4h'],
  ])('%i ms → %s', (ms, expected) => {
    expect(fmtDuration(ms)).toBe(expected);
  });
});

describe('msg', () => {
  it('vitória mostra monstro, rank, rolagens e ganhos', () => {
    const t = msg.huntWin('ana', outcome());
    expect(t).toBe('@ana ⚔️ venceu um Lobo de Gelo [E] (27 vs 21) — +15 XP, +5 ouro');
  });

  it('vitória crítica é destacada', () => {
    expect(msg.huntWin('ana', outcome({ crit: true }))).toContain('CRÍTICO');
  });

  it('derrota com lesão e XP de consolo', () => {
    const t = msg.huntLoss('ana', outcome({ won: false, injured: true, xpGained: 7, playerPower: 9, monsterPower: 25 }), 600_000);
    expect(t).toContain('derrotado por um Lobo de Gelo [E] (9 vs 25)');
    expect(t).toContain('+7 XP de consolo');
    expect(t).toContain('lesionado por 10min');
  });

  it('status', () => {
    const t = msg.status('ana', { title: 'Top 1 · T1', classLabel: 'Assassino', rank: 1, level: 7,
      xpText: '40/90 XP', gold: 32, state: '✅ pronto para caçar' });
    expect(t).toBe('@ana [Top 1 · T1] Assassino Rank E · Nv 7 (40/90 XP) · 32 ouro · ✅ pronto para caçar');
  });

  it('ranking vazio e preenchido', () => {
    expect(msg.ranking(1, [])).toContain('ninguém');
    const t = msg.ranking(1, [
      { name: 'ana', title: null, rank: 3, level: 17 },
      { name: 'bia', title: 'Rank S · T1', rank: 2, level: 12 },
    ]);
    expect(t).toBe('🏆 T1: 1. ana (C·17) 2. [Rank S · T1] bia (D·12)');
  });

  it('lista de títulos marca o equipado', () => {
    const t = msg.titlesList('ana', [{ label: 'Top 2 · T1', equipped: false }, { label: 'Top 1 · T2', equipped: true }]);
    expect(t).toContain('1) Top 2 · T1');
    expect(t).toContain('2) Top 1 · T2 ✅');
  });

  it('re-despertar e fim de temporada', () => {
    expect(msg.reawakening('ana', 1, 3)).toBe('🌌 RE-DESPERTAR! @ana saltou de Rank E para Rank C!');
    expect(msg.seasonEnded(1, ['ana', 'bia'])).toContain('Temporada 1 encerrada');
    expect(msg.seasonEnded(1, [])).toContain('Ninguém');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/game/messages.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `despertar/src/game/messages.ts`**

```ts
import type { HuntOutcome } from '../core/combat';
import { rankLetter } from '../core/types';

export function fmtDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`;
  return `${s}s`;
}

export interface StatusView {
  title: string | null;
  classLabel: string;
  rank: number;
  level: number;
  xpText: string;
  gold: number;
  state: string;
}

export interface RankingEntry {
  name: string;
  title: string | null;
  rank: number;
  level: number;
}

const at = (name: string) => `@${name}`;
const titled = (title: string | null) => (title ? `[${title}] ` : '');
const R = rankLetter;

export const msg = {
  notAwakened: (n: string) => `${at(n)} você ainda não despertou! Digite !despertar para entrar no jogo.`,
  awakened: (n: string, cls: string) => `${at(n)} ✨ despertou como ${cls} Rank F! Use !cacar para começar.`,
  alreadyAwakened: (n: string, cls: string, rank: number) =>
    `${at(n)} você já despertou como ${cls} Rank ${R(rank)}.`,

  huntWin: (n: string, o: HuntOutcome) =>
    `${at(n)} ⚔️ venceu um ${o.monsterName} [${R(o.monsterRank)}] (${o.playerPower} vs ${o.monsterPower})` +
    `${o.crit ? ' 💥 CRÍTICO!' : ''} — +${o.xpGained} XP, +${o.goldGained} ouro`,
  huntLoss: (n: string, o: HuntOutcome, injuryMs: number) =>
    `${at(n)} 💀 foi derrotado por um ${o.monsterName} [${R(o.monsterRank)}] (${o.playerPower} vs ${o.monsterPower})` +
    `${o.xpGained > 0 ? ` — +${o.xpGained} XP de consolo` : ''}` +
    `${o.injured ? ` e está lesionado por ${fmtDuration(injuryMs)}` : ''}`,
  levelUpSuffix: (level: number) => ` · ⬆️ Nível ${level}!`,
  capReachedSuffix: () => ' · ⭐ Nível máximo do rank! Use !reavaliar',
  onCooldown: (n: string, ms: number) => `${at(n)} você está descansando. Pode caçar de novo em ${fmtDuration(ms)}.`,
  injured: (n: string, ms: number) => `${at(n)} você está lesionado. Volta a caçar em ${fmtDuration(ms)}.`,

  reevalNotAtCap: (n: string, level: number, cap: number) =>
    `${at(n)} você precisa chegar ao nível ${cap} para a reavaliação (atual: ${level}).`,
  reevalAlreadyS: (n: string) => `${at(n)} você já é Rank S — o topo! Agora é subir no ranking.`,
  reevalBlocked: (n: string, ms: number) =>
    `${at(n)} a Associação só aceita nova reavaliação em ${fmtDuration(ms)}.`,
  reevalSuccess: (n: string, toRank: number) =>
    `${at(n)} 🏅 passou no Teste de Reavaliação! Agora é Rank ${R(toRank)}!`,
  reevalFail: (n: string, ms: number) => `${at(n)} ❌ reprovou na reavaliação. Tente de novo em ${fmtDuration(ms)}.`,
  reawakening: (n: string, fromRank: number, toRank: number) =>
    `🌌 RE-DESPERTAR! ${at(n)} saltou de Rank ${R(fromRank)} para Rank ${R(toRank)}!`,

  status: (n: string, v: StatusView) =>
    `${at(n)} ${titled(v.title)}${v.classLabel} Rank ${R(v.rank)} · Nv ${v.level} (${v.xpText}) · ${v.gold} ouro · ${v.state}`,

  ranking: (seasonNumber: number, entries: RankingEntry[]) =>
    entries.length === 0
      ? `🏆 T${seasonNumber}: ninguém no ranking ainda. Seja o primeiro com !despertar!`
      : `🏆 T${seasonNumber}: ` +
        entries.map((e, i) => `${i + 1}. ${titled(e.title)}${e.name} (${R(e.rank)}·${e.level})`).join(' '),
  rankingSelf: (n: string, position: number, total: number) =>
    `${at(n)} você está em ${position}º de ${total} na temporada.`,

  titlesEmpty: (n: string) => `${at(n)} você ainda não tem títulos. Termine uma temporada no topo para ganhar um!`,
  titlesList: (n: string, titles: { label: string; equipped: boolean }[]) =>
    `${at(n)} seus títulos: ` +
    titles.map((t, i) => `${i + 1}) ${t.label}${t.equipped ? ' ✅' : ''}`).join(' · ') +
    ' — use !titulo <número> para equipar',
  titleEquipped: (n: string, label: string) => `${at(n)} título [${label}] equipado!`,
  titleRemoved: (n: string) => `${at(n)} título removido do perfil.`,
  titleNotFound: (n: string) => `${at(n)} título não encontrado. Veja a lista com !titulos.`,

  season: (number: number, msLeft: number) => `📅 Temporada ${number} — termina em ${fmtDuration(msLeft)}.`,
  seasonEnded: (number: number, podium: string[]) =>
    `🏁 Temporada ${number} encerrada! ` +
    (podium.length > 0
      ? `Pódio: ${podium.map((name, i) => `${i + 1}. ${name}`).join(' ')}. Títulos entregues!`
      : 'Ninguém pontuou desta vez.'),
  seasonStarted: (number: number, durationMs: number) =>
    `🌀 Temporada ${number} começou! Todos voltam ao Rank F. Duração: ${fmtDuration(durationMs)}.`,

  paused: () => '⏸️ O jogo foi pausado pela moderação.',
  resumed: () => '▶️ O jogo voltou! Bora caçar.',
  help: () =>
    'Comandos: !despertar · !cacar · !status · !reavaliar · !ranking [eu] · !titulos · !titulo <n> · !temporada',
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/game/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add despertar/src/game/messages.ts despertar/tests/game/messages.test.ts
git commit -m "feat(despertar): textos do chat e formatação de duração"
```

---

### Task 9: `GameService` (orquestração)

**Files:**
- Create: `despertar/src/core/clock.ts`, `despertar/src/game/game-service.ts`
- Modify: `despertar/tests/helpers.ts` (adicionar `FakeClock`)
- Test: `despertar/tests/game/game-service.test.ts`

**Interfaces:**
- Consumes: tudo de `src/core/*` (Tasks 1–5), `GameRepository` (Task 6), `Command`, `normalizeText` (Task 7), `msg`, `fmtDuration` (Task 8)
- Produces:
  - `interface Clock { now(): number }`, `systemClock: Clock`
  - `interface Author { userId: string; displayName: string; isMod: boolean }`
  - `interface GameDeps { repo: GameRepository; balance: Balance; rng: Rng; clock: Clock }`
  - `class GameService { constructor(deps: GameDeps); start(): string[]; handle(author: Author, cmd: Command): string[] }`
  - tests/helpers.ts: `class FakeClock implements Clock { constructor(t?: number); now(): number; advance(ms: number): void }`

- [ ] **Step 1: Criar `despertar/src/core/clock.ts`**

```ts
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
```

- [ ] **Step 2: Adicionar `FakeClock` em `despertar/tests/helpers.ts`**

Adicionar no topo, junto dos imports:
```ts
import type { Clock } from '../src/core/clock';
```
E no fim do arquivo:
```ts
export class FakeClock implements Clock {
  constructor(public t = 1_000_000) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
```

- [ ] **Step 3: Escrever o teste que falha — `despertar/tests/game/game-service.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import { levelCap } from '../../src/core/progression';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana', isMod: false };
const bia: Author = { userId: 'u-bia', displayName: 'bia', isMod: false };
const mod: Author = { userId: 'u-mod', displayName: 'mod', isMod: true };

const WIN = [0.5, 0, d20(20), d20(1)];
const LOSS_INJURED = [0.5, 0, d20(1), d20(20), 0];
const CLASS_GUERREIRO = 0;
const CLASS_MAGO = 0.3;
const DAY = 86_400_000;

function setup() {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  /** Avança 3s (fora da janela anti-duplicado) e envia o comando. */
  const say = (author: Author, text: string): string[] => {
    const cmd = parseCommand(text);
    if (!cmd) throw new Error(`comando inválido no teste: ${text}`);
    clock.advance(3_000);
    return game.handle(author, cmd);
  };
  const awaken = (author: Author, classRoll = CLASS_GUERREIRO) => {
    rng.push(classRoll);
    return say(author, '!despertar');
  };
  return { repo, clock, rng, b, game, say, awaken };
}

describe('GameService', () => {
  it('start cria a temporada 1 uma única vez', () => {
    const { repo, game, say } = setup();
    game.start();
    expect(repo.getCurrentSeason()!.number).toBe(1);
    expect(say(ana, '!temporada')[0]).toContain('Temporada 1');
  });

  it('pede !despertar para quem não despertou', () => {
    const { say } = setup();
    expect(say(ana, '!cacar')[0]).toContain('!despertar');
  });

  it('despertar cria caçador Rank F com classe sorteada, uma vez só', () => {
    const { repo, say, awaken } = setup();
    expect(awaken(ana)[0]).toContain('Guerreiro Rank F');
    expect(repo.getHunter('u-ana')).toMatchObject({ rank: 0, level: 1, classId: 'guerreiro' });
    expect(say(ana, '!despertar')[0]).toContain('já despertou');
  });

  it('caçada vence, salva e aplica cooldown avisando uma vez só', () => {
    const { repo, rng, clock, b, say, awaken } = setup();
    awaken(ana);
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain(`+${b.hunt.xpByRank[0]} XP`);
    expect(repo.getHunter('u-ana')!.xp).toBe(b.hunt.xpByRank[0]);
    expect(say(ana, '!cacar')[0]).toContain('descansando');
    expect(say(ana, '!cacar')).toEqual([]);
    clock.advance(b.hunt.cooldownMs);
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
  });

  it('lesão impede caçar mesmo depois do cooldown', () => {
    const { rng, clock, b, say, awaken } = setup();
    awaken(ana);
    rng.push(...LOSS_INJURED);
    expect(say(ana, '!cacar')[0]).toContain('lesionado');
    clock.advance(b.hunt.cooldownMs);
    expect(say(ana, '!cacar')[0]).toContain('Volta a caçar');
  });

  it('comando repetido dentro da janela é ignorado', () => {
    const { game, clock } = setup();
    const status = parseCommand('!status')!;
    expect(game.handle(ana, status)).toHaveLength(1);
    clock.advance(500);
    expect(game.handle(ana, status)).toEqual([]);
  });

  it('reavaliar abaixo do teto explica o nível necessário', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!reavaliar')[0]).toContain(`nível ${levelCap(0, b)}`);
  });

  it('reavaliar no teto promove', () => {
    const { repo, rng, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, level: levelCap(0, b) });
    rng.push(0.99, 0);
    expect(say(ana, '!reavaliar')[0]).toContain('Rank E');
    expect(repo.getHunter('u-ana')!.rank).toBe(1);
  });

  it('pausa: só mods; bloqueia ações e libera consultas', () => {
    const { rng, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!rpg pausar')).toEqual([]);
    expect(say(mod, '!rpg pausar')[0]).toContain('pausado');
    expect(say(ana, '!cacar')).toEqual([]);
    expect(say(ana, '!status')).toHaveLength(1);
    expect(say(mod, '!rpg retomar')[0]).toContain('voltou');
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
  });

  it('virada de temporada anuncia, entrega títulos e reseta', () => {
    const { repo, clock, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, rank: 3, level: 17 });
    awaken(bia, CLASS_MAGO);
    clock.advance(b.season.durationDays * DAY);
    const out = say(ana, '!status');
    expect(out[0]).toContain('Temporada 1 encerrada');
    expect(out[1]).toContain('Temporada 2');
    expect(out[2]).toContain('Guerreiro Rank F');
    expect(repo.getCurrentSeason()!.number).toBe(2);
    expect(repo.getTitles('u-ana').map((t) => t.label)).toContain('Top 1 · T1');
    expect(repo.getTitles('u-bia')).toEqual([]);
    expect(repo.getHallOfFame(1).map((e) => e.userId)).toEqual(['u-ana']);
  });

  it('mod pode forçar o fim da temporada', () => {
    const { say } = setup();
    expect(say(mod, '!rpg encerrar-temporada')[0]).toContain('Temporada 1 encerrada');
  });

  it('títulos: listar, equipar por número e nome, remover', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!titulos')[0]).toContain('ainda não tem títulos');
    repo.addTitle('u-ana', { titleId: 'top1-t1', label: 'Top 1 · T1', seasonId: 1, earnedAt: 0 });
    expect(say(ana, '!titulos')[0]).toContain('1) Top 1 · T1');
    expect(say(ana, '!titulo 1')[0]).toContain('equipado');
    expect(say(ana, '!status')[0]).toContain('[Top 1 · T1]');
    expect(say(ana, '!titulo nenhum')[0]).toContain('removido');
    expect(say(ana, '!titulo top 1')[0]).toContain('equipado');
    expect(say(ana, '!titulo 9')[0]).toContain('não encontrado');
  });

  it('ranking mostra o top e a posição própria', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, rank: 2 });
    awaken(bia, CLASS_MAGO);
    const top = say(ana, '!ranking')[0];
    expect(top).toContain('1. ana');
    expect(top).toContain('2. bia');
    expect(say(bia, '!ranking eu')[0]).toContain('2º de 2');
  });

  it('atualiza o nome exibido quando a pessoa troca de nick', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    say({ ...ana, displayName: 'Ana_Nova' }, '!status');
    expect(repo.getHunter('u-ana')!.displayName).toBe('Ana_Nova');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/game/game-service.test.ts`
Expected: FAIL — `game-service` não existe.

- [ ] **Step 5: Implementar `despertar/src/game/game-service.ts`**

```ts
import { normalizeText, type AdminAction, type Command } from '../commands/parse';
import type { Balance } from '../config/balance';
import type { Clock } from '../core/clock';
import { resolveHunt } from '../core/combat';
import { createHunter } from '../core/hunter';
import { isAtCap, levelCap, xpToNext } from '../core/progression';
import { sortRanking } from '../core/ranking';
import { resolveReevaluation } from '../core/reevaluation';
import { pick, type Rng } from '../core/rng';
import { closeSeason, newSeason } from '../core/season';
import { CLASS_IDS, MAX_RANK, type Hunter, type Season } from '../core/types';
import type { GameRepository } from '../data/repository';
import { fmtDuration, msg } from './messages';

export interface Author {
  userId: string;
  displayName: string;
  isMod: boolean;
}

export interface GameDeps {
  repo: GameRepository;
  balance: Balance;
  rng: Rng;
  clock: Clock;
}

const BLOCKED_WHEN_PAUSED = new Set<Command['kind']>(['despertar', 'cacar', 'reavaliar']);

export class GameService {
  private paused = false;
  private readonly lastCommandAt = new Map<string, number>();
  private readonly notifiedUntil = new Map<string, number>();

  constructor(private readonly deps: GameDeps) {}

  /** Garante uma temporada ativa (e vira a temporada se já acabou). Devolve anúncios. */
  start(): string[] {
    return this.ensureSeason(this.deps.clock.now());
  }

  handle(author: Author, cmd: Command): string[] {
    const now = this.deps.clock.now();
    if (this.isDuplicate(author.userId, cmd.kind, now)) return [];
    if (cmd.kind === 'admin') return author.isMod ? this.handleAdmin(cmd.action, now) : [];
    const announcements = this.ensureSeason(now);
    if (this.paused && BLOCKED_WHEN_PAUSED.has(cmd.kind)) return announcements;
    return [...announcements, ...this.dispatch(author, cmd, now)];
  }

  // ---------- infraestrutura ----------

  private isDuplicate(userId: string, kind: string, now: number): boolean {
    const key = `${userId}:${kind}`;
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
    return repo.transaction(() => {
      const next = repo.createSeason(newSeason(current.number + 1, now, balance));
      const result = closeSeason(repo.listHunters(), current, next.id, balance, now);
      repo.markSeasonClosed(current.id, now);
      repo.addHallOfFame(result.hallOfFame);
      for (const t of result.titles) repo.addTitle(t.userId, t.title);
      for (const h of result.resetHunters) repo.saveHunter(h);
      const podium = result.hallOfFame.slice(0, 3).map((e) => e.displayName);
      return [msg.seasonEnded(current.number, podium), msg.seasonStarted(next.number, next.endsAt - now)];
    });
  }

  private handleAdmin(action: AdminAction, now: number): string[] {
    switch (action) {
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
        return [this.ranking(author, cmd.self)];
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
      default:
        return [];
    }
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

  private ranking(author: Author, self: boolean): string {
    const season = this.currentSeason();
    const ranked = sortRanking(this.deps.repo.listHunters().filter((h) => h.seasonId === season.id));
    if (self) {
      const pos = ranked.findIndex((h) => h.userId === author.userId);
      return pos < 0 ? msg.notAwakened(author.displayName) : msg.rankingSelf(author.displayName, pos + 1, ranked.length);
    }
    return msg.ranking(
      season.number,
      ranked.slice(0, 5).map((h) => ({ name: h.displayName, title: this.titleLabel(h), rank: h.rank, level: h.level })),
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
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/game`
Expected: PASS.

- [ ] **Step 7: Suíte completa + typecheck**

Run: `npm test` e `npm run typecheck`
Expected: tudo PASS, sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add despertar/src/core/clock.ts despertar/src/game/game-service.ts despertar/tests
git commit -m "feat(despertar): GameService com comandos, pausa, títulos e virada de temporada"
```

---

### Task 10: Camada de chat (fila, console, Twitch, credenciais)

**Files:**
- Create: `despertar/src/chat/types.ts`, `despertar/src/chat/outbound-queue.ts`, `despertar/src/chat/console-client.ts`, `despertar/src/chat/twitch-client.ts`, `despertar/src/config/env.ts`
- Test: `despertar/tests/chat/outbound-queue.test.ts`, `despertar/tests/chat/console-client.test.ts`, `despertar/tests/config/env.test.ts`

**Interfaces:**
- Produces:
  - `interface IncomingMessage { userId: string; displayName: string; isMod: boolean; text: string }`
  - `interface ChatClient { connect(onMessage: (m: IncomingMessage) => void): Promise<void>; say(text: string): Promise<void>; disconnect(): Promise<void> }`
  - `MAX_MESSAGE_LENGTH = 500`; `class OutboundQueue { constructor(send: (text: string) => Promise<void>, intervalMs: number); enqueue(text: string): void; get size(): number }`
  - `parseConsoleLine(line: string): IncomingMessage | null`; `class ConsoleChatClient implements ChatClient`
  - `class TwitchChatClient implements ChatClient { constructor(env: TwitchEnv) }`
  - `interface TwitchEnv { username: string; token: string; channel: string }`; `readTwitchEnv(env?: NodeJS.ProcessEnv): TwitchEnv`; `describeTwitchEnv(e: TwitchEnv): string`

- [ ] **Step 1: Escrever testes que falham**

`despertar/tests/chat/outbound-queue.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_LENGTH, OutboundQueue } from '../../src/chat/outbound-queue';

describe('OutboundQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('envia a primeira na hora e espaça as próximas', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 1000);
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('respeita o intervalo para mensagem que chega depois', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 1000);
    q.enqueue('a');
    await vi.advanceTimersByTimeAsync(500);
    q.enqueue('b');
    await vi.advanceTimersByTimeAsync(499);
    expect(sent).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(['a', 'b']);
  });

  it('corta mensagens longas', async () => {
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => void sent.push(t), 0);
    q.enqueue('x'.repeat(MAX_MESSAGE_LENGTH + 50));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[0]).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(sent[0].endsWith('...')).toBe(true);
  });

  it('segue em frente se um envio falhar', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sent: string[] = [];
    const q = new OutboundQueue(async (t) => {
      if (t === 'a') throw new Error('falhou');
      sent.push(t);
    }, 10);
    q.enqueue('a');
    q.enqueue('b');
    await vi.advanceTimersByTimeAsync(20);
    expect(sent).toEqual(['b']);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
```

`despertar/tests/chat/console-client.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseConsoleLine } from '../../src/chat/console-client';

describe('parseConsoleLine', () => {
  it('lê "nome: texto"', () => {
    expect(parseConsoleLine('Ana: !cacar')).toEqual({
      userId: 'console:ana', displayName: 'Ana', isMod: false, text: '!cacar',
    });
  });

  it('asterisco marca moderador', () => {
    expect(parseConsoleLine('mod*: !rpg pausar')).toMatchObject({ isMod: true, displayName: 'mod', text: '!rpg pausar' });
  });

  it.each(['', '!cacar', ': !cacar', 'ana:'])('rejeita %j', (line) => {
    expect(parseConsoleLine(line)).toBeNull();
  });
});
```

`despertar/tests/config/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeTwitchEnv, readTwitchEnv } from '../../src/config/env';

const FAKE_TOKEN = 'token-de-teste-123';

describe('env', () => {
  it('lê as três variáveis e aceita token com ou sem prefixo oauth:', () => {
    const e = readTwitchEnv({ TWITCH_BOT_USERNAME: 'bot', TWITCH_OAUTH_TOKEN: `oauth:${FAKE_TOKEN}`, TWITCH_CHANNEL: 'Canal' });
    expect(e).toEqual({ username: 'bot', token: FAKE_TOKEN, channel: 'canal' });
  });

  it('lista o que falta sem mostrar valores', () => {
    expect(() => readTwitchEnv({ TWITCH_OAUTH_TOKEN: FAKE_TOKEN })).toThrow(/TWITCH_BOT_USERNAME, TWITCH_CHANNEL/);
    try {
      readTwitchEnv({ TWITCH_OAUTH_TOKEN: FAKE_TOKEN });
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_TOKEN);
    }
  });

  it('describeTwitchEnv nunca mostra o token', () => {
    const text = describeTwitchEnv({ username: 'bot', token: FAKE_TOKEN, channel: 'canal' });
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).toContain('****');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/chat tests/config/env.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `despertar/src/chat/types.ts`**

```ts
export interface IncomingMessage {
  userId: string;
  displayName: string;
  /** Moderador ou dono do canal. */
  isMod: boolean;
  text: string;
}

export interface ChatClient {
  connect(onMessage: (m: IncomingMessage) => void): Promise<void>;
  say(text: string): Promise<void>;
  disconnect(): Promise<void>;
}
```

- [ ] **Step 4: Implementar `despertar/src/chat/outbound-queue.ts`**

```ts
export const MAX_MESSAGE_LENGTH = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Envia mensagens em ordem, com pelo menos `intervalMs` entre uma e outra. */
export class OutboundQueue {
  private queue: string[] = [];
  private draining = false;

  constructor(
    private readonly send: (text: string) => Promise<void>,
    private readonly intervalMs: number,
  ) {}

  get size(): number {
    return this.queue.length;
  }

  enqueue(text: string): void {
    const safe = text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 3)}...` : text;
    this.queue.push(safe);
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const text = this.queue.shift()!;
      try {
        await this.send(text);
      } catch (err) {
        console.error('[chat] falha ao enviar mensagem:', err instanceof Error ? err.message : err);
      }
      await sleep(this.intervalMs);
    }
    this.draining = false;
  }
}
```

- [ ] **Step 5: Implementar `despertar/src/chat/console-client.ts`**

```ts
import { createInterface, type Interface } from 'node:readline';
import type { ChatClient, IncomingMessage } from './types';

/** "nome: texto" — "nome*: texto" simula moderador. */
export function parseConsoleLine(line: string): IncomingMessage | null {
  const m = /^\s*([^\s:*]+)(\*)?\s*:\s*(.+)$/.exec(line);
  if (!m) return null;
  const [, name, star, text] = m;
  return { userId: `console:${name.toLowerCase()}`, displayName: name, isMod: star === '*', text: text.trim() };
}

/** Chat de mentira no terminal, para testar e demonstrar sem credenciais. */
export class ConsoleChatClient implements ChatClient {
  private rl: Interface | null = null;

  async connect(onMessage: (m: IncomingMessage) => void): Promise<void> {
    this.rl = createInterface({ input: process.stdin });
    console.log('[console] Digite "nome: !comando" (use "nome*:" para moderador). Ctrl+C para sair.');
    this.rl.on('line', (line) => {
      if (!line.trim()) return;
      const m = parseConsoleLine(line);
      if (m) onMessage(m);
      else console.log('[console] formato: nome: !comando');
    });
  }

  async say(text: string): Promise<void> {
    console.log(`[bot] ${text}`);
  }

  async disconnect(): Promise<void> {
    this.rl?.close();
  }
}
```

- [ ] **Step 6: Implementar `despertar/src/config/env.ts`**

```ts
export interface TwitchEnv {
  username: string;
  token: string;
  channel: string;
}

const REQUIRED = ['TWITCH_BOT_USERNAME', 'TWITCH_OAUTH_TOKEN', 'TWITCH_CHANNEL'] as const;

/** Lê credenciais. Mensagens de erro citam só NOMES de variáveis, nunca valores. */
export function readTwitchEnv(env: NodeJS.ProcessEnv = process.env): TwitchEnv {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltam variáveis no .env: ${missing.join(', ')} (veja .env.example)`);
  }
  return {
    username: env.TWITCH_BOT_USERNAME!.trim(),
    token: env.TWITCH_OAUTH_TOKEN!.trim().replace(/^oauth:/, ''),
    channel: env.TWITCH_CHANNEL!.trim().toLowerCase(),
  };
}

/** Seguro para mostrar na live. */
export function describeTwitchEnv(e: TwitchEnv): string {
  return `canal: ${e.channel} · bot: ${e.username} · token: ****`;
}
```

- [ ] **Step 7: Implementar `despertar/src/chat/twitch-client.ts`**

```ts
import tmi from 'tmi.js';
import type { TwitchEnv } from '../config/env';
import type { ChatClient, IncomingMessage } from './types';

export class TwitchChatClient implements ChatClient {
  private readonly client: tmi.Client;

  constructor(private readonly env: TwitchEnv) {
    this.client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true },
      identity: { username: env.username, password: `oauth:${env.token}` },
      channels: [env.channel],
    });
  }

  async connect(onMessage: (m: IncomingMessage) => void): Promise<void> {
    this.client.on('message', (_channel, tags, message, self) => {
      if (self) return;
      const userId = tags['user-id'];
      if (!userId) return;
      const isBroadcaster = tags.badges?.broadcaster === '1';
      onMessage({
        userId,
        displayName: tags['display-name'] ?? tags.username ?? 'alguem',
        isMod: Boolean(tags.mod) || isBroadcaster,
        text: message,
      });
    });
    await this.client.connect();
  }

  async say(text: string): Promise<void> {
    await this.client.say(this.env.channel, text);
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
```

- [ ] **Step 8: Rodar e ver passar + typecheck**

Run: `npx vitest run tests/chat tests/config` e `npm run typecheck`
Expected: PASS e sem erros de tipo (o typecheck valida o `TwitchChatClient`, que não tem teste unitário por ser só adaptador).

- [ ] **Step 9: Commit**

```bash
git add despertar/src/chat despertar/src/config/env.ts despertar/tests/chat despertar/tests/config/env.test.ts
git commit -m "feat(despertar): fila de mensagens, chat de console, cliente Twitch e leitura segura do .env"
```

---

### Task 11: Composição (`main.ts`) + playtest no console

**Files:**
- Create: `despertar/src/main.ts`

**Interfaces:**
- Consumes: `loadBalance`, `BALANCE_PATH`, `readTwitchEnv`, `describeTwitchEnv`, `openDatabase`, `SqliteGameRepository`, `GameService`, `mathRng`, `systemClock`, `parseCommand`, `OutboundQueue`, `ConsoleChatClient`, `TwitchChatClient`, `ChatClient`
- Produces: executável `npm run dev` (Twitch) e `npm run dev:console` (sem credenciais; banco separado `data/console.db`)

- [ ] **Step 1: Implementar `despertar/src/main.ts`**

```ts
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConsoleChatClient } from './chat/console-client';
import { OutboundQueue } from './chat/outbound-queue';
import { TwitchChatClient } from './chat/twitch-client';
import type { ChatClient } from './chat/types';
import { parseCommand } from './commands/parse';
import { BALANCE_PATH, loadBalance } from './config/balance';
import { describeTwitchEnv, readTwitchEnv } from './config/env';
import { systemClock } from './core/clock';
import { mathRng } from './core/rng';
import { openDatabase, SqliteGameRepository } from './data/sqlite-repository';
import { GameService } from './game/game-service';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function main(): Promise<void> {
  const consoleMode = process.argv.includes('--console');
  const balance = loadBalance(BALANCE_PATH);

  const dataDir = join(ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, consoleMode ? 'console.db' : 'despertar.db'));
  const game = new GameService({ repo: new SqliteGameRepository(db), balance, rng: mathRng, clock: systemClock });

  let chat: ChatClient;
  if (consoleMode) {
    chat = new ConsoleChatClient();
  } else {
    const env = readTwitchEnv();
    console.log(`[boot] ${describeTwitchEnv(env)}`);
    chat = new TwitchChatClient(env);
  }

  const outbound = new OutboundQueue((text) => chat.say(text), consoleMode ? 0 : balance.chat.messageIntervalMs);

  process.on('SIGINT', () => {
    void chat.disconnect().finally(() => {
      db.close();
      process.exit(0);
    });
  });

  await chat.connect((m) => {
    const cmd = parseCommand(m.text);
    if (!cmd) return;
    try {
      const replies = game.handle({ userId: m.userId, displayName: m.displayName, isMod: m.isMod }, cmd);
      for (const reply of replies) outbound.enqueue(reply);
    } catch (err) {
      console.error('[jogo] erro ao processar comando:', err instanceof Error ? err.message : err);
    }
  });

  for (const announcement of game.start()) outbound.enqueue(announcement);
  console.log(`[boot] Despertar rodando (${consoleMode ? 'console' : 'Twitch'}).`);
}

main().catch((err) => {
  console.error('[boot] falha ao iniciar:', err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Playtest no console com entrada automática**

Run (Git Bash, em `despertar/`):
```bash
printf 'ana: !despertar\nana: !status\nana: !cacar\nbia: !cacar\nbia: !despertar\nana: !ranking\nmod*: !rpg pausar\nana: !reavaliar\nmod*: !rpg retomar\nana: !temporada\n' | npm run dev:console
```
Expected (o conteúdo varia com a sorte):
- `[bot] @ana ✨ despertou como <Classe> Rank F! ...`
- `[bot] @ana <Classe> Rank F · Nv 1 (0/30 XP) · 0 ouro · ✅ pronto para caçar`
- `[bot] @ana ⚔️ venceu ...` **ou** `[bot] @ana 💀 foi derrotado ...`
- `[bot] @bia você ainda não despertou! ...`
- `[bot] 🏆 T1: 1. ...`
- `[bot] ⏸️ O jogo foi pausado pela moderação.`
- (nenhuma resposta para o `!reavaliar` pausado)
- `[bot] ▶️ O jogo voltou! Bora caçar.`
- `[bot] 📅 Temporada 1 — termina em 13d 23h.`
- nenhuma linha `[jogo] erro`.

- [ ] **Step 4: Apagar o banco de teste**

Run: `rm -f data/console.db data/console.db-wal data/console.db-shm`

- [ ] **Step 5: (Manual, fora da live) Teste com a Twitch real**

Instruções para o usuário — **o agente não executa este passo nem vê o token**:
1. Copiar `.env.example` para `.env` e preencher (conta do bot, token com escopos `chat:read chat:edit`, canal) **com a live desligada**.
2. `npm run dev` → o boot deve mostrar só `canal: ... · bot: ... · token: ****`.
3. No chat do canal: `!despertar`, `!cacar`, `!status`.

- [ ] **Step 6: Commit**

```bash
git add despertar/src/main.ts
git commit -m "feat(despertar): composição do bot e modo console"
```

---

### Task 12: Simulador de balanceamento

**Files:**
- Create: `despertar/scripts/sim.ts`
- (Possível) Modify: `despertar/config/balance.json` — só os números, se a simulação sair da meta

**Interfaces:**
- Consumes: `loadBalance`, `BALANCE_PATH`, `CLASS_IDS`, `MAX_RANK`, `RANKS`, `ClassId`, `createHunter`, `resolveHunt`, `resolveReevaluation`, `isAtCap`, `levelCap`, `rankFloor`, `createSeededRng`
- Produces: `npm run sim [seed]` imprime, por classe, uma tabela por rank com a média de caçadas até chegar, a taxa de vitória no piso e a taxa antes do teto.

- [ ] **Step 1: Implementar `despertar/scripts/sim.ts`**

```ts
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
```

- [ ] **Step 2: Rodar**

Run: `npm run sim`
Expected: 5 tabelas (uma por classe), sem erro. Para o Guerreiro, a linha S deve ficar entre **180 e 300** caçadas, com vitória no piso de ~45–65% e antes do teto de ~70–90%.

- [ ] **Step 3: Calibrar, se precisar**

Se o Guerreiro sair da faixa: ajustar **só** `hunt.difficultyByRank` (mais alto = mais difícil) ou `hunt.xpByRank` em `config/balance.json`, rodar `npm run sim` de novo e repetir. Em seguida, `npm test` precisa continuar todo verde (os testes leem os números do balance).

- [ ] **Step 4: Commit**

```bash
git add despertar/scripts/sim.ts despertar/config/balance.json
git commit -m "feat(despertar): simulador de balanceamento"
```

---

## Cobertura da spec

| Seção da spec | Task |
|---|---|
| 3. Arquitetura / módulos | 1–11 |
| 4. Modelo de dados | 6 |
| 5.1 Ranks e níveis | 2 |
| 5.2 Classes | 1 (dados), 3 (passivas) |
| 5.3 Combate + cooldown + lesão | 3, 9 |
| 5.4 Reavaliação / Re-despertar | 4, 9 |
| 5.5 Temporadas e títulos | 5, 9 |
| 5.6 Ranking | 5, 9 |
| 6. Comandos e mensagens | 7, 8, 9 |
| 7. Erros e limites | 9 (duplicado, aviso único, pausa, não despertou), 10 (fila, falha de envio), 11 (erro de comando não derruba o bot, reconexão via tmi.js), 1 (balance inválido) |
| 8. Segurança (live) | 1 (.gitignore/.env.example), 10 (env mascarado), 11 (boot e passo manual) |
| 9. Balanceamento + simulador | 1, 12 |
| 10. Testes + playtest console | todas; 11 |
