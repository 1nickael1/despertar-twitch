# Despertar v3 — Equipamento e forja (design)

> Data: 2026-11-09. Status: **aguardando revisão**.
> Base: specs da v1/v1.1 ([rpg-design](2026-11-09-despertar-rpg-design.md)) e da v2 ([portais](2026-11-09-despertar-v2-portais-design.md)).
> O **duelo** (`!duelo @fulano` com aposta), que o ROADMAP punha na v3, fica para a **v3.1**: ele vai
> poder usar a arma e a armadura no cálculo da luta.

## 1. Visão geral

Cada caçador tem **dois espaços**: ⚔️ **arma** (aumenta o dano) e 🛡️ **armadura** (aumenta a
defesa). A loja vende só o equipamento **comum** do rank. Os monstros dropam **fragmentos**, e com
eles o jogador **forja** a versão **forjada** do mesmo equipamento, que é sempre mais forte que a da
loja.

### Decisões tomadas com o streamer

| Tema | Decisão |
|---|---|
| Espaços | Arma (dano) e armadura (defesa) |
| Arma | Soma no poder da caçada e no dano da raid |
| Armadura | Multiplica a chance de lesão (caçada) e de cair (raid) |
| Loja | Só o equipamento comum (o mais fraco) do rank atual |
| Materiais | 1 fragmento por rank (Fragmento F, E, …), dropado por monstros daquele rank |
| Forja | Equipamento forjado = mesmo item, sempre mais forte que o da loja do mesmo rank |
| Equipar | Só item do rank atual do personagem ou de rank menor |
| Fim da temporada | Equipamentos e fragmentos zeram, junto com o ouro |
| Equipar sozinho | Comprar ou forjar equipa na hora se o item for melhor que o atual |

## 2. Escopo

### Entra na v3
- `!comprar arma`, `!comprar armadura`, `!forjar arma|armadura [rank]`, `!equipar <número|nome>`.
- Fragmento como drop da caçada vencida e recompensa da raid vencida.
- Arma e armadura valendo na caçada e na raid.
- `!loja`, `!status`, `!inventario` e mensagens de vitória mostrando o equipamento e os fragmentos.
- Seção `equipment` no `balance.json`; simulação do efeito no `npm run sim`.
- Tela local mostrando arma, armadura e fragmentos de cada caçador.

### Fora da v3
- Duelo (v3.1). Raridades além de comum/forjado. Vender ou trocar itens. Desequipar.
- Equipamento por classe (todas as classes usam os mesmos itens).

## 3. Itens

Para cada rank e espaço existe **um item** em duas qualidades:

| Espaço | Efeito | Comum (loja) | Forjado |
|---|---|---|---|
| ⚔️ Arma | + poder na caçada e + dano na raid | +1 (F, E, D) · +2 (C, B, A) · +3 (S) | +2 (F, E) · +3 (D, C) · +4 (B, A) · +5 (S) |
| 🛡️ Armadura | × chance de lesão (caçada) e de cair (raid) | ×0,85 em todos os ranks | ×0,70 em todos os ranks |

- Cada +1 de poder vale uns 5 pontos percentuais de chance de vencer (o d20 tem a mesma variação em
  todo rank), então os bônus são pequenos de propósito.
- A armadura **multiplica** a chance: nunca zera e serve para toda classe. O Curandeiro, imune a
  lesão na caçada, continua imune; na raid a armadura reduz a chance de queda dele também.
- **Nomes** (no `balance.json`, um por rank e espaço). O forjado leva " ★" no fim:

| Rank | Arma | Armadura |
|---|---|---|
| F | Lâmina Enferrujada | Couro Gasto |
| E | Espada de Ferro | Cota de Couro |
| D | Lâmina de Aço | Cota de Malha |
| C | Espada Rúnica | Peitoral de Aço |
| B | Lâmina de Mithril | Armadura Rúnica |
| A | Espada Dracônica | Escamas de Dragão |
| S | Lâmina do Monarca | Manto do Monarca |

  Ex.: "Lâmina Enferrujada" (F, +1) na loja; "Lâmina Enferrujada ★" (F, +2) na forja.
- Cada caçador tem **no máximo 1 de cada item** (comprar ou forjar um item que já tem é recusado).
- **Equipar:** só item de rank ≤ rank do caçador. Subir de rank não tira nada do que está equipado.

## 4. Como se consegue

### 4.1 Loja (`!comprar arma` / `!comprar armadura`)
- Vende só o item **comum do rank atual** do caçador.
- Preço = `ceil(multiplicador × goldByRank[rank])`: arma **6×**, armadura **5×**. Rank F: 18 e 15 de
  ouro. A validação do `balance.json` exige multiplicador maior que o maior ouro de uma vitória
  (regra "uma vitória nunca paga um item da loja", que já vale para a poção).
- `!loja` passa a listar poção, arma e armadura do rank de quem pediu.

### 4.2 Fragmentos
- **Caçada vencida:** **50%** de chance de **+1 Fragmento** do **rank do monstro**. Se o monstro era
  de rank acima, o fragmento também é (fica guardado para quando o caçador subir).
- **Caçada perdida:** nada.
- **Raid vencida:** cada participante ganha fragmentos do **próprio rank**: **1** (azul), **2**
  (vermelho) ou **3** (quebra), e **+1** para o 1º lugar no dano. Derrota não dá fragmento.
- Ficam na tabela de itens (`frag-f`, `frag-e`, …) e aparecem no `!inventario`.

### 4.3 Forja (`!forjar arma|armadura [rank]`)
- Sem rank, forja do **rank atual**. Com rank (`!forjar arma E`), forja aquele rank, que precisa ser
  **≤ rank atual**.
- Custo: **6 fragmentos do rank do item** + `ceil(2 × goldByRank[rank])` de ouro (Rank F: 6 de ouro).
- Recusa com o motivo: rank acima do atual, faltam fragmentos (diz quantos tem), falta ouro, já
  tem o item.
- No grupo atual (Rank F), a primeira forja vem depois de umas 20 caçadas, ou menos com raids.

### 4.4 Equipar
- Ao **comprar** ou **forjar**, o item **equipa sozinho** se o espaço está vazio ou se ele é melhor
  que o equipado (arma: bônus maior; armadura: fator menor). Senão fica guardado.
- `!equipar <número|nome>`: número da lista do `!inventario` ou parte do nome (aceita acento e
  maiúsculas; "★" ou "forjad" escolhem a versão forjada). Recusa item de rank acima do atual.
- O item que sai do espaço continua no inventário.

## 5. Efeito no combate

### Caçada (`!cacar`)
- `poder = atributo + bônus do Guerreiro + bônus da arma + d20`.
- Na derrota, `chance de lesão = chance da classe × fator da armadura`.
- **Ordem dos sorteios:** rank do monstro, nome, d20 do jogador, d20 do monstro, e então
  **na vitória: drop do fragmento** (1 sorteio); **na derrota:** lesão (se a chance for > 0), como
  hoje. *Muda a sequência dos testes de caçada vencida: todos precisam de um valor a mais.*
- Mensagem de vitória ganha "· 💎 +1 Fragmento F" quando dropa.

### Raid
- O participante guarda **bônus da arma** e **fator da armadura** na hora de entrar.
- Dano = fórmula da v2 + bônus da arma (antes do crítico e do `!atacar`).
- Chance de cair = fórmula da v2 × fator da armadura.
- Vitória: além de XP e ouro, os fragmentos da seção 4.2. A mensagem do ranking ganha
  "+N 💎" por colocado.

## 6. Comandos e mensagens

| Comando | O que faz |
|---|---|
| `!comprar arma` / `!comprar armadura` | Compra o comum do rank atual |
| `!forjar arma\|armadura [rank]` | Forja o forjado do rank (padrão: atual) |
| `!equipar <número\|nome>` | Equipa um item do inventário |
| `!status` | Ganha "⚔️ Lâmina Enferrujada ★ +2 · 🛡️ Couro Gasto ×0,85" |
| `!inventario` | Ouro · poções · fragmentos (💎 F ×4 · E ×1) · itens numerados (✅ = equipado) |
| `!loja` | Poção, arma e armadura do rank, com preço |
| `!ajuda` | Cita `!forjar` e `!equipar` |

`!comprar pocao` continua igual. Comprar, forjar e equipar ficam bloqueados com o jogo pausado.

## 7. Dados

- `migrations/003_equipment.sql`: `ALTER TABLE hunters ADD COLUMN weapon_id TEXT;` e
  `ADD COLUMN armor_id TEXT;`.
- `Hunter` ganha `weaponId` e `armorId` (`null` = nada equipado). `resetForNewSeason` zera os dois.
- Itens e fragmentos ficam em `hunter_items` (já existe); a virada de temporada já chama
  `clearAllItems`.
- Ids: `arma-f-comum`, `arma-f-forjada`, `armadura-c-comum`, `frag-d`…

## 8. `balance.json`

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
}
```

Validação: 7 valores por lista; forjado melhor que comum em todo rank (bônus maior, fator menor);
fatores entre 0 e 1; `priceMultiplier` maior que o maior ouro de uma vitória.

## 9. Balanceamento

O `npm run sim` ganha uma tabela por classe com a chance de vitória no piso e antes do teto de cada
rank em três cenários: sem equipamento, arma e armadura comuns, arma e armadura forjadas. Meta: o
comum dá uns +5 pontos percentuais e o forjado uns +10–15, sem passar de ~92% antes do teto (exceto
o Mago, que já passa disso hoje; ver ROADMAP).

## 10. Testes

- `core/equipment.ts`: catálogo e ids, preço, `canEquip`, "é melhor", forja (todas as recusas e o
  sucesso), drop (sorteio acima e abaixo da chance), fragmentos da raid.
- `core/combat.ts`: arma soma no poder; armadura reduz a lesão; drop na vitória e nenhum sorteio
  extra na derrota.
- `core/raid.ts`: arma no dano, armadura na queda, fragmentos na recompensa.
- `GameService`: comprar (recusas, equipa sozinho), forjar, equipar, `!status`, `!inventario`,
  `!loja`, drop na caçada, fragmentos na raid, virada de temporada zera tudo.
- Repositório SQLite: migração 003, salvar e ler `weaponId`/`armorId`.
- `balance.ts`: validações da seção `equipment`.

## 11. Para depois

- **v3.1 Duelo:** `!duelo @fulano <ouro>`, usando arma e armadura.
- Itens por classe, raridades, vender itens.
