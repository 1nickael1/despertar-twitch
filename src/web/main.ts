import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE_PATH, loadBalance } from '../config/balance';
import { createHandler, TestBench } from './server';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = Number(process.env.DESPERTAR_WEB_PORT ?? 3210);
const HOST = '127.0.0.1';

const dataDir = join(ROOT, 'data');
mkdirSync(dataDir, { recursive: true });
const bench = new TestBench(loadBalance(BALANCE_PATH), join(dataDir, 'web.db'));
const indexPath = join(ROOT, 'web', 'index.html');

// Lê o HTML a cada visita: dá para editar a página sem reiniciar o servidor.
const server = createServer(createHandler(bench, () => readFileSync(indexPath, 'utf8')));
server.listen(PORT, HOST, () => {
  console.log(`[web] Tela de teste em http://${HOST}:${PORT} (só nesta máquina). Ctrl+C para sair.`);
});
