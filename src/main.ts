import { config as loadDotenv } from 'dotenv';
import { mkdirSync, readFileSync } from 'node:fs';
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
import { AdminRefusal, GameService } from './game/game-service';
import { OverlayHub } from './overlay/hub';
import { startOverlayServer } from './overlay/server';
import { buildOverlaySnapshot } from './overlay/snapshot';
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
  const repo = new SqliteGameRepository(db);
  const game = new GameService({ repo, balance, rng: mathRng, clock: systemClock });

  // Overlay do OBS: só nesta máquina; recebe o estado do painel sempre que o jogo muda.
  const overlayHub = new OverlayHub(() => buildOverlaySnapshot(game, repo, balance, systemClock.now()));
  const overlayPort = Number(process.env.DESPERTAR_OVERLAY_PORT ?? 3220);
  const overlayServer = startOverlayServer(
    overlayHub,
    () => readFileSync(join(ROOT, 'web', 'overlay.html'), 'utf8'),
    overlayPort,
    () => console.log(`[overlay] http://127.0.0.1:${overlayPort}/overlay (OBS: Fonte de Navegador 400×800)`),
  );
  overlayServer.on('error', (err) => console.error('[overlay] não subiu:', err.message));
  const publishOverlay = () => {
    try {
      overlayHub.publish();
    } catch (err) {
      console.error('[overlay] erro:', err instanceof Error ? err.message : err);
    }
  };
  const overlayKeepAlive = setInterval(() => overlayHub.keepAlive(), 15_000);

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
    const cmd = parseAdminLine(line);
    if (!cmd) {
      console.log(`[admin] comando desconhecido. ${ADMIN_HELP}`);
      return;
    }
    try {
      for (const reply of game.admin(cmd)) outbound.enqueue(reply);
      publishOverlay();
      console.log(`[admin] ok: ${line.trim()}`);
    } catch (err) {
      if (err instanceof AdminRefusal) console.log(`[admin] recusado: ${err.message}`);
      else console.error('[admin] erro:', err instanceof Error ? err.message : err);
    }
  });

  let ticker: NodeJS.Timeout | undefined;
  process.on('SIGINT', () => {
    clearInterval(ticker);
    clearInterval(overlayKeepAlive);
    overlayHub.close();
    overlayServer.close();
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
      publishOverlay();
    } catch (err) {
      console.error('[jogo] erro ao processar comando:', err instanceof Error ? err.message : err);
    }
  });

  for (const announcement of game.start()) outbound.enqueue(announcement);

  // Relógio do jogo: abre portais e resolve as rodadas mesmo sem ninguém digitar.
  ticker = setInterval(() => {
    try {
      for (const announcement of game.tick()) outbound.enqueue(announcement);
      publishOverlay();
    } catch (err) {
      console.error('[jogo] erro no relógio do jogo:', err instanceof Error ? err.message : err);
    }
  }, 1_000);
  console.log(`[boot] Despertar rodando (${consoleMode ? 'console' : 'Twitch'}). ${ADMIN_HELP}`);
}

main().catch((err) => {
  console.error('[boot] falha ao iniciar:', err instanceof Error ? err.message : err);
  process.exit(1);
});
