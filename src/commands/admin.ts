/**
 * Comandos de administração. Chegam SÓ pelo terminal onde o bot roda (nunca pelo chat):
 * quem não está no PC do streamer não tem como pausar ou encerrar a temporada.
 */
export type AdminAction = 'pausar' | 'retomar' | 'encerrar-temporada';

export const ADMIN_ACTIONS: readonly AdminAction[] = ['pausar', 'retomar', 'encerrar-temporada'];

export const ADMIN_HELP = 'Comandos do terminal: /pausar · /retomar · /encerrar-temporada';

export function isAdminLine(line: string): boolean {
  return line.trim().startsWith('/');
}

/** "/pausar", "/retomar" ou "/encerrar-temporada" (sem diferenciar maiúsculas). */
export function parseAdminLine(line: string): AdminAction | null {
  const trimmed = line.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;
  return ADMIN_ACTIONS.find((a) => a === trimmed.slice(1)) ?? null;
}

export function isAdminAction(value: unknown): value is AdminAction {
  return typeof value === 'string' && (ADMIN_ACTIONS as readonly string[]).includes(value);
}
