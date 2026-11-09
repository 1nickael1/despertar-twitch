/** Fonte de aleatoriedade injetável. next() devolve um número em [0, 1). */
export interface Rng {
  next(): number;
}

/** mulberry32: pequeno, rápido e determinístico para a mesma seed. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const mathRng: Rng = { next: () => Math.random() };

export function rollD20(rng: Rng): number {
  return Math.floor(rng.next() * 20) + 1;
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)];
}
