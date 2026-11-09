import { describe, expect, it } from 'vitest';
import { parseConsoleLine } from '../../src/chat/console-client';

describe('parseConsoleLine', () => {
  it('lê "nome: texto"', () => {
    expect(parseConsoleLine('Ana: !cacar')).toEqual({
      userId: 'console:ana', displayName: 'Ana', text: '!cacar',
    });
  });

  it('linha de terminal (/pausar) não vira mensagem de chat', () => {
    expect(parseConsoleLine('/pausar')).toBeNull();
    expect(parseConsoleLine('/encerrar-temporada: agora')).toBeNull();
  });

  it.each(['', '!cacar', ': !cacar', 'ana:'])('rejeita %j', (line) => {
    expect(parseConsoleLine(line)).toBeNull();
  });
});
