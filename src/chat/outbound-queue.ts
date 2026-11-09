export const MAX_MESSAGE_LENGTH = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Envia mensagens em ordem, com pelo menos `intervalMs` entre uma e outra. */
export class OutboundQueue {
  private queue: string[] = [];
  private draining = false;

  constructor(
    private readonly send: (text: string) => Promise<void>,
    private readonly intervalMs: number,
  ) {}

  get size(): number {
    return this.queue.length;
  }

  enqueue(text: string): void {
    const safe = text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 3)}...` : text;
    this.queue.push(safe);
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const text = this.queue.shift()!;
      try {
        await this.send(text);
      } catch (err) {
        console.error('[chat] falha ao enviar mensagem:', err instanceof Error ? err.message : err);
      }
      await sleep(this.intervalMs);
    }
    this.draining = false;
  }
}
