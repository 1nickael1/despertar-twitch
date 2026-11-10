import { normalizeText } from '../core/text';

export { normalizeText };

/** Comandos que o chat pode usar. Administração não existe aqui: ver commands/admin.ts (só terminal). */
export type Command =
  | { kind: 'despertar' }
  | { kind: 'cacar' }
  | { kind: 'status' }
  | { kind: 'reavaliar' }
  | { kind: 'ranking'; self: boolean }
  | { kind: 'titulos' }
  | { kind: 'titulo'; arg: string }
  | { kind: 'temporada' }
  | { kind: 'ajuda' }
  | { kind: 'loja' }
  | { kind: 'comprar'; item: string; qty: number }
  | { kind: 'usar'; item: string }
  | { kind: 'inventario' }
  | { kind: 'raid' }
  | { kind: 'atacar' };

// Map (e não objeto literal) para que "!constructor" e afins não casem com o protótipo.
const ALIASES = new Map<string, string>([
  ['despertar', 'despertar'],
  ['cacar', 'cacar'],
  ['hunt', 'cacar'],
  ['status', 'status'],
  ['perfil', 'status'],
  ['reavaliar', 'reavaliar'],
  ['ranking', 'ranking'],
  ['rank', 'ranking'],
  ['titulos', 'titulos'],
  ['titulo', 'titulo'],
  ['temporada', 'temporada'],
  ['ajuda', 'ajuda'],
  ['comandos', 'ajuda'],
  ['loja', 'loja'],
  ['comprar', 'comprar'],
  ['usar', 'usar'],
  ['pocao', 'pocao'],
  ['inventario', 'inventario'],
  ['mochila', 'inventario'],
  ['raid', 'raid'],
  ['atacar', 'atacar'],
]);

export function parseCommand(text: string): Command | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return null;
  const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const name = ALIASES.get(normalizeText(head));
  if (!name) return null;
  const argRaw = rest.join(' ').trim();
  const arg = normalizeText(argRaw);

  switch (name) {
    case 'despertar':
    case 'cacar':
    case 'status':
    case 'reavaliar':
    case 'titulos':
    case 'temporada':
    case 'ajuda':
    case 'loja':
    case 'inventario':
    case 'raid':
    case 'atacar':
      return { kind: name };
    case 'ranking':
      return { kind: 'ranking', self: arg === 'eu' };
    case 'titulo':
      return argRaw ? { kind: 'titulo', arg: argRaw } : { kind: 'titulos' };
    case 'comprar': {
      // "!comprar pocao 3": a quantidade, se vier, é o último pedaço; o resto é o nome do item.
      const tokens = arg ? arg.split(/\s+/) : [];
      const last = tokens[tokens.length - 1];
      const qty = last !== undefined && /^\d+$/.test(last) ? Number(tokens.pop()) : 1;
      return { kind: 'comprar', item: tokens.join(' '), qty };
    }
    case 'usar':
      return { kind: 'usar', item: arg };
    case 'pocao':
      return { kind: 'usar', item: 'pocao' };
    default:
      return null;
  }
}
