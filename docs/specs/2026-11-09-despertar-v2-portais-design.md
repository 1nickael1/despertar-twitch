# Despertar v2 — Portais (raids coletivas) (design)

> Data: 2026-11-09. Status: **aguardando revisão**.
> Base: spec da v1 e da v1.1 em [2026-11-09-despertar-rpg-design.md](2026-11-09-despertar-rpg-design.md).

## 1. Visão geral

O momento "evento de live": um portal se abre e o chat inteiro luta junto contra um boss com HP
compartilhado. Hoje o jogo tem **3 jogadores, todos no Rank F**, então os números desta versão
foram simulados para esse grupo (seção 8). Escalar o HP com o número de jogadores e o rank fica
para quando o chat crescer (seção 11).

### Decisões tomadas com o streamer

| Tema | Decisão |
|---|---|
| Duração | **60 s** de entrada + **5 min** de batalha, nos três tipos |
| HP do boss | Azul **500**, vermelho **800**, quebra **1000** (fixo, por enquanto) |
| Como se causa dano | **Híbrido**: rodadas automáticas; `!atacar` dá bônus na rodada |
| Ranking de dano | Quem mais causou dano ganha mais recompensa |
| Boss revida | Derruba jogadores; Tanque puxa o golpe; Curandeiro levanta caídos |
| Poção de Cura na raid | **Pode**: `!usar pocao` levanta quem caiu |
| Penalidade da quebra | **Lesão de 10 min em todos os caçadores despertados** |
| Raid pode pagar poção | **Pode**: a regra "uma vitória nunca paga uma poção" vale só para a caçada |
| Abertura | Timer configurável + `/portal` no terminal (também no modo console e na tela local) |
| Estado da raid | Em memória; reiniciar o bot cancela a raid em andamento |

## 2. Escopo

### Entra na v2
- Comandos do chat: `!raid` (entrar), `!atacar` (bônus na rodada).
- Comando de administração: `/portal [azul|vermelho|quebra]`.
- Três tipos de portal, boss com HP compartilhado, rodadas automáticas, ranking de dano.
- Papel das classes na raid (Tanque, Curandeiro, Guerreiro, Assassino).
- Poção de Cura levanta jogador caído.
- Seção `raid` no `balance.json`; simulação de raid no `npm run sim`.
- Tela de teste local com portal, HP do boss e botões novos.

### Fora da v2
- HP do boss escalando com número de jogadores ou rank (seção 11).
- Drops de raid (v3), overlay no OBS (v4).
- Salvar a raid no banco.
- Comando para sair da raid.

## 3. Como a raid funciona

### 3.1 Abertura

- **Por timer:** um portal abre `raid.intervalMs` depois do fim da última raid (padrão **30 min**).
  Ao ligar o bot, o primeiro portal vem `raid.intervalMs` depois da partida.
- **Tipo sorteado por peso:** `raid.typeWeights`, padrão azul **60**, vermelho **30**, quebra **10**.
- **Pelo terminal:** `/portal` (tipo sorteado) ou `/portal azul|vermelho|quebra`. Funciona:
  - no terminal do bot ligado na Twitch (`npm run dev`);
  - no modo console (`npm run dev:console`), onde linhas com `/` já são administração;
  - na tela de teste local (`npm run dev:web`), por botão.
- O portal só abre se houver **pelo menos 1 caçador despertado**, **nenhuma raid em andamento** e o
  jogo **não estiver pausado**. Pelo terminal, cada recusa responde o motivo (só no terminal, nada
  vai ao chat).
- O nome do boss é sorteado da lista de monstros (`monsters`) do **maior rank entre os caçadores
  despertados**.

### 3.2 Fases

| Fase | Duração | O que acontece |
|---|---|---|
| Entrada | `raid.entryMs` = **60 s** | Chat anuncia o portal (tipo, boss, HP). `!raid` entra. |
| Batalha | `raid.battleMs` = **5 min** | **15 rodadas** automáticas, uma a cada `raid.roundMs` = **20 s**. |
| Resultado | — | Vitória quando o HP chega a 0; derrota quando a última rodada passa. |

- **Entrar (`!raid`)** só na fase de entrada. Recusado para quem não despertou, está lesionado
  (a Poção de Cura resolve antes) ou já entrou. Na batalha, responde que a entrada fechou.
- **Ninguém sai** depois de entrar.
- **Ninguém entrou em 60 s:** o portal fecha. No azul e no vermelho, sem efeito. Na **quebra**,
  conta como derrota (seção 3.5).
- A primeira rodada é resolvida 20 s depois do fim da entrada; a 15ª coincide com o fim dos 5 min.

### 3.3 Cada rodada

Na ordem:

1. **Dano.** Cada participante **de pé** causa `atributo principal + d20`.
   - **Assassino:** crítico ×2 quando o d20 é ≥ `critMin` (18).
   - **Guerreiro:** soma `bonusVsHigherRank` (+2) sempre, porque o boss conta como inimigo mais forte.
   - **`!atacar`:** quem usou durante a rodada causa `× (1 + raid.attackBonus)` = **+50%**,
     arredondado para baixo. Uma vez por rodada; repetir na mesma rodada é ignorado em silêncio.
     Caído não ganha bônus.
   - Dano soma no total da raid e no placar de cada um.
2. **Vitória?** Se o HP chegou a 0, a raid termina aqui (o boss não revida).
3. **Boss revida** contra 1 participante de pé:
   - Se há **Tanque de pé**, o golpe vai nele (se houver mais de um, sorteia entre os Tanques).
   - Senão, sorteia entre os de pé.
   - Chance de cair = `chance de lesão da classe × raid.knockdownFactor` (**0,5**). O
     **Curandeiro**, imune a lesão nas caçadas, usa na raid a fórmula base
     (`baseInjuryChance − vit × injuryPerVit`, com mínimo) para poder cair.
   - Resultado para o grupo F atual: Tanque **5%**, Guerreiro **16%**, Curandeiro **17,5%**,
     Assassino **19%**, Mago **20,5%**.
4. **Curandeiro levanta.** Cada Curandeiro de pé levanta **1 caído** (o que caiu primeiro).
5. **Ninguém de pé** ao fim da rodada: a raid continua (pode haver poção), mas sem dano.

**Poção de Cura na batalha:** `!usar pocao` de um participante **caído** gasta a poção e o
levanta na hora (ele volta a causar dano a partir da próxima rodada). Se ele também tiver
descanso, lesão ou bloqueio de reavaliação, a mesma poção zera tudo. Participante **de pé** usa a
poção do jeito da v1.1 (zera esperas; se não houver nenhuma, não gasta).

**Mensagens:** uma por rodada, com o dano do grupo, o HP do boss e quem caiu ou levantou. Com
3 jogadores e a fila de 1,6 s entre mensagens, cabe folgado nos 20 s.

### 3.4 Ranking de dano

Ordena os participantes por dano total, do maior para o menor; empate fica com quem entrou
primeiro. A posição define o multiplicador da recompensa (seção 3.5).

### 3.5 Fim

**Vitória (qualquer tipo):** cada participante (de pé ou caído) ganha

```
XP   = floor(xpByRank[rank do jogador]   × multTipo × multPosição)
ouro = floor(goldByRank[rank do jogador] × multTipo × multPosição)
```

| Tipo | `multTipo` | | Posição | `multPosição` |
|---|---|---|---|---|
| Azul | 3 | | 1º | 2 |
| Vermelho | 5 | | 2º | 1,5 |
| Quebra | 6 | | 3º | 1,25 |
| | | | demais | 1 |

Exemplo para Rank F (caçada = 10 XP e 3 ouro; poção = 8 ouro):

| Posição | Azul | Vermelho | Quebra |
|---|---|---|---|
| demais | 30 XP · 9 ouro | 50 · 15 | 60 · 18 |
| 3º | 37 · 11 | 62 · 18 | 75 · 22 |
| 2º | 45 · 13 | 75 · 22 | 90 · 27 |
| 1º | 60 · 18 | 100 · 30 | 120 · 36 |

XP de raid passa pela mesma progressão da caçada (sobe nível, para no teto do rank).

**Anúncio da vitória:** a Twitch não aceita quebra de linha, então o ranking sai em **uma mensagem
por colocado**, com o dano que explica a posição:

```
🏆 Goblin foi derrotado! 🔵 PORTAL AZUL limpo. Ranking de dano:
1º ana — 50 de dano → +60 XP, +18 ouro
2º bia — 40 de dano → +45 XP, +13 ouro
```

Mostra os 5 primeiros; acima disso, uma última linha "…e mais N caçadores também receberam
recompensa."

**Derrota:**

| Tipo | Efeito |
|---|---|
| Azul | Nada. |
| Vermelho | Nada além da regra dos caídos abaixo. |
| Quebra | **Todos os caçadores despertados** (participantes ou não, inclusive Curandeiro) ficam lesionados por `raid.breakInjuryMs` = **10 min**. Quem já estava lesionado fica com a lesão que terminar mais tarde. |

**Vermelho, vitória ou derrota:** quem terminar **caído** perde
`raid.redFallXpHunts × xpByRank[rank]` = **2 caçadas** de XP. Na vitória isso sai da recompensa
dele; se a conta ficar negativa, o resto sai do XP atual, **sem nunca descer de nível** (para em 0
XP no nível).

Recompensas, perdas e lesões são gravadas numa **transação só**.

### 3.6 Regras gerais

- Participante **não usa `!cacar`** enquanto a raid dura (resposta: está na raid). O descanso da
  caçada não muda por causa da raid.
- `!raid` e `!atacar` ficam bloqueados com o jogo pausado (como `!cacar`).
- **`/pausar` cancela a raid em andamento**, sem recompensa e sem penalidade; com o jogo pausado
  nenhum portal abre. **`/retomar`** agenda o próximo portal para `raid.intervalMs` depois.
- **Virada de temporada** durante a raid cancela a raid (sem recompensa, sem penalidade).
- A proteção de 2 s contra comando repetido continua valendo.
- **Reiniciar o bot** no meio da raid perde a raid, sem recompensa e sem penalidade.

## 4. Arquitetura

Hoje o jogo só **reage** a comandos. A raid é a primeira coisa que acontece **com o tempo**. Para
isso o `GameService` ganha um `tick()`:

```
 main.ts / web/server.ts ──(a cada 1 s)──► GameService.tick() ──► anúncios ──► fila do chat
                                               │
                                               ├─ ensureSeason(now)   (temporada agora vira mesmo sem comandos)
                                               ├─ abre portal se o timer venceu
                                               ├─ fecha a entrada aos 60 s
                                               └─ resolve as rodadas vencidas (todas, se o bot atrasou)
```

O `tick()` usa só o `Clock` injetado, então os testes e a tela local resolvem uma raid inteira
avançando o relógio, sem esperar 6 minutos.

### Arquivos

| Onde | O que muda |
|---|---|
| `src/core/raid.ts` (novo) | Regras puras: sortear tipo, criar raid, entrar, marcar `!atacar`, resolver rodada (dano, golpe do boss, Tanque, Curandeiro), levantar com poção, ranking, recompensas e penalidades. Recebe estado + `Balance` + `Rng`, devolve novo estado + eventos da rodada. Sem banco, sem relógio. |
| `src/core/types.ts` | `PORTAL_TYPES`, `PortalType`, `isPortalType` (os tipos `Raid` e `RaidParticipant` ficam em `core/raid.ts`, junto das regras). |
| `src/game/game-service.ts` | Raid atual em memória; `tick()`; comandos `!raid` e `!atacar`; `!usar pocao` levanta caído; bloqueio de `!cacar` para participante; `/portal`; `/pausar` cancela; virada de temporada cancela; grava o fim numa transação. |
| `src/game/messages.ts` | Portal aberto, entrada fechada, resumo da rodada, vitória com ranking e recompensas, derrota, quebra, recusas de `!raid` / `!atacar`. `!ajuda` cita os comandos novos. |
| `src/commands/parse.ts` | `!raid` e `!atacar`. |
| `src/commands/admin.ts` | `/portal [tipo]` (a ação passa a ter argumento opcional). |
| `src/config/balance.ts` + `config/balance.json` | Seção `raid` (seção 5), validada pelo zod. |
| `src/main.ts` | `setInterval` de 1 s chamando `tick()` e enfileirando os anúncios. |
| `src/web/server.ts` + `web/index.html` | `tick()` a cada 1 s e depois de avançar o tempo; estado mostra portal, fase, HP do boss, participantes; botões `!raid`, `!atacar`, `/portal`. |
| `scripts/sim.ts` | Simulação de raid (seção 8). |

Sem migração: nada da raid vai para o banco além do que já existe no caçador (XP, ouro, lesão) e
no inventário (poção).

## 5. `balance.json`

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
}
```

Validação (o bot não sobe se falhar):
- `battleMs` é múltiplo de `roundMs`.
- Pesos ≥ 0 e pelo menos um > 0.
- HP, multiplicadores e durações positivos; `knockdownFactor` entre 0 e 1.
- `placeMultipliers` em ordem decrescente e todos ≥ 1.

## 6. Comandos e mensagens

| Comando | Quem | O que faz |
|---|---|---|
| `!raid` | chat | Entra no portal aberto (só na fase de entrada) |
| `!atacar` | chat | +50% de dano na rodada atual (só participante de pé, só na batalha) |
| `!usar pocao` | chat | Na batalha, levanta o participante caído (além do efeito da v1.1) |
| `/portal [azul\|vermelho\|quebra]` | terminal | Abre um portal agora (tipo sorteado se omitido) |

**`!ranking` da temporada (mudança na v1):** no mesmo formato, uma mensagem por colocado com a
pontuação da ordem (rank, nível, XP), para ficar claro por que cada um está naquela posição:

```
🏆 Ranking da Temporada 1 (ordem: rank, nível, XP)
1º ana — Rank C · Nv 17 · 35 XP
2º [Rank S · T1] bia — Rank D · Nv 12 · 80 XP
```

Recusas que vão ao chat usam o `notifyOnce` existente para não inundar (ex.: `!atacar` fora da
raid responde uma vez por raid).

## 7. Erros e limites

- `tick()` que encontra várias rodadas vencidas (bot travou) resolve todas em ordem.
- Erro dentro do `tick()` é registrado no console e não derruba o bot (igual aos comandos).
- Caçador que some do banco no meio da raid (não deveria acontecer) é ignorado no fim.

## 8. Balanceamento

Simulação com o grupo atual (Guerreiro F4, Tanque F3, Assassino F2), 5000 raids por linha,
rodadas de 20 s, queda × 0,5, `!atacar` +50%, sem poções. Chance de vitória:

| Quanto o chat usa `!atacar` | Azul 500 | Vermelho 800 | Quebra 1000 |
|---|---|---|---|
| nunca | 89% | 67% | 26% |
| metade das rodadas | 94% | 81% | 68% |
| toda rodada | 96% | 88% | 80% |

- Sem Tanque (Guerreiro, Mago, Assassino): azul 65–86%, vermelho 22–60%, quebra 4–41%.
- Os três no teto do F (nível 5): azul 93–98%, vermelho 77–91%, quebra 63–86%.
- A simulação não tinha o +2 do Guerreiro, as poções nem rodadas com o grupo todo caído (ela
  encerrava ali), então os números reais devem sair um pouco melhores.
- Rodadas de 30 s (10 por raid) deixavam vermelho e quebra quase impossíveis; queda sem o fator
  0,5 derrubava o grupo sem Tanque.

O `npm run sim` ganha esta tabela, com o grupo configurável no topo do script.

## 9. Testes

**`core/raid.ts`** (RNG com seed):
- Dano por classe: crítico do Assassino, +2 do Guerreiro, bônus do `!atacar` uma vez por rodada.
- Golpe do boss vai no Tanque de pé; sem Tanque, sorteia; Curandeiro pode cair na raid.
- Curandeiro levanta o caído mais antigo; Curandeiro caído não levanta ninguém.
- Vitória para na rodada em que o HP zera (sem golpe do boss).
- Ranking: ordem por dano, empate por ordem de entrada; multiplicadores por posição e por tipo.
- Vermelho: caído perde 2 caçadas de XP, desconta da recompensa, nunca desce de nível.
- Quebra: lesão em todos os despertados, mantém a lesão mais longa.

**`GameService`** (relógio falso):
- Timer abre portal; não abre pausado, sem caçadores ou com raid em andamento.
- `/portal` com e sem tipo; recusas.
- `!raid` só na entrada; lesionado recusado; entrada fecha aos 60 s; ninguém entrou (azul vs quebra).
- 15 rodadas em 5 min; `tick()` atrasado resolve todas.
- `!usar pocao` levanta caído e gasta; `!cacar` bloqueado para participante.
- `/pausar` cancela; virada de temporada cancela; recompensas gravadas numa transação.

**`balance.ts`:** validações da seção `raid`.

## 10. Segurança e privacidade (live)

Nada muda: administração continua só no terminal; nenhuma mensagem nova mostra dados além do
nome de exibição do chat.

## 11. Para depois

- **HP escalando** com número de participantes e rank médio, quando o chat tiver mais que poucos
  jogadores. Hoje um grupo Rank S passaria fácil pelos 1000 de HP.
- Drops na vitória (v3) e eventos da raid no overlay (v4): o `tick()` e as mensagens por rodada
  já são o ponto onde o overlay vai se ligar.
