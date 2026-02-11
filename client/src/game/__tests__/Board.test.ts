import { describe, it, expect, beforeEach } from 'vitest';
import { TetrominoType, FIELD_COLS, FIELD_ROWS, FIELD_ROWS_BUFFER } from '@battle-tetris/shared';
import { Board } from '../Board';
import { getSpawnPosition } from '../Tetromino';

describe('Board', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board();
  });

  describe('initialization', () => {
    it('creates an empty grid of FIELD_ROWS_BUFFER x FIELD_COLS', () => {
      expect(board.grid).toHaveLength(FIELD_ROWS_BUFFER);
      for (const row of board.grid) {
        expect(row).toHaveLength(FIELD_COLS);
        expect(row.every((c) => c === 0)).toBe(true);
      }
    });
  });

  describe('canPlace', () => {
    it('allows placement on empty field', () => {
      const [row, col] = getSpawnPosition(TetrominoType.T);
      expect(board.canPlace(TetrominoType.T, 0, row, col)).toBe(true);
    });

    it('rejects placement outside left wall', () => {
      expect(board.canPlace(TetrominoType.T, 0, 0, -2)).toBe(false);
    });

    it('rejects placement outside right wall', () => {
      expect(board.canPlace(TetrominoType.T, 0, 0, FIELD_COLS - 1)).toBe(false);
    });

    it('rejects placement below floor', () => {
      expect(board.canPlace(TetrominoType.T, 0, FIELD_ROWS_BUFFER - 1, 3)).toBe(false);
    });

    it('rejects placement overlapping existing blocks', () => {
      // Place a block at row 10, col 4
      board.grid[10][4] = TetrominoType.I;
      // T-piece at rotation 0 occupies (row, col+1), (row+1, col), (row+1, col+1), (row+1, col+2)
      // row=9, col=3 -> cells at (9,4), (10,3), (10,4), (10,5) -- (10,4) collides
      expect(board.canPlace(TetrominoType.T, 0, 9, 3)).toBe(false);
    });
  });

  describe('lock', () => {
    it('writes tetromino type value to grid cells', () => {
      // T-piece rotation 0 at row 0, col 3:
      // shape: [0,1,0], [1,1,1], [0,0,0]
      board.lock(TetrominoType.T, 0, 0, 3);
      expect(board.grid[0][4]).toBe(TetrominoType.T); // top center
      expect(board.grid[1][3]).toBe(TetrominoType.T); // bottom left
      expect(board.grid[1][4]).toBe(TetrominoType.T); // bottom center
      expect(board.grid[1][5]).toBe(TetrominoType.T); // bottom right
      // Surrounding cells remain 0
      expect(board.grid[0][3]).toBe(0);
      expect(board.grid[0][5]).toBe(0);
    });

    it('バッファ上部にはみ出したピースのロックで gr < 0 のセルがスキップされること', () => {
      // Place an I-piece at row = -1 (partially above the buffer).
      // I-piece rotation 0 shape (4x4):
      //   [0,0,0,0]  <- row -1 + 0 = -1 (all zeros, no block)
      //   [1,1,1,1]  <- row -1 + 1 =  0 (within grid)
      //   [0,0,0,0]  <- row -1 + 2 =  1
      //   [0,0,0,0]  <- row -1 + 3 =  2
      // All filled cells are at gr=0, so this should work fine.

      // For a more interesting test, use T-piece at row = -1:
      // T-piece rotation 0 shape (3x3):
      //   [0,1,0]  <- row -1 + 0 = -1 (gr < 0, should be skipped)
      //   [1,1,1]  <- row -1 + 1 =  0 (within grid)
      //   [0,0,0]  <- row -1 + 2 =  1
      board.lock(TetrominoType.T, 0, -1, 3);

      // The cell at gr=-1 (row=-1+0=−1, col=4) should be skipped
      // The cells at gr=0 should be written
      expect(board.grid[0][3]).toBe(TetrominoType.T); // row 0, col 3
      expect(board.grid[0][4]).toBe(TetrominoType.T); // row 0, col 4
      expect(board.grid[0][5]).toBe(TetrominoType.T); // row 0, col 5
      // row -1 is out of bounds, so no crash and no write
    });
  });

  describe('clearLines', () => {
    it('clears a single complete line', () => {
      // Fill the bottom row
      const bottomRow = FIELD_ROWS_BUFFER - 1;
      for (let c = 0; c < FIELD_COLS; c++) {
        board.grid[bottomRow][c] = TetrominoType.I;
      }
      const cleared = board.clearLines();
      expect(cleared).toBe(1);
      // Bottom row should now be empty
      expect(board.grid[bottomRow].every((c) => c === 0)).toBe(true);
    });

    it('clears multiple lines simultaneously', () => {
      const bottom = FIELD_ROWS_BUFFER - 1;
      // Fill bottom 2 rows
      for (let r = bottom - 1; r <= bottom; r++) {
        for (let c = 0; c < FIELD_COLS; c++) {
          board.grid[r][c] = TetrominoType.O;
        }
      }
      const cleared = board.clearLines();
      expect(cleared).toBe(2);
    });

    it('clears 4 lines (Tetris)', () => {
      const bottom = FIELD_ROWS_BUFFER - 1;
      for (let r = bottom - 3; r <= bottom; r++) {
        for (let c = 0; c < FIELD_COLS; c++) {
          board.grid[r][c] = TetrominoType.J;
        }
      }
      const cleared = board.clearLines();
      expect(cleared).toBe(4);
    });

    it('drops upper rows after clearing', () => {
      const bottom = FIELD_ROWS_BUFFER - 1;
      // Place a block above a full line
      board.grid[bottom - 1][5] = TetrominoType.S;
      // Fill the bottom row
      for (let c = 0; c < FIELD_COLS; c++) {
        board.grid[bottom][c] = TetrominoType.I;
      }
      board.clearLines();
      // The block should have fallen down one row
      expect(board.grid[bottom][5]).toBe(TetrominoType.S);
      expect(board.grid[bottom - 1][5]).toBe(0);
    });

    it('returns 0 when no lines are complete', () => {
      board.grid[FIELD_ROWS_BUFFER - 1][0] = TetrominoType.I;
      expect(board.clearLines()).toBe(0);
    });
  });

  describe('addGarbageLines', () => {
    it('adds garbage lines at the bottom with a hole', () => {
      board.addGarbageLines(2, 3);
      const bottom = FIELD_ROWS_BUFFER - 1;
      // Bottom 2 rows should be garbage
      for (let r = bottom - 1; r <= bottom; r++) {
        for (let c = 0; c < FIELD_COLS; c++) {
          if (c === 3) {
            expect(board.grid[r][c]).toBe(0); // hole
          } else {
            expect(board.grid[r][c]).toBe(8); // garbage block
          }
        }
      }
    });

    it('pushes existing blocks upward', () => {
      const bottom = FIELD_ROWS_BUFFER - 1;
      board.grid[bottom][5] = TetrominoType.T;
      board.addGarbageLines(1, 0);
      // Block should have moved up by 1
      expect(board.grid[bottom - 1][5]).toBe(TetrominoType.T);
    });
  });

  describe('isGameOver', () => {
    it('returns false on empty field', () => {
      const [row, col] = getSpawnPosition(TetrominoType.T);
      expect(board.isGameOver(TetrominoType.T, 0, row, col)).toBe(false);
    });

    it('returns true when spawn position is blocked', () => {
      const [row, col] = getSpawnPosition(TetrominoType.T);
      // Block the spawn area
      const shape = [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
      ];
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            board.grid[row + r][col + c] = TetrominoType.I;
          }
        }
      }
      expect(board.isGameOver(TetrominoType.T, 0, row, col)).toBe(true);
    });
  });

  describe('getVisibleGrid', () => {
    it('returns 20 rows (excludes 2 buffer rows)', () => {
      const visible = board.getVisibleGrid();
      expect(visible).toHaveLength(FIELD_ROWS);
    });

    it('returns a copy (not a reference)', () => {
      const visible = board.getVisibleGrid();
      visible[0][0] = 99;
      expect(board.grid[2][0]).toBe(0); // original unchanged
    });
  });

  describe('reset', () => {
    it('clears all cells', () => {
      board.grid[10][5] = TetrominoType.Z;
      board.grid[15][3] = TetrominoType.I;
      board.reset();
      for (const row of board.grid) {
        expect(row.every((c) => c === 0)).toBe(true);
      }
    });
  });
});
