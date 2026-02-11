import { describe, it, expect } from 'vitest';
import { calculateGarbage } from '../services/GarbageCalculator';

describe('GarbageCalculator', () => {
  it('0ライン消去 → 0おじゃま', () => {
    expect(calculateGarbage(0)).toBe(0);
  });

  it('1ライン消去 → 0おじゃま', () => {
    expect(calculateGarbage(1)).toBe(0);
  });

  it('2ライン消去 → 1おじゃま', () => {
    expect(calculateGarbage(2)).toBe(1);
  });

  it('3ライン消去 → 2おじゃま', () => {
    expect(calculateGarbage(3)).toBe(2);
  });

  it('4ライン消去 → 4おじゃま', () => {
    expect(calculateGarbage(4)).toBe(4);
  });

  it('負数 → 0', () => {
    expect(calculateGarbage(-1)).toBe(0);
  });

  it('5以上 → 0', () => {
    expect(calculateGarbage(5)).toBe(0);
    expect(calculateGarbage(100)).toBe(0);
  });
});
