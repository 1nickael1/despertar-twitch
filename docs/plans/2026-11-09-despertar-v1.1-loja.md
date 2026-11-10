# Despertar v1.1 — Loja e Poção de Cura · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar uso ao ouro: uma loja no chat e uma Poção de Cura, sem cooldown, que zera descanso, lesão e bloqueio da reavaliação.

**Architecture:** Catálogo de itens no `balance.json` (validado para que uma vitória nunca pague um item). Regras puras em `src/core/shop.ts`. Inventário numa tabela nova (`hunter_items`), exposto pelo `GameRepository`. O `GameService` ganha os comandos `loja`, `comprar`, `usar`, `inventario` e limpa os itens na virada de temporada.

**Tech Stack:** O mesmo da v1: Node 24, TypeScript (tsx), Vitest, zod 4, better-sqlite3.

**Spec:** `despertar/docs/specs/2026-11-09-despertar-rpg-design.md`, seção 14.

## Global Constraints

- Todo comando `npm`/`npx` roda dentro de `despertar/`. Branch de trabalho: `feat/despertar-loja`.
- Números só no `config/balance.json`; os testes leem os valores do balance em vez de repetir literais.
- `priceMultiplier` de cada item deve ser **maior que o maior multiplicador de ouro de uma vitória** (2 se alguma classe tem `critMin`, senão 1). Padrão: 2,5.
- Comprar: de 1 a `shop.maxPerPurchase` (10) por comando.
- Poção: sem cooldown; zera `lastHuntAt`, `injuredUntil`, `reevalBlockedUntil`; não é gasta se nenhuma das três esperas estiver ativa.
- `comprar` e `usar` bloqueados com o jogo pausado; `loja` e `inventario` liberados.
- Fim da temporada zera os itens, na mesma transação que reseta o ouro.
- Texto do chat em português, uma linha, `@nome` no começo quando é para alguém.
- Modo live: nada de token/segredo em log, teste ou commit.

## File Structure

```
despertar/
  config/balance.json              (+ shop)
  migrations/002_items.sql         (novo: hunter_items)
  src/core/text.ts                 (novo: normalizeText, movido de commands/parse.ts)
  src/core/shop.ts                 (novo: findItem, itemPrice, buyItem, healHunter)
  src/config/balance.ts            (+ schema da loja e regra do preço)
  src/data/repository.ts           (+ getItems, setItemQty, clearAllItems)
  src/data/memory-repository.ts    (+ itens)
  src/data/sqlite-repository.ts    (+ itens)
  src/commands/parse.ts            (+ loja, comprar, usar, inventario; reexporta normalizeText)
  src/game/messages.ts             (+ textos da loja; help atualizado)
  src/game/game-service.ts         (+ comandos; limpa itens na virada)
  src/web/server.ts                (+ poções na tabela, rota de ouro de teste)
  web/index.html                   (+ botões e coluna Poções)
  tests/...                        (testes de cada parte)
```

---

### Task 1: Catálogo da loja no balance

**Files:**
- Modify: `despertar/config/balance.json`
- Modify: `despertar/src/config/balance.ts`
- Test: `despertar/tests/config/balance.test.ts`

**Interfaces:**
- Produces: `Balance['shop']` = `{ maxPerPurchase: number; items: { pocao: { label: string; description: string; priceMultiplier: number } } }`; `maxWinGoldMultiplier(b: Balance): number`.

- [ ] **Step 1: Testes que falham** — acrescentar ao fim do `describe('balance', …)` em `tests/config/balance.test.ts`:

```ts
  it('tem a loja com a Poção de Cura', () => {
    const b = loadBalance(BALANCE_PATH);
    expect(b.shop.items.pocao.label).toBe('Poção de Cura');
    expect(b.shop.maxPerPurchase).toBeGreaterThanOrEqual(1);
  });

  it('recusa preço que uma vitória (mesmo crítica) pagaria', () => {
    const raw = rawBalance();
    raw.shop.items.pocao.priceMultiplier = 2;
    expect(() => parseBalance(raw)).toThrow(/shop\.items\.pocao\.priceMultiplier/);
  });

  it('sem nenhuma classe com crítico, basta passar de 1', () => {
    const raw = rawBalance();
    for (const c of Object.values(raw.classes) as { critMin: number | null }[]) c.critMin = null;
    raw.shop.items.pocao.priceMultiplier = 1.5;
    expect(() => parseBalance(raw)).not.toThrow();
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/config/balance.test.ts` → FAIL (`shop` não existe).

- [ ] **Step 3: `balance.json`** — acrescentar antes de `"classes"`:

```json
  "shop": {
    "maxPerPurchase": 10,
    "items": {
      "pocao": {
        "label": "Poção de Cura",
        "description": "zera descanso, lesão e reavaliação",
        "priceMultiplier": 2.5
      }
    }
  },
```

- [ ] **Step 4: `balance.ts`** — antes de `export const balanceSchema`, adicionar:

```ts
const shopItemSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  priceMultiplier: z.number().positive(),
});
```

dentro do `z.object({...})` do `balanceSchema`, ao lado de `chat`:

```ts
  shop: z.object({
    maxPerPurchase: z.number().int().min(1),
    items: z.object({ pocao: shopItemSchema }),
  }),
```

e encadear no fim do `balanceSchema` (depois do `})` que fecha o objeto):

```ts
  .superRefine((b, ctx) => {
    const maxWin = maxWinGoldMultiplier(b);
    for (const [id, item] of Object.entries(b.shop.items)) {
      if (item.priceMultiplier <= maxWin) {
        ctx.addIssue({
          code: 'custom',
          path: ['shop', 'items', id, 'priceMultiplier'],
          message: `uma vitória não pode pagar o item: use um valor maior que ${maxWin}`,
        });
      }
    }
  });
```

e a função (fora do schema, acima dele):

```ts
/** Maior múltiplo do ouro base que uma única vitória pode render (crítico dobra). */
export function maxWinGoldMultiplier(b: { classes: Record<string, { critMin: number | null }> }): number {
  return Object.values(b.classes).some((c) => c.critMin !== null) ? 2 : 1;
}
```

- [ ] **Step 5: Rodar** — `npx vitest run tests/config` e `npx tsc --noEmit` → PASS / exit 0.

- [ ] **Step 6: Commit** — `git add despertar/config despertar/src/config despertar/tests/config && git commit -m "feat(despertar): catálogo da loja no balance"`

---

### Task 2: Regras da loja (`core/shop.ts`)

**Files:**
- Create: `despertar/src/core/text.ts`, `despertar/src/core/shop.ts`
- Modify: `despertar/src/commands/parse.ts` (passa a reexportar `normalizeText`)
- Test: `despertar/tests/core/shop.test.ts`

**Interfaces:**
- Produces:
  - `normalizeText(s: string): string` em `core/text.ts`
  - `type ItemId = keyof Balance['shop']['items']`
  - `findItem(query: string, b: Balance): ItemId | null`
  - `itemPrice(itemId: ItemId, rank: number, b: Balance): number`
  - `type BuyResult = { ok: true; hunter: Hunter; total: number } | { ok: false; reason: 'qty'; max: number } | { ok: false; reason: 'gold'; total: number }`
  - `buyItem(h: Hunter, itemId: ItemId, qty: number, b: Balance): BuyResult`
  - `hasActiveWaits(h: Hunter, now: number, b: Balance): boolean`
  - `healHunter(h: Hunter, now: number, b: Balance): { healed: boolean; hunter: Hunter }`

- [ ] **Step 1: Teste que falha — `tests/core/shop.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { maxWinGoldMultiplier } from '../../src/config/balance';
import { buyItem, findItem, healHunter, itemPrice } from '../../src/core/shop';
import { makeHunter, testBalance } from '../helpers';

const b = testBalance();
const NOW = 100_000;

describe('loja', () => {
  it('acha o item pelo id ou pelo nome, com ou sem acento', () => {
    expect(findItem('pocao', b)).toBe('pocao');
    expect(findItem('POÇÃO', b)).toBe('pocao');
    expect(findItem('poção de cura', b)).toBe('pocao');
    expect(findItem('espada', b)).toBeNull();
    expect(findItem('', b)).toBeNull();
  });

  it('preço acompanha o rank', () => {
    const m = b.shop.items.pocao.priceMultiplier;
    expect(itemPrice('pocao', 0, b)).toBe(Math.ceil(m * b.hunt.goldByRank[0]));
    expect(itemPrice('pocao', 6, b)).toBe(Math.ceil(m * b.hunt.goldByRank[6]));
  });

  it('nenhuma vitória, nem crítica, paga uma poção em nenhum rank', () => {
    const maxWin = maxWinGoldMultiplier(b);
    b.hunt.goldByRank.forEach((gold, rank) => {
      expect(itemPrice('pocao', rank, b)).toBeGreaterThan(gold * maxWin);
    });
  });

  it('compra desconta o ouro', () => {
    const price = itemPrice('pocao', 0, b);
    const r = buyItem(makeHunter({ gold: price * 3 + 1 }), 'pocao', 3, b);
    expect(r).toMatchObject({ ok: true, total: price * 3 });
    if (r.ok) expect(r.hunter.gold).toBe(1);
  });

  it('recusa sem ouro suficiente', () => {
    const price = itemPrice('pocao', 0, b);
    expect(buyItem(makeHunter({ gold: price - 1 }), 'pocao', 1, b)).toEqual({ ok: false, reason: 'gold', total: price });
  });

  it.each([0, -1, 1.5, 999])('recusa quantidade %s', (qty) => {
    expect(buyItem(makeHunter({ gold: 1_000_000 }), 'pocao', qty, b)).toEqual({
      ok: false, reason: 'qty', max: b.shop.maxPerPurchase,
    });
  });

  it('cura zera descanso, lesão e bloqueio da reavaliação', () => {
    const h = makeHunter({ lastHuntAt: NOW, injuredUntil: NOW + 1000, reevalBlockedUntil: NOW + 1000 });
    const r = healHunter(h, NOW, b);
    expect(r.healed).toBe(true);
    expect(r.hunter).toMatchObject({ lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null });
  });

  it.each([
    ['descanso', { lastHuntAt: NOW }],
    ['lesão', { injuredUntil: NOW + 1 }],
    ['reavaliação', { reevalBlockedUntil: NOW + 1 }],
  ])('qualquer espera ativa conta (%s)', (_name, waits) => {
    expect(healHunter(makeHunter(waits), NOW, b).healed).toBe(true);
  });

  it('sem nenhuma espera ativa, não cura', () => {
    const h = makeHunter({ lastHuntAt: NOW - b.hunt.cooldownMs, injuredUntil: NOW - 1, reevalBlockedUntil: NOW });
    const r = healHunter(h, NOW, b);
    expect(r.healed).toBe(false);
    expect(r.hunter).toBe(h);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/core/shop.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: `src/core/text.ts`**

```ts
/** Sem acentos e em minúsculas, para comparar o que o chat digita. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
```

e em `src/commands/parse.ts` trocar a função `normalizeText` por:

```ts
import { normalizeText } from '../core/text';

export { normalizeText };
```

(o import vai no topo do arquivo; remover a definição antiga).

- [ ] **Step 4: `src/core/shop.ts`**

```ts
import type { Balance } from '../config/balance';
import { normalizeText } from './text';
import type { Hunter } from './types';

export type ItemId = keyof Balance['shop']['items'];

export function itemIds(b: Balance): ItemId[] {
  return Object.keys(b.shop.items) as ItemId[];
}

/** Aceita o id ("pocao") ou o nome ("Poção de Cura"), com ou sem acento. */
export function findItem(query: string, b: Balance): ItemId | null {
  const q = normalizeText(query.trim());
  if (!q) return null;
  return itemIds(b).find((id) => id === q || normalizeText(b.shop.items[id].label) === q) ?? null;
}

export function itemPrice(itemId: ItemId, rank: number, b: Balance): number {
  return Math.ceil(b.shop.items[itemId].priceMultiplier * b.hunt.goldByRank[rank]);
}

export type BuyResult =
  | { ok: true; hunter: Hunter; total: number }
  | { ok: false; reason: 'qty'; max: number }
  | { ok: false; reason: 'gold'; total: number };

export function buyItem(h: Hunter, itemId: ItemId, qty: number, b: Balance): BuyResult {
  const max = b.shop.maxPerPurchase;
  if (!Number.isInteger(qty) || qty < 1 || qty > max) return { ok: false, reason: 'qty', max };
  const total = itemPrice(itemId, h.rank, b) * qty;
  if (h.gold < total) return { ok: false, reason: 'gold', total };
  return { ok: true, hunter: { ...h, gold: h.gold - total }, total };
}

export function hasActiveWaits(h: Hunter, now: number, b: Balance): boolean {
  return (
    (h.lastHuntAt !== null && h.lastHuntAt + b.hunt.cooldownMs > now) ||
    (h.injuredUntil !== null && h.injuredUntil > now) ||
    (h.reevalBlockedUntil !== null && h.reevalBlockedUntil > now)
  );
}

/** Poção de Cura: zera as três esperas. Sem espera ativa, nada muda (a poção não deve ser gasta). */
export function healHunter(h: Hunter, now: number, b: Balance): { healed: boolean; hunter: Hunter } {
  if (!hasActiveWaits(h, now, b)) return { healed: false, hunter: h };
  return { healed: true, hunter: { ...h, lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null } };
}
```

- [ ] **Step 5: Rodar** — `npx vitest run` (suíte toda, por causa do `normalizeText` movido) e `npx tsc --noEmit` → PASS / exit 0.

- [ ] **Step 6: Commit** — `git add despertar/src despertar/tests && git commit -m "feat(despertar): regras da loja e da poção de cura"`

---

### Task 3: Inventário no repositório

**Files:**
- Create: `despertar/migrations/002_items.sql`
- Modify: `despertar/src/data/repository.ts`, `memory-repository.ts`, `sqlite-repository.ts`
- Test: `despertar/tests/data/repository.test.ts`

**Interfaces:**
- Produces (em `GameRepository`):
  - `getItems(userId: string): Record<string, number>` — só itens com quantidade > 0
  - `setItemQty(userId: string, itemId: string, qty: number): void` — `qty <= 0` remove
  - `clearAllItems(): void`

- [ ] **Step 1: Testes que falham** — dentro do `describe.each(factories)`:

```ts
  it('itens: grava, atualiza, remove com zero e limpa tudo', () => {
    expect(repo.getItems('u1')).toEqual({});
    repo.setItemQty('u1', 'pocao', 3);
    repo.setItemQty('u2', 'pocao', 1);
    expect(repo.getItems('u1')).toEqual({ pocao: 3 });
    repo.setItemQty('u1', 'pocao', 2);
    expect(repo.getItems('u1')).toEqual({ pocao: 2 });
    repo.setItemQty('u1', 'pocao', 0);
    expect(repo.getItems('u1')).toEqual({});
    repo.clearAllItems();
    expect(repo.getItems('u2')).toEqual({});
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/data` → FAIL.

- [ ] **Step 3: `migrations/002_items.sql`**

```sql
CREATE TABLE hunter_items (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (user_id, item_id)
);
```

- [ ] **Step 4: Interface** — em `src/data/repository.ts`, antes de `transaction`:

```ts
  /** Itens do jogador com quantidade > 0, por id. */
  getItems(userId: string): Record<string, number>;
  /** Quantidade <= 0 remove o item. */
  setItemQty(userId: string, itemId: string, qty: number): void;
  /** Fim da temporada: ninguém fica com item. */
  clearAllItems(): void;
```

- [ ] **Step 5: Memória** — em `MemoryGameRepository`, campo `private items = new Map<string, Map<string, number>>();` e:

```ts
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
```

- [ ] **Step 6: SQLite** — em `SqliteGameRepository`:

```ts
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
```

- [ ] **Step 7: Rodar** — `npx vitest run tests/data` e `npx tsc --noEmit` → PASS / exit 0. (A migração 002 roda sozinha no `openDatabase`, inclusive em bancos que já existem.)

- [ ] **Step 8: Commit** — `git add despertar/migrations despertar/src/data despertar/tests/data && git commit -m "feat(despertar): inventário de itens no banco"`

---

### Task 4: Comandos da loja no parser

**Files:**
- Modify: `despertar/src/commands/parse.ts`
- Test: `despertar/tests/commands/parse.test.ts`

**Interfaces:**
- Produces (novas variantes de `Command`):
  - `{ kind: 'loja' }`
  - `{ kind: 'comprar'; item: string; qty: number }` — `item` vem sem acento e em minúsculas; `qty` padrão 1; vazio se não veio item
  - `{ kind: 'usar'; item: string }`
  - `{ kind: 'inventario' }`

- [ ] **Step 1: Testes que falham** — no `describe('parseCommand', …)`:

```ts
  it('loja e inventário', () => {
    expect(parseCommand('!loja')).toEqual({ kind: 'loja' });
    expect(parseCommand('!inventario')).toEqual({ kind: 'inventario' });
    expect(parseCommand('!inventário')).toEqual({ kind: 'inventario' });
    expect(parseCommand('!mochila')).toEqual({ kind: 'inventario' });
  });

  it('comprar com e sem quantidade', () => {
    expect(parseCommand('!comprar pocao')).toEqual({ kind: 'comprar', item: 'pocao', qty: 1 });
    expect(parseCommand('!comprar Poção 3')).toEqual({ kind: 'comprar', item: 'pocao', qty: 3 });
    expect(parseCommand('!comprar poção de cura 2')).toEqual({ kind: 'comprar', item: 'pocao de cura', qty: 2 });
    expect(parseCommand('!comprar')).toEqual({ kind: 'comprar', item: '', qty: 1 });
    expect(parseCommand('!comprar pocao 0')).toEqual({ kind: 'comprar', item: 'pocao', qty: 0 });
  });

  it('usar e o atalho !pocao', () => {
    expect(parseCommand('!usar pocao')).toEqual({ kind: 'usar', item: 'pocao' });
    expect(parseCommand('!usar')).toEqual({ kind: 'usar', item: '' });
    expect(parseCommand('!pocao')).toEqual({ kind: 'usar', item: 'pocao' });
    expect(parseCommand('!Poção')).toEqual({ kind: 'usar', item: 'pocao' });
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/commands` → FAIL.

- [ ] **Step 3: Implementar** — no tipo `Command`, acrescentar:

```ts
  | { kind: 'loja' }
  | { kind: 'comprar'; item: string; qty: number }
  | { kind: 'usar'; item: string }
  | { kind: 'inventario' }
```

no `ALIASES`:

```ts
  ['loja', 'loja'],
  ['comprar', 'comprar'],
  ['usar', 'usar'],
  ['pocao', 'pocao'],
  ['inventario', 'inventario'],
  ['mochila', 'inventario'],
```

no `switch (name)`, junto do grupo `case 'despertar': … return { kind: name };`, acrescentar `case 'loja':` e `case 'inventario':`; e antes do `default`:

```ts
    case 'comprar': {
      const tokens = arg ? arg.split(/\s+/) : [];
      const last = tokens[tokens.length - 1];
      const qty = last !== undefined && /^\d+$/.test(last) ? Number(tokens.pop()) : 1;
      return { kind: 'comprar', item: tokens.join(' '), qty };
    }
    case 'usar':
      return { kind: 'usar', item: arg };
    case 'pocao':
      return { kind: 'usar', item: 'pocao' };
```

- [ ] **Step 4: Rodar** — `npx vitest run tests/commands` e `npx tsc --noEmit` → PASS / exit 0. (O `tsc` vai apontar que o `GameService` não trata as variantes novas só se o `switch` dele exigir exaustividade; ele tem `default`, então passa.)

- [ ] **Step 5: Commit** — `git add despertar/src/commands despertar/tests/commands && git commit -m "feat(despertar): comandos da loja no parser"`

---

### Task 5: Textos e `GameService`

**Files:**
- Modify: `despertar/src/game/messages.ts`, `despertar/src/game/game-service.ts`
- Test: `despertar/tests/game/messages.test.ts`, `despertar/tests/game/game-service.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces (em `msg`): `shop(n, rank, entries: { id: string; label: string; description: string; price: number }[])`, `bought(n, label, qty, total, owned, goldLeft)`, `notEnoughGold(n, label, qty, total, gold)`, `buyQty(n, max)`, `buyUsage(n)`, `itemNotFound(n)`, `useUsage(n)`, `noItem(n, label)`, `healed(n, label, left)`, `nothingToHeal(n, label)`, `inventory(n, gold, items: { label: string; qty: number }[])`.

- [ ] **Step 1: Testes que falham**

Em `tests/game/messages.test.ts`, dentro do `describe('msg', …)`:

```ts
  it('loja, compra e inventário', () => {
    expect(msg.shop('ana', 1, [{ id: 'pocao', label: 'Poção de Cura', description: 'zera tudo', price: 13 }])).toBe(
      '@ana 🛒 Loja (preços do Rank E): Poção de Cura — 13 ouro (zera tudo) · use !comprar pocao [quantidade]',
    );
    expect(msg.bought('ana', 'Poção de Cura', 2, 26, 3, 4)).toBe(
      '@ana 🧪 comprou 2× Poção de Cura por 26 ouro. Agora tem 3 · ouro: 4',
    );
    expect(msg.inventory('ana', 4, [])).toBe('@ana 🎒 4 ouro · nenhum item');
    expect(msg.inventory('ana', 4, [{ label: 'Poção de Cura', qty: 3 }])).toBe('@ana 🎒 4 ouro · Poção de Cura ×3');
  });

  it('ajuda lista os comandos da loja', () => {
    expect(msg.help()).toContain('!loja');
    expect(msg.help()).toContain('!usar pocao');
  });
```

Em `tests/game/game-service.test.ts`: adicionar `import { itemPrice } from '../../src/core/shop';` e, no `describe('GameService', …)`:

```ts
  it('loja mostra o preço para o rank de quem pede', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!loja')[0]).toContain(`${itemPrice('pocao', 0, b)} ouro`);
  });

  it('comprar sem ouro suficiente', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!comprar pocao')[0]).toContain('ouro insuficiente');
  });

  it('comprar desconta o ouro e guarda as poções', () => {
    const { repo, b, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 100 });
    expect(say(ana, '!comprar pocao 3')[0]).toContain('3×');
    expect(repo.getHunter('u-ana')!.gold).toBe(100 - 3 * itemPrice('pocao', 0, b));
    expect(repo.getItems('u-ana')).toEqual({ pocao: 3 });
  });

  it('comprar: quantidade fora do limite, item que não existe e sem item', () => {
    const { b, say, awaken } = setup();
    awaken(ana);
    expect(say(ana, `!comprar pocao ${b.shop.maxPerPurchase + 1}`)[0]).toContain('quantidade inválida');
    expect(say(ana, '!comprar espada')[0]).toContain('não existe');
    expect(say(ana, '!comprar')[0]).toContain('!comprar pocao');
  });

  it('usar poção zera as três esperas, sem cooldown próprio', () => {
    const { repo, rng, clock, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({
      ...repo.getHunter('u-ana')!,
      lastHuntAt: clock.now(), injuredUntil: clock.now() + 600_000, reevalBlockedUntil: clock.now() + 600_000,
    });
    repo.setItemQty('u-ana', 'pocao', 2);
    const out = say(ana, '!usar pocao')[0];
    expect(out).toContain('zerados');
    expect(out).toContain('Restam 1');
    expect(repo.getHunter('u-ana')).toMatchObject({ lastHuntAt: null, injuredUntil: null, reevalBlockedUntil: null });
    rng.push(...WIN);
    expect(say(ana, '!cacar')[0]).toContain('venceu');
    expect(say(ana, '!pocao')[0]).toContain('Restam 0');
  });

  it('sem espera ativa a poção não é gasta', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.setItemQty('u-ana', 'pocao', 1);
    expect(say(ana, '!usar pocao')[0]).toContain('guardada');
    expect(repo.getItems('u-ana')).toEqual({ pocao: 1 });
  });

  it('usar sem ter poção', () => {
    const { say, awaken } = setup();
    awaken(ana);
    expect(say(ana, '!usar pocao')[0]).toContain('não tem');
  });

  it('inventário mostra ouro e itens', () => {
    const { repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 42 });
    repo.setItemQty('u-ana', 'pocao', 2);
    const out = say(ana, '!inventario')[0];
    expect(out).toContain('42 ouro');
    expect(out).toContain('Poção de Cura ×2');
  });

  it('pausado: comprar e usar bloqueados; loja e inventário liberados', () => {
    const { game, repo, say, awaken } = setup();
    awaken(ana);
    repo.saveHunter({ ...repo.getHunter('u-ana')!, gold: 100 });
    game.admin('pausar');
    expect(say(ana, '!comprar pocao')).toEqual([]);
    expect(say(ana, '!usar pocao')).toEqual([]);
    expect(say(ana, '!loja')).toHaveLength(1);
    expect(say(ana, '!inventario')).toHaveLength(1);
  });

  it('fim da temporada zera os itens', () => {
    const { game, repo, awaken } = setup();
    awaken(ana);
    repo.setItemQty('u-ana', 'pocao', 3);
    game.admin('encerrar-temporada');
    expect(repo.getItems('u-ana')).toEqual({});
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/game` → FAIL.

- [ ] **Step 3: `messages.ts`** — dentro do objeto `msg`, antes de `paused`:

```ts
  shop: (n: string, rank: number, entries: { id: string; label: string; description: string; price: number }[]) =>
    `${at(n)} 🛒 Loja (preços do Rank ${R(rank)}): ` +
    entries.map((e) => `${e.label} — ${e.price} ouro (${e.description})`).join(' · ') +
    ` · use !comprar ${entries[0]?.id ?? 'item'} [quantidade]`,
  bought: (n: string, label: string, qty: number, total: number, owned: number, goldLeft: number) =>
    `${at(n)} 🧪 comprou ${qty}× ${label} por ${total} ouro. Agora tem ${owned} · ouro: ${goldLeft}`,
  notEnoughGold: (n: string, label: string, qty: number, total: number, gold: number) =>
    `${at(n)} ouro insuficiente: ${qty}× ${label} custa ${total} e você tem ${gold}.`,
  buyQty: (n: string, max: number) => `${at(n)} quantidade inválida: compre de 1 a ${max} por vez.`,
  buyUsage: (n: string) => `${at(n)} use: !comprar pocao [quantidade]`,
  itemNotFound: (n: string) => `${at(n)} esse item não existe. Veja a !loja.`,
  useUsage: (n: string) => `${at(n)} use: !usar pocao`,
  noItem: (n: string, label: string) => `${at(n)} você não tem ${label}. Compre na !loja.`,
  healed: (n: string, label: string, left: number) =>
    `${at(n)} 🧪 usou ${label}: descanso, lesão e reavaliação zerados! Restam ${left}.`,
  nothingToHeal: (n: string, label: string) =>
    `${at(n)} você já está pronto pra caçar; a ${label} ficou guardada.`,
  inventory: (n: string, gold: number, items: { label: string; qty: number }[]) =>
    `${at(n)} 🎒 ${gold} ouro · ` +
    (items.length > 0 ? items.map((i) => `${i.label} ×${i.qty}`).join(' · ') : 'nenhum item'),
```

e trocar o `help` por:

```ts
  help: () =>
    'Comandos: !despertar · !cacar · !status · !reavaliar · !ranking [eu] · !titulos · !titulo <n> · !temporada · !loja · !comprar pocao [qtd] · !usar pocao · !inventario',
```

- [ ] **Step 4: `game-service.ts`**

Import: `import { buyItem, findItem, healHunter, itemIds, itemPrice } from '../core/shop';`

`BLOCKED_WHEN_PAUSED`:

```ts
const BLOCKED_WHEN_PAUSED = new Set<Command['kind']>(['despertar', 'cacar', 'reavaliar', 'comprar', 'usar']);
```

Em `rollSeason`, dentro da transação, depois do `for (const h of result.resetHunters) …`:

```ts
      repo.clearAllItems();
```

No segundo `switch (cmd.kind)` de `dispatch`, antes do `default`:

```ts
      case 'loja':
        return [this.shop(h)];
      case 'comprar':
        return [this.buy(h, cmd.item, cmd.qty)];
      case 'usar':
        return [this.useItem(h, cmd.item, now)];
      case 'inventario':
        return [this.inventory(h)];
```

Métodos novos, no fim da classe:

```ts
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
```

- [ ] **Step 5: Rodar** — `npx vitest run` e `npx tsc --noEmit` → PASS / exit 0.

- [ ] **Step 6: Commit** — `git add despertar/src/game despertar/tests/game && git commit -m "feat(despertar): loja, compra, poção e inventário no jogo"`

---

### Task 6: Tela de teste local + verificação

**Files:**
- Modify: `despertar/src/web/server.ts`, `despertar/web/index.html`
- Test: `despertar/tests/web/server.test.ts`

**Interfaces:**
- Produces: `HunterView.potions: number`; `TestBench.giveGold(name: string, amount: number): boolean`; rota `POST /api/give-gold { name, amount }` (só na bancada local; 1 a 100000; 404 se a pessoa não despertou).

- [ ] **Step 1: Testes que falham** — em `tests/web/server.test.ts`:

```ts
  it('mostra poções e dá ouro de teste', async () => {
    rng.push(0);
    await command('ana', '!despertar');
    expect((await post('/api/give-gold', { name: 'ana', amount: 500 })).status).toBe(200);
    await command('ana', '!comprar pocao 2');
    const s = (await (await fetch(base + '/api/state')).json()) as { hunters: { potions: number; gold: number }[] };
    expect(s.hunters[0].potions).toBe(2);
    expect((await post('/api/give-gold', { name: 'ninguem', amount: 5 })).status).toBe(404);
    expect((await post('/api/give-gold', { name: 'ana', amount: -5 })).status).toBe(400);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/web` → FAIL.

- [ ] **Step 3: `server.ts`**

`HunterView` ganha `potions: number;`. Em `view(...)`, no objeto devolvido: `potions: this.repo.getItems(h.userId).pocao ?? 0,`.

Método novo em `TestBench`:

```ts
  /** Só na bancada local: dá ouro para testar a loja sem caçar por horas. */
  giveGold(name: string, amount: number): boolean {
    const h = this.repo.getHunter(`web:${name.toLowerCase()}`);
    if (!h) return false;
    this.repo.saveHunter({ ...h, gold: h.gold + amount });
    return true;
  }
```

Rota nova em `createHandler`, antes do `throw new HttpError(404, …)`:

```ts
      if (req.method === 'POST' && path === '/api/give-gold') {
        const { name, amount } = await readJson(req);
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) throw new HttpError(400, 'Nome inválido.');
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 100_000) {
          throw new HttpError(400, 'Quantidade de ouro inválida.');
        }
        if (!bench.giveGold(name, amount)) throw new HttpError(404, 'Essa pessoa ainda não despertou.');
        return json(res, 200, bench.state());
      }
```

- [ ] **Step 4: `web/index.html`**

Na segunda linha de botões rápidos (depois de `!ajuda`), acrescentar:

```html
        <button type="button" data-cmd="!loja">!loja</button>
        <button type="button" data-cmd="!comprar pocao">!comprar pocao</button>
        <button type="button" data-cmd="!usar pocao">!usar pocao</button>
        <button type="button" data-cmd="!inventario">!inventario</button>
        <button type="button" id="give-gold">+100 ouro (teste)</button>
```

No `<thead>`, depois de `<th>Ouro</th>`: `<th>Poções</th>`. No array `cells` do `render`, depois de `h.gold,`: `h.potions,` — e ajustar o índice da classe `status` de `7` para `8`.

No script, depois dos listeners de `[data-admin]`:

```js
  $('give-gold').addEventListener('click', () => {
    const name = $('name').value.trim();
    queue = queue.then(async () => {
      try {
        render(await api('/api/give-gold', { name, amount: 100 }));
        line('sys', '', `💰 +100 ouro para ${name} (só na bancada de teste)`);
      } catch (err) {
        line('err', '', err.message);
      }
    });
  });
```

- [ ] **Step 5: Rodar** — `npx vitest run` e `npx tsc --noEmit` → PASS / exit 0.

- [ ] **Step 6: Playtest no console**

```bash
rm -f data/console.db*
printf 'ana: !despertar\nana: !loja\nana: !comprar pocao\nana: !inventario\nana: !usar pocao\nana: !ajuda\n' | npx tsx src/main.ts --console
rm -f data/console.db*
```

Esperado: loja com o preço do Rank F, "ouro insuficiente" (ana começa com 0), inventário "nenhum item", "você não tem Poção de Cura", ajuda com os comandos novos.

- [ ] **Step 7: Playtest no navegador** — reiniciar o servidor `despertar-web` (o código mudou) e, **sem clicar em Resetar** (pode haver partida do usuário), usar um nome novo: `!despertar`, `+100 ouro`, `!comprar pocao`, `!cacar`, `!cacar` (descansando), `!usar pocao`, `!cacar` (vence de novo). Conferir a coluna Poções.

- [ ] **Step 8: Commit** — `git add despertar/src/web despertar/web despertar/tests/web && git commit -m "feat(despertar): loja na tela de teste local"`

---

## Checkpoints

1. Depois da Task 2 (regras puras prontas).
2. Depois da Task 5 (jogo completo no chat).
3. Depois da Task 6 (tela local + verificação), seguido de merge no `master` com a suíte rodando no resultado.

## Cobertura da spec (seção 14)

| Requisito | Task |
|---|---|
| `!loja` com preço do rank | 4, 5 |
| `!comprar pocao [qtd]`, 1 a 10 | 2, 4, 5 |
| `!usar pocao` / `!pocao` / `!poção` | 4, 5 |
| `!inventario` / `!mochila` | 4, 5 |
| Sem cooldown; zera as três esperas | 2, 5 |
| Não gasta sem espera ativa | 2, 5 |
| Preço > maior vitória (crítico incluso), validado | 1, 2 |
| Bloqueio com jogo pausado | 5 |
| Itens zeram no fim da temporada | 3, 5 |
| Catálogo genérico + tabela `hunter_items` | 1, 3 |
| Tela local com poções e botões | 6 |
