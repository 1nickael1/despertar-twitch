# Despertar v3.1 — Duelo (design)

> Data: 2026-11-09. Status: **aguardando revisão**.
> Base: specs da v1, v2 ([portais](2026-11-09-despertar-v2-portais-design.md)) e v3 ([equipamento](2026-11-09-despertar-v3-equipamento-design.md)).

## 1. Visão geral

Dois caçadores se enfrentam numa **melhor de 3**, com aposta de ouro opcional. Qualquer um pode
desafiar qualquer um; o desafiado aceita ou recusa. Com 2 ou mais ranks de diferença o duelo vale
**só pela honra**: ninguém ganha nem perde nada, então um Rank S nunca lucra derrotando um Rank F.

### Decisões tomadas com o streamer

| Tema | Decisão |
|---|---|
| Quem duela | Qualquer um com qualquer um; o desafiado aceita ou recusa |
| Diferença de rank ≥ 2 | Duelo sem aposta: ninguém ganha nem perde nada |
| Em jogo | Só o ouro apostado (os dois põem o mesmo valor; o vencedor leva tudo). Sem XP, sem lesão |
| Luta | Melhor de 3; cada rodada: atributo + arma + defesa da armadura + d20 |
| Prazo para aceitar | 60 s |
| Entre duelos | 2 min de espera para os dois |

## 2. Escopo

### Entra na v3.1
- `!duelo @nome [ouro]`, `!aceitar`, `!recusar`.
- Seção `duel` no `balance.json`; `core/duel.ts`; simulação no `npm run sim`.
- Botões `!aceitar` e `!recusar` na tela local.

### Fora da v3.1
- Habilidades de classe no duelo, XP ou lesão, ranking de duelos, limite de aposta, cancelar o
  próprio desafio (ele expira em 60 s).

## 3. Como funciona

### 3.1 Desafiar (`!duelo @nome [ouro]`)
- `@nome` é o nome de exibição do chat, com ou sem `@`, sem diferenciar maiúsculas. Aposta inteira
  ≥ 0; sem número = 0.
- Recusado (resposta só para quem desafiou), nesta ordem:
  1. sem alvo ou aposta inválida → como usar;
  2. alvo é a própria pessoa;
  3. alvo não despertou;
  4. desafiante ou alvo dentro de uma raid;
  5. desafiante ou alvo esperando o cooldown do duelo (diz quanto falta);
  6. desafiante ou alvo já tem um desafio pendente (como desafiante ou desafiado);
  7. depois da regra de rank (3.3), desafiante ou alvo sem o ouro da aposta.
- Aceito: o bot anuncia e o alvo tem **60 s** (`duel.acceptMs`).

```
⚔️ @ana desafiou @bia para um duelo valendo 20 ouro! @bia: !aceitar ou !recusar (1min)
⚔️ @ana desafiou @caio para um duelo só pela honra (2+ ranks de diferença)! @caio: !aceitar ou !recusar (1min)
```

### 3.2 Responder
- `!aceitar`: confere de novo raid e ouro dos dois (o cooldown não muda enquanto há desafio pendente). Se algo falhar, o desafio é
  cancelado com o motivo. Senão, a luta acontece na hora.
- `!recusar`: o desafio some e o bot avisa.
- `!aceitar`/`!recusar` sem desafio pendente: avisa (a proteção de 2 s evita flood).
- **Expirou** (60 s sem resposta): o relógio do jogo (`tick()`) avisa e o desafio some.

### 3.3 Regra de rank
- Diferença de rank **≤ `duel.fairRankGap` (1)**: vale a aposta pedida.
- Diferença **≥ 2**: a aposta vira **0** (só pela honra), mesmo que tenham pedido ouro.

### 3.4 A luta
- Poder de cada lado por rodada = `atributo principal (nível) + bônus da arma + defesa da armadura + d20`.
- Defesa da armadura (`duel.armorDefense`): comum **+1**, forjada **+2**; sem armadura, 0.
- Quem tiver mais poder vence a rodada; **empate repete a rodada** (não conta).
- Quem vencer **2 rodadas** (`duel.roundsToWin`) vence o duelo.
- Sorteios por rodada: d20 do desafiante, depois d20 do desafiado.
- Sem bônus de classe (o Guerreiro não ganha o +2 contra rank acima).

### 3.5 Resultado
- O perdedor paga a aposta ao vencedor (o "pote" anunciado é o dobro). Gravado numa transação.
- Os dois entram em cooldown de duelo por **2 min** (`duel.cooldownMs`). O cooldown da caçada não muda.
- Uma mensagem só:

```
⚔️ DUELO ana × bia (20 ouro) · R1: ana 23 × 19 bia · R2: ana 15 × 22 bia · R3: ana 26 × 18 bia · 🏆 ana venceu por 2×1 e levou 40 ouro!
⚔️ DUELO ana × caio (só pela honra) · R1: … · 🏆 caio venceu por 2×0!
```

### 3.6 Regras gerais
- `!duelo`, `!aceitar` e `!recusar` ficam bloqueados com o jogo pausado.
- Desafios pendentes e cooldowns ficam **em memória**: reiniciar o bot os apaga.
- A proteção de 2 s contra comando repetido continua valendo.

## 4. Arquitetura

| Onde | O que |
|---|---|
| `config/balance.json` + `balance.ts` | `duel: { acceptMs: 60000, cooldownMs: 120000, armorDefense: { comum: 1, forjada: 2 }, roundsToWin: 2, fairRankGap: 1 }` |
| `src/core/duel.ts` (novo) | `duelStake(a, b, bet, bal)`, `duelPower(h, roll, bal)`, `resolveDuel(challenger, target, bal, rng)` → rodadas e vencedor, `settleDuel(winner, loser, stake)` |
| `src/commands/parse.ts` | `{ kind: 'duelo'; target: string \| null; bet: number \| null }`, `aceitar`, `recusar` |
| `src/game/game-service.ts` | `pendingDuels` (por desafiado), `duelCooldownUntil`; `tick()` expira desafios |
| `src/game/messages.ts` | Textos do duelo |
| `src/web/server.ts`, `web/index.html` | Botões `!aceitar` e `!recusar` |
| `scripts/sim.ts` | Chance de vitória do desafiante por diferença de nível/rank e com equipamento |

Sem migração.

## 5. Testes

- `core/duel.ts`: poder (atributo, arma, defesa por qualidade), aposta efetiva (gap 0, 1, 2),
  melhor de 3 (2×0, 2×1, empate repetido, ordem dos sorteios), transferência de ouro.
- `parse`: `!duelo @Bia 20`, `!duelo bia`, `!duelo`, `!duelo @bia abc`, `!duelo @bia -5`, `!aceitar`, `!recusar`.
- `GameService`: cada recusa da 3.1, desafio e aceite com transferência, recusa, expiração pelo
  `tick()`, honra com 2+ ranks, re-checagem do ouro no aceite, cooldown dos dois, pausado bloqueia,
  quem está na raid não duela.
- `balance.ts`: validação da seção `duel`.

## 6. Para depois

- Habilidades de classe no duelo, ranking de duelos, limite de aposta.
