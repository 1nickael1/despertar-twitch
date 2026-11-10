import type { HuntOutcome } from '../core/combat';
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

export const msg = {
  notAwakened: (n: string) => `${at(n)} você ainda não despertou! Digite !despertar para entrar no jogo.`,
  awakened: (n: string, cls: string) => `${at(n)} ✨ despertou como ${cls} Rank F! Use !cacar para começar.`,
  alreadyAwakened: (n: string, cls: string, rank: number) =>
    `${at(n)} você já despertou como ${cls} Rank ${R(rank)}.`,

  huntWin: (n: string, o: HuntOutcome) =>
    `${at(n)} ⚔️ venceu um ${o.monsterName} [${R(o.monsterRank)}] (${o.playerPower} vs ${o.monsterPower})` +
    `${o.crit ? ' 💥 CRÍTICO!' : ''} — +${o.xpGained} XP, +${o.goldGained} ouro`,
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
    `${at(n)} ${titled(v.title)}${v.classLabel} Rank ${R(v.rank)} · Nv ${v.level} (${v.xpText}) · ${v.gold} ouro · ${v.state}`,

  /** Uma mensagem por colocado (a Twitch não aceita quebra de linha). */
  ranking: (seasonNumber: number, entries: RankingEntry[]): string[] =>
    entries.length === 0
      ? [`🏆 T${seasonNumber}: ninguém no ranking ainda. Seja o primeiro com !despertar!`]
      : [
          `🏆 Ranking da Temporada ${seasonNumber} (ordem: rank, nível, XP)`,
          ...entries.map((e, i) => `${i + 1}º ${titled(e.title)}${e.name} — Rank ${R(e.rank)} · Nv ${e.level} · ${e.xp} XP`),
        ],
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
    ` · use !comprar ${entries[0]?.id ?? 'item'} [quantidade]`,
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
  inventory: (n: string, gold: number, items: { label: string; qty: number }[]) =>
    `${at(n)} 🎒 ${gold} ouro · ` +
    (items.length > 0 ? items.map((i) => `${i.label} ×${i.qty}`).join(' · ') : 'nenhum item'),

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
  /** Ranking de dano: uma mensagem por colocado, com o dano que explica a posição. */
  raidVictory: (type: PortalType, boss: string, rewards: RaidReward[]): string[] => [
    `🏆 ${boss} foi derrotado! ${PORTAL_LABEL[type]} limpo. Ranking de dano:`,
    ...rewards.slice(0, 5).map((r) => `${r.place}º ${r.displayName} — ${r.damage} de dano → +${r.xp} XP, +${r.gold} ouro`),
    ...(rewards.length > 5 ? [`…e mais ${rewards.length - 5} caçadores também receberam recompensa.`] : []),
  ],
  raidDefeat: (type: PortalType, boss: string, hp: number) =>
    `💨 O tempo acabou: ${boss} sobreviveu com ${hp} HP e o ${PORTAL_LABEL[type]} se fechou.`,
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

  paused: () => '⏸️ O jogo foi pausado.',
  resumed: () => '▶️ O jogo voltou! Bora caçar.',
  help: () =>
    'Comandos: !despertar · !cacar · !status · !reavaliar · !ranking [eu] · !titulos · !titulo <n> · !temporada · !loja · !comprar pocao [qtd] · !usar pocao · !inventario · !raid · !atacar',
};
