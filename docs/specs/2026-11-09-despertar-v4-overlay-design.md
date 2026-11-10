# Despertar v4 — Overlay no OBS (design)

> Data: 2026-11-09. Status: **aguardando revisão**.
> Base: specs anteriores; a raid é a da v2 ([portais](2026-11-09-despertar-v2-portais-design.md)).

## 1. Visão geral

Uma página aberta no OBS como **Fonte de Navegador** mostra, numa coluna na lateral direita da
tela, o **ranking** da temporada e a **raid** em andamento, no visual de "janela de sistema" de
manhwa. A página só exibe: ninguém comanda o jogo por ela.

### Decisões tomadas com o streamer

| Tema | Decisão |
|---|---|
| Posição | Página de **400×800** que é só o painel; posição e tamanho se ajustam direto na fonte do OBS (lateral direita da tela) |
| Conteúdo | Só **raid** e **ranking** por enquanto |
| Som | Nenhum por enquanto |
| Personagens | **Ícone de classe** (sem foto da Twitch) |
| Visual | Janela de sistema: painel escuro translúcido, borda ciano luminosa, cantos marcados (mockup aprovado) |
| Ranking | **Top 5**; **some durante a raid** (só a raid aparece) |
| Envio dos dados | O bot manda o **estado completo do painel** a cada mudança (SSE); a página só desenha |

## 2. Escopo

### Entra na v4
- Página `web/overlay.html` (400×800, fundo transparente, painel de 380 px com 10 px de margem para o brilho).
- Servidor do overlay dentro do processo do bot: `http://127.0.0.1:3220/overlay` (só nesta máquina).
- Mesma página na tela de teste local, com link "Abrir overlay", ligada ao jogo de teste.
- Guardar no jogo o resumo da última rodada e o resultado da raid (hoje só viram texto).

### Fora da v4
- Som, fotos de perfil da Twitch, duelo, avisos de nível/rank/forja, ranking animado entre posições.

## 3. O que aparece

### 3.1 Sem raid
- Janela **"Ranking · Temporada N"** com o top 5: posição (1º–3º em dourado), ícone de classe,
  nome, rank, nível e XP (a ordem do ranking).
- Rodapé: **"Próximo portal em mm:ss"** (contando na página); com o jogo pausado, **"Jogo pausado"**.
- Ninguém despertou: "Aguardando caçadores. Digite !despertar".

### 3.2 Portal aberto (entrada)
- O ranking sai. Janela **"Alerta do sistema"** com a borda na cor do portal (azul, vermelho, âmbar
  para a quebra), o tipo do portal, o boss e o HP.
- Contagem regressiva da entrada e "Digite !raid para entrar · N caçadores".
- Lista de quem entrou, com o ícone de classe.

### 3.3 Batalha
- "Rodada X/15 · próxima em 0:SS" no título.
- **Barra de HP** do boss (anima quando cai) e "HP atual / máximo".
- Caçadores com ícone e dano total; quem está caído fica riscado, com o ícone vermelho.
- Linha da última rodada: dano do grupo, quem usou `!atacar`, quem caiu ou levantou.

### 3.4 Fim da raid (por 20 s)
- **Vitória:** "Portal limpo", pódio (top 3) com dano, XP e ouro, e a nota de fragmentos ("💎 +1 cada (1º +2)").
- **Derrota:** "O tempo acabou", com o HP que sobrou. **Todos caídos:** "Todos caíram". **Quebra:**
  "Quebra de portal — todos lesionados por 10 min".
- **Ninguém entrou** (azul/vermelho): "O portal se fechou".
- Cancelada (pausa ou virada de temporada): o painel volta direto ao ranking.
- Depois de `overlay.resultMs` (20 s), volta o ranking.

### 3.5 Visual
- Painel `rgba(6, 14, 30, .84)`, borda 1 px ciano com brilho, cantos em "L", títulos em
  maiúsculas espaçadas; fontes Rajdhani e JetBrains Mono (Google Fonts, com fonte do sistema de reserva).
- Ícones de classe em SVG embutido: espada (Guerreiro), cajado (Mago), adaga (Assassino), cruz
  (Curandeiro), escudo (Tanque).
- Janela entra com uma animação curta (≤ 300 ms); nada pisca em loop.

## 4. Arquitetura

```
 GameService ──► buildOverlaySnapshot() ──► OverlayHub ──SSE──► web/overlay.html (OBS)
 (handle / admin / tick)                    (só envia se mudou)
```

### 4.1 Estado do painel (`OverlaySnapshot`)

```ts
interface OverlaySnapshot {
  serverNow: number;                 // a página corrige o relógio dela por esta diferença
  paused: boolean;
  season: number;
  nextPortalAt: number | null;
  ranking: { name: string; classId: ClassId; rank: RankLetter; level: number; xp: number }[]; // top 5
  raid: null | {
    type: PortalType; bossName: string; hp: number; maxHp: number;
    phase: 'entrada' | 'batalha'; battleStartsAt: number; round: number; totalRounds: number; nextRoundAt: number | null;
    participants: { name: string; classId: ClassId; damage: number; down: boolean }[];
    lastRound: RoundReport | null;
  };
  result: null | {
    type: PortalType; bossName: string;
    outcome: 'vitoria' | 'derrota' | 'todos-caidos' | 'quebra' | 'vazio';
    hp: number; maxHp: number;
    podium: { name: string; classId: ClassId; damage: number; xp: number; gold: number }[]; // top 3
    fragmentsEach: number; fragmentsTop: number;
    until: number;                   // até quando mostrar
  };
}
```

### 4.2 Mudanças no jogo
- `GameService` guarda `lastRound` (último `RoundReport` da raid atual; zera quando a raid acaba) e
  `lastResult` (resumo do fim da raid, com `until = fim + overlay.resultMs`). Cancelamento não gera resultado.
- `src/overlay/snapshot.ts` (novo): `buildOverlaySnapshot(game, repo, balance, now)` — sem I/O além
  da leitura do repositório.
- `balance.json`: `overlay: { resultMs: 20000, rankingSize: 5 }`.

### 4.3 Servidor
- `src/overlay/hub.ts` (novo): `OverlayHub` guarda os clientes SSE, manda o estado ao conectar e,
  em `publish(snapshot)`, só envia se o JSON mudou (ignorando `serverNow`). Comentário de
  "keep-alive" a cada 15 s.
- `src/overlay/server.ts` (novo): `GET /overlay` (o HTML, lido do disco a cada visita) e
  `GET /overlay/events` (SSE). Escuta em `127.0.0.1`, porta `DESPERTAR_OVERLAY_PORT` (padrão 3220).
- `main.ts`: sobe o servidor do overlay e chama `publish` depois de cada comando do chat, comando
  do terminal e `tick()`. Erro no overlay é registrado e não derruba o bot.
- Tela de teste (`web/server.ts`): as mesmas duas rotas, ligadas ao jogo de teste (o relógio
  adiantado vale também para o overlay), e o link "Abrir overlay" na página.

### 4.4 Página (`web/overlay.html`)
- HTML/CSS/JS puros, sem dependências. Conecta em `/overlay/events` com `EventSource` (reconecta sozinho).
- Desenha a partir do estado; contagens regressivas com `requestAnimationFrame`/1 s usando
  `serverNow`; a barra de HP anima comparando com o estado anterior.
- Mostra o painel do resultado só enquanto `serverNow-corrigido < result.until`.

## 5. Testes

- `snapshot.ts`: sem raid (ranking top 5, próximo portal, pausado), entrada, batalha (lastRound,
  caídos), resultado de vitória com pódio e fragmentos, derrota, quebra, todos caídos, vazio,
  resultado expirado não aparece.
- `GameService`: `lastRound` atualiza por rodada e zera no fim; `lastResult` em cada desfecho;
  cancelamento não gera resultado.
- `OverlayHub`: envia o estado ao conectar; não reenvia estado igual; envia quando muda.
- Servidor: `/overlay` serve o HTML; `/overlay/events` responde `text/event-stream` com o estado.
- Visual: conferido na tela de teste com o navegador (estados 3.1–3.4).

## 6. Como usar no OBS

1. Rodar o bot (`npm run dev`).
2. OBS → Fontes → **Navegador** → URL `http://127.0.0.1:3220/overlay`, largura **400**, altura **800**.
3. Deixar a fonte por cima da cena do jogo e arrastar/redimensionar no canto que quiser. O fundo é transparente.

## 7. Para depois

- Som, fotos da Twitch, duelo no overlay, avisos de nível/rank/forja, ranking animado.
