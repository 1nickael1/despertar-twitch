import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { OverlayHub } from '../../src/overlay/hub';
import type { OverlaySnapshot } from '../../src/overlay/snapshot';

/** Resposta HTTP falsa: guarda o que foi escrito. */
class FakeResponse extends EventEmitter {
  status = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    return this;
  }
  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.ended = true;
    return this;
  }
  get data(): OverlaySnapshot[] {
    return this.chunks.filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)));
  }
}

const base = (over: Partial<OverlaySnapshot> = {}): OverlaySnapshot => ({
  serverNow: 1,
  paused: false,
  season: 1,
  nextPortalAt: null,
  ranking: [],
  raid: null,
  result: null,
  ...over,
});

describe('OverlayHub', () => {
  it('manda o estado ao conectar, como event-stream', () => {
    const hub = new OverlayHub(() => base({ season: 3 }));
    const res = new FakeResponse();
    hub.connect(res as unknown as ServerResponse);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.data).toEqual([base({ season: 3 })]);
    expect(hub.clientCount).toBe(1);
  });

  it('publish só reenvia quando o estado muda (o relógio não conta)', () => {
    let current = base();
    const hub = new OverlayHub(() => current);
    const res = new FakeResponse();
    hub.connect(res as unknown as ServerResponse);
    current = base({ serverNow: 999 });
    hub.publish();
    expect(res.data).toHaveLength(1);
    current = base({ paused: true });
    hub.publish();
    expect(res.data).toHaveLength(2);
    expect(res.data[1].paused).toBe(true);
  });

  it('keep-alive escreve um comentário; cliente que fecha sai da lista', () => {
    const hub = new OverlayHub(() => base());
    const res = new FakeResponse();
    hub.connect(res as unknown as ServerResponse);
    hub.keepAlive();
    expect(res.chunks.at(-1)).toBe(': ping\n\n');
    res.emit('close');
    expect(hub.clientCount).toBe(0);
  });

  it('close encerra todos os clientes', () => {
    const hub = new OverlayHub(() => base());
    const res = new FakeResponse();
    hub.connect(res as unknown as ServerResponse);
    hub.close();
    expect(res.ended).toBe(true);
    expect(hub.clientCount).toBe(0);
  });
});
