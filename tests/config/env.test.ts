import { describe, expect, it } from 'vitest';
import { describeTwitchEnv, readTwitchEnv } from '../../src/config/env';

const FAKE_TOKEN = 'token-de-teste-123';

describe('env', () => {
  it('lê as três variáveis e aceita token com ou sem prefixo oauth:', () => {
    const e = readTwitchEnv({ TWITCH_BOT_USERNAME: 'bot', TWITCH_OAUTH_TOKEN: `oauth:${FAKE_TOKEN}`, TWITCH_CHANNEL: 'Canal' });
    expect(e).toMatchObject({ username: 'bot', token: FAKE_TOKEN, channel: 'canal', refresh: null });
    expect(e.refreshMissing).toEqual(['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_REFRESH_TOKEN']);
  });

  it('com as três variáveis de renovação, liga a renovação automática', () => {
    const e = readTwitchEnv({
      TWITCH_BOT_USERNAME: 'bot', TWITCH_OAUTH_TOKEN: FAKE_TOKEN, TWITCH_CHANNEL: 'canal',
      TWITCH_CLIENT_ID: 'id', TWITCH_CLIENT_SECRET: 'segredo', TWITCH_REFRESH_TOKEN: 'r',
    });
    expect(e.refresh).toEqual({ clientId: 'id', clientSecret: 'segredo', refreshToken: 'r' });
    expect(describeTwitchEnv(e)).toContain('renovação automática: ligada');
    expect(describeTwitchEnv(e)).not.toContain('segredo');
  });

  it('lista o que falta sem mostrar valores', () => {
    expect(() => readTwitchEnv({ TWITCH_OAUTH_TOKEN: FAKE_TOKEN })).toThrow(/TWITCH_BOT_USERNAME, TWITCH_CHANNEL/);
    try {
      readTwitchEnv({ TWITCH_OAUTH_TOKEN: FAKE_TOKEN });
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_TOKEN);
    }
  });

  it('describeTwitchEnv nunca mostra o token', () => {
    const text = describeTwitchEnv({ username: 'bot', token: FAKE_TOKEN, channel: 'canal', refresh: null, refreshMissing: [] });
    expect(text).not.toContain(FAKE_TOKEN);
    expect(text).toContain('****');
  });
});
