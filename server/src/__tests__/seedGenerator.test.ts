import { describe, it, expect } from 'vitest';
import { generateSeed } from '../utils/seedGenerator';

describe('seedGenerator', () => {
  it('生成されたシードが数値であること', () => {
    const seed = generateSeed();
    expect(typeof seed).toBe('number');
    expect(Number.isInteger(seed)).toBe(true);
  });

  it('生成されたシードが範囲内であること', () => {
    for (let i = 0; i < 100; i++) {
      const seed = generateSeed();
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 31);
    }
  });

  it('複数回呼び出しで異なる値が返ること', () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 100; i++) {
      seeds.add(generateSeed());
    }
    // 100回生成して全て同じ値になる確率は事実上ゼロ
    expect(seeds.size).toBeGreaterThan(1);
  });
});
