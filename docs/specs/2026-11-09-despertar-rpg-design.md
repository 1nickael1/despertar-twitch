# Despertar — RPG de chat com ranks F→S (design)

> Nome provisório. Data: 2026-11-09. Status: **aguardando revisão**.
> Código ficará em `despertar/` dentro deste workspace.

## 1. Visão geral

Jogo de RPG para o chat da Twitch, inspirado no gênero manhwa de "caçadores ranqueados".
Portais surgem durante a live; cada viewer desperta como **Caçador Rank F** e progride
até o **Rank S** por meio de **ações** (caçadas, testes de reavaliação, e nas versões
futuras raids e duelos). Assistir parado não dá XP.

### Decisões já tomadas

| Tema | Decisão |
|---|---|
| Onde o jogo acontece | Começa só no chat (v1–v3); overlay no OBS na v4, reaproveitando o mesmo núcleo |
| Stack | TypeScript / Node.js |
| Hospedagem | Roda no PC do streamer durante as lives; SQLite local atrás de uma interface de repositório, migrável para servidor depois |
| Progressão | Temporadas de **14 dias** (configurável); reset ao fim; títulos ficam no inventário para sempre |
| XP | Apenas por ação |
| Combate | Atributos por classe + d20 |

## 2. Escopo

### v1 — "Despertar" (este documento detalha)
- Comandos: `!despertar`, `!cacar`, `!status`, `!reavaliar`, `!ranking`, `!titulos`, `!titulo`, `!temporada`, `!ajuda`
- Comandos de administração **só pelo terminal do bot** (nunca pelo chat, nem de mods nem do dono do canal): `/pausar`, `/retomar`, `/encerrar-temporada`
- Ranks F→S, 5 classes, combate por fórmula, lesão, reavaliação, Re-despertar
- Temporadas, Hall da Fama, inventário de títulos
- Cooldowns, fila de mensagens com limite de taxa
- Arquivo de balanceamento + script de simulação
- Cliente de console para testar sem Twitch

### Fora da v1 (roadmap — seção 12)
Raids/portais (v2), equipamento/loja/duelos (v3), overlay (v4).

## 3. Arquitetura

```
 Twitch chat ──► ChatClient (adaptador) ──► CommandParser ──► GameService ──► ChatClient.say()
 Console     ──┘                                                 │
                                                                 ├─► core/ (regras puras)
                                                                 ├─► GameRepository (interface)
                                                                 │      ├─ SqliteGameRepository
                                                                 │      └─ MemoryGameRepository (testes)
                                                                 ├─► Clock (interface)
                                                                 └─► Rng (interface, com seed)
```

Princípio: **o núcleo do jogo não sabe que a Twitch existe.** Regras são funções puras
que recebem estado + dado sorteado e devolvem novo estado + evento. Isso permite testar
tudo sem conexão, rodar simulações de balanceamento e, na v4, o overlay consumir os mesmos eventos.

### Módulos

| Pasta | Responsabilidade | Depende de |
|---|---|---|
| `src/core/` | Tipos (`Rank`, `ClassId`, `Hunter`, `Monster`), combate, progressão, reavaliação, temporada. Sem I/O. | `balance` (dados), `Rng` |
| `src/config/` | Carrega e valida `balance.json` (zod) e `.env` | — |
| `src/game/` | `GameService`: recebe `Command` + autor, aplica regras, persiste, devolve `Reply[]` | core, repositório, Clock, Rng |
| `src/data/` | Interface `GameRepository` (caçadores, títulos, temporadas, Hall da Fama) + implementações SQLite e memória | `better-sqlite3` |
| `src/chat/` | Interface `ChatClient`; `TwitchChatClient` (tmi.js) e `ConsoleChatClient`; `OutboundQueue` com limite de taxa | tmi.js |
| `src/commands/` | `parseCommand(texto)` → `Command \| null`, com aliases e acentos | — |
| `scripts/sim.ts` | Simula N jogadores × M ações e imprime curva de progressão e taxa de vitória por rank | core |

Processamento é **serial** (uma fila de comandos de entrada), e `better-sqlite3` é síncrono,
então não há condição de corrida entre comandos do mesmo jogador.

## 4. Modelo de dados (SQLite)

Todas as datas são `INTEGER` em milissegundos desde a época (epoch ms).

**hunters**
| coluna | tipo | nota |
|---|---|---|
| `user_id` | TEXT PK | ID estável da Twitch (não o nome) |
| `display_name` | TEXT | atualizado a cada mensagem |
| `class_id` | TEXT | `guerreiro \| mago \| assassino \| curandeiro \| tanque` |
| `rank` | INTEGER | 0=F … 6=S |
| `level` | INTEGER | |
| `xp` | INTEGER | XP dentro do nível atual |
| `gold` | INTEGER | sem uso na v1 além de exibir (loja na v3) |
| `rank_reached_at` | TEXT | desempate do ranking |
| `last_hunt_at` | TEXT \| NULL | cooldown |
| `injured_until` | TEXT \| NULL | lesão |
| `reeval_blocked_until` | TEXT \| NULL | cooldown após falha |
| `equipped_title_id` | TEXT \| NULL | |
| `season_id` | INTEGER | temporada do progresso atual |

**hunter_titles** — `user_id`, `title_id`, `label`, `season_id`, `earned_at` (PK `user_id`+`title_id`)

**seasons** — `id`, `number`, `started_at`, `ends_at`, `closed_at`

**hall_of_fame** — `season_id`, `position`, `user_id`, `display_name`, `final_rank`, `final_level`

Migrações: arquivos SQL numerados aplicados no boot.

## 5. Regras do jogo

Todos os números abaixo são **ponto de partida** e vivem em `balance.json`.

### 5.1 Ranks e níveis
- Ranks: F, E, D, C, B, A, S.
- Cada rank tem um **nível teto**: F 5 · E 10 · D 15 · C 20 · B 25 · A 30 · S 40.
- XP para subir do nível L para L+1: `20 + 10 × L`.
- **Piso** de um rank = teto do rank anterior (piso do F = 1).
- Ao atingir o teto do rank, o XP extra fica **guardado** (não sobe nível) e o jogador
  pode fazer `!reavaliar`. Ao ser promovido, o XP guardado é aplicado normalmente.
  Rank S não tem reavaliação; o teto 40 serve para disputa de ranking.

### 5.2 Classes

Cada classe tem um **atributo principal** que cresce por nível, mais VIT (resistência a lesão).

| Classe | Principal | Base | Cresc./nível | VIT | Passiva |
|---|---|---|---|---|---|
| Guerreiro | FOR | 8 | 1,5 | 6 | +2 de poder contra monstros de rank acima |
| Mago | INT | 7 | 1,8 | 3 | — (mais forte no fim, mais frágil) |
| Assassino | AGI | 8 | 1,5 | 4 | Crítico em 18–20 no d20: se vencer, XP e ouro ×2 (não garante vitória) |
| Curandeiro | INT | 7 | 1,4 | 5 | Nunca se lesiona; derrota dá 50% do XP |
| Tanque | VIT | 8 | 1,4 | 10 | Chance de lesão fixa em 10% (ignora VIT); derrota dá 25% do XP |

Classe sorteada no `!despertar` e **mantida entre temporadas**.

### 5.3 Combate (`!cacar`)
1. Sorteia o rank do monstro: 70% mesmo rank, 15% um abaixo, 15% um acima (limitado a F–S).
2. Sorteia o monstro de uma lista por rank (nome temático, ex.: "Goblin", "Lobo de Gelo", "Cavaleiro Sem Cabeça").
3. `poderJogador = atributoPrincipal(nível) + passivas + d20`
   `poderMonstro = dificuldade[rankMonstro] + d20`
4. Vitória se `poderJogador ≥ poderMonstro`.
   - XP por rank do monstro: F 10 · E 15 · D 22 · C 32 · B 45 · A 60 · S 80
   - Ouro por rank: F 3 · E 5 · D 8 · C 12 · B 18 · A 25 · S 35
5. Derrota: sem XP (salvo passivas); chance de lesão `max(10%, 50% − VIT×3%)`.
   Lesão impede `!cacar` por 10 min.
- `dificuldade[rank]` ≈ atributo principal do Guerreiro no nível piso do rank − 1 (com dois d20,
  diferença 0 dá ~52% e +7 dá ~80%), calibrado pelo
  simulador para mirar **~55% de vitória no piso** e **~80% no teto** de cada rank.
- Cooldown de `!cacar`: 3 min por jogador.

**Meta de calibragem:** jogador ativo chega ao Rank S com ~230 caçadas (~11–12 h de jogo ativo),
compatível com uma temporada de 2 semanas.

### 5.4 Reavaliação (`!reavaliar`)
- Só disponível no teto do rank.
- 70% de sucesso → sobe 1 rank, mensagem de destaque.
- Falha → bloqueio de 20 min, sem perda de XP.
- **Re-despertar:** em qualquer tentativa, 1% de chance de pular **2 ranks** (limitado a S);
  o nível vai para o piso do novo rank. Mensagem especial no chat.

### 5.5 Temporadas e títulos
- Primeira temporada começa no primeiro boot. Duração em `balance.json` (padrão 14 dias).
- A virada é checada no boot e antes de processar qualquer comando.
- Ao encerrar:
  0. Só entra no Hall da Fama e nos títulos quem teve progresso na temporada (rank > F, nível > 1 ou XP > 0).
  1. Grava top 10 no `hall_of_fame`.
  2. Concede títulos: `[Top 1 · T<n>]`, `[Top 2 · T<n>]`, `[Top 3 · T<n>]` e `[Rank S · T<n>]` para quem chegou a S.
  3. Reseta todos: rank F, nível 1, XP 0, ouro 0, cooldowns limpos. Classe, nome e títulos ficam.
  4. Abre a próxima temporada e anuncia no chat.
- `!titulos` lista o inventário; `!titulo <número|nome>` equipa; `!titulo nenhum` remove.
  O título equipado aparece no `!status` e no `!ranking`.

### 5.6 Ranking
Ordenação da temporada: rank ↓, nível ↓, XP ↓, `rank_reached_at` ↑.
Não há ranking semanal separado: com temporadas de 2 semanas, o ranking da temporada já cumpre esse papel.
`!ranking` mostra top 5; `!ranking eu` mostra a posição do autor.

## 6. Comandos e mensagens

Aceita com ou sem acento e maiúsculas (`!caçar`, `!CACAR`). Respostas em **uma linha**, começando com `@usuario`.

| Comando | Exemplo de resposta |
|---|---|
| `!despertar` | `@ana ✨ despertou como Assassina Rank F! Use !cacar para começar.` |
| `!cacar` | `@ana ⚔️ venceu um Lobo de Gelo [E] (27 vs 21) — +15 XP, +5 ouro` |
| `!cacar` (derrota) | `@ana 💥 foi derrotada por um Orc [D] (14 vs 25) e está lesionada por 10 min` |
| `!status` | `@ana [Top 1 · T1] Assassina Rank E · Nv 7 (40/90 XP) · 32 ouro · pronta para caçar` |
| `!reavaliar` | `@ana 🏅 passou no Teste de Reavaliação! Agora é Rank D!` |
| Re-despertar | `🌌 RE-DESPERTAR! @ana saltou de Rank E para Rank C!` |
| `!ranking` | `🏆 T1: 1. ana (C·17) 2. bruno (C·15) 3. …` |
| `!temporada` | `Temporada 1 — termina em 9d 4h` |
| `!ajuda` | lista curta de comandos |

Administração (só no terminal onde o bot roda; o chat não tem nenhum comando de administração e o
código não tem o conceito de "moderador"): `/pausar` / `/retomar` (ignora comandos de jogo durante
momentos da live; o chat vê apenas o anúncio), `/encerrar-temporada` (força virada — útil para teste).
Decisão do streamer em 2026-11-09: ninguém na live deve conseguir pausar ou encerrar a temporada.

## 7. Erros e limites

| Situação | Comportamento |
|---|---|
| Comando desconhecido | Ignorado em silêncio |
| Jogador não despertou | Uma resposta curta sugerindo `!despertar` |
| Em cooldown / lesionado | Responde com tempo restante **no máximo uma vez** por janela de cooldown |
| Mesmo comando repetido em < 2 s | Ignorado |
| Jogo pausado | Comandos de jogo ignorados; `!status`/`!ranking` funcionam |
| Limite de mensagens da Twitch | `OutboundQueue` com taxa configurável (padrão seguro para conta não-mod; recomenda-se dar mod ao bot) |
| Queda de conexão | tmi.js reconecta; comandos durante a queda são perdidos (aceitável) |
| Erro inesperado num comando | Log local, nenhuma mensagem no chat, o bot segue rodando |
| `balance.json` inválido | Bot não inicia e mostra qual campo está errado |

## 8. Segurança e privacidade (live)

- Credenciais apenas em `.env` (`TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL`).
  `.env` no `.gitignore`; `.env.example` com placeholders é o que aparece na tela.
- Recomendado: **conta separada para o bot**. Gerar o token **fora da live**.
- Logs nunca imprimem token; o boot mostra só `canal: <nome> · token: ****`.
- O banco guarda apenas ID e nome público da Twitch.
- `ConsoleChatClient` permite demonstrar o jogo na live sem nenhuma credencial carregada.

## 9. Balanceamento

- `balance.json` contém: tetos de nível, curva de XP, XP/ouro por rank, dificuldade por rank,
  classes, chances (monstro, lesão, reavaliação, re-despertar), cooldowns, duração da temporada,
  listas de monstros.
- Validação com zod no boot.
- Alterações exigem reiniciar o bot (sem hot-reload na v1).
- `npm run sim` roda o simulador e mostra: caçadas até cada rank por classe, taxa de vitória
  no piso/teto de cada rank. Bom conteúdo de live para ajustar números junto com o chat.

## 10. Testes

- **Vitest.**
- `core/`: testes unitários com `Rng` determinístico (seed) — combate, curva de XP, teto de nível,
  reavaliação, re-despertar, virada de temporada.
- `game/`: `GameService` com `InMemoryHunterRepository` + `FakeClock` — fluxos completos de comando,
  cooldown, pausa, títulos.
- `commands/`: parser com aliases, acentos e lixo.
- `data/`: `SqliteHunterRepository` contra banco em memória (`:memory:`), incluindo migrações.
- Playtest manual: `npm run dev:console` — digitar `ana: !cacar`, `bruno: !ranking` no terminal.

## 11. Estrutura inicial

```
despertar/
  src/{core,config,game,data,chat,commands}/
  scripts/sim.ts
  config/balance.json
  migrations/001_init.sql
  tests/
  .env.example
  package.json · tsconfig.json · vitest.config.ts
```

## 12. Roadmap

| Versão | Conteúdo | Notas de design |
|---|---|---|
| **v1.1 — Loja e Poção de Cura** | `!loja`, `!comprar`, `!usar`, `!inventario`; Poção de Cura | Ver seção 14 |
| **v2 — Portais** | Raids coletivas (`!raid`), portal azul / vermelho / quebra de portal, boss com HP compartilhado, papel das classes (Curandeiro cura, Tanque reduz dano) | Raid vira mais um tipo de evento do `core`; gatilho por timer configurável + comando no terminal |
| **v3 — Equipamento e PvP** | Drops, `!equipar`, equipamentos na loja (que já existe desde a v1.1), `!duelo @fulano` com aposta | Equipamento soma no atributo principal; entra como item novo no catálogo da loja |
| **v4 — Overlay** | Página web no OBS: boss, HP, avatares, ranking animado | Servidor local publica os eventos do `GameService` via WebSocket; overlay só consome |

Cada versão terá spec e plano próprios. Ideias e status de cada versão: [../ROADMAP.md](../ROADMAP.md).

## 13. Pontos em aberto

- Nome definitivo do jogo.

## 14. v1.1 — Loja e Poção de Cura

Aprovado pelo streamer em 2026-11-09. Primeiro uso do ouro.

### Comandos

| Comando | O que faz |
|---|---|
| `!loja` | Lista os itens com o preço **para o rank de quem pediu** |
| `!comprar pocao [qtd]` | Compra de 1 a `shop.maxPerPurchase` (padrão 10) unidades, se houver ouro |
| `!usar pocao` (aliases `!pocao`, `!poção`) | Usa uma poção na hora |
| `!inventario` (alias `!mochila`) | Mostra ouro e itens |

Nomes de item aceitam acento e maiúsculas (`poção`, `POCAO`).

### Poção de Cura

- **Sem cooldown** para usar.
- **Zera as três esperas**: descanso entre caçadas, lesão e bloqueio da reavaliação.
- Se nenhuma das três estiver ativa, **não é gasta** e o bot avisa que a pessoa já está pronta.
- **Preço** = `ceil(priceMultiplier × goldByRank[rank do jogador])`, com `priceMultiplier` no
  `balance.json` (padrão **2,5**). Regra do streamer: **uma vitória nunca paga uma poção**, nem a
  crítica do Assassino (que rende 2× o ouro). Por isso o `balance.json` é recusado se
  `priceMultiplier` não for maior que o maior multiplicador de ouro de uma vitória (2 quando
  alguma classe tem crítico, senão 1). Como cada caçada rende em média menos que uma vitória,
  encadear comprar → usar → caçar sempre perde ouro e não substitui o cooldown.

### Regras gerais

- Comprar e usar ficam bloqueados com o jogo pausado pelo terminal; `!loja` e `!inventario` não.
- No fim da temporada os itens zeram junto com o ouro (títulos e classe continuam).
- A proteção de 2 s contra comando repetido continua valendo.

### Design

- Catálogo de itens em `balance.json` (`shop.items`), para a v3 só acrescentar itens.
- Inventário na tabela `hunter_items (user_id, item_id, qty)`, migração `002`.
- Regras puras em `core/shop.ts` (preço, compra, cura); `GameService` orquestra; a virada de
  temporada limpa os itens na mesma transação que reseta o ouro.
- A tela de teste local mostra as poções de cada caçador e tem botões para os comandos novos.
