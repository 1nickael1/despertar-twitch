# Despertar v4 — Overlay no OBS: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Objetivo:** coluna lateral no OBS com ranking (top 5) e raid, visual de janela de sistema,
alimentada por SSE com o estado completo do painel.

**Spec:** [../specs/2026-11-09-despertar-v4-overlay-design.md](../specs/2026-11-09-despertar-v4-overlay-design.md)
**Mockup aprovado:** estados "sem raid", "raid em andamento", "entrada" e "vitória" (visual da seção 3.5 da spec).

## Restrições globais

- Nomes vêm do chat: a página monta tudo com `textContent`/`createElement`, **nunca `innerHTML`** com dados.
- Servidores só em `127.0.0.1`. O overlay não recebe comandos.
- Erro no overlay nunca derruba o bot (try/catch e log).
- `npm test` e `npx tsc --noEmit` antes de cada commit; commits com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Interfaces

```ts
// game-service.ts
export type RaidOutcome = 'vitoria' | 'derrota' | 'todos-caidos' | 'quebra' | 'vazio';
export interface RaidEnding { type: PortalType; bossName: string; outcome: RaidOutcome; hp: number; maxHp: number;
  rewards: RaidReward[]; participants: RaidParticipant[]; endedAt: number }
get lastRaidRound(): RoundReport | null      // zera ao abrir portal, ao terminar e ao cancelar
get lastRaidEnding(): RaidEnding | null      // não muda no cancelamento

// overlay/snapshot.ts
export interface OverlaySnapshot { ... }     // spec 4.1
export function buildOverlaySnapshot(game: GameService, repo: GameRepository, b: Balance, now: number): OverlaySnapshot

// overlay/hub.ts
export class OverlayHub { constructor(snapshot: () => OverlaySnapshot); connect(res: ServerResponse): void;
  publish(): void; keepAlive(): void; get clientCount(): number; close(): void }

// overlay/server.ts
export function handleOverlayRoute(req, res, hub, getHtml: () => string): boolean
export function startOverlayServer(hub, getHtml, port: number): Server
```

## Tasks

### Task 1: Config e resumos da raid no jogo
- `balance.json`: `"overlay": { "resultMs": 20000, "rankingSize": 5 }`; schema com `resultMs` int > 0 e `rankingSize` int 1–10.
- `GameService`: `lastRound` (setado a cada rodada; `null` em `openPortal`, `finishRaid`, `cancelRaid`) e `lastEnding` (em `finishRaid`, com o desfecho: `vazio` para azul/vermelho sem ninguém, `quebra`, `vitoria`, `todos-caidos`, `derrota`).
- Testes em `tests/game/game-service-raid.test.ts`: `lastRaidRound` após uma rodada e `null` no fim; `lastRaidEnding` para vitória, vazio, quebra vazia e cancelamento (fica `null`).

### Task 2: `buildOverlaySnapshot`
- `tests/overlay/snapshot.test.ts`: sem raid (top 5 de 7, ordem do ranking, próximo portal, pausado); entrada (participantes com classe); batalha (`round`, `nextRoundAt`, `lastRound`, caído); vitória (pódio top 3 com classe, fragmentos 1/2, `until`); some depois de 20 s; derrota; `vazio`.

### Task 3: `OverlayHub` e rotas
- `tests/overlay/hub.test.ts` com resposta falsa: envia o estado ao conectar; `publish` não reenvia igual (mesmo com `serverNow` diferente); reenvia quando muda; remove cliente no `close`.
- `handleOverlayRoute`: `GET /overlay` (HTML, `no-store`), `GET /overlay/events` (SSE); outras rotas → `false`.

### Task 4: Ligar no bot e na tela de teste
- `main.ts`: repositório numa variável; hub + servidor em `DESPERTAR_OVERLAY_PORT` (3220); `publish` depois de comando do chat, do terminal e do `tick()`; keep-alive a cada 15 s; fecha no SIGINT.
- `web/server.ts`: `TestBench.overlaySnapshot()` e `pulse()` (tick sem perder anúncios + publish); `createHandler` aceita o hub e serve as rotas; `web/main.ts` chama `pulse()` a cada 1 s.
- `web/index.html`: link "Abrir overlay".
- Testes em `tests/web/server.test.ts`: `/overlay` serve o HTML; `/overlay/events` manda `data:` com o ranking.

### Task 5: `web/overlay.html`
- A partir do mockup: janelas de ranking, entrada, batalha e resultado; contagens com o relógio corrigido por `serverNow`; barra de HP com transição; `?lado=esquerda`; animação de entrada ≤ 300 ms.

### Task 6: Conferir e fechar
- Tela de teste: abrir `/overlay` no navegador, passar por sem raid → `/portal` → `!raid` → rodadas → vitória/derrota; screenshots.
- ROADMAP (v4 ✅, plano), commit, perguntar sobre o merge.
