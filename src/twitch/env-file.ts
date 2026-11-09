import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/**
 * Troca o valor de algumas variáveis num arquivo .env, mantendo comentários, ordem e o resto.
 * Escreve num arquivo temporário e renomeia, para nunca deixar o .env pela metade.
 */
export function updateEnvFile(path: string, updates: Record<string, string>): void {
  const original = readFileSync(path, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();

  const pending = new Map(Object.entries(updates));
  const updated = lines.map((line) => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m || !pending.has(m[1])) return line;
    const value = pending.get(m[1])!;
    pending.delete(m[1]);
    return `${m[1]}=${value}`;
  });
  for (const [key, value] of pending) updated.push(`${key}=${value}`);

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, updated.join(eol) + eol, 'utf8');
  renameSync(tmp, path);
}
