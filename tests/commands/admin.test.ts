import { describe, expect, it } from 'vitest';
import { isAdminLine, parseAdminLine } from '../../src/commands/admin';

describe('comandos do terminal', () => {
  it.each([
    ['/pausar', 'pausar'],
    ['  /RETOMAR ', 'retomar'],
    ['/encerrar-temporada', 'encerrar-temporada'],
  ])('%j → %s', (line, action) => {
    expect(parseAdminLine(line)).toBe(action);
  });

  it.each(['pausar', '!rpg pausar', '/xyz', '', ' / pausar'])('rejeita %j', (line) => {
    expect(parseAdminLine(line)).toBeNull();
  });

  it('isAdminLine reconhece linhas que começam com /', () => {
    expect(isAdminLine(' /qualquer')).toBe(true);
    expect(isAdminLine('ana: !cacar')).toBe(false);
  });
});
