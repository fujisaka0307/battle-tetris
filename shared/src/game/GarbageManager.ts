import { FIELD_COLS } from '../constants.js';
import { Board } from './Board.js';

/**
 * おじゃまライン管理。
 *
 * 受信したおじゃまラインをキューに蓄積し、
 * テトリミノのロック時にフィールドへせり上げる。
 */
export class GarbageManager {
  /** せり上げ待ちのおじゃまライン数 */
  private queue: number = 0;

  /** PRNG — 穴の列を決めるために使う */
  private readonly rng: (() => number) | null = null;

  /**
   * @param rng オプション: 穴位置の決定に使う乱数関数 (0..1)。
   *            指定しない場合は Math.random を使用。
   */
  constructor(rng?: () => number) {
    this.rng = rng ?? null;
  }

  /**
   * おじゃまラインをキューに追加する。
   */
  add(lines: number): void {
    if (lines > 0) {
      this.queue += lines;
    }
  }

  /**
   * 現在のキュー内のおじゃまライン数を返す。
   */
  pending(): number {
    return this.queue;
  }

  /**
   * キュー内のおじゃまラインをすべてフィールドにせり上げる。
   * @param board 対象のボード
   * @returns 実際にせり上げたライン数
   */
  flush(board: Board): number {
    const lines = this.queue;
    if (lines <= 0) return 0;

    const holeCol = this.randomHoleCol();
    board.addGarbageLines(lines, holeCol);
    this.queue = 0;
    return lines;
  }

  /**
   * キューをクリアする（相殺用）。
   * @param cancelLines 相殺するライン数
   * @returns 実際に相殺されたライン数
   */
  cancel(cancelLines: number): number {
    const cancelled = Math.min(this.queue, cancelLines);
    this.queue -= cancelled;
    return cancelled;
  }

  /**
   * 状態をリセットする。
   */
  reset(): void {
    this.queue = 0;
  }

  /**
   * ランダムな穴の列位置を返す。
   */
  private randomHoleCol(): number {
    const r = this.rng ? this.rng() : Math.random(); // NOSONAR — game logic, not security
    return Math.floor(r * FIELD_COLS);
  }
}
