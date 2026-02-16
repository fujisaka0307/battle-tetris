import {
  TetrominoType,
  FIELD_COLS,
  FIELD_ROWS_BUFFER,
  Board,
  SHAPES,
  ROTATION_COUNT,
} from '@battle-tetris/shared';

// =============================================================================
// Types
// =============================================================================

export interface Placement {
  col: number;
  rotation: number;
}

interface EvalWeights {
  aggregateHeight: number;
  completeLines: number;
  holes: number;
  bumpiness: number;
}

// =============================================================================
// Level Configurations
// =============================================================================

/** レベル別の重み設定 */
const LEVEL_WEIGHTS: Record<number, EvalWeights> = {
  // レベル 1-3: 弱い重み
  1: { aggregateHeight: -0.3, completeLines: 0.5, holes: -0.3, bumpiness: -0.1 },
  2: { aggregateHeight: -0.4, completeLines: 0.6, holes: -0.4, bumpiness: -0.15 },
  3: { aggregateHeight: -0.4, completeLines: 0.7, holes: -0.5, bumpiness: -0.2 },
  // レベル 4-6: 適切な重み
  4: { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  5: { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  6: { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  // レベル 7-10: 最適な重み
  7:  { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  8:  { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  9:  { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
  10: { aggregateHeight: -0.51, completeLines: 0.76, holes: -0.36, bumpiness: -0.18 },
};

/**
 * レベル別のランダム性（上位何%から選ぶか）。
 * 1: 上位60%からランダム, 2: 上位40%, 3: 上位20%, 4+: 最善手
 */
function getRandomnessTopPercent(level: number): number {
  if (level <= 1) return 0.6;
  if (level <= 2) return 0.4;
  if (level <= 3) return 0.2;
  return 0; // 4以上: 常に最善手
}

// =============================================================================
// AiDecisionMaker
// =============================================================================

export class AiDecisionMaker {
  private readonly level: number;
  private readonly weights: EvalWeights;

  constructor(level: number) {
    this.level = Math.max(1, Math.min(10, level));
    this.weights = LEVEL_WEIGHTS[this.level] ?? LEVEL_WEIGHTS[5];
  }

  /**
   * 最適な配置を探す。
   */
  findBestPlacement(board: Board, pieceType: TetrominoType): Placement {
    const candidates: { placement: Placement; score: number }[] = [];

    for (let rotation = 0; rotation < ROTATION_COUNT; rotation++) {
      const shape = SHAPES[pieceType][rotation];
      const size = shape.length;

      // 有効な列範囲を計算
      const minCol = this.getMinCol(shape, size);
      const maxCol = this.getMaxCol(shape, size);

      for (let col = minCol; col <= maxCol; col++) {
        // ドロップ先を計算
        const dropRow = this.findDropRow(board, pieceType, rotation, col);
        if (dropRow < 0) continue;

        // 仮想ボードでシミュレーション
        const score = this.evaluatePlacement(board, pieceType, rotation, dropRow, col);
        candidates.push({ placement: { col, rotation }, score });
      }
    }

    if (candidates.length === 0) {
      // フォールバック: 中央にスポーン回転0で配置
      return { col: 3, rotation: 0 };
    }

    // スコアでソート（降順）
    candidates.sort((a, b) => b.score - a.score);

    // ランダム性の適用
    const topPercent = getRandomnessTopPercent(this.level);
    if (topPercent > 0) {
      const topCount = Math.max(1, Math.ceil(candidates.length * topPercent));
      const idx = Math.floor(Math.random() * topCount); // NOSONAR
      return candidates[idx].placement;
    }

    return candidates[0].placement;
  }

  // ---------------------------------------------------------------------------
  // Private — Evaluation
  // ---------------------------------------------------------------------------

  private evaluatePlacement(
    board: Board,
    type: TetrominoType,
    rotation: number,
    row: number,
    col: number,
  ): number {
    // 仮想ボードにピースを配置
    const gridCopy = board.grid.map((r) => [...r]);
    const shape = SHAPES[type][rotation];
    const size = shape.length;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const gr = row + r;
        const gc = col + c;
        if (gr >= 0 && gr < FIELD_ROWS_BUFFER && gc >= 0 && gc < FIELD_COLS) {
          gridCopy[gr][gc] = type;
        }
      }
    }

    // ライン消去シミュレーション
    let completeLines = 0;
    for (let r = FIELD_ROWS_BUFFER - 1; r >= 0; r--) {
      if (gridCopy[r].every((cell) => cell !== 0)) {
        gridCopy.splice(r, 1);
        gridCopy.unshift(Array.from({ length: FIELD_COLS }, () => 0));
        completeLines++;
        r++;
      }
    }

    // 評価指標の計算
    const heights = this.getColumnHeights(gridCopy);
    const aggregateHeight = heights.reduce((sum, h) => sum + h, 0);
    const holes = this.countHoles(gridCopy, heights);
    const bumpiness = this.calculateBumpiness(heights);

    // 重み付きスコア
    return (
      this.weights.aggregateHeight * aggregateHeight +
      this.weights.completeLines * completeLines +
      this.weights.holes * holes +
      this.weights.bumpiness * bumpiness
    );
  }

  private getColumnHeights(grid: number[][]): number[] {
    const heights = new Array(FIELD_COLS).fill(0);
    for (let c = 0; c < FIELD_COLS; c++) {
      for (let r = 0; r < FIELD_ROWS_BUFFER; r++) {
        if (grid[r][c] !== 0) {
          heights[c] = FIELD_ROWS_BUFFER - r;
          break;
        }
      }
    }
    return heights;
  }

  private countHoles(grid: number[][], heights: number[]): number {
    let holes = 0;
    for (let c = 0; c < FIELD_COLS; c++) {
      const topRow = FIELD_ROWS_BUFFER - heights[c];
      for (let r = topRow + 1; r < FIELD_ROWS_BUFFER; r++) {
        if (grid[r][c] === 0) {
          holes++;
        }
      }
    }
    return holes;
  }

  private calculateBumpiness(heights: number[]): number {
    let bumpiness = 0;
    for (let c = 0; c < FIELD_COLS - 1; c++) {
      bumpiness += Math.abs(heights[c] - heights[c + 1]);
    }
    return bumpiness;
  }

  // ---------------------------------------------------------------------------
  // Private — Drop calculation
  // ---------------------------------------------------------------------------

  private findDropRow(
    board: Board,
    type: TetrominoType,
    rotation: number,
    col: number,
  ): number {
    let row = 0;
    if (!board.canPlace(type, rotation, row, col)) {
      return -1;
    }
    while (board.canPlace(type, rotation, row + 1, col)) {
      row++;
    }
    return row;
  }

  private getMinCol(shape: number[][], size: number): number {
    // ピースの左端の実際のオフセットを見つける
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r++) {
        if (shape[r][c] !== 0) return -c;
      }
    }
    return 0;
  }

  private getMaxCol(shape: number[][], size: number): number {
    // ピースの右端の実際のオフセットを見つける
    for (let c = size - 1; c >= 0; c--) {
      for (let r = 0; r < size; r++) {
        if (shape[r][c] !== 0) return FIELD_COLS - 1 - c;
      }
    }
    return FIELD_COLS - 1;
  }
}
