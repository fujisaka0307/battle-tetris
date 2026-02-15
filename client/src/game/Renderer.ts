import {
  TetrominoType,
  FIELD_COLS,
  FIELD_ROWS,
  FIELD_ROWS_BUFFER,
} from '@battle-tetris/shared';
import {
  SHAPES,
  TETROMINO_COLORS,
  TETROMINO_COLORS_LIGHT,
  TETROMINO_COLORS_DARK,
} from './Tetromino';

// =============================================================================
// Constants
// =============================================================================

/** ブロック1セルの描画サイズ (px) */
const CELL_SIZE = 30;

/** グリッド線の色 */
const GRID_COLOR = 'rgba(255,255,255,0.06)';

/** グリッド線の太い色 (5行/5列ごと) */
const GRID_COLOR_THICK = 'rgba(255,255,255,0.12)';

/** フィールド背景色 */
const BG_COLOR = '#000000';

/** フィールド背景のグラデーション中心色 */
const BG_CENTER_COLOR = '#0a0a14';

/** おじゃまブロックの色 */
const GARBAGE_COLOR = '#808080';
const GARBAGE_COLOR_LIGHT = '#a0a0a0';
const GARBAGE_COLOR_DARK = '#505050';

/** ネクスト/ホールド表示のセルサイズ */
const PREVIEW_CELL_SIZE = 24;

/** ネクスト間の縦スペーシング (px) */
const PREVIEW_GAP = 8;

/** 相手フィールドのセルサイズ */
const MINI_CELL_SIZE = 14;

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
  private readonly ctx: CanvasRenderingContext2D;

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

    // 背景 — radial gradient for subtle depth
    const bgGrad = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height) * 0.7,
    );
    bgGrad.addColorStop(0, BG_CENTER_COLOR);
    bgGrad.addColorStop(1, BG_COLOR);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // フィールド上のブロック（バッファ行をスキップ: row 2以降を表示）
    const bufferOffset = FIELD_ROWS_BUFFER - FIELD_ROWS; // 2
    for (let r = 0; r < FIELD_ROWS; r++) {
      for (let c = 0; c < FIELD_COLS; c++) {
        const value = state.grid[r + bufferOffset][c];
        if (value !== 0) {
          const colors = this.getCellColors(value);
          this.drawBlock(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, colors);
        }
      }
    }

    // ゴーストピース
    if (state.currentPiece && state.ghostRow !== null) {
      this.drawGhostPiece(
        state.currentPiece.type,
        state.currentPiece.rotation,
        state.ghostRow - bufferOffset,
        state.currentPiece.col,
      );
    }

    // 現在のテトリミノ
    if (state.currentPiece) {
      this.drawPiece(
        state.currentPiece.type,
        state.currentPiece.rotation,
        state.currentPiece.row - bufferOffset,
        state.currentPiece.col,
        CELL_SIZE,
      );
    }

    // グリッド線
    this.drawGrid(width, height);
  }

  /**
   * ネクストキューを描画する（専用キャンバス上で 0,0 から描画）。
   */
  drawNextQueue(pieces: TetrominoType[]): void {
    const ctx = this.ctx;
    const canvasW = Renderer.nextQueueWidth;
    const canvasH = Renderer.nextQueueHeight;

    // 背景クリア
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0, 0, canvasW, canvasH);

    for (let i = 0; i < pieces.length; i++) {
      const type = pieces[i];
      const shape = SHAPES[type][0];
      const size = shape.length;
      const piecePixelW = size * PREVIEW_CELL_SIZE;
      const offsetX = (canvasW - piecePixelW) / 2;
      const offsetY = i * (4 * PREVIEW_CELL_SIZE + PREVIEW_GAP);

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (shape[r][c] !== 0) {
            const colors = this.getTetrominoColors(type);
            this.drawBlock(
              offsetX + c * PREVIEW_CELL_SIZE,
              offsetY + r * PREVIEW_CELL_SIZE,
              PREVIEW_CELL_SIZE,
              colors,
            );
          }
        }
      }
    }
  }

  /**
   * ホールドピースを描画する（専用キャンバス上で 0,0 から描画）。
   */
  drawHold(piece: TetrominoType | null): void {
    const ctx = this.ctx;
    const canvasW = Renderer.holdWidth;
    const canvasH = Renderer.holdHeight;

    // 背景クリア
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (piece === null) return;
    const shape = SHAPES[piece][0];
    const size = shape.length;
    const piecePixelW = size * PREVIEW_CELL_SIZE;
    const offsetX = (canvasW - piecePixelW) / 2;
    const offsetY = (canvasH - size * PREVIEW_CELL_SIZE) / 2;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] !== 0) {
          const colors = this.getTetrominoColors(piece);
          this.drawBlock(
            offsetX + c * PREVIEW_CELL_SIZE,
            offsetY + r * PREVIEW_CELL_SIZE,
            PREVIEW_CELL_SIZE,
            colors,
          );
        }
      }
    }
  }

  /**
   * 相手のフィールドを縮小描画する（専用キャンバス上で 0,0 から描画）。
   */
  drawOpponentField(state: OpponentRenderState): void {
    const ctx = this.ctx;
    const width = FIELD_COLS * MINI_CELL_SIZE;
    const height = FIELD_ROWS * MINI_CELL_SIZE;

    // 背景
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // ブロック
    for (let r = 0; r < FIELD_ROWS; r++) {
      const row = state.grid[r];
      if (!row) continue;
      for (let c = 0; c < FIELD_COLS; c++) {
        const value = row[c];
        if (value !== 0) {
          const colors = this.getCellColors(value);
          this.drawMiniBlock(c * MINI_CELL_SIZE, r * MINI_CELL_SIZE, colors);
        }
      }
    }

    // 枠線
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
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

  /** ネクストキュー表示幅 (px) */
  static get nextQueueWidth(): number {
    return 4 * PREVIEW_CELL_SIZE;
  }

  /** ネクストキュー表示高さ (px) — 3ピース分 */
  static get nextQueueHeight(): number {
    return 3 * (4 * PREVIEW_CELL_SIZE + PREVIEW_GAP);
  }

  /** ホールド表示幅 (px) */
  static get holdWidth(): number {
    return 4 * PREVIEW_CELL_SIZE;
  }

  /** ホールド表示高さ (px) */
  static get holdHeight(): number {
    return 4 * PREVIEW_CELL_SIZE;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Block rendering
  // ---------------------------------------------------------------------------

  /** 3D風グラデーションブロックを描画する */
  private drawBlock(
    x: number,
    y: number,
    size: number,
    colors: { base: string; light: string; dark: string },
  ): void {
    const ctx = this.ctx;
    const s = size - 1; // 1px gap

    // Gradient fill: top-left (light) → bottom-right (base)
    const grad = ctx.createLinearGradient(x, y, x + s, y + s);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.base);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, s, s);

    // Top & left highlight edge (2px)
    ctx.fillStyle = colors.light;
    ctx.fillRect(x, y, s, 2);       // top
    ctx.fillRect(x, y, 2, s);       // left

    // Bottom & right shadow edge (2px)
    ctx.fillStyle = colors.dark;
    ctx.fillRect(x, y + s - 2, s, 2); // bottom
    ctx.fillRect(x + s - 2, y, 2, s); // right
  }

  /** ミニブロック (相手フィールド用) — シンプルなグラデーション */
  private drawMiniBlock(
    x: number,
    y: number,
    colors: { base: string; light: string; dark: string },
  ): void {
    const ctx = this.ctx;
    const s = MINI_CELL_SIZE - 1;

    const grad = ctx.createLinearGradient(x, y, x + s, y + s);
    grad.addColorStop(0, colors.light);
    grad.addColorStop(1, colors.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, s, s);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Piece rendering
  // ---------------------------------------------------------------------------

  private drawPiece(
    type: TetrominoType,
    rotation: number,
    displayRow: number,
    col: number,
    cellSize: number,
  ): void {
    const shape = SHAPES[type][rotation];
    const size = shape.length;
    const colors = this.getTetrominoColors(type);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const drawRow = displayRow + r;
        if (drawRow < 0) continue; // Still in buffer, don't draw
        this.drawBlock(
          (col + c) * cellSize,
          drawRow * cellSize,
          cellSize,
          colors,
        );
      }
    }
  }

  /** ゴーストピース — ネオンアウトライン + 薄いフィル */
  private drawGhostPiece(
    type: TetrominoType,
    rotation: number,
    displayRow: number,
    col: number,
  ): void {
    const ctx = this.ctx;
    const shape = SHAPES[type][rotation];
    const size = shape.length;
    const color = TETROMINO_COLORS[type];

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (shape[r][c] === 0) continue;
        const drawRow = displayRow + r;
        if (drawRow < 0) continue;
        const x = (col + c) * CELL_SIZE;
        const y = drawRow * CELL_SIZE;
        const s = CELL_SIZE - 1;

        // 薄い背景フィル
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(x, y, s, s);

        // ネオンアウトライン
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      }
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Grid
  // ---------------------------------------------------------------------------

  private drawGrid(width: number, height: number): void {
    const ctx = this.ctx;

    // 通常グリッド線
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    for (let c = 1; c < FIELD_COLS; c++) {
      if (c % 5 === 0) continue; // 太い線は別途描画
      const x = c * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let r = 1; r < FIELD_ROWS; r++) {
      if (r % 5 === 0) continue;
      const y = r * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 太いグリッド線 (5行/5列ごと)
    ctx.strokeStyle = GRID_COLOR_THICK;
    ctx.lineWidth = 2;

    for (let c = 5; c < FIELD_COLS; c += 5) {
      const x = c * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let r = 5; r < FIELD_ROWS; r += 5) {
      const y = r * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Color
  // ---------------------------------------------------------------------------

  private getTetrominoColors(type: TetrominoType): { base: string; light: string; dark: string } {
    return {
      base: TETROMINO_COLORS[type],
      light: TETROMINO_COLORS_LIGHT[type],
      dark: TETROMINO_COLORS_DARK[type],
    };
  }

  private getCellColors(value: number): { base: string; light: string; dark: string } {
    if (value === 8) {
      return { base: GARBAGE_COLOR, light: GARBAGE_COLOR_LIGHT, dark: GARBAGE_COLOR_DARK };
    }
    if (value >= 1 && value <= 7) {
      return this.getTetrominoColors(value as TetrominoType);
    }
    return { base: BG_COLOR, light: BG_COLOR, dark: BG_COLOR };
  }
}
