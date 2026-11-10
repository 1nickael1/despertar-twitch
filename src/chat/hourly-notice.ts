/** Início da próxima hora cheia (11:30 → 12:00), no fuso do computador. */
export function nextHourStart(now: number): number {
  const d = new Date(now);
  d.setMinutes(60, 0, 0); // 60 minutos vira a hora seguinte (e o dia, se for 23h)
  return d.getTime();
}

/**
 * Aviso fixo que o bot manda no chat na virada de cada hora (11:00, 12:00, ...).
 * Não é parte do jogo: sai mesmo com o jogo pausado. Texto vazio desliga.
 */
export class HourlyNotice {
  private nextAt: number;

  constructor(
    private readonly text: string,
    now: number,
    /** Passou disso da virada (PC dormiu, por exemplo): pula aquela hora em vez de mandar atrasado. */
    private readonly graceMs = 60_000,
  ) {
    this.nextAt = nextHourStart(now);
  }

  /** Chamado pelo relógio de 1 s do bot; devolve o texto uma vez por hora, na virada. */
  poll(now: number): string | null {
    if (!this.text.trim() || now < this.nextAt) return null;
    const late = now - this.nextAt;
    this.nextAt = nextHourStart(now);
    return late < this.graceMs ? this.text : null;
  }
}
