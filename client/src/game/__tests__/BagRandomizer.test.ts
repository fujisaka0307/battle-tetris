import { describe, it, expect } from 'vitest';
import { TetrominoType } from '@battle-tetris/shared';
import { BagRandomizer } from '../BagRandomizer';
import { ALL_TETROMINO_TYPES } from '../Tetromino';

const TEST_SEED = 42;

describe('BagRandomizer', () => {
  // ---------------------------------------------------------------------------
  // next()
  // ---------------------------------------------------------------------------

  describe('next()', () => {
    it('最初の7回の next() で全7種類のテトリミノが1回ずつ出ること', () => {
      const bag = new BagRandomizer(TEST_SEED);
      const firstBag: TetrominoType[] = [];
      for (let i = 0; i < 7; i++) {
        firstBag.push(bag.next());
      }

      // Should contain all 7 types exactly once
      const sorted = [...firstBag].sort();
      const expected = [...ALL_TETROMINO_TYPES].sort();
      expect(sorted).toEqual(expected);
    });

    it('8回目の next() で新しいバッグが自動生成されること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      // Exhaust the first bag (7 pieces)
      for (let i = 0; i < 7; i++) {
        bag.next();
      }

      // 8th call should still return a valid piece (from new bag)
      const eighth = bag.next();
      expect(ALL_TETROMINO_TYPES).toContain(eighth);
    });

    it('2バッグ目 (8-14回目) でも全7種類が揃うこと', () => {
      const bag = new BagRandomizer(TEST_SEED);

      // Exhaust the first bag
      for (let i = 0; i < 7; i++) {
        bag.next();
      }

      // Collect second bag
      const secondBag: TetrominoType[] = [];
      for (let i = 0; i < 7; i++) {
        secondBag.push(bag.next());
      }

      const sorted = [...secondBag].sort();
      const expected = [...ALL_TETROMINO_TYPES].sort();
      expect(sorted).toEqual(expected);
    });

    it('バッグが空の状態から next() を呼ぶと新しいバッグが生成されること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      // Exhaust first bag completely
      for (let i = 0; i < 7; i++) {
        bag.next();
      }

      // Internal bag should be empty now. Next call triggers bag.length === 0 branch
      const piece = bag.next();
      expect(ALL_TETROMINO_TYPES).toContain(piece);
    });
  });

  // ---------------------------------------------------------------------------
  // peek()
  // ---------------------------------------------------------------------------

  describe('peek()', () => {
    it('peek(3) で次の3つのピースを先読みできること (消費しない)', () => {
      const bag = new BagRandomizer(TEST_SEED);

      const peeked = bag.peek(3);
      expect(peeked).toHaveLength(3);

      // Verify the peeked pieces are valid
      for (const p of peeked) {
        expect(ALL_TETROMINO_TYPES).toContain(p);
      }

      // Verify peek doesn't consume: next() should return the same pieces
      for (let i = 0; i < 3; i++) {
        expect(bag.next()).toBe(peeked[i]);
      }
    });

    it('peek(10) でバッグを超える先読みで追加バッグが生成されること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      // Initial bag has 7 pieces. Peeking 10 requires generating more
      const peeked = bag.peek(10);
      expect(peeked).toHaveLength(10);

      // All should be valid types
      for (const p of peeked) {
        expect(ALL_TETROMINO_TYPES).toContain(p);
      }

      // First 7 should form a complete bag
      const firstSeven = [...peeked.slice(0, 7)].sort();
      const expected = [...ALL_TETROMINO_TYPES].sort();
      expect(firstSeven).toEqual(expected);
    });

    it('peek(14) で2バッグ分を先読みできること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      const peeked = bag.peek(14);
      expect(peeked).toHaveLength(14);

      // First 7 should be a complete bag
      const first = [...peeked.slice(0, 7)].sort();
      expect(first).toEqual([...ALL_TETROMINO_TYPES].sort());

      // Second 7 should also be a complete bag
      const second = [...peeked.slice(7, 14)].sort();
      expect(second).toEqual([...ALL_TETROMINO_TYPES].sort());
    });

    it('peek(0) で空配列を返すこと', () => {
      const bag = new BagRandomizer(TEST_SEED);
      expect(bag.peek(0)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('新しいシードでリセットすると異なるシーケンスが生成されること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      const seq1: TetrominoType[] = [];
      for (let i = 0; i < 7; i++) {
        seq1.push(bag.next());
      }

      // Reset with a different seed
      bag.reset(999);
      const seq2: TetrominoType[] = [];
      for (let i = 0; i < 7; i++) {
        seq2.push(bag.next());
      }

      // Different seeds should produce different sequences
      // (extremely unlikely to be identical with a proper PRNG)
      const isSame = seq1.every((v, i) => v === seq2[i]);
      expect(isSame).toBe(false);
    });

    it('同じシードでリセットすると同じシーケンスが再現されること', () => {
      const bag = new BagRandomizer(TEST_SEED);

      const seq1: TetrominoType[] = [];
      for (let i = 0; i < 14; i++) {
        seq1.push(bag.next());
      }

      // Reset with the same seed
      bag.reset(TEST_SEED);
      const seq2: TetrominoType[] = [];
      for (let i = 0; i < 14; i++) {
        seq2.push(bag.next());
      }

      expect(seq1).toEqual(seq2);
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('決定性', () => {
    it('同じシードのインスタンス2つが同じピース順序を生成すること', () => {
      const bag1 = new BagRandomizer(TEST_SEED);
      const bag2 = new BagRandomizer(TEST_SEED);

      for (let i = 0; i < 21; i++) {
        // 3 bags worth
        expect(bag1.next()).toBe(bag2.next());
      }
    });

    it('異なるシードのインスタンスが異なるピース順序を生成すること', () => {
      const bag1 = new BagRandomizer(42);
      const bag2 = new BagRandomizer(123);

      const seq1: TetrominoType[] = [];
      const seq2: TetrominoType[] = [];
      for (let i = 0; i < 7; i++) {
        seq1.push(bag1.next());
        seq2.push(bag2.next());
      }

      const isSame = seq1.every((v, i) => v === seq2[i]);
      expect(isSame).toBe(false);
    });
  });
});
