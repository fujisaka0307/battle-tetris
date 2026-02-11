import { randomInt } from 'node:crypto';

/**
 * テトリミノ生成用のシード値を暗号的にランダムに生成する。
 *
 * 対戦開始時に両プレイヤーへ同一シードを配布し、
 * 同じピース順序を保証するために使用する。
 *
 * @returns 0 〜 2^31-1 の範囲のランダムな整数
 */
export function generateSeed(): number {
  return randomInt(0, 2 ** 31);
}
