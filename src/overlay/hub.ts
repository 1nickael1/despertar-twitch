import type { ServerResponse } from 'node:http';
import type { OverlaySnapshot } from './snapshot';

/** Chave de comparação: o relógio muda a cada chamada e não conta como mudança. */
const keyOf = (s: OverlaySnapshot) => JSON.stringify({ ...s, serverNow: 0 });

/**
 * Clientes do overlay (Server-Sent Events). Cada cliente recebe o estado completo ao conectar e de
 * novo sempre que ele muda; a página só desenha o último estado que recebeu.
 */
export class OverlayHub {
  private readonly clients = new Set<ServerResponse>();
  private lastKey: string | null = null;

  constructor(private readonly snapshot: () => OverlaySnapshot) {}

  get clientCount(): number {
    return this.clients.size;
  }

  connect(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
    const s = this.snapshot();
    this.lastKey = keyOf(s);
    this.send(res, s);
  }

  /** Manda o estado atual a todos, se mudou desde o último envio. */
  publish(): void {
    const s = this.snapshot();
    const key = keyOf(s);
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const res of this.clients) this.send(res, s);
  }

  /** Comentário SSE: mantém a conexão viva em proxies e no OBS. */
  keepAlive(): void {
    for (const res of this.clients) res.write(': ping\n\n');
  }

  close(): void {
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  private send(res: ServerResponse, s: OverlaySnapshot): void {
    res.write(`data: ${JSON.stringify(s)}\n\n`);
  }
}
