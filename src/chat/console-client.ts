import type { Interface } from 'node:readline';
import { ADMIN_HELP, isAdminLine } from '../commands/admin';
import type { ChatClient, IncomingMessage } from './types';

/** "nome: texto". Linhas que começam com "/" são do terminal (administração), não do chat. */
export function parseConsoleLine(line: string): IncomingMessage | null {
  if (isAdminLine(line)) return null;
  const m = /^\s*([^\s:]+)\s*:\s*(.+)$/.exec(line);
  if (!m) return null;
  const [, name, text] = m;
  return { userId: `console:${name.toLowerCase()}`, displayName: name, text: text.trim() };
}

/**
 * Chat de mentira no terminal, para testar e demonstrar sem credenciais.
 * Recebe a mesma interface de leitura que o main.ts usa para os comandos /admin.
 */
export class ConsoleChatClient implements ChatClient {
  constructor(private readonly terminal: Interface) {}

  async connect(onMessage: (m: IncomingMessage) => void): Promise<void> {
    console.log(`[console] Chat: digite "nome: !comando". ${ADMIN_HELP}. Ctrl+C para sair.`);
    this.terminal.on('line', (line) => {
      if (!line.trim() || isAdminLine(line)) return;
      const m = parseConsoleLine(line);
      if (m) onMessage(m);
      else console.log('[console] formato: nome: !comando');
    });
  }

  async say(text: string): Promise<void> {
    console.log(`[bot] ${text}`);
  }

  async disconnect(): Promise<void> {
    // A interface do terminal é fechada pelo main.ts.
  }
}
