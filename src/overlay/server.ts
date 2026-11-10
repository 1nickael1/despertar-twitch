import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { OverlayHub } from './hub';

/** Atende `/overlay` (a página) e `/overlay/events` (SSE). Devolve false para qualquer outra rota. */
export function handleOverlayRoute(
  req: IncomingMessage,
  res: ServerResponse,
  hub: OverlayHub,
  getHtml: () => string,
): boolean {
  if (req.method !== 'GET') return false;
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/overlay') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(getHtml());
    return true;
  }
  if (path === '/overlay/events') {
    hub.connect(res);
    return true;
  }
  return false;
}

/** Servidor só do overlay, para o bot de verdade. Escuta apenas nesta máquina. */
export function startOverlayServer(hub: OverlayHub, getHtml: () => string, port: number, onReady?: () => void): Server {
  const server = createServer((req, res) => {
    try {
      if (!handleOverlayRoute(req, res, hub, getHtml)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Use /overlay');
      }
    } catch (err) {
      console.error('[overlay] erro:', err instanceof Error ? err.message : err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.listen(port, '127.0.0.1', onReady);
  return server;
}
