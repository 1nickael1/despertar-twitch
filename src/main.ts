import { config as loadDotenv } from 'dotenv';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ConsoleChatClient } from './chat/console-client';
import { OutboundQueue } from './chat/outbound-queue';
import { TwitchChatClient } from './chat/twitch-client';
import type { ChatClient } from './chat/types';
import { ADMIN_HELP, isAdminLine, parseAdminLine } from './commands/admin';
import { parseCommand } from './commands/parse';
import { BALANCE_PATH, loadBalance } from './config/balance';
import { describeTwitchEnv, readTwitchEnv } from './config/env';
import { systemClock } from './core/clock';
import { mathRng } from './core/rng';
import { openDatabase, SqliteGameRepository } from './data/sqlite-repository';
import { GameService } from './game/game-service';
import { TokenManager } from './twitch/token';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENV_PATH = join(ROOT, '.env');
loadDotenv({ path: ENV_PATH, quiet: true });

async function main(): Promise<void> {
  const consoleMode = process.argv.includes('--console');
  const balance = loadBalance(BALANCE_PATH);

  const dataDir = join(ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, consoleMode ? 'console.db' : 'despertar.db'));
  const game = new GameService({ repo: new SqliteGameRepository(db), balance, rng: mathRng, clock: systemClock });

  // O terminal onde o bot roda: único lugar de onde vêm os comandos de administração.
  const terminal = createInterface({ input: process.stdin });

  let chat: ChatClient;
  let tokens: TokenManager | null = null;
  if (consoleMode) {
    chat = new ConsoleChatClient(terminal);
  } else {
    const env = readTwitchEnv();
    console.log(`[boot] ${describeTwitchEnv(env)}`);
    if (env.refresh) {
      tokens = new TokenManager({ accessToken: env.token, ...env.refresh, envFilePath: ENV_PATH });
      tokens.startAutoRefresh(await tokens.ensureFresh());
      const manager = tokens;
      chat = new TwitchChatClient(env, () => manager.current());
    } else {
      console.log(`[boot] renovação automática desligada: faltam ${env.refreshMissing.join(', ')}`);
      chat = new TwitchChatClient(env);
    }
  }

  const outbound = new OutboundQueue((text) => chat.say(text), consoleMode ? 0 : balance.chat.messageIntervalMs);

  terminal.on('line', (line) => {
    if (!isAdminLine(line)) {
      if (!consoleMode && line.trim()) console.log(`[admin] ${ADMIN_HELP}`);
      return;
    }
    const action = parseAdminLine(line);
    if (!action) {
      console.log(`[admin] comando desconhecido. ${ADMIN_HELP}`);
      return;
    }
    try {
      for (const reply of game.admin(action)) outbound.enqueue(reply);
      console.log(`[admin] ok: /${action}`);
    } catch (err) {
      console.error('[admin] erro:', err instanceof Error ? err.message : err);
    }
  });

  process.on('SIGINT', () => {
    tokens?.stop();
    terminal.close();
    void chat.disconnect().finally(() => {
      db.close();
      process.exit(0);
    });
  });

  await chat.connect((m) => {
    const cmd = parseCommand(m.text);
    if (!cmd) return;
    try {
      for (const reply of game.handle({ userId: m.userId, displayName: m.displayName }, cmd)) outbound.enqueue(reply);
    } catch (err) {
      console.error('[jogo] erro ao processar comando:', err instanceof Error ? err.message : err);
    }
  });

  for (const announcement of game.start()) outbound.enqueue(announcement);
  console.log(`[boot] Despertar rodando (${consoleMode ? 'console' : 'Twitch'}). ${ADMIN_HELP}`);
}

main().catch((err) => {
  console.error('[boot] falha ao iniciar:', err instanceof Error ? err.message : err);
  process.exit(1);
});
