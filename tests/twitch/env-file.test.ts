import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateEnvFile } from '../../src/twitch/env-file';

describe('updateEnvFile', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'despertar-env-'));
    file = join(dir, '.env');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('troca só as linhas pedidas e mantém o resto', () => {
    writeFileSync(file, '# comentario\nTWITCH_CHANNEL=canal\nTWITCH_OAUTH_TOKEN=velho\nTWITCH_REFRESH_TOKEN = r-velho\n');
    updateEnvFile(file, { TWITCH_OAUTH_TOKEN: 'novo', TWITCH_REFRESH_TOKEN: 'r-novo' });
    expect(readFileSync(file, 'utf8')).toBe(
      '# comentario\nTWITCH_CHANNEL=canal\nTWITCH_OAUTH_TOKEN=novo\nTWITCH_REFRESH_TOKEN=r-novo\n',
    );
  });

  it('adiciona a variável que não existia', () => {
    writeFileSync(file, 'A=1\n');
    updateEnvFile(file, { B: '2' });
    expect(readFileSync(file, 'utf8')).toBe('A=1\nB=2\n');
  });

  it('preserva quebras de linha do Windows (CRLF)', () => {
    writeFileSync(file, 'A=1\r\nTOKEN=x\r\n');
    updateEnvFile(file, { TOKEN: 'y' });
    expect(readFileSync(file, 'utf8')).toBe('A=1\r\nTOKEN=y\r\n');
  });
});
