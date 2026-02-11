import {
  TetrominoType,
  FIELD_COLS,
  FIELD_ROWS,
  FIELD_ROWS_BUFFER,
} from '@battle-tetris/shared';
import { SHAPES, TETROMINO_COLORS } from './Tetromino';

// =============================================================================
// Constants
// =============================================================================

/** ブロック1セルの描画サイズ (px) */
const CELL_SIZE = 30;

/** グリッド線の色 */
const GRID_COLOR = '#222222';

/** フィールド背景色 */
const BG_COLOR = '#000000';

/** ゴーストピースの透明度 */
const GHOST_ALPHA = 0.3;

/** おじゃまブロックの色 */
const GARBAGE_COLOR = '#808080';

/** ブロック枠線の色 */
const BLOCK_BORDER_COLOR = 'rgba(255,255,255,0.15)';

/** ネクスト/ホールド表示のセルサイズ */
const PREVIEW_CELL_SIZE = 20;

/** 相手フィールドのセルサイズ */
const MINI_CELL_SIZE = 10;

// =============================================================================
// Types
// =============================================================================

export interface RenderState {
  /** フィールド (バッファ含む 22行) */
  grid: number[][];
  /** 現在のテトリミノ */
  currentPiece: {
    type: TetrominoType;
    rotation: number;
    row: number;
    col: number;
  } | null;
  /** ゴーストピースの行 */
  ghostRow: number | null;
  /** ネクストキュー (3つ) */
  nextPieces: TetrominoType[];
  /** ホールドピース */
  holdPiece: TetrominoType | null;
}

export interface OpponentRenderState {
  /** 相手のフィールド (表示領域 20行) */
  grid: number[][];
}

// =============================================================================
// Renderer
// =============================================================================

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * メインフィールドを描画する。
   */
  drawField(state: RenderState): void {
    const ctx = this.ctx;
    const width = FIELD_COLS * CELL_SIZE;
    const height = FIELD_ROWS * CELL_SIZE;

    // 背景
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // フィールド上のブロック（バッファ行をスキップ: row 2以降を表示）
    const bufferOffset = FIELD_ROWS_BUFFER - FIELD_ROWS; // 2
    for (let r = 0; r < FIELD_ROWS; r++) {
      for (let c = 0; c < FIELD_COLS; c++) {
        const value = state.grid[r + bufferOffset][c];
        if (value !== 0) {
          this.drawBlock(c, r, this.getCellColor(value));
        }
      }
    }

    // ゴーストピース
    if (state.currentPiece && state.ghostRow !== null) {
      this.drawPiece(
        state.currentPiece.type,
        state.currentPiece.rotation,
        state.ghostRow - bufferOffset,
        state.currentPiece.col,
        GHOST_ALPHA,
      );
    }

    // 現在のテトリミノ
    if (state.currentPiece) {
      this.drawPiece(
        state.currentPiece.type,
        state.currentPiece.rotation,
        state.currentPiece.row - bufferOffset,
        state.currentPiece.col,
        1.0,
      );
    }

    // グリッド線
    this.drawGrid(width, height);
  }

  /**
   * ネクストキューを描画する。
   * @param x 描画開始X座標
   * @param y 描画開始Y座標
   */
  drawNextQueue(pieces: TetrominoType[], x: number, y: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < pieces.length; i++) {
      const type = pieces[i];
      const shape = SHAPES[type][0];
      const size = shape.length;
      const offsetY = y + i * (size + 1) * PREVIEW_CELL_SIZE;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (shape[r][c] !== 0) {
            ctx.fillStyle = TETROMINO_COLORS[type];
            ctx.fillRect(
              x + c * PREVIEW_CELL_SIZE,
              offsetY + r * PREVIEW_CELL_SIZE,
              PREVIEW_CELL_SIZE - 1,
              PREVIEW_CELL_SIZE - 1,
            );
          }
        }
      }
    }
  }

  /**
   * ホールドピースを描画する。
   * @param x 描画開始X座標
   * @param y 描画開始Y座標
   */
  drawHold(piece: TetrominoType | null, x: number, y: number): void {
    if (piece === null) return;
    const ctx = this.ctx;
    const shape = SHAPES[piece][0];
    const size = shape.length;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] !== 0) {
          ctx.fillStyle = TETROMINO_COLORS[piece];
          ctx.fillRect(
            x + c * PREVIEW_CELL_SIZE,
            y + r * PREVIEW_CELL_SIZE,
            PREVIEW_CELL_SIZE - 1,
            PREVIEW_CELL_SIZE - 1,
          );
        }
      }
    }
  }

  /**
   * 相手のフィールドを縮小描画する。
   * @param x 描画開始X座標
   * @param y 描画開始Y座標
   */
  drawOpponentField(state: OpponentRenderState, x: number, y: number): void {
    const ctx = this.ctx;
    const width = FIELD_COLS * MINI_CELL_SIZE;
    const height = FIELD_ROWS * MINI_CELL_SIZE;

    // 背景
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(x, y, width, height);

    // ブロック
    for (let r = 0; r < FIELD_ROWS; r++) {
      const row = state.grid[r];
      if (!row) continue;
      for (let c = 0; c < FIELD_COLS; c++) {
        const value = row[c];
        if (value !== 0) {
          ctx.fillStyle = this.getCellColor(value);
          ctx.fillRect(
            x + c * MINI_CELL_SIZE,
            y + r * MINI_CELL_SIZE,
            MINI_CELL_SIZE - 1,
            MINI_CELL_SIZE - 1,
          );
        }
      }
    }

    // 枠線
    ctx.strokeStyle = GRID_COLOR;
    ctx.strokeRect(x, y, width, height);
  }

  // ---------------------------------------------------------------------------
  // Sizing helpers
  // ---------------------------------------------------------------------------

  /** メインフィールドの幅 (px) */
  static get fieldWidth(): number {
    return FIELD_COLS * CELL_SIZE;
  }

  /** メインフィールドの高さ (px) */
  static get fieldHeight(): number {
    return FIELD_ROWS * CELL_SIZE;
  }

  /** 相手フィールドの幅 (px) */
  static get miniFieldWidth(): number {
    return FIELD_COLS * MINI_CELL_SIZE;
  }

  /** 相手フィールドの高さ (px) */
  static get miniFieldHeight(): number {
    return FIELD_ROWS * MINI_CELL_SIZE;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private drawBlock(col: number, row: number, color: string): void {
    const ctx = this.ctx;
    const x = col * CELL_SIZE;
    const y = row * CELL_SIZE;

    ctx.fillStyle = color;
    ctx.fillRect(x, y, CELL_SIZE - 1, CELL_SIZE - 1);

    // Subtle border highlight
    ctx.strokeStyle = BLOCK_BORDER_COLOR;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 2, CELL_SIZE - 2);
  }

  private drawPiece(
    type: TetrominoType,
    rotation: number,
    displayRow: number,
    col: number,
    alpha: number,
  ): void {
    const ctx = this.ctx;
    const shape = SHAPES[type][rotation];
    const size = shape.length;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const drawRow = displayRow + r;
        if (drawRow < 0) continue; // Still in buffer, don't draw
        this.drawBlock(col + c, drawRow, TETROMINO_COLORS[type]);
      }
    }

    ctx.globalAlpha = prevAlpha;
  }

  private drawGrid(width: number, height: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;

    for (let c = 0; c <= FIELD_COLS; c++) {
      const x = c * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let r = 0; r <= FIELD_ROWS; r++) {
      const y = r * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  private getCellColor(value: number): string {
    if (value === 8) return GARBAGE_COLOR;
    if (value >= 1 && value <= 7) {
      return TETROMINO_COLORS[value as TetrominoType];
    }
    return BG_COLOR;
  }
}
