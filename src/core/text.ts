/** Sem acentos e em minúsculas, para comparar o que o chat digita. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
