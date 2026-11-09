import { describe, expect, it } from 'vitest';
import { chance, createSeededRng, pick, rollD20 } from '../../src/core/rng';
import { d20, seqRng } from '../helpers';

describe('rng', () => {
  it('mesma seed gera a mesma sequência, em [0,1)', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rollD20 cobre 1..20', () => {
    const rng = createSeededRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rollD20(rng));
    expect([...seen].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('helper d20 produz a face pedida', () => {
    expect(rollD20(seqRng([d20(1)]))).toBe(1);
    expect(rollD20(seqRng([d20(17)]))).toBe(17);
    expect(rollD20(seqRng([d20(20)]))).toBe(20);
  });

  it('chance e pick', () => {
    expect(chance(seqRng([0.29]), 0.3)).toBe(true);
    expect(chance(seqRng([0.3]), 0.3)).toBe(false);
    expect(pick(seqRng([0.99]), ['a', 'b', 'c'])).toBe('c');
    expect(pick(seqRng([0]), ['a', 'b', 'c'])).toBe('a');
  });
});
