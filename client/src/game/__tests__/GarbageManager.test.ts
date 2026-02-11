import { describe, it, expect } from 'vitest';
import { FIELD_COLS } from '@battle-tetris/shared';
import { GarbageManager } from '../GarbageManager';
import { Board } from '../Board';

describe('GarbageManager', () => {
  it('初期状態でキューが空であること', () => {
    const gm = new GarbageManager();
    expect(gm.pending()).toBe(0);
  });

  it('add() でキューにおじゃまが追加されること', () => {
    const gm = new GarbageManager();
    gm.add(3);
    expect(gm.pending()).toBe(3);
    gm.add(2);
    expect(gm.pending()).toBe(5);
  });

  it('負数の add は無視されること', () => {
    const gm = new GarbageManager();
    gm.add(-1);
    expect(gm.pending()).toBe(0);
  });

  it('flush() でフィールドにおじゃまラインがせり上がること', () => {
    // 穴の位置を固定するためRNGを固定
    const gm = new GarbageManager(() => 0.3); // floor(0.3 * 10) = col 3
    const board = new Board();
    gm.add(2);
    const flushed = gm.flush(board);

    expect(flushed).toBe(2);
    expect(gm.pending()).toBe(0);

    // フィールドの下2行がおじゃまラインであること
    const grid = board.grid;
    const lastRow = grid[grid.length - 1];
    const secondLastRow = grid[grid.length - 2];

    // 穴以外のセルが 8 (おじゃまブロック色) であること
    for (let c = 0; c < FIELD_COLS; c++) {
      if (c === 3) {
        expect(lastRow[c]).toBe(0);
        expect(secondLastRow[c]).toBe(0);
      } else {
        expect(lastRow[c]).toBe(8);
        expect(secondLastRow[c]).toBe(8);
      }
    }
  });

  it('キューが空の場合 flush() が 0 を返し、せり上げが発生しないこと', () => {
    const gm = new GarbageManager();
    const board = new Board();
    const flushed = gm.flush(board);

    expect(flushed).toBe(0);
    // フィールドが全て空であること
    for (const row of board.grid) {
      expect(row.every((cell) => cell === 0)).toBe(true);
    }
  });

  it('おじゃまラインに穴が1つだけ空いていること', () => {
    const gm = new GarbageManager(() => 0.5); // floor(0.5 * 10) = col 5
    const board = new Board();
    gm.add(1);
    gm.flush(board);

    const lastRow = board.grid[board.grid.length - 1];
    const holes = lastRow.filter((cell) => cell === 0).length;
    expect(holes).toBe(1);
    expect(lastRow[5]).toBe(0);
  });

  it('cancel() でキューが相殺されること', () => {
    const gm = new GarbageManager();
    gm.add(4);
    const cancelled = gm.cancel(2);

    expect(cancelled).toBe(2);
    expect(gm.pending()).toBe(2);
  });

  it('cancel() でキュー以上の値を指定するとキューが0になること', () => {
    const gm = new GarbageManager();
    gm.add(3);
    const cancelled = gm.cancel(5);

    expect(cancelled).toBe(3);
    expect(gm.pending()).toBe(0);
  });

  it('reset() でキューがクリアされること', () => {
    const gm = new GarbageManager();
    gm.add(5);
    gm.reset();
    expect(gm.pending()).toBe(0);
  });
});
