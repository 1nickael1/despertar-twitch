import { describe, expect, it } from 'vitest';
import { normalizeText, parseCommand } from '../../src/commands/parse';

describe('parseCommand', () => {
  it.each(['!cacar', '!caçar', '!CAÇAR', '  !hunt  '])('%s → cacar', (t) => {
    expect(parseCommand(t)).toEqual({ kind: 'cacar' });
  });

  it('aliases', () => {
    expect(parseCommand('!perfil')).toEqual({ kind: 'status' });
    expect(parseCommand('!comandos')).toEqual({ kind: 'ajuda' });
    expect(parseCommand('!despertar')).toEqual({ kind: 'despertar' });
    expect(parseCommand('!reavaliar')).toEqual({ kind: 'reavaliar' });
    expect(parseCommand('!temporada')).toEqual({ kind: 'temporada' });
  });

  it('ranking com e sem "eu"', () => {
    expect(parseCommand('!ranking')).toEqual({ kind: 'ranking', self: false });
    expect(parseCommand('!ranking eu')).toEqual({ kind: 'ranking', self: true });
  });

  it('forjar e equipar', () => {
    expect(parseCommand('!forjar arma')).toEqual({ kind: 'forjar', slot: 'arma', rank: null });
    expect(parseCommand('!FORJAR Armadura e')).toEqual({ kind: 'forjar', slot: 'armadura', rank: 1 });
    expect(parseCommand('!forjar')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!forjar espada')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!forjar arma x')).toEqual({ kind: 'forjar', slot: null, rank: null });
    expect(parseCommand('!equipar 2')).toEqual({ kind: 'equipar', arg: '2' });
    expect(parseCommand('!equipar Lâmina ★')).toEqual({ kind: 'equipar', arg: 'Lâmina ★' });
  });

  it('raid e atacar', () => {
    expect(parseCommand('!raid')).toEqual({ kind: 'raid' });
    expect(parseCommand('!RAID')).toEqual({ kind: 'raid' });
    expect(parseCommand('!atacar')).toEqual({ kind: 'atacar' });
  });

  it('títulos', () => {
    expect(parseCommand('!titulos')).toEqual({ kind: 'titulos' });
    expect(parseCommand('!titulo')).toEqual({ kind: 'titulos' });
    expect(parseCommand('!titulo 2')).toEqual({ kind: 'titulo', arg: '2' });
    expect(parseCommand('!título Top 1')).toEqual({ kind: 'titulo', arg: 'Top 1' });
  });

  it.each(['!rpg pausar', '!RPG retomar', '!rpg encerrar-temporada', '!pausar', '/pausar'])(
    'administração não existe no chat: %s',
    (t) => {
      expect(parseCommand(t)).toBeNull();
    },
  );

  it.each(['', 'oi', '!', '!naoexiste', '!constructor', '!toString', 'cacar'])('ignora %j', (t) => {
    expect(parseCommand(t)).toBeNull();
  });

  it('loja e inventário', () => {
    expect(parseCommand('!loja')).toEqual({ kind: 'loja' });
    expect(parseCommand('!inventario')).toEqual({ kind: 'inventario' });
    expect(parseCommand('!inventário')).toEqual({ kind: 'inventario' });
    expect(parseCommand('!mochila')).toEqual({ kind: 'inventario' });
  });

  it('comprar com e sem quantidade', () => {
    expect(parseCommand('!comprar pocao')).toEqual({ kind: 'comprar', item: 'pocao', qty: 1 });
    expect(parseCommand('!comprar Poção 3')).toEqual({ kind: 'comprar', item: 'pocao', qty: 3 });
    expect(parseCommand('!comprar poção de cura 2')).toEqual({ kind: 'comprar', item: 'pocao de cura', qty: 2 });
    expect(parseCommand('!comprar')).toEqual({ kind: 'comprar', item: '', qty: 1 });
    expect(parseCommand('!comprar pocao 0')).toEqual({ kind: 'comprar', item: 'pocao', qty: 0 });
  });

  it('usar e o atalho !pocao', () => {
    expect(parseCommand('!usar pocao')).toEqual({ kind: 'usar', item: 'pocao' });
    expect(parseCommand('!usar')).toEqual({ kind: 'usar', item: '' });
    expect(parseCommand('!pocao')).toEqual({ kind: 'usar', item: 'pocao' });
    expect(parseCommand('!Poção')).toEqual({ kind: 'usar', item: 'pocao' });
  });

  it('normalizeText remove acentos e caixa', () => {
    expect(normalizeText('Título ÇA')).toBe('titulo ca');
  });
});
