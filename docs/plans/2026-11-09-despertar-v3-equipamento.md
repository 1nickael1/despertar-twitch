# Despertar v3 — Equipamento e forja: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** arma e armadura por caçador: comum na loja, forjada com fragmentos dropados por
monstros e raids; a arma soma no poder (caçada e raid) e a armadura multiplica a chance de lesão e
de cair.

**Arquitetura:** regras puras em `src/core/equipment.ts` (catálogo derivado do `balance.json`,
compra, forja, equipar, drop). `Hunter` ganha `weaponId`/`armorId` (migração 003). Combate e raid
leem o bônus e o fator pelo catálogo; na raid eles são guardados no participante ao entrar.
Fragmentos e itens possuídos ficam em `hunter_items` (já existe e já é limpa na virada de temporada).

**Stack:** TypeScript (ESM, `tsx`), vitest, zod 4, better-sqlite3. Comandos rodam em `despertar/`.

**Spec:** [../specs/2026-11-09-despertar-v3-equipamento-design.md](../specs/2026-11-09-despertar-v3-equipamento-design.md)

## Restrições globais

- Ids: `arma-f-comum`, `arma-f-forjada`, `armadura-c-comum`, `frag-d`… (letra do rank em minúscula).
- Nome forjado = nome do rank + `" ★"`. Cada caçador tem no máximo 1 de cada item.
- Equipar só item de rank ≤ rank do caçador. Forjar só rank ≤ rank do caçador.
- **Sorteios da caçada:** rank do monstro → nome → d20 jogador → d20 monstro → **vitória: drop (1 sorteio sempre)** / derrota: lesão (só se a chance > 0). Toda sequência de vitória nos testes ganha um valor a mais (`0.99` = sem drop).
- Mensagens: respostas diretas com `@nome`; ícones ⚔️ arma, 🛡️ armadura, 💎 fragmento; fator escrito com vírgula (`×0,85`).
- Twitch: mensagens ≤ 500 caracteres; rankings continuam pelo `pack()` de `messages.ts`.
- Live: nenhum comando imprime `.env`, tokens ou dados de jogadores.
- Antes de cada commit: `npm test` e `npx tsc --noEmit` passando. Commits terminam com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `config/balance.json`, `src/config/balance.ts` | Seção `equipment` + validação |
| `src/core/types.ts`, `src/core/hunter.ts` | `EQUIPMENT_SLOTS`; `Hunter.weaponId/armorId` |
| `migrations/003_equipment.sql`, `src/data/sqlite-repository.ts` | Colunas `weapon_id`, `armor_id` |
| `src/core/equipment.ts` (novo) | Regras puras do equipamento |
| `src/core/combat.ts` | Arma no poder, armadura na lesão, drop de fragmento |
| `src/core/raid.ts` | Arma/armadura no participante; fragmentos na recompensa |
| `src/commands/parse.ts` | `!forjar`, `!equipar` |
| `src/game/messages.ts` | Textos novos e mudados |
| `src/game/game-service.ts` | Comprar/forjar/equipar, status, inventário, loja, drops |
| `src/web/server.ts`, `web/index.html` | Equipamento e fragmentos na tela local |
| `scripts/sim.ts` | Chance de vitória sem/comum/forjado |

---

### Task 1: Seção `equipment` no balance

**Files:** Modify `config/balance.json`, `src/config/balance.ts` · Test `tests/config/balance.test.ts`

**Interfaces:** Produces `Balance['equipment']` = `{ weapon: { names: string[7]; commonBonus: number[7]; forgedBonus: number[7]; priceMultiplier }, armor: { names; commonFactor; forgedFactor; priceMultiplier }, fragmentDropChance, raidFragments: { azul; vermelho; quebra }, raidTopDamageBonusFragments, forge: { fragments; goldMultiplier } }`.

- [ ] **Step 1: Testes que falham** — no fim do `describe('balance')`:

```ts
  it('tem a seção equipment com os valores aprovados', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.equipment.weapon.names[0]).toBe('Lâmina Enferrujada');
    expect(b.equipment.weapon.forgedBonus[0]).toBe(2);
    expect(b.equipment.armor.forgedFactor[0]).toBe(0.7);
    expect(b.equipment.forge).toEqual({ fragments: 6, goldMultiplier: 2 });
  });

  it('recusa arma forjada que não é mais forte que a da loja', () => {
    const raw = rawBalance();
    raw.equipment.weapon.forgedBonus[3] = raw.equipment.weapon.commonBonus[3];
    expect(() => parseBalance(raw)).toThrow(/equipment\.weapon\.forgedBonus/);
  });

  it('recusa armadura forjada que não protege mais que a da loja', () => {
    const raw = rawBalance();
    raw.equipment.armor.forgedFactor[0] = 0.9;
    expect(() => parseBalance(raw)).toThrow(/equipment\.armor\.forgedFactor/);
  });

  it('recusa equipamento que uma vitória pagaria', () => {
    const raw = rawBalance();
    raw.equipment.weapon.priceMultiplier = 2;
    expect(() => parseBalance(raw)).toThrow(/equipment\.weapon\.priceMultiplier/);
  });
```

- [ ] **Step 2:** `npx vitest run tests/config/balance.test.ts` → FAIL (`b.equipment` indefinido).

- [ ] **Step 3: Implementar.** Em `config/balance.json`, depois do objeto `"raid"`:

```json
  "equipment": {
    "weapon": {
      "names": ["Lâmina Enferrujada", "Espada de Ferro", "Lâmina de Aço", "Espada Rúnica", "Lâmina de Mithril", "Espada Dracônica", "Lâmina do Monarca"],
      "commonBonus": [1, 1, 1, 2, 2, 2, 3],
      "forgedBonus": [2, 2, 3, 3, 4, 4, 5],
      "priceMultiplier": 6
    },
    "armor": {
      "names": ["Couro Gasto", "Cota de Couro", "Cota de Malha", "Peitoral de Aço", "Armadura Rúnica", "Escamas de Dragão", "Manto do Monarca"],
      "commonFactor": [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85],
      "forgedFactor": [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
      "priceMultiplier": 5
    },
    "fragmentDropChance": 0.5,
    "raidFragments": { "azul": 1, "vermelho": 2, "quebra": 3 },
    "raidTopDamageBonusFragments": 1,
    "forge": { "fragments": 6, "goldMultiplier": 2 }
  },
```

Em `src/config/balance.ts`, depois de `raidSchema`:

```ts
const rankNames = z.array(z.string().min(1)).length(7);
const perRankInt = z.array(z.number().int().nonnegative()).length(7);
const perRankFactor = z.array(z.number().gt(0).max(1)).length(7);

const equipmentSchema = z.object({
  weapon: z
    .object({ names: rankNames, commonBonus: perRankInt, forgedBonus: perRankInt, priceMultiplier: z.number().positive() })
    .refine((w) => w.forgedBonus.every((f, i) => f > w.commonBonus[i]), {
      message: 'a arma forjada precisa ser mais forte que a da loja em todo rank',
      path: ['forgedBonus'],
    }),
  armor: z
    .object({ names: rankNames, commonFactor: perRankFactor, forgedFactor: perRankFactor, priceMultiplier: z.number().positive() })
    .refine((a) => a.forgedFactor.every((f, i) => f < a.commonFactor[i]), {
      message: 'a armadura forjada precisa proteger mais que a da loja em todo rank',
      path: ['forgedFactor'],
    }),
  fragmentDropChance: probability,
  raidFragments: z.object({
    azul: z.number().int().nonnegative(),
    vermelho: z.number().int().nonnegative(),
    quebra: z.number().int().nonnegative(),
  }),
  raidTopDamageBonusFragments: z.number().int().nonnegative(),
  forge: z.object({ fragments: z.number().int().min(1), goldMultiplier: z.number().nonnegative() }),
});
```

No `balanceSchema`, depois de `raid: raidSchema,`: `equipment: equipmentSchema,`. No `superRefine`, depois do laço da loja:

```ts
  for (const slot of ['weapon', 'armor'] as const) {
    if (b.equipment[slot].priceMultiplier <= maxWin) {
      ctx.addIssue({
        code: 'custom',
        path: ['equipment', slot, 'priceMultiplier'],
        message: `uma vitória não pode pagar o item: use um valor maior que ${maxWin}`,
      });
    }
  }
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): seção equipment no balance.json com validação`.

---

### Task 2: `Hunter` com arma e armadura (tipo, migração, repositórios)

**Files:** Modify `src/core/types.ts`, `src/core/hunter.ts`, `src/data/sqlite-repository.ts` · Create `migrations/003_equipment.sql` · Test `tests/core/hunter.test.ts`, `tests/data/repository.test.ts`

**Interfaces:** Produces `EQUIPMENT_SLOTS = ['arma','armadura']`, `type EquipmentSlot`, `isEquipmentSlot(v): v is EquipmentSlot`; `Hunter.weaponId: string | null`, `Hunter.armorId: string | null`.

- [ ] **Step 1: Testes que falham.** Em `tests/core/hunter.test.ts`: no `toEqual` do `createHunter` acrescente `weaponId: null, armorId: null,` (depois de `equippedTitleId: null,`). No teste de `resetForNewSeason`, acrescente `weaponId: 'arma-c-forjada', armorId: 'armadura-c-comum'` ao `makeHunter({...})` e `weaponId: null, armorId: null` ao `toMatchObject`. Em `tests/data/repository.test.ts`, depois do primeiro teste:

```ts
  it('salva e lê arma e armadura equipadas', () => {
    const h = makeHunter({ userId: 'u2', weaponId: 'arma-f-forjada', armorId: null });
    repo.saveHunter(h);
    expect(repo.getHunter('u2')).toEqual(h);
    repo.saveHunter({ ...h, weaponId: null, armorId: 'armadura-f-comum' });
    expect(repo.getHunter('u2')).toMatchObject({ weaponId: null, armorId: 'armadura-f-comum' });
  });
```

- [ ] **Step 2:** `npx vitest run tests/core/hunter.test.ts tests/data` → FAIL.

- [ ] **Step 3: Implementar.**

`src/core/types.ts`: no `Hunter`, depois de `equippedTitleId: string | null;`:

```ts
  /** Arma e armadura equipadas (ids do catálogo de equipamento); null = nada. */
  weaponId: string | null;
  armorId: string | null;
```

e no fim do arquivo:

```ts
export const EQUIPMENT_SLOTS = ['arma', 'armadura'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}
```

`src/core/hunter.ts`: em `createHunter`, depois de `equippedTitleId: null,` → `weaponId: null, armorId: null,`; em `resetForNewSeason`, antes de `seasonId,` → `weaponId: null, armorId: null,`.

`migrations/003_equipment.sql`:

```sql
ALTER TABLE hunters ADD COLUMN weapon_id TEXT;
ALTER TABLE hunters ADD COLUMN armor_id TEXT;
```

`src/data/sqlite-repository.ts`: `HunterRow` ganha `weapon_id: string | null; armor_id: string | null;`; `toHunter` ganha `weaponId: r.weapon_id, armorId: r.armor_id,`; o `saveHunter` passa a ser:

```ts
        `INSERT INTO hunters (user_id, display_name, class_id, rank, level, xp, gold, rank_reached_at,
           last_hunt_at, injured_until, reeval_blocked_until, equipped_title_id, weapon_id, armor_id, season_id)
         VALUES (@userId, @displayName, @classId, @rank, @level, @xp, @gold, @rankReachedAt,
           @lastHuntAt, @injuredUntil, @reevalBlockedUntil, @equippedTitleId, @weaponId, @armorId, @seasonId)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name, class_id = excluded.class_id, rank = excluded.rank,
           level = excluded.level, xp = excluded.xp, gold = excluded.gold,
           rank_reached_at = excluded.rank_reached_at, last_hunt_at = excluded.last_hunt_at,
           injured_until = excluded.injured_until, reeval_blocked_until = excluded.reeval_blocked_until,
           equipped_title_id = excluded.equipped_title_id, weapon_id = excluded.weapon_id,
           armor_id = excluded.armor_id, season_id = excluded.season_id`,
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS (o `makeHunter` dos testes já usa `createHunter`).
- [ ] **Step 5: Commit** `feat(equip): arma e armadura no caçador (migração 003)`.

---

### Task 3: `core/equipment.ts`

**Files:** Create `src/core/equipment.ts`, `tests/core/equipment.test.ts`

**Interfaces:**
- `type Quality = 'comum' | 'forjada'`
- `interface EquipmentItem { id; slot: EquipmentSlot; rank: number; quality: Quality; label: string; value: number }` (arma: bônus; armadura: fator)
- `equipmentId(slot, rank, quality)`, `fragmentId(rank)`, `fragmentRank(itemId): number | null`
- `getEquipment(slot, rank, quality, b): EquipmentItem`, `equipmentById(id, b): EquipmentItem | null`
- `weaponBonus(h, b): number`, `armorFactor(h, b): number`, `canEquip(item, h)`, `isBetter(item, h, b)`, `equip(h, item): Hunter`
- `equipmentPrice(slot, rank, b)`, `forgeCost(rank, b): { fragments; gold }`
- `buyEquipment(h, slot, owned, b)`: `{ ok: true; hunter; item; price; equipped } | { ok: false; reason: 'owned'; item } | { ok: false; reason: 'gold'; item; price }`
- `forgeEquipment(h, slot, rank | null, owned, b)`: `{ ok: true; hunter; item; cost; fragmentsLeft; equipped } | { ok: false; reason: 'rank'; maxRank } | { ok: false; reason: 'owned'; item } | { ok: false; reason: 'fragments'; rank; have; need } | { ok: false; reason: 'gold'; have; need }`
- `ownedEquipment(owned, b): EquipmentItem[]` (ordem: arma antes, rank crescente, comum antes), `ownedFragments(owned): { rank; qty }[]`, `findOwnedEquipment(query, owned, b): EquipmentItem | null`
- `rollFragmentDrop(rng, b): boolean`, `raidFragmentsFor(type, place, b): number`

- [ ] **Step 1: Testes que falham** — `tests/core/equipment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  armorFactor, buyEquipment, canEquip, equip, equipmentById, equipmentPrice, findOwnedEquipment, forgeCost,
  forgeEquipment, fragmentId, fragmentRank, getEquipment, isBetter, ownedEquipment, ownedFragments,
  raidFragmentsFor, rollFragmentDrop, weaponBonus,
} from '../../src/core/equipment';
import { makeHunter, seqRng, testBalance } from '../helpers';

const b = testBalance();

describe('equipamento: catálogo', () => {
  it('ids, nomes e valores por rank e qualidade', () => {
    expect(getEquipment('arma', 0, 'comum', b)).toEqual({
      id: 'arma-f-comum', slot: 'arma', rank: 0, quality: 'comum', label: 'Lâmina Enferrujada', value: 1,
    });
    expect(getEquipment('arma', 0, 'forjada', b)).toMatchObject({ id: 'arma-f-forjada', label: 'Lâmina Enferrujada ★', value: 2 });
    expect(getEquipment('armadura', 3, 'forjada', b)).toMatchObject({ id: 'armadura-c-forjada', label: 'Peitoral de Aço ★', value: 0.7 });
    expect(equipmentById('armadura-s-comum', b)).toMatchObject({ rank: 6, label: 'Manto do Monarca', value: 0.85 });
    expect(equipmentById('pocao', b)).toBeNull();
    expect(fragmentId(2)).toBe('frag-d');
    expect(fragmentRank('frag-d')).toBe(2);
    expect(fragmentRank('arma-f-comum')).toBeNull();
  });

  it('bônus da arma e fator da armadura do caçador', () => {
    expect(weaponBonus(makeHunter(), b)).toBe(0);
    expect(armorFactor(makeHunter(), b)).toBe(1);
    expect(weaponBonus(makeHunter({ weaponId: 'arma-f-forjada' }), b)).toBe(2);
    expect(armorFactor(makeHunter({ armorId: 'armadura-f-comum' }), b)).toBe(0.85);
  });

  it('equipar: rank do item ≤ rank do caçador; "melhor" por bônus ou fator', () => {
    const swordE = getEquipment('arma', 1, 'comum', b);
    expect(canEquip(swordE, makeHunter({ rank: 0 }))).toBe(false);
    expect(canEquip(swordE, makeHunter({ rank: 1 }))).toBe(true);
    const forged = getEquipment('arma', 0, 'forjada', b);
    expect(isBetter(forged, makeHunter(), b)).toBe(true);
    expect(isBetter(forged, makeHunter({ weaponId: 'arma-f-comum' }), b)).toBe(true);
    expect(isBetter(getEquipment('arma', 0, 'comum', b), makeHunter({ weaponId: 'arma-f-forjada' }), b)).toBe(false);
    expect(isBetter(getEquipment('armadura', 0, 'forjada', b), makeHunter({ armorId: 'armadura-f-comum' }), b)).toBe(true);
    expect(equip(makeHunter(), forged).weaponId).toBe('arma-f-forjada');
  });

  it('preços e custo da forja seguem o ouro do rank', () => {
    expect(equipmentPrice('arma', 0, b)).toBe(18);
    expect(equipmentPrice('armadura', 0, b)).toBe(15);
    expect(forgeCost(0, b)).toEqual({ fragments: 6, gold: 6 });
  });
});

describe('equipamento: loja e forja', () => {
  it('compra o comum do rank atual e equipa se for melhor', () => {
    const r = buyEquipment(makeHunter({ gold: 20 }), 'arma', {}, b);
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ price: 18, equipped: true, item: { id: 'arma-f-comum' } });
    expect(r.hunter).toMatchObject({ gold: 2, weaponId: 'arma-f-comum' });
    const keep = buyEquipment(makeHunter({ gold: 20, weaponId: 'arma-f-forjada' }), 'arma', {}, b);
    expect(keep.ok && keep.equipped).toBe(false);
    expect(keep.ok && keep.hunter.weaponId).toBe('arma-f-forjada');
  });

  it('compra recusa: já tem, falta ouro', () => {
    expect(buyEquipment(makeHunter({ gold: 99 }), 'arma', { 'arma-f-comum': 1 }, b)).toMatchObject({ ok: false, reason: 'owned' });
    expect(buyEquipment(makeHunter({ gold: 5 }), 'armadura', {}, b)).toMatchObject({ ok: false, reason: 'gold', price: 15 });
  });

  it('forja o rank atual por padrão, gasta fragmentos e ouro, equipa', () => {
    const r = forgeEquipment(makeHunter({ gold: 10 }), 'arma', null, { 'frag-f': 7 }, b);
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ item: { id: 'arma-f-forjada' }, fragmentsLeft: 1, cost: { fragments: 6, gold: 6 }, equipped: true });
    expect(r.hunter).toMatchObject({ gold: 4, weaponId: 'arma-f-forjada' });
  });

  it('forja rank menor quando pedido; recusa rank acima, já tem, fragmentos e ouro', () => {
    const rankE = makeHunter({ rank: 1, gold: 50 });
    const low = forgeEquipment(rankE, 'armadura', 0, { 'frag-f': 6 }, b);
    expect(low.ok && low.item.id).toBe('armadura-f-forjada');
    expect(forgeEquipment(makeHunter(), 'arma', 1, { 'frag-e': 9 }, b)).toEqual({ ok: false, reason: 'rank', maxRank: 0 });
    expect(forgeEquipment(makeHunter({ gold: 50 }), 'arma', null, { 'frag-f': 9, 'arma-f-forjada': 1 }, b)).toMatchObject({ ok: false, reason: 'owned' });
    expect(forgeEquipment(makeHunter({ gold: 50 }), 'arma', null, { 'frag-f': 2 }, b)).toEqual({ ok: false, reason: 'fragments', rank: 0, have: 2, need: 6 });
    expect(forgeEquipment(makeHunter({ gold: 1 }), 'arma', null, { 'frag-f': 6 }, b)).toEqual({ ok: false, reason: 'gold', have: 1, need: 6 });
  });
});

describe('equipamento: inventário', () => {
  const owned = { 'armadura-f-comum': 1, 'arma-f-forjada': 1, 'arma-f-comum': 1, 'frag-e': 1, 'frag-f': 4, pocao: 2 };

  it('lista equipamentos em ordem fixa e fragmentos por rank', () => {
    expect(ownedEquipment(owned, b).map((i) => i.id)).toEqual(['arma-f-comum', 'arma-f-forjada', 'armadura-f-comum']);
    expect(ownedFragments(owned)).toEqual([{ rank: 0, qty: 4 }, { rank: 1, qty: 1 }]);
  });

  it('acha por número, nome sem acento, "forjada" ou "★" e letra do rank', () => {
    expect(findOwnedEquipment('2', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('lamina', owned, b)?.id).toBe('arma-f-comum');
    expect(findOwnedEquipment('Lâmina forjada', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('★', owned, b)?.id).toBe('arma-f-forjada');
    expect(findOwnedEquipment('couro f', owned, b)?.id).toBe('armadura-f-comum');
    expect(findOwnedEquipment('9', owned, b)).toBeNull();
    expect(findOwnedEquipment('espada', owned, b)).toBeNull();
  });
});

describe('equipamento: fragmentos', () => {
  it('drop da caçada pela chance; raid por tipo com bônus do 1º', () => {
    expect(rollFragmentDrop(seqRng([0.49]), b)).toBe(true);
    expect(rollFragmentDrop(seqRng([0.5]), b)).toBe(false);
    expect(raidFragmentsFor('azul', 1, b)).toBe(2);
    expect(raidFragmentsFor('azul', 2, b)).toBe(1);
    expect(raidFragmentsFor('vermelho', 3, b)).toBe(2);
    expect(raidFragmentsFor('quebra', 1, b)).toBe(4);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/core/equipment.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** — `src/core/equipment.ts`:

```ts
import type { Balance } from '../config/balance';
import { chance, type Rng } from './rng';
import { normalizeText } from './text';
import { RANKS, rankLetter, type EquipmentSlot, type Hunter, type PortalType, type RankLetter } from './types';

export type Quality = 'comum' | 'forjada';

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  rank: number;
  quality: Quality;
  label: string;
  /** Arma: bônus de poder. Armadura: fator da chance de lesão (caçada) e de cair (raid). */
  value: number;
}

type Owned = Record<string, number>;

const ID_PATTERN = /^(arma|armadura)-([fedcbas])-(comum|forjada)$/;
const FRAGMENT_PATTERN = /^frag-([fedcbas])$/;
const rankFromLetter = (letter: string) => RANKS.indexOf(letter.toUpperCase() as RankLetter);

export const equipmentId = (slot: EquipmentSlot, rank: number, quality: Quality) =>
  `${slot}-${rankLetter(rank).toLowerCase()}-${quality}`;
export const fragmentId = (rank: number) => `frag-${rankLetter(rank).toLowerCase()}`;

export function fragmentRank(itemId: string): number | null {
  const m = FRAGMENT_PATTERN.exec(itemId);
  return m ? rankFromLetter(m[1]) : null;
}

export function getEquipment(slot: EquipmentSlot, rank: number, quality: Quality, b: Balance): EquipmentItem {
  const forged = quality === 'forjada';
  const w = b.equipment.weapon;
  const a = b.equipment.armor;
  const value =
    slot === 'arma' ? (forged ? w.forgedBonus : w.commonBonus)[rank] : (forged ? a.forgedFactor : a.commonFactor)[rank];
  const name = (slot === 'arma' ? w : a).names[rank];
  return { id: equipmentId(slot, rank, quality), slot, rank, quality, label: forged ? `${name} ★` : name, value };
}

export function equipmentById(id: string, b: Balance): EquipmentItem | null {
  const m = ID_PATTERN.exec(id);
  return m ? getEquipment(m[1] as EquipmentSlot, rankFromLetter(m[2]), m[3] as Quality, b) : null;
}

export function weaponBonus(h: Pick<Hunter, 'weaponId'>, b: Balance): number {
  return h.weaponId ? (equipmentById(h.weaponId, b)?.value ?? 0) : 0;
}

export function armorFactor(h: Pick<Hunter, 'armorId'>, b: Balance): number {
  return h.armorId ? (equipmentById(h.armorId, b)?.value ?? 1) : 1;
}

export function canEquip(item: EquipmentItem, h: Pick<Hunter, 'rank'>): boolean {
  return item.rank <= h.rank;
}

/** Espaço vazio: qualquer item é melhor. Arma: bônus maior. Armadura: fator menor. */
export function isBetter(item: EquipmentItem, h: Pick<Hunter, 'weaponId' | 'armorId'>, b: Balance): boolean {
  const currentId = item.slot === 'arma' ? h.weaponId : h.armorId;
  const current = currentId ? equipmentById(currentId, b) : null;
  if (!current) return true;
  return item.slot === 'arma' ? item.value > current.value : item.value < current.value;
}

export function equip(h: Hunter, item: EquipmentItem): Hunter {
  return item.slot === 'arma' ? { ...h, weaponId: item.id } : { ...h, armorId: item.id };
}

export function equipmentPrice(slot: EquipmentSlot, rank: number, b: Balance): number {
  const mult = slot === 'arma' ? b.equipment.weapon.priceMultiplier : b.equipment.armor.priceMultiplier;
  return Math.ceil(mult * b.hunt.goldByRank[rank]);
}

export function forgeCost(rank: number, b: Balance): { fragments: number; gold: number } {
  return { fragments: b.equipment.forge.fragments, gold: Math.ceil(b.equipment.forge.goldMultiplier * b.hunt.goldByRank[rank]) };
}

export type BuyEquipmentResult =
  | { ok: true; hunter: Hunter; item: EquipmentItem; price: number; equipped: boolean }
  | { ok: false; reason: 'owned'; item: EquipmentItem }
  | { ok: false; reason: 'gold'; item: EquipmentItem; price: number };

/** A loja só vende o comum do rank atual. Equipa sozinho se for melhor. */
export function buyEquipment(h: Hunter, slot: EquipmentSlot, owned: Owned, b: Balance): BuyEquipmentResult {
  const item = getEquipment(slot, h.rank, 'comum', b);
  if ((owned[item.id] ?? 0) > 0) return { ok: false, reason: 'owned', item };
  const price = equipmentPrice(slot, h.rank, b);
  if (h.gold < price) return { ok: false, reason: 'gold', item, price };
  const paid: Hunter = { ...h, gold: h.gold - price };
  const equipped = isBetter(item, paid, b);
  return { ok: true, hunter: equipped ? equip(paid, item) : paid, item, price, equipped };
}

export type ForgeResult =
  | {
      ok: true;
      hunter: Hunter;
      item: EquipmentItem;
      cost: { fragments: number; gold: number };
      fragmentsLeft: number;
      equipped: boolean;
    }
  | { ok: false; reason: 'rank'; maxRank: number }
  | { ok: false; reason: 'owned'; item: EquipmentItem }
  | { ok: false; reason: 'fragments'; rank: number; have: number; need: number }
  | { ok: false; reason: 'gold'; have: number; need: number };

/** Forja do rank pedido (padrão: atual), que precisa ser ≤ rank do caçador. Equipa sozinho se for melhor. */
export function forgeEquipment(h: Hunter, slot: EquipmentSlot, rank: number | null, owned: Owned, b: Balance): ForgeResult {
  const r = rank ?? h.rank;
  if (r > h.rank) return { ok: false, reason: 'rank', maxRank: h.rank };
  const item = getEquipment(slot, r, 'forjada', b);
  if ((owned[item.id] ?? 0) > 0) return { ok: false, reason: 'owned', item };
  const cost = forgeCost(r, b);
  const have = owned[fragmentId(r)] ?? 0;
  if (have < cost.fragments) return { ok: false, reason: 'fragments', rank: r, have, need: cost.fragments };
  if (h.gold < cost.gold) return { ok: false, reason: 'gold', have: h.gold, need: cost.gold };
  const paid: Hunter = { ...h, gold: h.gold - cost.gold };
  const equipped = isBetter(item, paid, b);
  return { ok: true, hunter: equipped ? equip(paid, item) : paid, item, cost, fragmentsLeft: have - cost.fragments, equipped };
}

const QUALITY_ORDER: Record<Quality, number> = { comum: 0, forjada: 1 };

/** Equipamentos possuídos em ordem fixa: é a numeração do !inventario e do !equipar <número>. */
export function ownedEquipment(owned: Owned, b: Balance): EquipmentItem[] {
  return Object.keys(owned)
    .filter((id) => (owned[id] ?? 0) > 0)
    .map((id) => equipmentById(id, b))
    .filter((i): i is EquipmentItem => i !== null)
    .sort(
      (x, y) =>
        (x.slot === y.slot ? 0 : x.slot === 'arma' ? -1 : 1) ||
        x.rank - y.rank ||
        QUALITY_ORDER[x.quality] - QUALITY_ORDER[y.quality],
    );
}

export function ownedFragments(owned: Owned): { rank: number; qty: number }[] {
  return Object.entries(owned)
    .map(([id, qty]) => ({ rank: fragmentRank(id), qty }))
    .filter((f): f is { rank: number; qty: number } => f.rank !== null && f.qty > 0)
    .sort((x, y) => x.rank - y.rank);
}

/**
 * `!equipar 2` (número do !inventario) ou palavras do nome, sem acento. "forjada"/"★" escolhem a
 * forjada, "comum" a da loja e uma letra sozinha é o rank ("couro f").
 */
export function findOwnedEquipment(query: string, owned: Owned, b: Balance): EquipmentItem | null {
  const list = ownedEquipment(owned, b);
  const q = normalizeText(query.trim());
  if (/^\d+$/.test(q)) return list[Number(q) - 1] ?? null;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return (
    list.find((item) => {
      const words = normalizeText(`${item.label} ${item.slot} ${item.quality} ${rankLetter(item.rank)}`).split(/\s+/);
      return tokens.every((t) => words.some((w) => (t.length === 1 ? w === t : w.startsWith(t))));
    }) ?? null
  );
}

export function rollFragmentDrop(rng: Rng, b: Balance): boolean {
  return chance(rng, b.equipment.fragmentDropChance);
}

export function raidFragmentsFor(type: PortalType, place: number, b: Balance): number {
  return b.equipment.raidFragments[type] + (place === 1 ? b.equipment.raidTopDamageBonusFragments : 0);
}
```

- [ ] **Step 4:** `npx vitest run tests/core/equipment.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): regras do equipamento (catálogo, loja, forja, inventário, drops)`.

---

### Task 4: Combate da caçada com arma, armadura e drop

**Files:** Modify `src/core/combat.ts`, `tests/core/combat.test.ts`, `tests/game/game-service.test.ts` (linha do `WIN`), `tests/web/server.test.ts` (linha do `WIN`), `tests/game/messages.test.ts` (helper `outcome`)

**Interfaces:** `HuntOutcome` ganha `fragmentRank: number | null` (rank do fragmento dropado).

- [ ] **Step 1: Testes.** Em `tests/core/combat.test.ts`, acrescente `const NO_DROP = 0.99;` e `const DROP = 0;` depois de `HIGHER_RANK`, e coloque `, NO_DROP` no fim do array do `seqRng` de **toda vitória**: os testes "vitória: XP e ouro…", "Assassino: crítico dobra…", "Assassino: abaixo da faixa…", "Guerreiro ganha bônus…", os dois de "rank do monstro fica dentro de F..S" e "vitória pode subir de nível". No primeiro teste, acrescente `expect(o.fragmentRank).toBeNull();`. Acrescente:

```ts
  it('vitória pode dropar fragmento do rank do monstro', () => {
    const o = resolveHunt(makeHunter(), b, seqRng([HIGHER_RANK, 0, d20(20), d20(1), DROP]), NOW);
    expect(o.won).toBe(true);
    expect(o.fragmentRank).toBe(1);
  });

  it('arma soma no poder', () => {
    const o = resolveHunt(makeHunter({ weaponId: 'arma-f-forjada' }), b, seqRng([SAME_RANK, 0, d20(5), d20(8), NO_DROP]), NOW);
    expect(o.playerPower).toBe(primaryStat('guerreiro', 1, b) + 2 + 5);
    expect(o.won).toBe(true);
  });

  it('armadura reduz a chance de lesão', () => {
    // Guerreiro: 0,32 sem armadura; com a forjada ×0,7 = 0,224. Sorteio 0,25 lesiona só sem armadura.
    const loss = [SAME_RANK, 0, d20(1), d20(20), 0.25];
    expect(resolveHunt(makeHunter(), b, seqRng(loss), NOW).injured).toBe(true);
    expect(resolveHunt(makeHunter({ armorId: 'armadura-f-forjada' }), b, seqRng(loss), NOW).injured).toBe(false);
  });

  it('derrota não sorteia drop', () => {
    const rng = seqRng([SAME_RANK, 0, d20(1), d20(20), 0.99]);
    expect(resolveHunt(makeHunter(), b, rng, NOW).fragmentRank).toBeNull();
    expect(rng.remaining).toBe(0);
  });
```

Em `tests/game/game-service.test.ts` e `tests/web/server.test.ts`: `const WIN = [0.5, 0, d20(20), d20(1), 0.99];` (sem drop). Em `tests/game/messages.test.ts`, no helper `outcome`, acrescente `fragmentRank: null,` antes de `hunter: makeHunter()`.

- [ ] **Step 2:** `npx vitest run tests/core/combat.test.ts` → FAIL.

- [ ] **Step 3: Implementar** em `src/core/combat.ts`:
- import: `import { armorFactor, rollFragmentDrop, weaponBonus } from './equipment';`
- `HuntOutcome` ganha `/** Fragmento dropado (rank do monstro) ou null. */ fragmentRank: number | null;`
- comentário da função: `Ordem dos sorteios: rank do monstro, nome, d20 do jogador, d20 do monstro e então, na vitória, o drop do fragmento; na derrota (só com chance > 0), a lesão.`
- `const playerPower = primaryStat(h.classId, h.level, b) + bonus + weaponBonus(h, b) + playerRoll;`
- na vitória, depois do `crit`/`mult`: `const fragmentRank = rollFragmentDrop(rng, b) ? monsterRank : null;` e o `return` ganha `fragmentRank`.
- na derrota: `const p = injuryChance(h.classId, b) * armorFactor(h, b);` e o `return` ganha `fragmentRank: null`.

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): arma e armadura na caçada; vitória pode dropar fragmento`.

---

### Task 5: Raid com arma, armadura e fragmentos

**Files:** Modify `src/core/raid.ts`, `src/game/game-service.ts` (chamada do `joinRaid`), `scripts/sim.ts` (chamada do `joinRaid`), `tests/core/raid.test.ts`, `tests/game/messages.test.ts` (helper `rw`)

**Interfaces:** `RaidParticipant` ganha `weaponBonus: number; armorFactor: number`. `joinRaid(raid, h, now, b)`. `raidDamage(p: Pick<RaidParticipant, 'classId'|'level'|'attacked'|'weaponBonus'>, roll, b)`. `RaidReward` ganha `rank: number; fragments: number`.

- [ ] **Step 1: Testes.** Em `tests/core/raid.test.ts`:
- `joined()` e toda chamada direta passam `b`: `joinRaid(raid, h, T0, b)` (inclusive no teste "entrar: só na entrada…").
- no `toMatchObject` do participante do teste "entrar", acrescente `weaponBonus: 0, armorFactor: 1`.
- o helper `p` de "raid: dano e queda" vira `(classId: ClassId, level = 1, attacked = false, weaponBonus = 0) => ({ classId, level, attacked, weaponBonus })`.
- o helper `party` de "raid: ranking e recompensas" ganha `weaponBonus: 0, armorFactor: 1,` em cada participante.
- no teste "vitória paga caçada do rank × tipo × posição", troque o `map` por `[r.displayName, r.place, r.damage, r.xp, r.gold, r.xpLoss, r.fragments]` e acrescente o fragmento em cada linha: `['ana', 1, 50, 60, 18, 0, 2]`, `['bia', 2, 40, 45, 13, 0, 1]`, `['cris', 3, 30, 37, 11, 0, 1]`, `['duda', 4, 20, 30, 9, 0, 1]`.
- acrescente:

```ts
describe('raid: equipamento', () => {
  it('participante guarda arma e armadura ao entrar', () => {
    const raid = joined(makeHunter({ userId: 'a', weaponId: 'arma-f-forjada', armorId: 'armadura-f-comum' }));
    expect(raid.participants[0]).toMatchObject({ weaponBonus: 2, armorFactor: 0.85 });
  });

  it('arma soma no dano', () => {
    expect(raidDamage({ classId: 'guerreiro', level: 1, attacked: false, weaponBonus: 2 }, 10, b)).toEqual({ damage: 22, crit: false });
  });

  it('armadura reduz a chance de cair', () => {
    // Guerreiro cai com 0,16; com a forjada, 0,112. Sorteio 0,13 derruba só sem armadura.
    const plain = started(joined(makeHunter({ userId: 'a', displayName: 'ana' })));
    const armored = started(joined(makeHunter({ userId: 'a', displayName: 'ana', armorId: 'armadura-f-forjada' })));
    expect(resolveRound(plain, b, seqRng([d20(1), 0.13])).report.bossHit!.fell).toBe(true);
    expect(resolveRound(armored, b, seqRng([d20(1), 0.13])).report.bossHit!.fell).toBe(false);
  });

  it('derrota não dá fragmento', () => {
    const raid = { ...openRaid('quebra', 'Boss', T0, b), participants: joined(makeHunter({ userId: 'a' })).participants };
    expect(raidRewards(raid, false, b)[0]).toMatchObject({ fragments: 0, rank: 0 });
    expect(raidRewards(raid, true, b)[0]).toMatchObject({ fragments: 4 });
  });
});
```

Em `tests/game/messages.test.ts`, o helper `rw` do teste de vitória ganha `rank: 0, fragments: place === 1 ? 2 : 1,`.

- [ ] **Step 2:** `npx vitest run tests/core/raid.test.ts` → FAIL.

- [ ] **Step 3: Implementar** em `src/core/raid.ts`:
- import: `import { armorFactor, raidFragmentsFor, weaponBonus } from './equipment';`
- `RaidParticipant` ganha `/** Arma e armadura no momento de entrar. */ weaponBonus: number; armorFactor: number;`
- `joinRaid(raid: Raid, h: Hunter, now: number, b: Balance)`; o participante ganha `weaponBonus: weaponBonus(h, b), armorFactor: armorFactor(h, b),`
- `raidDamage(p: Pick<RaidParticipant, 'classId' | 'level' | 'attacked' | 'weaponBonus'>, ...)`: `let damage = primaryStat(p.classId, p.level, b) + cls.bonusVsHigherRank + p.weaponBonus + roll;`
- em `resolveRound`: `const fell = chance(rng, knockdownChance(target.classId, b) * target.armorFactor);`
- `RaidReward` ganha `/** Rank do participante (o fragmento é desse rank). */ rank: number; fragments: number;` e o objeto de `raidRewards` ganha `rank: p.rank, fragments: won ? raidFragmentsFor(raid.type, i + 1, b) : 0,`.

Em `src/game/game-service.ts`: `const r = joinRaid(this.raid, h, now, this.deps.balance);`. Em `scripts/sim.ts`: `joinRaid(raid, { ... }, 0, b)`.

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): arma e armadura na raid; vitória da raid dá fragmentos`.

---

### Task 6: Comandos `!forjar`/`!equipar` e mensagens

**Files:** Modify `src/commands/parse.ts`, `src/game/messages.ts` · Test `tests/commands/parse.test.ts`, `tests/game/messages.test.ts`, `tests/game/game-service-raid.test.ts` (texto da vitória)

**Interfaces:**
- `Command` ganha `{ kind: 'forjar'; slot: EquipmentSlot | null; rank: number | null }` (slot `null` = uso errado) e `{ kind: 'equipar'; arg: string }`.
- `messages.ts` exporta `gearPower(item): string` (`+2 dano` / `×0,85 lesão`) e, no `msg`: `statusGear(weapon|null, armor|null)`, `boughtGear(n, item, price, equipped, goldLeft)`, `forged(n, item, cost, equipped, fragmentsLeft)`, `alreadyOwn(n, item)`, `forgeUsage(n)`, `forgeRank(n, maxRank)`, `forgeFragments(n, rank, have, need)`, `forgeGold(n, need, have)`, `equipUsage(n)`, `equipNotFound(n)`, `equipRank(n, item)`, `equipped(n, item)`. Mudam: `huntWin` (fragmento), `status` (`StatusView.gear?`), `shop` (rodapé), `inventory` (fragmentos e equipamentos), `raidVictory` (fragmentos no cabeçalho), `help`.

- [ ] **Step 1: Testes.** Em `tests/commands/parse.test.ts`:

```ts
  it('forjar e equipar', () => {
    expect(parseCommand('!forjar arma')).toEqual({ kind: 'forjar', slot: 'arma', rank: null });
    expect(parseCommand('!FORJAR Armadura e')).toEqual({ kind: 'forjar', slot: 'armadura', rank: 1 });
    expect(parseCommand('!forjar')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!forjar espada')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!forjar arma x')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!equipar 2')).toEqual({ kind: 'equipar', arg: '2' });
    expect(parseCommand('!equipar Lâmina ★')).toEqual({ kind: 'equipar', arg: 'Lâmina ★' });
  });
```

Em `tests/game/messages.test.ts`:
- no teste "loja, compra e inventário", o rodapé esperado da loja passa a ser `' · use !comprar pocao'`.
- no teste "vitória: ranking de dano em uma mensagem só", o cabeçalho esperado passa a ser `'🏆 Goblin derrotado! 🔵 PORTAL AZUL limpo · 💎 +1 cada (1º +2) ‖ 🥇 ana — …'` (resto igual).
- acrescente:

```ts
  it('equipamento: vitória com fragmento, status, loja e inventário', () => {
    const sword = { id: 'arma-f-forjada', slot: 'arma' as const, rank: 0, quality: 'forjada' as const, label: 'Lâmina Enferrujada ★', value: 2 };
    const leather = { id: 'armadura-f-comum', slot: 'armadura' as const, rank: 0, quality: 'comum' as const, label: 'Couro Gasto', value: 0.85 };
    expect(msg.huntWin('ana', outcome({ fragmentRank: 1 }))).toBe(
      '@ana ⚔️ venceu um Lobo de Gelo [E] (27 vs 21) — +15 XP, +5 ouro · 💎 +1 Fragmento E',
    );
    expect(gearPower(sword)).toBe('+2 dano');
    expect(gearPower(leather)).toBe('×0,85 lesão');
    expect(msg.statusGear(sword, leather)).toBe('⚔️ Lâmina Enferrujada ★ +2 · 🛡️ Couro Gasto ×0,85');
    expect(msg.statusGear(null, null)).toBe('');
    expect(msg.status('ana', { title: null, classLabel: 'Guerreiro', rank: 0, level: 2, xpText: '5/40 XP', gold: 3,
      state: '✅ pronto para caçar', gear: '⚔️ Lâmina Enferrujada ★ +2' })).toBe(
      '@ana Guerreiro Rank F · Nv 2 (5/40 XP) · 3 ouro · ⚔️ Lâmina Enferrujada ★ +2 · ✅ pronto para caçar',
    );
    expect(msg.inventory('ana', 4, [], [{ rank: 0, qty: 4 }, { rank: 1, qty: 1 }], [
      { item: sword, equipped: true }, { item: leather, equipped: false },
    ])).toBe('@ana 🎒 4 ouro · 💎 F ×4 E ×1 · 1) ⚔️ Lâmina Enferrujada ★ [F] ✅ · 2) 🛡️ Couro Gasto [F]');
  });

  it('equipamento: comprar, forjar, equipar e recusas', () => {
    const common = { id: 'arma-f-comum', slot: 'arma' as const, rank: 0, quality: 'comum' as const, label: 'Lâmina Enferrujada', value: 1 };
    const forged = { ...common, id: 'arma-f-forjada', quality: 'forjada' as const, label: 'Lâmina Enferrujada ★', value: 2 };
    expect(msg.boughtGear('ana', common, 18, true, 2)).toBe(
      '@ana 🛒 comprou ⚔️ Lâmina Enferrujada [F] (+1 dano) por 18 ouro · equipado ✅ · ouro: 2',
    );
    expect(msg.boughtGear('ana', common, 18, false, 2)).toContain('guardado no !inventario');
    expect(msg.forged('ana', forged, { fragments: 6, gold: 6 }, true, 1)).toBe(
      '@ana 🔨 forjou ⚔️ Lâmina Enferrujada ★ [F] (+2 dano) com 6 💎 F e 6 ouro · equipado ✅ · sobram 1 💎 F',
    );
    expect(msg.alreadyOwn('ana', common)).toBe('@ana você já tem ⚔️ Lâmina Enferrujada [F].');
    expect(msg.forgeUsage('ana')).toBe('@ana use: !forjar arma|armadura [rank] (ex.: !forjar arma F)');
    expect(msg.forgeRank('ana', 0)).toBe('@ana você só pode forjar até o seu rank (F).');
    expect(msg.forgeFragments('ana', 0, 2, 6)).toBe('@ana faltam fragmentos: precisa de 6 💎 F e tem 2.');
    expect(msg.forgeGold('ana', 6, 1)).toBe('@ana ouro insuficiente para forjar: custa 6 e você tem 1.');
    expect(msg.equipUsage('ana')).toBe('@ana use: !equipar <número ou nome> (veja o !inventario)');
    expect(msg.equipNotFound('ana')).toBe('@ana você não tem esse item. Veja o !inventario.');
    expect(msg.equipRank('ana', { ...common, rank: 1, label: 'Espada de Ferro' })).toBe(
      '@ana ⚔️ Espada de Ferro [E] (+1 dano) é de rank acima do seu.',
    );
    expect(msg.equipped('ana', forged)).toBe('@ana ✅ equipou ⚔️ Lâmina Enferrujada ★ [F] (+2 dano).');
    expect(msg.help()).toContain('!forjar');
    expect(msg.help()).toContain('!equipar');
  });
```

(import: `import { fmtDuration, gearPower, msg } from '../../src/game/messages';`)

Em `tests/game/game-service-raid.test.ts`, no teste de vitória, o texto esperado passa a começar com `'🏆 Goblin derrotado! 🔵 PORTAL AZUL limpo · 💎 +1 cada (1º +2) ‖ '`.

- [ ] **Step 2:** `npx vitest run tests/commands tests/game` → FAIL.

- [ ] **Step 3: Implementar.**

`src/commands/parse.ts`:
- imports: `import { isEquipmentSlot, RANKS, type EquipmentSlot, type RankLetter } from '../core/types';`
- `Command` ganha `| { kind: 'forjar'; slot: EquipmentSlot | null; rank: number | null }` e `| { kind: 'equipar'; arg: string }`.
- `ALIASES` ganha `['forjar', 'forjar'], ['forja', 'forjar'], ['equipar', 'equipar'],`.
- no `switch (name)`:

```ts
    case 'forjar': {
      // "!forjar arma" ou "!forjar armadura e": espaço e, opcionalmente, a letra do rank.
      const [slotToken, rankToken, ...extra] = arg ? arg.split(/\s+/) : [];
      const rank = rankToken === undefined ? null : RANKS.indexOf(rankToken.toUpperCase() as RankLetter);
      if (!isEquipmentSlot(slotToken) || rank === -1 || extra.length > 0) return { kind: 'forjar', slot: null, rank: null };
      return { kind: 'forjar', slot: slotToken, rank };
    }
    case 'equipar':
      return { kind: 'equipar', arg: argRaw };
```

`src/game/messages.ts`:
- import: `import type { EquipmentItem } from '../core/equipment';`
- `StatusView` ganha `/** Arma e armadura equipadas (texto pronto); vazio = nada. */ gear?: string;`
- depois de `const place = …`:

```ts
const fmtFactor = (f: number) => `×${String(f).replace('.', ',')}`;
const gearIcon = (i: EquipmentItem) => (i.slot === 'arma' ? '⚔️' : '🛡️');
/** "+2 dano" (arma) ou "×0,85 lesão" (armadura). */
export const gearPower = (i: EquipmentItem) => (i.slot === 'arma' ? `+${i.value} dano` : `${fmtFactor(i.value)} lesão`);
const gear = (i: EquipmentItem) => `${gearIcon(i)} ${i.label} [${R(i.rank)}] (${gearPower(i)})`;
```

- `huntWin`: depois do trecho de XP/ouro, acrescente `` + `${o.fragmentRank !== null ? ` · 💎 +1 Fragmento ${R(o.fragmentRank)}` : ''}` ``.
- `status`: `` `${at(n)} ${titled(v.title)}${v.classLabel} Rank ${R(v.rank)} · Nv ${v.level} (${v.xpText}) · ${v.gold} ouro${v.gear ? ` · ${v.gear}` : ''} · ${v.state}` ``
- `shop`: rodapé `` ` · use !comprar ${entries.map((e) => e.id).join(' | ')}` ``
- `inventory`:

```ts
  inventory: (
    n: string,
    gold: number,
    items: { label: string; qty: number }[],
    fragments: { rank: number; qty: number }[] = [],
    equipment: { item: EquipmentItem; equipped: boolean }[] = [],
  ) => {
    const parts = [
      ...items.map((i) => `${i.label} ×${i.qty}`),
      ...(fragments.length > 0 ? [`💎 ${fragments.map((f) => `${R(f.rank)} ×${f.qty}`).join(' ')}`] : []),
      ...equipment.map((e, i) => `${i + 1}) ${gearIcon(e.item)} ${e.item.label} [${R(e.item.rank)}]${e.equipped ? ' ✅' : ''}`),
    ];
    return `${at(n)} 🎒 ${gold} ouro · ${parts.length > 0 ? parts.join(' · ') : 'nenhum item'}`;
  },
  statusGear: (weapon: EquipmentItem | null, armor: EquipmentItem | null) =>
    [weapon && `⚔️ ${weapon.label} +${weapon.value}`, armor && `🛡️ ${armor.label} ${fmtFactor(armor.value)}`]
      .filter(Boolean)
      .join(' · '),
  boughtGear: (n: string, item: EquipmentItem, price: number, equipped: boolean, goldLeft: number) =>
    `${at(n)} 🛒 comprou ${gear(item)} por ${price} ouro · ${equipped ? 'equipado ✅' : 'guardado no !inventario'} · ouro: ${goldLeft}`,
  forged: (n: string, item: EquipmentItem, cost: { fragments: number; gold: number }, equipped: boolean, fragmentsLeft: number) =>
    `${at(n)} 🔨 forjou ${gear(item)} com ${cost.fragments} 💎 ${R(item.rank)} e ${cost.gold} ouro · ` +
    `${equipped ? 'equipado ✅' : 'guardado no !inventario'} · sobram ${fragmentsLeft} 💎 ${R(item.rank)}`,
  alreadyOwn: (n: string, item: EquipmentItem) => `${at(n)} você já tem ${gearIcon(item)} ${item.label} [${R(item.rank)}].`,
  forgeUsage: (n: string) => `${at(n)} use: !forjar arma|armadura [rank] (ex.: !forjar arma F)`,
  forgeRank: (n: string, maxRank: number) => `${at(n)} você só pode forjar até o seu rank (${R(maxRank)}).`,
  forgeFragments: (n: string, rank: number, have: number, need: number) =>
    `${at(n)} faltam fragmentos: precisa de ${need} 💎 ${R(rank)} e tem ${have}.`,
  forgeGold: (n: string, need: number, have: number) =>
    `${at(n)} ouro insuficiente para forjar: custa ${need} e você tem ${have}.`,
  equipUsage: (n: string) => `${at(n)} use: !equipar <número ou nome> (veja o !inventario)`,
  equipNotFound: (n: string) => `${at(n)} você não tem esse item. Veja o !inventario.`,
  equipRank: (n: string, item: EquipmentItem) => `${at(n)} ${gear(item)} é de rank acima do seu.`,
  equipped: (n: string, item: EquipmentItem) => `${at(n)} ✅ equipou ${gear(item)}.`,
```

- `raidVictory`: o cabeçalho vira `` `🏆 ${boss} derrotado! ${PORTAL_LABEL[type]} limpo${fragmentNote(rewards)}` `` com, antes do `msg`:

```ts
/** " · 💎 +1 cada (1º +2)": quanto de fragmento cada um ganhou na raid. */
function fragmentNote(rewards: RaidReward[]): string {
  const top = rewards[0]?.fragments ?? 0;
  if (top === 0) return '';
  return rewards.length === 1 ? ` · 💎 +${top}` : ` · 💎 +${rewards[1].fragments} cada (1º +${top})`;
}
```

- `help`: troque `· !raid · !atacar'` por `· !raid · !atacar · !forjar arma|armadura · !equipar <n>'`.

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): comandos !forjar e !equipar e textos do equipamento`.

---

### Task 7: Equipamento no `GameService`

**Files:** Modify `src/game/game-service.ts` · Create `tests/game/game-service-gear.test.ts`

**Interfaces:** Consumes Tasks 1–6. Sem API pública nova.

- [ ] **Step 1: Testes que falham** — `tests/game/game-service-gear.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/commands/parse';
import type { Balance } from '../../src/config/balance';
import { MemoryGameRepository } from '../../src/data/memory-repository';
import { GameService, type Author } from '../../src/game/game-service';
import { d20, FakeClock, ScriptedRng, testBalance } from '../helpers';

const ana: Author = { userId: 'u-ana', displayName: 'ana' };
const MIN = 60_000;

function setup(tweak: (b: Balance) => void = () => {}) {
  const repo = new MemoryGameRepository();
  const clock = new FakeClock();
  const rng = new ScriptedRng();
  const b = testBalance();
  tweak(b);
  const game = new GameService({ repo, balance: b, rng, clock });
  game.start();
  const say = (author: Author, text: string): string[] => {
    clock.advance(3_000);
    return game.handle(author, parseCommand(text)!);
  };
  rng.push(0); // ana desperta como Guerreiro
  say(ana, '!despertar');
  const patch = (p: Record<string, unknown>) => repo.saveHunter({ ...repo.getHunter('u-ana')!, ...p });
  return { repo, clock, rng, b, game, say, patch };
}

describe('GameService: equipamento', () => {
  it('loja lista poção, arma e armadura do rank', () => {
    const { say } = setup();
    const out = say(ana, '!loja')[0];
    expect(out).toContain('Lâmina Enferrujada [F] — 18 ouro (+1 dano)');
    expect(out).toContain('Couro Gasto [F] — 15 ouro (×0,85 lesão)');
    expect(out).toContain('use !comprar pocao | arma | armadura');
  });

  it('comprar arma: sem ouro, compra e equipa, não compra de novo', () => {
    const { repo, say, patch } = setup();
    expect(say(ana, '!comprar arma')[0]).toContain('ouro insuficiente');
    patch({ gold: 20 });
    expect(say(ana, '!comprar arma')[0]).toContain('equipado ✅');
    expect(repo.getHunter('u-ana')).toMatchObject({ gold: 2, weaponId: 'arma-f-comum' });
    expect(repo.getItems('u-ana')).toEqual({ 'arma-f-comum': 1 });
    patch({ gold: 20 });
    expect(say(ana, '!comprar arma')[0]).toContain('já tem');
  });

  it('forjar: usa fragmentos e ouro, troca a arma comum pela forjada', () => {
    const { repo, say, patch } = setup();
    expect(say(ana, '!forjar')[0]).toContain('use: !forjar');
    expect(say(ana, '!forjar arma')[0]).toContain('precisa de 6 💎 F e tem 0');
    expect(say(ana, '!forjar arma e')[0]).toContain('só pode forjar até o seu rank (F)');
    patch({ gold: 10, weaponId: 'arma-f-comum' });
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    repo.setItemQty('u-ana', 'frag-f', 6);
    expect(say(ana, '!forjar arma')[0]).toContain('forjou ⚔️ Lâmina Enferrujada ★ [F]');
    expect(repo.getHunter('u-ana')).toMatchObject({ gold: 4, weaponId: 'arma-f-forjada' });
    expect(repo.getItems('u-ana')).toEqual({ 'arma-f-comum': 1, 'arma-f-forjada': 1 });
  });

  it('equipar por número e nome; recusa rank acima e item que não tem', () => {
    const { repo, say } = setup();
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    repo.setItemQty('u-ana', 'arma-f-forjada', 1);
    repo.setItemQty('u-ana', 'arma-e-comum', 1);
    expect(say(ana, '!equipar')[0]).toContain('use: !equipar');
    expect(say(ana, '!equipar 2')[0]).toContain('equipou ⚔️ Lâmina Enferrujada ★');
    expect(repo.getHunter('u-ana')!.weaponId).toBe('arma-f-forjada');
    expect(say(ana, '!equipar lamina comum')[0]).toContain('equipou ⚔️ Lâmina Enferrujada [F]');
    expect(say(ana, '!equipar espada')[0]).toContain('rank acima');
    expect(say(ana, '!equipar 9')[0]).toContain('não tem esse item');
  });

  it('status e inventário mostram equipamento e fragmentos', () => {
    const { repo, say, patch } = setup();
    patch({ weaponId: 'arma-f-forjada' });
    repo.setItemQty('u-ana', 'arma-f-forjada', 1);
    repo.setItemQty('u-ana', 'frag-f', 3);
    expect(say(ana, '!status')[0]).toContain('· ⚔️ Lâmina Enferrujada ★ +2 ·');
    expect(say(ana, '!inventario')[0]).toContain('💎 F ×3 · 1) ⚔️ Lâmina Enferrujada ★ [F] ✅');
  });

  it('caçada vencida guarda o fragmento; a arma ajuda a vencer', () => {
    const { repo, rng, say, patch } = setup();
    patch({ weaponId: 'arma-f-forjada' });
    // 8 + 2 (arma) + 5 = 15 contra 7 + 8 = 15: vence só por causa da arma; sorteio 0 = dropa
    rng.push(0.5, 0, d20(5), d20(8), 0);
    expect(say(ana, '!cacar')[0]).toContain('💎 +1 Fragmento F');
    expect(repo.getItems('u-ana')).toEqual({ 'frag-f': 1 });
  });

  it('raid vencida dá fragmentos (1 + 1 do 1º lugar no azul)', () => {
    const { repo, rng, clock, game, say } = setup((b) => {
      b.raid.bossHp.azul = 10;
    });
    rng.push(0); // boss
    game.admin({ action: 'portal', portal: 'azul' });
    say(ana, '!raid');
    clock.advance(MIN);
    game.tick();
    rng.push(d20(10));
    clock.advance(20_000);
    expect(game.tick().join('\n')).toContain('💎 +2');
    expect(repo.getItems('u-ana')).toEqual({ 'frag-f': 2 });
  });

  it('pausado bloqueia forjar e equipar; fim da temporada tira o equipamento', () => {
    const { repo, game, say, patch } = setup();
    patch({ weaponId: 'arma-f-comum', armorId: 'armadura-f-comum' });
    repo.setItemQty('u-ana', 'arma-f-comum', 1);
    game.admin({ action: 'pausar' });
    expect(say(ana, '!forjar arma')).toEqual([]);
    expect(say(ana, '!equipar 1')).toEqual([]);
    game.admin({ action: 'retomar' });
    game.admin({ action: 'encerrar-temporada' });
    expect(repo.getHunter('u-ana')).toMatchObject({ weaponId: null, armorId: null });
    expect(repo.getItems('u-ana')).toEqual({});
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/game/game-service-gear.test.ts` → FAIL.

- [ ] **Step 3: Implementar** em `src/game/game-service.ts`:

Imports:

```ts
import {
  buyEquipment,
  canEquip,
  equip,
  equipmentById,
  equipmentPrice,
  findOwnedEquipment,
  forgeEquipment,
  fragmentId,
  getEquipment,
  ownedEquipment,
  ownedFragments,
} from '../core/equipment';
```

`import { CLASS_IDS, EQUIPMENT_SLOTS, isEquipmentSlot, MAX_RANK, rankLetter, type EquipmentSlot, type Hunter, type PortalType, type Season } from '../core/types';` e `import { fmtDuration, gearPower, msg, RANKING_SIZE } from './messages';`.

- `BLOCKED_WHEN_PAUSED` ganha `'forjar'` e `'equipar'`.
- no segundo `switch` de `dispatch`:

```ts
      case 'forjar':
        return [this.forge(h, cmd.slot, cmd.rank)];
      case 'equipar':
        return [this.equipCommand(h, cmd.arg)];
```

- `shop(h)`: depois de montar `entries` (poção):

```ts
    const gear = EQUIPMENT_SLOTS.map((slot) => {
      const item = getEquipment(slot, h.rank, 'comum', b);
      return { id: slot, label: `${item.label} [${rankLetter(item.rank)}]`, description: gearPower(item), price: equipmentPrice(slot, h.rank, b) };
    });
    return msg.shop(h.displayName, h.rank, [...entries, ...gear]);
```

- `buy(h, itemQuery, qty)`: logo depois de `if (!itemQuery) return msg.buyUsage(h.displayName);`:

```ts
    if (isEquipmentSlot(itemQuery)) return this.buyGear(h, itemQuery);
```

- `inventory(h)`: passa fragmentos e equipamentos:

```ts
    const gear = ownedEquipment(owned, b).map((item) => ({ item, equipped: item.id === h.weaponId || item.id === h.armorId }));
    return msg.inventory(h.displayName, h.gold, items, ownedFragments(owned), gear);
```

- `status(h, now)`: o objeto passado a `msg.status` ganha

```ts
      gear: msg.statusGear(
        h.weaponId ? equipmentById(h.weaponId, b) : null,
        h.armorId ? equipmentById(h.armorId, b) : null,
      ),
```

- `hunt(h, now)`: troque `this.deps.repo.saveHunter(o.hunter);` por:

```ts
    const { repo } = this.deps;
    repo.transaction(() => {
      repo.saveHunter(o.hunter);
      if (o.fragmentRank !== null) {
        const id = fragmentId(o.fragmentRank);
        repo.setItemQty(h.userId, id, (repo.getItems(h.userId)[id] ?? 0) + 1);
      }
    });
```

- `finishRaid`: dentro do laço das recompensas, depois do `saveHunter`:

```ts
        if (h && r.fragments > 0) {
          const id = fragmentId(r.rank);
          repo.setItemQty(r.userId, id, (repo.getItems(r.userId)[id] ?? 0) + r.fragments);
        }
```

- novos métodos (seção `// ---------- equipamento ----------`, depois da loja):

```ts
  private buyGear(h: Hunter, slot: EquipmentSlot): string {
    const { repo, balance: b } = this.deps;
    const r = buyEquipment(h, slot, repo.getItems(h.userId), b);
    if (!r.ok) {
      return r.reason === 'owned'
        ? msg.alreadyOwn(h.displayName, r.item)
        : msg.notEnoughGold(h.displayName, r.item.label, 1, r.price, h.gold);
    }
    repo.transaction(() => {
      repo.saveHunter(r.hunter);
      repo.setItemQty(h.userId, r.item.id, 1);
    });
    return msg.boughtGear(h.displayName, r.item, r.price, r.equipped, r.hunter.gold);
  }

  private forge(h: Hunter, slot: EquipmentSlot | null, rank: number | null): string {
    const { repo, balance: b } = this.deps;
    if (!slot) return msg.forgeUsage(h.displayName);
    const r = forgeEquipment(h, slot, rank, repo.getItems(h.userId), b);
    if (!r.ok) {
      switch (r.reason) {
        case 'rank':
          return msg.forgeRank(h.displayName, r.maxRank);
        case 'owned':
          return msg.alreadyOwn(h.displayName, r.item);
        case 'fragments':
          return msg.forgeFragments(h.displayName, r.rank, r.have, r.need);
        case 'gold':
          return msg.forgeGold(h.displayName, r.need, r.have);
      }
    }
    repo.transaction(() => {
      repo.saveHunter(r.hunter);
      repo.setItemQty(h.userId, r.item.id, 1);
      repo.setItemQty(h.userId, fragmentId(r.item.rank), r.fragmentsLeft);
    });
    return msg.forged(h.displayName, r.item, r.cost, r.equipped, r.fragmentsLeft);
  }

  private equipCommand(h: Hunter, arg: string): string {
    const { repo, balance: b } = this.deps;
    if (!arg.trim()) return msg.equipUsage(h.displayName);
    const item = findOwnedEquipment(arg, repo.getItems(h.userId), b);
    if (!item) return msg.equipNotFound(h.displayName);
    if (!canEquip(item, h)) return msg.equipRank(h.displayName, item);
    repo.saveHunter(equip(h, item));
    return msg.equipped(h.displayName, item);
  }
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(equip): loja, forja, equipar e drops no jogo`.

---

### Task 8: Tela local, simulação e ROADMAP

**Files:** Modify `src/web/server.ts`, `web/index.html`, `scripts/sim.ts`, `docs/ROADMAP.md` · Test `tests/web/server.test.ts`

- [ ] **Step 1: Teste.** Em `tests/web/server.test.ts`, no teste "envia comando e mostra o caçador no estado", troque o `objectContaining` por `expect.objectContaining({ name: 'ana', rank: 'F', gear: '—', fragments: '—' })`.

- [ ] **Step 2:** `npx vitest run tests/web` → FAIL.

- [ ] **Step 3: Implementar.**

`src/web/server.ts`: `HunterView` ganha `gear: string; fragments: string;`. Import `equipmentById, ownedFragments` de `../core/equipment` e `msg` de `../game/messages`. Em `view(h, now)`:

```ts
    const owned = this.repo.getItems(h.userId);
    const gear = msg.statusGear(
      h.weaponId ? equipmentById(h.weaponId, b) : null,
      h.armorId ? equipmentById(h.armorId, b) : null,
    );
    const fragments = ownedFragments(owned).map((f) => `${rankLetter(f.rank)} ×${f.qty}`).join(' ');
```

e no objeto devolvido: `potions: owned.pocao ?? 0, gear: gear || '—', fragments: fragments || '—',`.

`web/index.html`: no `<thead>`, depois de `<th>Poções</th>`, acrescente `<th>Equip.</th><th>💎</th>`; no `render`, no array `cells`, depois de `h.potions,` acrescente `h.gear, h.fragments,` e troque `if (idx === 8) td.className = 'status';` por `if (idx === 10) td.className = 'status';`. Nos botões rápidos, depois de `!atacar`: `<button type="button" data-cmd="!comprar arma">!comprar arma</button>`, `<button type="button" data-cmd="!forjar arma">!forjar arma</button>`, `<button type="button" data-cmd="!forjar armadura">!forjar armadura</button>`.

`scripts/sim.ts`:
- import `import { equipmentId, type Quality } from '../src/core/equipment';`
- `simulateClass(classId: ClassId, quality: Quality | null = null)`; dentro do laço, antes de `const { rank, level } = h;`:

```ts
      if (quality) h = { ...h, weaponId: equipmentId('arma', h.rank, quality), armorId: equipmentId('armadura', h.rank, quality) };
```

- troque o laço final das classes por:

```ts
console.log('Colunas: vitória no piso / antes do teto, sem equipamento, com comum e com forjado (sempre do rank atual).');
for (const classId of CLASS_IDS) {
  const runs = [simulateClass(classId), simulateClass(classId, 'comum'), simulateClass(classId, 'forjada')];
  const cell = (row: Record<string, string | number>) => `${row['vitória no piso']} / ${row['vitória antes do teto']}`;
  console.log(`\n== ${b.classes[classId].label} ==`);
  console.table(
    runs[0].map((row, r) => ({
      rank: row.rank,
      'caçadas até chegar': row['caçadas até chegar (média)'],
      'sem equip': cell(row),
      comum: cell(runs[1][r]),
      forjado: cell(runs[2][r]),
    })),
  );
}
```

- [ ] **Step 4:** `npm test && npx tsc --noEmit` → PASS. `npm run sim`: conferir que o comum fica uns +5 pontos e o forjado uns +10–15 sobre "sem equip". Se passar de ~92% antes do teto fora do Mago, **parar e mostrar a tabela** antes de mexer nos números.

- [ ] **Step 5: Conferir na tela local.** `npm run dev:web` (em segundo plano) e abrir `http://127.0.0.1:3210`. Com um nome de teste: `!despertar`, `+100 ouro (teste)`, `!comprar arma` (coluna Equip. mostra a lâmina), `!loja`, `!inventario`, `!forjar arma` (recusa por fragmentos). Parar o servidor no fim.

- [ ] **Step 6: ROADMAP.** Linha da v3: `| **v3 — Equipamento** | Arma e armadura, loja do rank, fragmentos, `!forjar`, `!equipar` | ✅ no `main` |` (só depois do merge) e acrescente o plano na tabela de documentos: `| [plans/2026-11-09-despertar-v3-equipamento.md](plans/2026-11-09-despertar-v3-equipamento.md) | Plano executado da v3 |`.

- [ ] **Step 7: Commit** `feat(equip): equipamento na tela local e na simulação; ROADMAP da v3`.
