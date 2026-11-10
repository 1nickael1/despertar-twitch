import { describe, expect, it } from 'vitest';
import { isAdminLine, parseAdminLine, toAdminCommand } from '../../src/commands/admin';

describe('comandos do terminal', () => {
  it.each([
    ['/pausar', { action: 'pausar' }],
    ['  /RETOMAR ', { action: 'retomar' }],
    ['/encerrar-temporada', { action: 'encerrar-temporada' }],
    ['/portal', { action: 'portal', portal: null }],
    ['/portal azul', { action: 'portal', portal: 'azul' }],
    ['/PORTAL  Vermelho', { action: 'portal', portal: 'vermelho' }],
    ['/portal quebra', { action: 'portal', portal: 'quebra' }],
  ])('%j → %j', (line, cmd) => {
    expect(parseAdminLine(line)).toEqual(cmd);
  });

  it.each(['pausar', '!rpg pausar', '/xyz', '', ' / pausar', '/portal roxo', '/pausar agora'])('rejeita %j', (line) => {
    expect(parseAdminLine(line)).toBeNull();
  });

  it('isAdminLine reconhece linhas que começam com /', () => {
    expect(isAdminLine(' /qualquer')).toBe(true);
    expect(isAdminLine('ana: !cacar')).toBe(false);
  });

  it('toAdminCommand valida o que vem da tela local', () => {
    expect(toAdminCommand('portal', 'azul')).toEqual({ action: 'portal', portal: 'azul' });
    expect(toAdminCommand('portal', undefined)).toEqual({ action: 'portal', portal: null });
    expect(toAdminCommand('portal', 'roxo')).toBeNull();
    expect(toAdminCommand('apagar-tudo', undefined)).toBeNull();
    expect(toAdminCommand('pausar', 'x')).toBeNull();
    expect(toAdminCommand('pausar', undefined)).toEqual({ action: 'pausar' });
  });
});
