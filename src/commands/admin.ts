import { isPortalType, type PortalType } from '../core/types';

/**
 * Comandos de administração. Chegam SÓ pelo terminal onde o bot roda (nunca pelo chat):
 * quem não está no PC do streamer não tem como pausar, encerrar a temporada ou abrir portal.
 */
export type AdminCommand =
  | { action: 'pausar' }
  | { action: 'retomar' }
  | { action: 'encerrar-temporada' }
  | { action: 'portal'; portal: PortalType | null };

export type AdminAction = AdminCommand['action'];

export const ADMIN_HELP =
  'Comandos do terminal: /pausar · /retomar · /encerrar-temporada · /portal [azul|vermelho|quebra]';

export function isAdminLine(line: string): boolean {
  return line.trim().startsWith('/');
}

/** "/pausar", "/portal", "/portal vermelho"... (sem diferenciar maiúsculas). */
export function parseAdminLine(line: string): AdminCommand | null {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;
  const [head = '', ...rest] = trimmed.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  return toAdminCommand(head, arg === '' ? undefined : arg);
}

/** Monta o comando a partir de ação + argumento. Usado pelo terminal e pela tela local. */
export function toAdminCommand(action: unknown, arg: unknown): AdminCommand | null {
  const noArg = arg === undefined || arg === null;
  if (action === 'pausar' || action === 'retomar' || action === 'encerrar-temporada') {
    return noArg ? { action } : null;
  }
  if (action === 'portal') {
    if (noArg) return { action, portal: null };
    return isPortalType(arg) ? { action, portal: arg } : null;
  }
  return null;
}
