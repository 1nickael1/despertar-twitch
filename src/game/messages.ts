import { MAX_MESSAGE_LENGTH } from '../chat/outbound-queue';
import type { HuntOutcome } from '../core/combat';
import type { DuelResult } from '../core/duel';
import type { EquipmentItem } from '../core/equipment';
import type { RaidReward, RoundReport } from '../core/raid';
import { rankLetter, type PortalType } from '../core/types';

export function fmtDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return s > 0 ? `${m}min ${s}s` : `${m}min`;
  return `${s}s`;
}

export interface StatusView {
  title: string | null;
  classLabel: string;
  rank: number;
  level: number;
  xpText: string;
  gold: number;
  state: string;
  /** Arma e armadura equipadas (texto pronto); vazio = nada. */
  gear?: string;
}

export interface RankingEntry {
  name: string;
  title: string | null;
  rank: number;
  level: number;
  xp: number;
}

const at = (name: string) => `@${name}`;
const titled = (title: string | null) => (title ? `[${title}] ` : '');
const R = rankLetter;

const PORTAL_LABEL: Record<PortalType, string> = {
  azul: '🔵 PORTAL AZUL',
  vermelho: '🔴 PORTAL VERMELHO',
  quebra: '⚠️ QUEBRA DE PORTAL',
};
const PORTAL_RULE: Record<PortalType, string> = {
  azul: 'Raid normal.',
  vermelho: 'Ninguém sai até acabar; quem terminar caído perde XP.',
  quebra: 'Se não limparem a tempo, TODOS os caçadores ficam lesionados!',
};
const hunters = (count: number) => `${count} ${count === 1 ? 'caçador' : 'caçadores'}`;

/** A Twitch não aceita quebra de linha: rankings são uma mensagem só, colocados separados por ‖. */
const SEP = ' ‖ ';
const MEDALS = ['🥇', '🥈', '🥉'];
const place = (i: number) => MEDALS[i] ?? `${i + 1}º`;

const fmtFactor = (f: number) => `×${String(f).replace('.', ',')}`;
const gearIcon = (i: EquipmentItem) => (i.slot === 'arma' ? '⚔️' : '🛡️');
/** "+2 dano" (arma) ou "×0,85 lesão" (armadura). */
export const gearPower = (i: EquipmentItem) => (i.slot === 'arma' ? `+${i.value} dano` : `${fmtFactor(i.value)} lesão`);
const gear = (i: EquipmentItem) => `${gearIcon(i)} ${i.label} [${R(i.rank)}] (${gearPower(i)})`;

/** " · 💎 +1 cada (1º +2)": quanto de fragmento cada um ganhou na raid. */
function fragmentNote(rewards: RaidReward[]): string {
  const top = rewards[0]?.fragments ?? 0;
  if (top === 0) return '';
  return rewards.length === 1 ? ` · 💎 +${top}` : ` · 💎 +${rewards[1].fragments} cada (1º +${top})`;
}
/** Rankings mostram até 10 pessoas: pódio completo, do 4º em diante compacto. */
export const RANKING_SIZE = 10;
const PODIUM = 3;

/**
 * Junta as partes com ‖ numa mensagem. Se passar do limite da Twitch, continua numa nova mensagem
 * ("(cont.) …"), sempre cortando entre partes, nunca no meio de um nome.
 */
function pack(parts: string[]): string[] {
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current === '' ? part : current + SEP + part;
    if (current !== '' && next.length > MAX_MESSAGE_LENGTH) {
      out.push(current);
      current = `(cont.) ${part}`;
    } else {
      current = next;
    }
  }
  if (current !== '') out.push(current);
  return out;
}

export const msg = {
  notAwakened: (n: string) => `${at(n)} você ainda não despertou! Digite !despertar para entrar no jogo.`,
  awakened: (n: string, cls: string) => `${at(n)} ✨ despertou como ${cls} Rank F! Use !cacar para começar.`,
  alreadyAwakened: (n: string, cls: string, rank: number) =>
    `${at(n)} você já despertou como ${cls} Rank ${R(rank)}.`,

  huntWin: (n: string, o: HuntOutcome) =>
    `${at(n)} ⚔️ venceu um ${o.monsterName} [${R(o.monsterRank)}] (${o.playerPower} vs ${o.monsterPower})` +
    `${o.crit ? ' 💥 CRÍTICO!' : ''} — +${o.xpGained} XP, +${o.goldGained} ouro` +
    `${o.fragmentRank !== null ? ` · 💎 +1 Fragmento ${R(o.fragmentRank)}` : ''}`,
  huntLoss: (n: string, o: HuntOutcome, injuryMs: number) =>
    `${at(n)} 💀 foi derrotado por um ${o.monsterName} [${R(o.monsterRank)}] (${o.playerPower} vs ${o.monsterPower})` +
    `${o.xpGained > 0 ? ` — +${o.xpGained} XP de consolo` : ''}` +
    `${o.injured ? ` e está lesionado por ${fmtDuration(injuryMs)}` : ''}`,
  levelUpSuffix: (level: number) => ` · ⬆️ Nível ${level}!`,
  capReachedSuffix: () => ' · ⭐ Nível máximo do rank! Use !reavaliar',
  onCooldown: (n: string, ms: number) => `${at(n)} você está descansando. Pode caçar de novo em ${fmtDuration(ms)}.`,
  injured: (n: string, ms: number) => `${at(n)} você está lesionado. Volta a caçar em ${fmtDuration(ms)}.`,

  reevalNotAtCap: (n: string, level: number, cap: number) =>
    `${at(n)} você precisa chegar ao nível ${cap} para a reavaliação (atual: ${level}).`,
  reevalAlreadyS: (n: string) => `${at(n)} você já é Rank S — o topo! Agora é subir no ranking.`,
  reevalBlocked: (n: string, ms: number) =>
    `${at(n)} a Associação só aceita nova reavaliação em ${fmtDuration(ms)}.`,
  reevalSuccess: (n: string, toRank: number) =>
    `${at(n)} 🏅 passou no Teste de Reavaliação! Agora é Rank ${R(toRank)}!`,
  reevalFail: (n: string, ms: number) => `${at(n)} ❌ reprovou na reavaliação. Tente de novo em ${fmtDuration(ms)}.`,
  reawakening: (n: string, fromRank: number, toRank: number) =>
    `🌌 RE-DESPERTAR! ${at(n)} saltou de Rank ${R(fromRank)} para Rank ${R(toRank)}!`,

  status: (n: string, v: StatusView) =>
    `${at(n)} ${titled(v.title)}${v.classLabel} Rank ${R(v.rank)} · Nv ${v.level} (${v.xpText}) · ${v.gold} ouro${v.gear ? ` · ${v.gear}` : ''} · ${v.state}`,

  /** Top 10 com a pontuação que explica a posição (rank › nível › XP); normalmente uma mensagem só. */
  ranking: (seasonNumber: number, entries: RankingEntry[]): string[] =>
    entries.length === 0
      ? [`🏆 T${seasonNumber}: ninguém no ranking ainda. Seja o primeiro com !despertar!`]
      : pack([
          `🏆 Ranking T${seasonNumber} (rank › nível › XP)`,
          ...entries
            .slice(0, RANKING_SIZE)
            .map((e, i) =>
              i < PODIUM
                ? `${place(i)} ${titled(e.title)}${e.name} — ${R(e.rank)} · Nv ${e.level} · ${e.xp} XP`
                : `${place(i)} ${titled(e.title)}${e.name} ${R(e.rank)}·${e.level}·${e.xp}`,
            ),
        ]),
  rankingSelf: (n: string, position: number, total: number) =>
    `${at(n)} você está em ${position}º de ${total} na temporada.`,

  titlesEmpty: (n: string) => `${at(n)} você ainda não tem títulos. Termine uma temporada no topo para ganhar um!`,
  titlesList: (n: string, titles: { label: string; equipped: boolean }[]) =>
    `${at(n)} seus títulos: ` +
    titles.map((t, i) => `${i + 1}) ${t.label}${t.equipped ? ' ✅' : ''}`).join(' · ') +
    ' — use !titulo <número> para equipar',
  titleEquipped: (n: string, label: string) => `${at(n)} título [${label}] equipado!`,
  titleRemoved: (n: string) => `${at(n)} título removido do perfil.`,
  titleNotFound: (n: string) => `${at(n)} título não encontrado. Veja a lista com !titulos.`,

  season: (number: number, msLeft: number) => `📅 Temporada ${number} — termina em ${fmtDuration(msLeft)}.`,
  seasonEnded: (number: number, podium: string[]) =>
    `🏁 Temporada ${number} encerrada! ` +
    (podium.length > 0
      ? `Pódio: ${podium.map((name, i) => `${i + 1}. ${name}`).join(' ')}. Títulos entregues!`
      : 'Ninguém pontuou desta vez.'),
  seasonStarted: (number: number, durationMs: number) =>
    `🌀 Temporada ${number} começou! Todos voltam ao Rank F. Duração: ${fmtDuration(durationMs)}.`,

  shop: (n: string, rank: number, entries: { id: string; label: string; description: string; price: number }[]) =>
    `${at(n)} 🛒 Loja (preços do Rank ${R(rank)}): ` +
    entries.map((e) => `${e.label} — ${e.price} ouro (${e.description})`).join(' · ') +
    ` · use !comprar ${entries.map((e) => e.id).join(' | ')}`,
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
  inventory: (
    n: string,
    gold: number,
    items: { label: string; qty: number }[],
    fragments: { rank: number; qty: number }[] = [],
    equipment: { item: EquipmentItem; equipped: boolean }[] = [],
  ) => {
    const parts = [
      ...items.map((i) => `${i.label} ×${i.qty}`),
      ...(fragments.length > 0 ? [`💎 ${fragments.map((f) => `${R(f.rank)} ×${f.qty}`).join(' ')}`] : []),
      ...equipment.map((e, i) => `${i + 1}) ${gearIcon(e.item)} ${e.item.label} [${R(e.item.rank)}]${e.equipped ? ' ✅' : ''}`),
    ];
    return `${at(n)} 🎒 ${gold} ouro · ${parts.length > 0 ? parts.join(' · ') : 'nenhum item'}`;
  },
  statusGear: (weapon: EquipmentItem | null, armor: EquipmentItem | null) =>
    [weapon && `⚔️ ${weapon.label} +${weapon.value}`, armor && `🛡️ ${armor.label} ${fmtFactor(armor.value)}`]
      .filter(Boolean)
      .join(' · '),
  boughtGear: (n: string, item: EquipmentItem, price: number, equipped: boolean, goldLeft: number) =>
    `${at(n)} 🛒 comprou ${gear(item)} por ${price} ouro · ${equipped ? 'equipado ✅' : 'guardado no !inventario'} · ouro: ${goldLeft}`,
  forged: (
    n: string,
    item: EquipmentItem,
    cost: { fragments: number; gold: number },
    equipped: boolean,
    fragmentsLeft: number,
  ) =>
    `${at(n)} 🔨 forjou ${gear(item)} com ${cost.fragments} 💎 ${R(item.rank)} e ${cost.gold} ouro · ` +
    `${equipped ? 'equipado ✅' : 'guardado no !inventario'} · sobram ${fragmentsLeft} 💎 ${R(item.rank)}`,
  alreadyOwn: (n: string, item: EquipmentItem) => `${at(n)} você já tem ${gearIcon(item)} ${item.label} [${R(item.rank)}].`,
  forgeUsage: (n: string) => `${at(n)} use: !forjar arma|armadura [rank] (ex.: !forjar arma F)`,
  forgeRank: (n: string, maxRank: number) => `${at(n)} você só pode forjar até o seu rank (${R(maxRank)}).`,
  forgeFragments: (n: string, rank: number, have: number, need: number) =>
    `${at(n)} faltam fragmentos: precisa de ${need} 💎 ${R(rank)} e tem ${have}.`,
  forgeGold: (n: string, need: number, have: number) =>
    `${at(n)} ouro insuficiente para forjar: custa ${need} e você tem ${have}.`,
  equipUsage: (n: string) => `${at(n)} use: !equipar <número ou nome> (veja o !inventario)`,
  equipNotFound: (n: string) => `${at(n)} você não tem esse item. Veja o !inventario.`,
  equipRank: (n: string, item: EquipmentItem) => `${at(n)} ${gear(item)} é de rank acima do seu.`,
  equipped: (n: string, item: EquipmentItem) => `${at(n)} ✅ equipou ${gear(item)}.`,

  portalOpened: (type: PortalType, boss: string, hp: number, entryMs: number) =>
    `${PORTAL_LABEL[type]} abriu! Boss: ${boss} (${hp} HP). ${PORTAL_RULE[type]} Digite !raid em ${fmtDuration(entryMs)} para entrar.`,
  raidJoined: (n: string, count: number) => `${at(n)} entrou no portal! (${hunters(count)})`,
  raidNone: (n: string) => `${at(n)} não há portal aberto agora. Fique de olho no chat!`,
  raidEntryClosed: (n: string) => `${at(n)} a entrada do portal já fechou. Espere o próximo!`,
  raidInjured: (n: string, ms: number) =>
    `${at(n)} você está lesionado e não pode entrar (${fmtDuration(ms)}). Uma !usar pocao resolve.`,
  raidBattleStarted: (boss: string, count: number, rounds: number, roundMs: number, bonusPct: number) =>
    `⚔️ A batalha contra ${boss} começou! ${hunters(count)} · ${rounds} rodadas de ${fmtDuration(roundMs)} · ` +
    `use !atacar em cada rodada para +${bonusPct}% de dano`,
  raidRound: (boss: string, r: RoundReport) => {
    const parts = [
      `Rodada ${r.round}/${r.totalRounds}: grupo causou ${r.groupDamage} de dano${r.attackers > 0 ? ` (${r.attackers} com !atacar)` : ''}`,
    ];
    if (r.crits.length > 0) parts.push(`💥 crítico de ${r.crits.join(', ')}`);
    parts.push(`${boss}: ${r.hp}/${r.maxHp} HP`);
    if (r.bossHit) {
      parts.push(
        r.bossHit.fell
          ? `💀 ${r.bossHit.name} caiu!`
          : r.bossHit.tank
            ? `🛡️ ${r.bossHit.name} segurou o golpe`
            : `${r.bossHit.name} desviou do golpe`,
      );
    }
    for (const v of r.revived) parts.push(`✨ ${v.healer} levantou ${v.target}`);
    return parts.join(' · ');
  },
  /** Ranking de dano (top 10) com o dano e a recompensa de cada um; normalmente uma mensagem só. */
  raidVictory: (type: PortalType, boss: string, rewards: RaidReward[]): string[] =>
    pack([
      `🏆 ${boss} derrotado! ${PORTAL_LABEL[type]} limpo${fragmentNote(rewards)}`,
      ...rewards
        .slice(0, RANKING_SIZE)
        .map((r, i) =>
          i < PODIUM
            ? `${place(i)} ${r.displayName} — ${r.damage} de dano → +${r.xp} XP, +${r.gold} ouro`
            : `${place(i)} ${r.displayName} ${r.damage} (+${r.xp} XP +${r.gold} ouro)`,
        ),
      ...(rewards.length > RANKING_SIZE ? [`+${rewards.length - RANKING_SIZE} caçadores também receberam recompensa`] : []),
    ]),
  raidDefeat: (type: PortalType, boss: string, hp: number) =>
    `💨 O tempo acabou: ${boss} sobreviveu com ${hp} HP e o ${PORTAL_LABEL[type]} se fechou.`,
  raidWiped: (type: PortalType, boss: string, hp: number) =>
    `💀 Todos caíram! ${boss} venceu com ${hp} HP e o ${PORTAL_LABEL[type]} se fechou.`,
  raidRedFallen: (entries: { name: string; xp: number }[]) =>
    `🔴 Quem terminou caído perdeu XP: ${entries.map((e) => `${e.name} (-${e.xp} XP)`).join(' · ')}`,
  raidBreak: (boss: string, injuryMs: number) =>
    `⚠️ QUEBRA! ${boss} escapou do portal. Todos os caçadores estão lesionados por ${fmtDuration(injuryMs)}.`,
  portalClosedEmpty: (type: PortalType) => `${PORTAL_LABEL[type]} se fechou: ninguém entrou.`,
  raidCancelled: () => '🌀 O portal se fechou sem resultado (raid cancelada).',
  inRaid: (n: string) => `${at(n)} você está dentro do portal! Caçadas só depois da raid.`,
  raidRevived: (n: string, label: string, left: number) =>
    `${at(n)} 🧪 usou ${label} e voltou à batalha! Restam ${left}.`,
  attackNoRaid: (n: string) => `${at(n)} não há batalha agora. Use !atacar durante uma raid.`,
  attackNotIn: (n: string) => `${at(n)} você não está nesta raid. Entre com !raid quando o próximo portal abrir.`,
  attackNotStarted: (n: string) => `${at(n)} a batalha ainda não começou. Espere a entrada fechar.`,
  attackDown: (n: string) => `${at(n)} você caiu! Só volta à luta com um Curandeiro ou !usar pocao.`,

  duelUsage: (n: string) => `${at(n)} use: !duelo @nome [ouro] (ex.: !duelo @bia 20)`,
  duelSelf: (n: string) => `${at(n)} você não pode duelar consigo mesmo.`,
  duelNoTarget: (n: string, target: string) => `${at(n)} ${target} ainda não despertou.`,
  duelInRaid: (n: string) => `${at(n)} ninguém duela de dentro de um portal. Espere a raid acabar.`,
  duelCooldown: (n: string, ms: number) => `${at(n)} você acabou de duelar. Pode desafiar de novo em ${fmtDuration(ms)}.`,
  duelTargetCooldown: (n: string, target: string, ms: number) =>
    `${at(n)} ${target} acabou de duelar. Tente de novo em ${fmtDuration(ms)}.`,
  duelPending: (n: string) => `${at(n)} já existe um desafio pendente com um de vocês. Espere a resposta.`,
  duelNoGold: (n: string, who: string, stake: number) => `${at(n)} ${who} não tem ${stake} ouro para apostar.`,
  duelChallenge: (challenger: string, target: string, stake: number, gapHonor: boolean, acceptMs: number) =>
    `⚔️ ${at(challenger)} desafiou ${at(target)} para um duelo ` +
    `${stake > 0 ? `valendo ${stake} ouro` : gapHonor ? 'só pela honra (2+ ranks de diferença)' : 'só pela honra'}! ` +
    `${at(target)}: !aceitar ou !recusar (${fmtDuration(acceptMs)})`,
  duelNone: (n: string) => `${at(n)} você não tem nenhum desafio para responder.`,
  duelRefused: (target: string, challenger: string) => `${at(challenger)} ${target} recusou o duelo.`,
  duelExpired: (challenger: string, target: string) => `⌛ O desafio de ${challenger} para ${target} expirou.`,
  duelCancelledRaid: (c: string, t: string) => `⚔️ Duelo entre ${c} e ${t} cancelado: alguém está dentro de um portal.`,
  duelCancelledGold: (c: string, t: string, stake: number) =>
    `⚔️ Duelo entre ${c} e ${t} cancelado: alguém não tem mais ${stake} ouro.`,
  duelResult: (c: string, t: string, stake: number, r: DuelResult) => {
    const rounds = r.rounds.map((x, i) => `R${i + 1}: ${c} ${x.challenger} × ${x.target} ${t}`).join(' · ');
    const [winner, won, lost] = r.winner === 'challenger' ? [c, r.challengerWins, r.targetWins] : [t, r.targetWins, r.challengerWins];
    return (
      `⚔️ DUELO ${c} × ${t} (${stake > 0 ? `${stake} ouro` : 'só pela honra'}) · ${rounds} · ` +
      `🏆 ${winner} venceu por ${won}×${lost}${stake > 0 ? ` e levou ${stake * 2} ouro` : ''}!`
    );
  },

  paused: () => '⏸️ O jogo foi pausado.',
  resumed: () => '▶️ O jogo voltou! Bora caçar.',
  help: () =>
    'Comandos: !despertar · !cacar · !status · !reavaliar · !ranking [eu] · !titulos · !titulo <n> · !temporada · !loja · !comprar pocao [qtd] · !usar pocao · !inventario · !raid · !atacar · !forjar arma|armadura · !equipar <n> · !duelo @nome [ouro]',
};
