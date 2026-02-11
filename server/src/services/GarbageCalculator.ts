import { GARBAGE_TABLE } from '@battle-tetris/shared';

/**
 * ライン消去数から相手に送るおじゃまライン数を計算する。
 *
 * @param linesCleared 消去したライン数 (0〜4)
 * @returns 送信するおじゃまライン数
 */
export function calculateGarbage(linesCleared: number): number {
  if (linesCleared < 0 || linesCleared >= GARBAGE_TABLE.length) {
    return 0;
  }
  return GARBAGE_TABLE[linesCleared];
}
