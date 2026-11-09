import type { HuntOutcome } from '../core/combat';
import { rankLetter } from '../core/types';

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
}

const at = (name: string) => `@${name}`;
const titled = (title: string | null) => (title ? `[${title}] ` : '');
const R = rankLetter;

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

  ranking: (seasonNumber: number, entries: RankingEntry[]) =>
    entries.length === 0
      ? `🏆 T${seasonNumber}: ninguém no ranking ainda. Seja o primeiro com !despertar!`
      : `🏆 T${seasonNumber}: ` +
        entries.map((e, i) => `${i + 1}. ${titled(e.title)}${e.name} (${R(e.rank)}·${e.level})`).join(' '),
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

  paused: () => '⏸️ O jogo foi pausado.',
  resumed: () => '▶️ O jogo voltou! Bora caçar.',
  help: () =>
    'Comandos: !despertar · !cacar · !status · !reavaliar · !ranking [eu] · !titulos · !titulo <n> · !temporada · !loja · !comprar pocao [qtd] · !usar pocao · !inventario',
};
