import { fmtDuration } from '../game/messages';
import { updateEnvFile } from './env-file';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
/** Abaixo disso, o token é renovado já no boot. */
const MIN_REMAINING_SEC = 30 * 60;
/** Renova este tanto antes de vencer. */
const REFRESH_MARGIN_SEC = 15 * 60;
const RETRY_MS = 5 * 60 * 1000;
const REGENERATE_HINT = 'Gere um novo fora da live com: twitch token -u -s "chat:read chat:edit"';

export interface TokenInfo {
  login: string | null;
  scopes: string[];
  expiresInSec: number;
}

/** Pergunta à Twitch sobre o token. null = inválido ou vencido. */
export async function validateToken(token: string, fetchFn: FetchFn = fetch): Promise<TokenInfo | null> {
  const res = await fetchFn(VALIDATE_URL, { headers: { Authorization: `OAuth ${token}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`A Twitch respondeu HTTP ${res.status} ao validar o token.`);
  const data = (await res.json()) as { login?: string; scopes?: string[]; expires_in?: number };
  return { login: data.login ?? null, scopes: data.scopes ?? [], expiresInSec: data.expires_in ?? 0 };
}

export interface RefreshCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

/** Troca o refresh token por um token novo. Erros nunca incluem os segredos. */
export async function refreshAccessToken(creds: RefreshCredentials, fetchFn: FetchFn = fetch): Promise<RefreshedTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`A Twitch recusou a renovação do token (HTTP ${res.status}). ${REGENERATE_HINT}`);
  }
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token || !data.refresh_token) {
    throw new Error(`Resposta de renovação incompleta da Twitch. ${REGENERATE_HINT}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresInSec: data.expires_in ?? 0 };
}

export function refreshDelayMs(expiresInSec: number): number {
  return Math.max(60_000, (expiresInSec - REFRESH_MARGIN_SEC) * 1000);
}

export interface TokenManagerOptions extends RefreshCredentials {
  accessToken: string;
  /** .env onde os tokens novos são gravados. */
  envFilePath: string;
  fetchFn?: FetchFn;
  log?: (message: string) => void;
}

/** Mantém o token do bot sempre válido. Os logs nunca mostram token nem segredo. */
export class TokenManager {
  private accessToken: string;
  private refreshToken: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchFn: FetchFn;
  private readonly log: (message: string) => void;

  constructor(private readonly opts: TokenManagerOptions) {
    this.accessToken = opts.accessToken;
    this.refreshToken = opts.refreshToken;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.log = opts.log ?? ((m) => console.log(m));
  }

  current(): string {
    return this.accessToken;
  }

  /** Valida e, se faltar pouco para vencer (ou já venceu), renova. Devolve segundos até vencer. */
  async ensureFresh(): Promise<number> {
    const info = await validateToken(this.accessToken, this.fetchFn);
    if (info && info.expiresInSec > MIN_REMAINING_SEC) {
      this.log(`[token] válido; vence em ${fmtDuration(info.expiresInSec * 1000)}`);
      return info.expiresInSec;
    }
    this.log(info ? '[token] perto de vencer; renovando…' : '[token] vencido ou inválido; renovando…');
    return this.refresh();
  }

  async refresh(): Promise<number> {
    const r = await refreshAccessToken(
      { clientId: this.opts.clientId, clientSecret: this.opts.clientSecret, refreshToken: this.refreshToken },
      this.fetchFn,
    );
    this.accessToken = r.accessToken;
    this.refreshToken = r.refreshToken;
    updateEnvFile(this.opts.envFilePath, { TWITCH_OAUTH_TOKEN: r.accessToken, TWITCH_REFRESH_TOKEN: r.refreshToken });
    this.log(`[token] renovado e salvo no .env; vence em ${fmtDuration(r.expiresInSec * 1000)}`);
    return r.expiresInSec;
  }

  /** Agenda renovações sozinhas, uma antes de cada vencimento. */
  startAutoRefresh(expiresInSec: number): void {
    this.schedule(refreshDelayMs(expiresInSec));
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.refresh()
        .then((expiresInSec) => this.schedule(refreshDelayMs(expiresInSec)))
        .catch((err: unknown) => {
          this.log(`[token] falha ao renovar: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
          this.log(`[token] nova tentativa em ${fmtDuration(RETRY_MS)}`);
          this.schedule(RETRY_MS);
        });
    }, delayMs);
  }
}
