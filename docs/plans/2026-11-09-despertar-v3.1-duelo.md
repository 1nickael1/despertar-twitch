# Despertar v3.1 — Duelo: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans (ou subagent-driven-development).
> Passos com checkbox (`- [ ]`).

**Objetivo:** `!duelo @nome [ouro]` → o alvo `!aceitar`/`!recusar` em 60 s → melhor de 3
(atributo + arma + defesa da armadura + d20); o vencedor leva a aposta. Com 2+ ranks de diferença,
só pela honra.

**Arquitetura:** regras puras em `src/core/duel.ts`; `GameService` guarda desafios pendentes (por
desafiado) e cooldowns em memória e expira desafios no `tick()`. Sem migração.

**Spec:** [../specs/2026-11-09-despertar-v3.1-duelo-design.md](../specs/2026-11-09-despertar-v3.1-duelo-design.md)

## Restrições globais

- Sorteios por rodada: d20 do desafiante, depois do desafiado; empate repete a rodada.
- Resultado e anúncios numa mensagem só (≤ 500 caracteres).
- `!duelo`, `!aceitar` e `!recusar` bloqueados com o jogo pausado.
- Antes de cada commit: `npm test` e `npx tsc --noEmit`. Commits com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Seção `duel` no balance

`config/balance.json`, depois de `"equipment"`:

```json
  "duel": {
    "acceptMs": 60000,
    "cooldownMs": 120000,
    "armorDefense": { "comum": 1, "forjada": 2 },
    "roundsToWin": 2,
    "fairRankGap": 1
  },
```

`src/config/balance.ts`:

```ts
const duelSchema = z.object({
  acceptMs: z.number().int().positive(),
  cooldownMs: z.number().int().nonnegative(),
  armorDefense: z.object({ comum: z.number().int().nonnegative(), forjada: z.number().int().nonnegative() }),
  roundsToWin: z.number().int().min(1),
  fairRankGap: z.number().int().min(0).max(6),
});
```

e `duel: duelSchema,` no `balanceSchema`.

- [ ] Teste (`tests/config/balance.test.ts`): carrega `duel` com `acceptMs` 60000, `armorDefense.forjada` 2; recusa `roundsToWin: 0` (`/duel\.roundsToWin/`).
- [ ] Implementar, `npm test`, `npx tsc --noEmit`, commit `feat(duelo): seção duel no balance.json`.

### Task 2: `core/duel.ts`

**Interfaces:**
- `duelStake(a: Pick<Hunter,'rank'>, c: Pick<Hunter,'rank'>, bet: number, b): number` — `bet` se `|rank a − rank c| ≤ fairRankGap`, senão 0.
- `armorDefense(h: Pick<Hunter,'armorId'>, b): number` — pela qualidade da armadura equipada; 0 sem armadura.
- `duelBase(h, b): number` — `primaryStat + weaponBonus + armorDefense`.
- `interface DuelRound { challenger: number; target: number }`
- `interface DuelResult { rounds: DuelRound[]; challengerWins: number; targetWins: number; winner: 'challenger' | 'target' }`
- `resolveDuel(challenger: Hunter, target: Hunter, b, rng): DuelResult` — empates não entram em `rounds`.
- `settleDuel(winner: Hunter, loser: Hunter, stake: number): { winner: Hunter; loser: Hunter }`

**Testes (`tests/core/duel.test.ts`)**, com Guerreiro F1 (base 8) e Mago F1 (base 7):
- `duelStake`: gap 0 e 1 → aposta; gap 2 → 0.
- `armorDefense`: nada 0, `armadura-f-comum` 1, `armadura-f-forjada` 2; `duelBase` Guerreiro com arma e armadura forjadas = 12.
- 2×0: `[d20(10), d20(1), d20(10), d20(1)]` → rounds `[{18, 8}, {18, 8}]`, challenger vence, `rng.remaining` 0.
- empate repete e 2×1: `[d20(5), d20(6), d20(1), d20(20), d20(20), d20(1), d20(20), d20(1)]` → 3 rodadas contadas (13×13 descartada), `challengerWins` 2, `targetWins` 1.
- `settleDuel` move a aposta.

- [ ] Testes que falham → implementar → `npm test`/`tsc` → commit `feat(duelo): regras do duelo`.

### Task 3: Comandos e mensagens

`parse.ts`: `{ kind: 'duelo'; target: string | null; bet: number | null }`, `{ kind: 'aceitar' }`, `{ kind: 'recusar' }`.
`!duelo @Bia 20` → `{ target: 'bia', bet: 20 }`; `!duelo bia` → bet 0; `!duelo`, `!duelo @bia abc`,
`!duelo @bia -5`, `!duelo @bia 5 x` → `{ target: null, bet: null }`.

`messages.ts` (`msg`): `duelUsage(n)`, `duelSelf(n)`, `duelNoTarget(n, target)`, `duelInRaid(n)`,
`duelCooldown(n, ms)`, `duelTargetCooldown(n, target, ms)`, `duelPending(n)`, `duelNoGold(n, who, stake)`,
`duelChallenge(challenger, target, stake, gapHonor, acceptMs)`, `duelNone(n)`, `duelRefused(target, challenger)`,
`duelExpired(challenger, target)`, `duelCancelledRaid(c, t)`, `duelCancelledGold(c, t, stake)`,
`duelResult(c, t, stake, result)`; `help` cita `!duelo @nome [ouro]`.

Textos exatos testados:
- `duelChallenge('ana','bia',20,false,60000)` → `⚔️ @ana desafiou @bia para um duelo valendo 20 ouro! @bia: !aceitar ou !recusar (1min)`
- `duelChallenge('ana','caio',0,true,60000)` contém `só pela honra (2+ ranks de diferença)`
- `duelResult('ana','bia',20,{rounds:[{challenger:23,target:19},{challenger:15,target:22},{challenger:26,target:18}],challengerWins:2,targetWins:1,winner:'challenger'})` →
  `⚔️ DUELO ana × bia (20 ouro) · R1: ana 23 × 19 bia · R2: ana 15 × 22 bia · R3: ana 26 × 18 bia · 🏆 ana venceu por 2×1 e levou 40 ouro!`
- com aposta 0: `(só pela honra)` e sem "e levou".
- `help()` com ≤ 500 caracteres.

- [ ] Testes → implementar → commit `feat(duelo): comandos e textos do duelo`.

### Task 4: Duelo no `GameService`

Estado: `pendingDuels: Map<targetId, { challengerId, targetId, stake, expiresAt }>`,
`duelCooldownUntil: Map<userId, number>`. `BLOCKED_WHEN_PAUSED` ganha `duelo`, `aceitar`, `recusar`.
`tick()` chama `expireDuels(now)` logo depois de `ensureSeason` (antes do retorno de pausado).

Ordem das recusas do `!duelo` (spec 3.1): uso → si mesmo → não despertou → raid → cooldown (próprio,
depois do alvo) → pendente → ouro (depois da regra de rank). `!aceitar`: confere raid e ouro dos dois;
se falhar, cancela com o motivo; senão resolve, grava os dois numa transação e põe os dois em cooldown.

**Testes (`tests/game/game-service-duel.test.ts`)**, com ana e bia Guerreiras e caio:
1. Recusas: uso, si mesmo, não despertou, sem ouro do desafiante e do alvo.
2. Desafio + aceite com `[d20(10), d20(1), d20(10), d20(1)]` → texto exato 2×0, ana 50 e bia 10 de ouro; novo `!duelo` de ana → cooldown; de caio contra bia → cooldown do alvo.
3. Pendente e recusa: caio desafiando bia com desafio pendente → "pendente"; `!recusar` → "recusou"; `!aceitar` depois → "nenhum desafio".
4. Expiração: `tick()` 60 s depois → "expirou"; `!aceitar` → "nenhum desafio".
5. Honra: caio Rank D; `!duelo @caio 20` → "só pela honra (2+ ranks"; ouro de ninguém muda.
6. Ouro re-checado no aceite: ana zera o ouro antes de bia aceitar → "cancelado", sem sorteio.
7. Raid: ana dentro de um portal → "portal".
8. Pausado: `!duelo @bia` → nenhuma resposta.

- [ ] Testes → implementar → commit `feat(duelo): desafio, aceite, recusa, expiração e cooldown no jogo`.

### Task 5: Tela local, simulação e ROADMAP

- `web/index.html`: botões `!aceitar` e `!recusar` depois de `!forjar armadura`.
- `scripts/sim.ts`: tabela "Duelo (Guerreiros)" com a chance de vitória do desafiante em 5.000 duelos:
  F nv3 × F nv3, F nv5 × F nv1, E nv5 × F nv5, E nv10 × F nv5, F nv3 forjado × F nv3.
- `docs/ROADMAP.md`: v3.1 ✅ e o plano na tabela de documentos.
- Conferir na tela local: dois nomes, `!duelo @nome 10`, `!aceitar`.
- [ ] `npm test`/`tsc`/`npm run sim` → commit `feat(duelo): tela local, simulação e ROADMAP`.
