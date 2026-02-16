import { TetrominoType } from '../types.js';
import { FIELD_COLS, FIELD_ROWS_BUFFER } from '../constants.js';
import { SHAPES } from './Tetromino.js';

/**
 * テトリスのフィールド（ボード）を管理する。
 * 内部的には FIELD_ROWS_BUFFER (22) 行 x FIELD_COLS (10) 列。
 * 上位2行はバッファ（非表示）。
 */
export class Board {
  /** grid[row][col] — 0=空, 1-7=テトリミノ種別 */
  readonly grid: number[][];

  constructor() {
    this.grid = Board.createEmptyGrid();
  }

  static createEmptyGrid(): number[][] {
    return Array.from({ length: FIELD_ROWS_BUFFER }, () =>
      Array.from({ length: FIELD_COLS }, () => 0),
    );
  }

  /**
   * テトリミノがフィールド内に収まり、既存ブロックと衝突しないか判定する。
   */
  canPlace(type: TetrominoType, rotation: number, row: number, col: number): boolean {
    const shape = SHAPES[type][rotation];
    const size = shape.length;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const gr = row + r;
        const gc = col + c;
        if (gr < 0 || gr >= FIELD_ROWS_BUFFER || gc < 0 || gc >= FIELD_COLS) {
          return false;
        }
        if (this.grid[gr][gc] !== 0) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * テトリミノをフィールドに固定（ロック）する。
   */
  lock(type: TetrominoType, rotation: number, row: number, col: number): void {
    const shape = SHAPES[type][rotation];
    const size = shape.length;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const gr = row + r;
        const gc = col + c;
        if (gr >= 0 && gr < FIELD_ROWS_BUFFER && gc >= 0 && gc < FIELD_COLS) {
          this.grid[gr][gc] = type;
        }
      }
    }
  }

  /**
   * 揃った行を消去し、上の行を落下させる。
   * @returns 消去された行数
   */
  clearLines(): number {
    let cleared = 0;
    for (let r = FIELD_ROWS_BUFFER - 1; r >= 0; r--) {
      if (this.grid[r].every((cell) => cell !== 0)) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array.from({ length: FIELD_COLS }, () => 0));
        cleared++;
        r++; // 同じ行を再チェック（上から行が落ちてくるため）
      }
    }
    return cleared;
  }

  /**
   * おじゃまラインをフィールド下部にせり上げる。
   * @param lines せり上げる行数
   * @param holeCol 穴の位置（列番号）
   */
  addGarbageLines(lines: number, holeCol: number): void {
    for (let i = 0; i < lines; i++) {
      // 最上段の行を削除
      this.grid.shift();
      // 下部におじゃまラインを追加（holeCol以外を埋める）
      const garbageLine = Array.from({ length: FIELD_COLS }, (_, c) =>
        c === holeCol ? 0 : 8, // 8 = おじゃまブロックの色ID
      );
      this.grid.push(garbageLine);
    }
  }

  /**
   * ゲームオーバー判定：スポーン位置にテトリミノを配置できるか。
   */
  isGameOver(type: TetrominoType, rotation: number, row: number, col: number): boolean {
    return !this.canPlace(type, rotation, row, col);
  }

  /**
   * 表示用フィールドを取得（バッファ行を除いた20行）。
   */
  getVisibleGrid(): number[][] {
    return this.grid.slice(2).map((row) => [...row]);
  }

  /**
   * フィールドをリセットする。
   */
  reset(): void {
    for (let r = 0; r < FIELD_ROWS_BUFFER; r++) {
      for (let c = 0; c < FIELD_COLS; c++) {
        this.grid[r][c] = 0;
      }
    }
  }
}
