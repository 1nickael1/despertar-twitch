# Despertar — Roadmap

Onde o jogo está e o que vem depois. As ideias da v2 em diante **ainda não são design aprovado**:
cada versão ganha spec e plano próprios (em `specs/` e `plans/`) quando começar.

## Documentos

| Documento | O que tem |
|---|---|
| [specs/2026-11-09-despertar-rpg-design.md](specs/2026-11-09-despertar-rpg-design.md) | Spec do jogo (v1) e da v1.1 (seção 14) |
| [plans/2026-11-09-despertar-v1.md](plans/2026-11-09-despertar-v1.md) | Plano executado da v1 |
| [plans/2026-11-09-despertar-v1.1-loja.md](plans/2026-11-09-despertar-v1.1-loja.md) | Plano executado da v1.1 |
| [specs/2026-11-09-despertar-v2-portais-design.md](specs/2026-11-09-despertar-v2-portais-design.md) | Spec da v2 (Portais) |
| [plans/2026-11-09-despertar-v2-portais.md](plans/2026-11-09-despertar-v2-portais.md) | Plano executado da v2 |
| [specs/2026-11-09-despertar-v3-equipamento-design.md](specs/2026-11-09-despertar-v3-equipamento-design.md) | Spec da v3 (Equipamento e forja) |
| [plans/2026-11-09-despertar-v3-equipamento.md](plans/2026-11-09-despertar-v3-equipamento.md) | Plano executado da v3 |
| [specs/2026-11-09-despertar-v3.1-duelo-design.md](specs/2026-11-09-despertar-v3.1-duelo-design.md) | Spec da v3.1 (Duelo) |
| [plans/2026-11-09-despertar-v3.1-duelo.md](plans/2026-11-09-despertar-v3.1-duelo.md) | Plano executado da v3.1 |
| [specs/2026-11-09-despertar-v4-overlay-design.md](specs/2026-11-09-despertar-v4-overlay-design.md) | Spec da v4 (Overlay no OBS) |
| [plans/2026-11-09-despertar-v4-overlay.md](plans/2026-11-09-despertar-v4-overlay.md) | Plano executado da v4 |

## Status

| Versão | Conteúdo | Status |
|---|---|---|
| **v1 — Despertar** | Ranks F→S, 5 classes, `!cacar`, `!reavaliar`, temporadas de 14 dias, títulos, ranking, administração só pelo terminal, renovação automática do token | ✅ no `main` |
| **v1.1 — Loja** | `!loja`, `!comprar`, `!usar` / `!pocao`, `!inventario`; Poção de Cura (zera descanso, lesão e reavaliação; uma vitória nunca paga uma) | ✅ no `main` |
| **v2 — Portais** | Raids coletivas: `!raid`, `!atacar`, `/portal`, portal azul / vermelho / quebra, ranking de dano; rankings em uma mensagem só, com medalhas e pontuação | ✅ no `main` |
| **v3 — Equipamento** | Arma e armadura, loja do rank, fragmentos, `!forjar`, `!equipar` | ✅ no `main` |
| **v3.1 — Duelo** | `!duelo @fulano [ouro]`, melhor de 3, aposta só entre ranks próximos | ✅ no `main` |
| **v4 — Overlay** | Coluna lateral no OBS com ranking e raid, visual de janela de sistema | ✅ no ramo `v4-overlay` |

## v2 — Portais (raids coletivas)

O momento "evento de live": o chat inteiro joga junto.

- Um portal se abre e o chat tem **cerca de 60 segundos** para entrar com `!raid`.
- **Boss com HP compartilhado:** o dano de todos que entraram se soma.
- **Tipos de portal:**
  - 🔵 **Azul:** raid normal.
  - 🔴 **Vermelho:** ninguém sai até acabar; recompensa maior, e quem cai perde XP.
  - ⚠️ **Quebra de portal:** se o chat não limpar a tempo, os monstros "escapam" e todo mundo leva uma
    penalidade. Força cooperação.
- **Papel das classes na raid:** o Curandeiro cura o grupo, o Tanque segura o dano do boss.
- **Como o portal abre:** por tempo, configurável no `balance.json`, ou na hora por um comando no
  **terminal** do bot (administração continua fora do chat).
- No código, a raid vira mais um tipo de evento do `core`.

Decidido no design da v2 (detalhes na spec):
- 60 s de entrada + 5 min de batalha; HP fixo por tipo (azul 500, vermelho 800, quebra 1000) para
  o grupo atual de 3 jogadores Rank F. Recompensa = caçada do rank × 3 / 5 / 6, com bônus por
  posição no ranking de dano.
- A Poção de Cura pode ser usada na raid e levanta quem caiu.
- Sem cooldown próprio: o próximo portal vem 30 min depois do fim do anterior (configurável).

## v3 — Equipamento e PvP

- **Drops** nas caçadas e raids, e `!equipar`.
- **Equipamentos na loja:** entram como itens novos no catálogo `shop.items` do `balance.json`; a loja
  e o inventário (`hunter_items`) já existem desde a v1.1.
- O equipamento **soma no atributo principal** da classe.
- **`!duelo @fulano`** com aposta de ouro.

Para decidir no design da v3:
- Se equipamento zera no fim da temporada, como o ouro e as poções.
- Como o duelo convive com a regra de que uma vitória nunca paga um item da loja.

## v4 — Overlay no OBS

- Coluna na lateral direita (`?lado=esquerda` troca), visual de janela de sistema, ícones de classe.
- Mostra o ranking (top 5) e, durante a raid, só a raid: entrada, barra de HP, caçadores, última
  rodada e o resultado por 20 s.
- O bot manda o estado completo do painel por SSE; a página só desenha.
- **No OBS:** Fonte de Navegador com `http://127.0.0.1:3220/overlay`, 1920×1080, por cima da cena.
- Para depois: som, fotos da Twitch, duelo no overlay, avisos de nível/rank/forja.

## Pendências fora das versões

- **HP do boss escalando** com número de jogadores e rank, quando o chat crescer (spec v2, seção 11).
- **Balanceamento do Curandeiro e do Tanque** (`npm run sim`): caem para ~41–43% de vitória no piso
  do Rank A (o Guerreiro fica em ~56%). Eles compensam com menos lesão e XP na derrota, mas vale
  olhar.

Feito:
- Teste no chat real (2026-11-09).
- **Mago rebalanceado** (2026-11-09): crescimento por nível de 1,8 para 1,6. Antes ia de 48% de
  vitória no piso do F a 95% antes do teto do A (98% com forjado); agora fica entre 47% e 62% no piso
  e no máximo 81% antes do teto (91% com forjado, igual ao Guerreiro). Continua "começa fraco,
  termina forte", dentro da faixa das outras classes.
