/**
 * npm run token            → mostra se o token do bot é válido (sem mostrar o token)
 * npm run token -- --renovar → força uma renovação e grava os tokens novos no .env
 */
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTwitchEnv } from '../src/config/env';
import { fmtDuration } from '../src/game/messages';
import { TokenManager, validateToken } from '../src/twitch/token';

const ENV_PATH = join(fileURLToPath(new URL('..', import.meta.url)), '.env');
loadDotenv({ path: ENV_PATH, quiet: true });

async function main(): Promise<void> {
  const env = readTwitchEnv();

  if (process.argv.includes('--renovar')) {
    if (!env.refresh) throw new Error(`Renovação desligada: faltam ${env.refreshMissing.join(', ')} no .env`);
    await new TokenManager({ accessToken: env.token, ...env.refresh, envFilePath: ENV_PATH }).refresh();
    return;
  }

  const info = await validateToken(env.token);
  if (!info) {
    console.log('[token] vencido ou inválido.');
    console.log(env.refresh ? '[token] o bot renova sozinho ao ligar, ou rode: npm run token -- --renovar' : '[token] gere outro fora da live.');
    return;
  }
  const scopesOk = info.scopes.includes('chat:read') && info.scopes.includes('chat:edit');
  console.log(`[token] válido · conta: ${info.login ?? '(token de aplicativo)'} · permissões de chat: ${scopesOk ? 'ok' : 'FALTANDO'}`);
  console.log(`[token] vence em ${fmtDuration(info.expiresInSec * 1000)} · renovação automática: ${env.refresh ? 'ligada' : 'desligada'}`);
  if (info.login && info.login.toLowerCase() !== env.username.toLowerCase()) {
    console.log('[token] ATENÇÃO: o token é de outra conta, não da conta do bot.');
  }
}

main().catch((err) => {
  console.error('[token] erro:', err instanceof Error ? err.message : 'erro desconhecido');
  process.exit(1);
});
