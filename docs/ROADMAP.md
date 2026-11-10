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

## Status

| Versão | Conteúdo | Status |
|---|---|---|
| **v1 — Despertar** | Ranks F→S, 5 classes, `!cacar`, `!reavaliar`, temporadas de 14 dias, títulos, ranking, administração só pelo terminal, renovação automática do token | ✅ no `main` |
| **v1.1 — Loja** | `!loja`, `!comprar`, `!usar` / `!pocao`, `!inventario`; Poção de Cura (zera descanso, lesão e reavaliação; uma vitória nunca paga uma) | ✅ no `main` |
| **v2 — Portais** | Raids coletivas: `!raid`, `!atacar`, `/portal`, portal azul / vermelho / quebra, ranking de dano; `!ranking` em uma mensagem por colocado | ✅ no `main` |
| **v3 — Equipamento e PvP** | Drops, equipamentos, duelos | ⏳ |
| **v4 — Overlay** | Tela no OBS | ⏳ |

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

- Página para o OBS: boss e barra de HP da raid, avatares entrando, ranking animado.
- Um servidor local transmite os eventos do `GameService` (WebSocket); o overlay só exibe.

## Pendências fora das versões

- **Primeiro teste no chat real** (com a live desligada): `npm --prefix despertar run dev` e
  `!despertar` no canal. Até agora o bot foi testado no console e na tela local.
- **HP do boss escalando** com número de jogadores e rank, quando o chat crescer (spec v2, seção 11).
- **Balanceamento das classes** (`npm run sim`): o Mago passa de 90% de vitória no fim de cada rank;
  Curandeiro e Tanque caem para ~40% no começo dos ranks altos. Bom tema para uma live de ajuste.
