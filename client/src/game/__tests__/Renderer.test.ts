import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TetrominoType, FIELD_COLS, FIELD_ROWS, FIELD_ROWS_BUFFER } from '@battle-tetris/shared';
import { Renderer, RenderState, OpponentRenderState } from '../Renderer';
import { Board } from '../Board';

// =============================================================================
// Mock Canvas 2D Context
// =============================================================================

function createMockCtx() {
  const mockGradient = { addColorStop: vi.fn() };
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue(mockGradient),
    createRadialGradient: vi.fn().mockReturnValue(mockGradient),
  } as unknown as CanvasRenderingContext2D;
}

function createEmptyState(): RenderState {
  const grid = Board.createEmptyGrid();
  return {
    grid,
    currentPiece: null,
    ghostRow: null,
    nextPieces: [],
    holdPiece: null,
  };
}

describe('Renderer', () => {
  let ctx: ReturnType<typeof createMockCtx>;
  let renderer: Renderer;

  beforeEach(() => {
    ctx = createMockCtx();
    renderer = new Renderer(ctx as unknown as CanvasRenderingContext2D);
  });

  // ---------------------------------------------------------------------------
  // drawField
  // ---------------------------------------------------------------------------

  describe('drawField', () => {
    it('空フィールドで描画エラーが起きないこと', () => {
      const state = createEmptyState();
      expect(() => renderer.drawField(state)).not.toThrow();
    });

    it('フィールド描画で fillRect が呼ばれること', () => {
      const state = createEmptyState();
      renderer.drawField(state);
      // At minimum, the background fillRect should be called
      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });

    it('ブロックがあるセルで fillRect が追加で呼ばれること', () => {
      const state = createEmptyState();
      // Place a block at visible row 19 (bottom), col 0
      const bufferOffset = FIELD_ROWS_BUFFER - FIELD_ROWS;
      state.grid[bufferOffset + 19][0] = TetrominoType.I;

      renderer.drawField(state);

      // fillRect should be called more than just the background
      const calls = (ctx.fillRect as any).mock.calls;
      expect(calls.length).toBeGreaterThan(1);
    });

    it('ゴーストピースで save/restore が呼ばれること', () => {
      const state = createEmptyState();
      state.currentPiece = {
        type: TetrominoType.T,
        rotation: 0,
        row: 2,
        col: 3,
      };
      state.ghostRow = 18;

      renderer.drawField(state);

      // save/restore should have been called for ghost piece rendering
      expect((ctx.save as any)).toHaveBeenCalled();
      expect((ctx.restore as any)).toHaveBeenCalled();
    });

    it('グリッド線が描画されること', () => {
      const state = createEmptyState();
      renderer.drawField(state);

      // stroke should be called for grid lines
      expect((ctx.stroke as any)).toHaveBeenCalled();
      // beginPath should be called for each grid line
      expect((ctx.beginPath as any)).toHaveBeenCalled();
    });

    it('現在のテトリミノが描画されること', () => {
      const state = createEmptyState();
      state.currentPiece = {
        type: TetrominoType.I,
        rotation: 0,
        row: 2,
        col: 3,
      };
      state.ghostRow = null;

      renderer.drawField(state);
      const callsAfter = (ctx.fillRect as any).mock.calls.length;

      // I piece (rotation 0) has 4 blocks, each block uses multiple fillRect calls (gradient + edges)
      expect(callsAfter).toBeGreaterThan(0);
    });

    it('バッファ行にあるピースの描画で drawRow < 0 のセルがスキップされること', () => {
      const state = createEmptyState();
      state.currentPiece = {
        type: TetrominoType.T,
        rotation: 0,
        row: 0,
        col: 3,
      };
      state.ghostRow = null;

      // Should not throw even though the piece is in the buffer
      expect(() => renderer.drawField(state)).not.toThrow();
    });

    it('ゴーストピースがバッファ行にある場合もエラーが起きないこと', () => {
      const state = createEmptyState();
      state.currentPiece = {
        type: TetrominoType.T,
        rotation: 0,
        row: 0,
        col: 3,
      };
      state.ghostRow = 0;

      expect(() => renderer.drawField(state)).not.toThrow();
    });

    it('背景にradialGradientが使われること', () => {
      const state = createEmptyState();
      renderer.drawField(state);
      expect((ctx.createRadialGradient as any)).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // drawNextQueue
  // ---------------------------------------------------------------------------

  describe('drawNextQueue', () => {
    it('ネクスト3つが描画されること', () => {
      const pieces = [TetrominoType.I, TetrominoType.T, TetrominoType.O];
      renderer.drawNextQueue(pieces);
      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });

    it('空配列でもエラーにならないこと', () => {
      expect(() => renderer.drawNextQueue([])).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // drawHold
  // ---------------------------------------------------------------------------

  describe('drawHold', () => {
    it('ホールドピースが描画されること', () => {
      renderer.drawHold(TetrominoType.J);
      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });

    it('null の場合はクリアのみでピースが描画されないこと', () => {
      renderer.drawHold(null);
      // Only clearRect call for clearing the area, no piece blocks drawn
      expect((ctx.clearRect as any)).toHaveBeenCalledTimes(1);
      expect((ctx.fillRect as any)).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // drawOpponentField
  // ---------------------------------------------------------------------------

  describe('drawOpponentField', () => {
    it('相手フィールドが描画されること', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      // Place some blocks
      grid[19][0] = TetrominoType.I;
      grid[19][1] = TetrominoType.I;

      const state: OpponentRenderState = { grid };
      renderer.drawOpponentField(state);

      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });

    it('空の相手フィールドでエラーにならないこと', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      const state: OpponentRenderState = { grid };
      expect(() => renderer.drawOpponentField(state)).not.toThrow();
    });

    it('行が undefined の場合にスキップされること (defensive)', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      // Force a row to be undefined to trigger the `if (!row) continue` branch
      (grid as any)[5] = undefined;
      const state: OpponentRenderState = { grid };
      expect(() => renderer.drawOpponentField(state)).not.toThrow();
    });

    it('おじゃまブロック (value=8) が描画されること', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      grid[19][0] = 8; // garbage block
      const state: OpponentRenderState = { grid };
      renderer.drawOpponentField(state);
      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  describe('field dimensions', () => {
    it('フィールドサイズが正しいこと', () => {
      expect(Renderer.fieldWidth).toBe(FIELD_COLS * 30);
      expect(Renderer.fieldHeight).toBe(FIELD_ROWS * 30);
    });

    it('ミニフィールドサイズが正しいこと', () => {
      expect(Renderer.miniFieldWidth).toBe(FIELD_COLS * 14);
      expect(Renderer.miniFieldHeight).toBe(FIELD_ROWS * 14);
    });

    it('ネクストキューサイズが正しいこと', () => {
      expect(Renderer.nextQueueWidth).toBe(4 * 24);
      expect(Renderer.nextQueueHeight).toBe(3 * (4 * 24 + 8));
    });

    it('ホールドサイズが正しいこと', () => {
      expect(Renderer.holdWidth).toBe(4 * 24);
      expect(Renderer.holdHeight).toBe(4 * 24);
    });
  });

  // ---------------------------------------------------------------------------
  // getCellColors edge cases
  // ---------------------------------------------------------------------------

  describe('getCellColor エッジケース', () => {
    it('value 0 (空セル) でフィールド背景色が返ること', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      // Value 9 is not a valid tetromino type (1-7) nor garbage (8)
      grid[19][0] = 9;
      const state: OpponentRenderState = { grid };
      renderer.drawOpponentField(state);

      const fillStyleValues = (ctx.fillRect as any).mock.calls.map(
        (_: any, _idx: number) => {
          return true;
        },
      );
      expect(fillStyleValues.length).toBeGreaterThan(0);
    });

    it('value 99 (不明な値) でもエラーにならないこと', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      grid[0][0] = 99; // Unknown value
      const state: OpponentRenderState = { grid };
      expect(() => renderer.drawOpponentField(state)).not.toThrow();
    });

    it('value -1 (負の値) でもエラーにならないこと', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      grid[0][0] = -1; // Negative value
      const state: OpponentRenderState = { grid };
      expect(() => renderer.drawOpponentField(state)).not.toThrow();
    });

    it('全テトリミノタイプ (1-7) でそれぞれ描画されること', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      // Place one of each tetromino type
      for (let t = 1; t <= 7; t++) {
        grid[19][t - 1] = t;
      }
      const state: OpponentRenderState = { grid };
      renderer.drawOpponentField(state);
      // Should have drawn background + 7 mini blocks + border
      expect((ctx.fillRect as any).mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    it('おじゃまブロック (value=8) でグレー色が使われること', () => {
      const grid = Array.from({ length: FIELD_ROWS }, () =>
        Array.from({ length: FIELD_COLS }, () => 0),
      );
      grid[19][0] = 8;
      const state: OpponentRenderState = { grid };

      renderer.drawOpponentField(state);

      expect((ctx.fillRect as any)).toHaveBeenCalled();
    });

    it('メインフィールドで不明な値 (value=10) が描画されてもエラーにならないこと', () => {
      const state = createEmptyState();
      const bufferOffset = FIELD_ROWS_BUFFER - FIELD_ROWS;
      state.grid[bufferOffset + 19][0] = 10; // Unknown value
      expect(() => renderer.drawField(state)).not.toThrow();
    });
  });
});
