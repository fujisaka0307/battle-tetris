import { TetrominoType } from '@battle-tetris/shared';
import { ALL_TETROMINO_TYPES } from './Tetromino';

// =============================================================================
// Seed-based PRNG (mulberry32)
// =============================================================================

/**
 * mulberry32 — 32bit シードベースの決定的擬似乱数生成器。
 * 同じシードなら常に同じ乱数列を返す。
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; // NOSONAR — 32-bit integer coercion required by mulberry32
    seed = (seed + 0x6d2b79f5) | 0; // NOSONAR
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Fisher-Yates Shuffle
// =============================================================================

/**
 * Fisher-Yates シャッフル（in-place）。
 * 与えられた RNG 関数を使用して配列をシャッフルする。
 */
function fisherYatesShuffle<T>(array: T[], rng: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// =============================================================================
// BagRandomizer
// =============================================================================

/**
 * 7-bag ランダマイザー。
 *
 * テトリスの標準的な 7-bag システムを実装する。
 * 7種類のテトリミノを1セット（バッグ）としてシャッフルし、
 * 順番に払い出す。バッグが空になると新しいバッグを生成する。
 *
 * シードベースの決定的 PRNG を使用するため、
 * 同じシードなら常に同じピース順序を再現できる。
 */
export class BagRandomizer {
  private rng!: () => number;
  private bag!: TetrominoType[];

  constructor(seed: number) {
    this.reset(seed);
  }

  /**
   * 次のテトリミノを1つ消費して返す。
   */
  next(): TetrominoType {
    if (this.bag.length === 0) {
      this.bag = this.generateBag();
    }
    return this.bag.shift()!;
  }

  /**
   * 次の N 個のテトリミノを先読みする（消費しない）。
   * 必要に応じてバッグを追加生成する。
   */
  peek(count: number): TetrominoType[] {
    // 必要な分だけバッグを補充
    while (this.bag.length < count) {
      this.bag.push(...this.generateBag());
    }
    return this.bag.slice(0, count);
  }

  /**
   * 新しいシードでランダマイザーをリセットする。
   */
  reset(seed: number): void {
    this.rng = mulberry32(seed);
    this.bag = this.generateBag();
  }

  /**
   * 7種類のテトリミノをシャッフルした新しいバッグを生成する。
   */
  private generateBag(): TetrominoType[] {
    const bag = [...ALL_TETROMINO_TYPES];
    return fisherYatesShuffle(bag, this.rng);
  }
}
