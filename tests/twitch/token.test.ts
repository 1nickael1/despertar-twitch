import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  refreshAccessToken,
  refreshDelayMs,
  TokenManager,
  validateToken,
  type FetchFn,
} from '../../src/twitch/token';

const SECRET = 'segredo-de-teste';
const REFRESH = 'refresh-de-teste';
const creds = { clientId: 'client-id-teste', clientSecret: SECRET, refreshToken: REFRESH };

interface Call {
  url: string;
  init?: RequestInit;
}

function fakeFetch(...responses: Array<{ status: number; body: unknown }>): FetchFn & { calls: Call[] } {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: chamada não prevista');
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as FetchFn & { calls: Call[] };
  fn.calls = calls;
  return fn;
}

describe('validateToken', () => {
  it('devolve conta, permissões e validade', async () => {
    const f = fakeFetch({ status: 200, body: { login: 'bot', scopes: ['chat:read'], expires_in: 3600 } });
    expect(await validateToken('tok', f)).toEqual({ login: 'bot', scopes: ['chat:read'], expiresInSec: 3600 });
    expect(f.calls[0].url).toBe('https://id.twitch.tv/oauth2/validate');
  });

  it('token inválido ou vencido devolve null', async () => {
    expect(await validateToken('tok', fakeFetch({ status: 401, body: {} }))).toBeNull();
  });
});

describe('refreshAccessToken', () => {
  it('troca o refresh token por um token novo', async () => {
    const f = fakeFetch({ status: 200, body: { access_token: 'novo', refresh_token: 'r2', expires_in: 14000 } });
    expect(await refreshAccessToken(creds, f)).toEqual({ accessToken: 'novo', refreshToken: 'r2', expiresInSec: 14000 });
    const body = new URLSearchParams(String(f.calls[0].init?.body));
    expect(f.calls[0].url).toBe('https://id.twitch.tv/oauth2/token');
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe(REFRESH);
    expect(body.get('client_id')).toBe(creds.clientId);
  });

  it('recusa da Twitch vira erro claro, sem vazar segredos', async () => {
    const f = fakeFetch({ status: 400, body: { message: 'Invalid refresh token' } });
    const err = await refreshAccessToken(creds, f).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('twitch token -u');
    expect((err as Error).message).not.toContain(SECRET);
    expect((err as Error).message).not.toContain(REFRESH);
  });
});

describe('refreshDelayMs', () => {
  it('renova 15 minutos antes de vencer, com mínimo de 1 minuto', () => {
    expect(refreshDelayMs(4 * 3600)).toBe((4 * 3600 - 15 * 60) * 1000);
    expect(refreshDelayMs(60)).toBe(60_000);
  });
});

describe('TokenManager', () => {
  let dir: string;
  let envFile: string;
  const logs: string[] = [];
  const log = (m: string) => void logs.push(m);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'despertar-token-'));
    envFile = join(dir, '.env');
    writeFileSync(envFile, `TWITCH_CHANNEL=canal\nTWITCH_OAUTH_TOKEN=velho\nTWITCH_REFRESH_TOKEN=${REFRESH}\n`);
    logs.length = 0;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('token com bastante validade não é renovado', async () => {
    const f = fakeFetch({ status: 200, body: { login: 'bot', scopes: [], expires_in: 3 * 3600 } });
    const m = new TokenManager({ accessToken: 'velho', ...creds, envFilePath: envFile, fetchFn: f, log });
    expect(await m.ensureFresh()).toBe(3 * 3600);
    expect(m.current()).toBe('velho');
    expect(f.calls).toHaveLength(1);
  });

  it('token perto de vencer é renovado e gravado no .env', async () => {
    const f = fakeFetch(
      { status: 200, body: { login: 'bot', scopes: [], expires_in: 10 * 60 } },
      { status: 200, body: { access_token: 'novo', refresh_token: 'r-novo', expires_in: 14000 } },
    );
    const m = new TokenManager({ accessToken: 'velho', ...creds, envFilePath: envFile, fetchFn: f, log });
    expect(await m.ensureFresh()).toBe(14000);
    expect(m.current()).toBe('novo');
    const saved = readFileSync(envFile, 'utf8');
    expect(saved).toContain('TWITCH_OAUTH_TOKEN=novo');
    expect(saved).toContain('TWITCH_REFRESH_TOKEN=r-novo');
    expect(saved).toContain('TWITCH_CHANNEL=canal');
  });

  it('token vencido é renovado', async () => {
    const f = fakeFetch(
      { status: 401, body: {} },
      { status: 200, body: { access_token: 'novo', refresh_token: 'r-novo', expires_in: 14000 } },
    );
    const m = new TokenManager({ accessToken: 'velho', ...creds, envFilePath: envFile, fetchFn: f, log });
    await m.ensureFresh();
    expect(m.current()).toBe('novo');
  });

  it('logs nunca mostram token ou segredo', async () => {
    const f = fakeFetch(
      { status: 401, body: {} },
      { status: 200, body: { access_token: 'token-novo-secreto', refresh_token: 'r-novo-secreto', expires_in: 14000 } },
    );
    const m = new TokenManager({ accessToken: 'velho', ...creds, envFilePath: envFile, fetchFn: f, log });
    await m.ensureFresh();
    const all = logs.join('\n');
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of ['token-novo-secreto', 'r-novo-secreto', 'velho', SECRET, REFRESH]) {
      expect(all).not.toContain(secret);
    }
  });
});
