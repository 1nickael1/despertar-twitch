import type { RefreshCredentials } from '../twitch/token';

export interface TwitchEnv {
  username: string;
  token: string;
  channel: string;
  /** Presente quando as três variáveis de renovação existem: o bot renova o token sozinho. */
  refresh: RefreshCredentials | null;
  /** Nomes das variáveis de renovação que faltam (vazio quando a renovação está ligada). */
  refreshMissing: string[];
}

const REQUIRED = ['TWITCH_BOT_USERNAME', 'TWITCH_OAUTH_TOKEN', 'TWITCH_CHANNEL'] as const;
const REFRESH_VARS = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REFRESH_TOKEN'] as const;

/** Lê credenciais. Mensagens de erro citam só NOMES de variáveis, nunca valores. */
export function readTwitchEnv(env: NodeJS.ProcessEnv = process.env): TwitchEnv {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltam variáveis no .env: ${missing.join(', ')} (veja .env.example)`);
  }
  const refreshMissing = REFRESH_VARS.filter((k) => !env[k]?.trim());
  return {
    username: env.TWITCH_BOT_USERNAME!.trim(),
    token: env.TWITCH_OAUTH_TOKEN!.trim().replace(/^oauth:/, ''),
    channel: env.TWITCH_CHANNEL!.trim().toLowerCase(),
    refresh:
      refreshMissing.length === 0
        ? {
            clientId: env.TWITCH_CLIENT_ID!.trim(),
            clientSecret: env.TWITCH_CLIENT_SECRET!.trim(),
            refreshToken: env.TWITCH_REFRESH_TOKEN!.trim(),
          }
        : null,
    refreshMissing,
  };
}

/** Seguro para mostrar na live. */
export function describeTwitchEnv(e: TwitchEnv): string {
  return `canal: ${e.channel} · bot: ${e.username} · token: **** · renovação automática: ${e.refresh ? 'ligada' : 'desligada'}`;
}
