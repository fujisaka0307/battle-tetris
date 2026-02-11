import { describe, it, expect } from 'vitest';
import { TetrominoType } from '@battle-tetris/shared';
import {
  SHAPES,
  WALL_KICK_I,
  WALL_KICK_JLSTZ,
  TETROMINO_COLORS,
  ALL_TETROMINO_TYPES,
  ROTATION_COUNT,
  getWallKickData,
  nextRotation,
  getSpawnPosition,
} from '../Tetromino';

describe('SHAPES', () => {
  it('defines shapes for all 7 tetromino types', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      expect(SHAPES[type]).toBeDefined();
    }
  });

  it('each type has exactly 4 rotation states', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      expect(SHAPES[type]).toHaveLength(ROTATION_COUNT);
    }
  });

  it('I and O use 4x4 matrices', () => {
    for (const rotation of SHAPES[TetrominoType.I]) {
      expect(rotation).toHaveLength(4);
      for (const row of rotation) {
        expect(row).toHaveLength(4);
      }
    }
    for (const rotation of SHAPES[TetrominoType.O]) {
      expect(rotation).toHaveLength(4);
    }
  });

  it('T, S, Z, J, L use 3x3 matrices', () => {
    const types3x3 = [
      TetrominoType.T,
      TetrominoType.S,
      TetrominoType.Z,
      TetrominoType.J,
      TetrominoType.L,
    ];
    for (const type of types3x3) {
      for (const rotation of SHAPES[type]) {
        expect(rotation).toHaveLength(3);
        for (const row of rotation) {
          expect(row).toHaveLength(3);
        }
      }
    }
  });

  it('each shape has exactly 4 filled cells', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      for (let r = 0; r < ROTATION_COUNT; r++) {
        const count = SHAPES[type][r].flat().filter((c) => c === 1).length;
        expect(count).toBe(4);
      }
    }
  });

  it('4 rotations return to original shape', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      // Rotation state 0 should match after going 0→1→2→3→0
      const original = SHAPES[type][0];
      // After 4 quarter turns we're back to state 0
      const backToOriginal = SHAPES[type][nextRotation(nextRotation(nextRotation(nextRotation(0, 1), 1), 1), 1)];
      expect(backToOriginal).toEqual(original);
    }
  });
});

describe('Wall Kick Data', () => {
  const allTransitions = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3'];

  it('JLSTZ wall kick has all 8 transitions', () => {
    for (const key of allTransitions) {
      expect(WALL_KICK_JLSTZ[key]).toBeDefined();
      expect(WALL_KICK_JLSTZ[key]).toHaveLength(5);
    }
  });

  it('I wall kick has all 8 transitions', () => {
    for (const key of allTransitions) {
      expect(WALL_KICK_I[key]).toBeDefined();
      expect(WALL_KICK_I[key]).toHaveLength(5);
    }
  });

  it('first offset is always [0,0] (no kick)', () => {
    for (const key of allTransitions) {
      expect(WALL_KICK_JLSTZ[key][0]).toEqual([0, 0]);
      expect(WALL_KICK_I[key][0]).toEqual([0, 0]);
    }
  });

  it('I mino uses different offsets than JLSTZ', () => {
    // At least one transition should differ
    let hasDifference = false;
    for (const key of allTransitions) {
      if (JSON.stringify(WALL_KICK_I[key]) !== JSON.stringify(WALL_KICK_JLSTZ[key])) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });
});

describe('getWallKickData', () => {
  it('returns I kick data for I mino', () => {
    expect(getWallKickData(TetrominoType.I)).toBe(WALL_KICK_I);
  });

  it('returns JLSTZ kick data for other minos', () => {
    const others = [
      TetrominoType.O,
      TetrominoType.T,
      TetrominoType.S,
      TetrominoType.Z,
      TetrominoType.J,
      TetrominoType.L,
    ];
    for (const type of others) {
      expect(getWallKickData(type)).toBe(WALL_KICK_JLSTZ);
    }
  });
});

describe('TETROMINO_COLORS', () => {
  it('defines a color for each type', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      expect(TETROMINO_COLORS[type]).toBeDefined();
      expect(typeof TETROMINO_COLORS[type]).toBe('string');
      expect(TETROMINO_COLORS[type].length).toBeGreaterThan(0);
    }
  });
});

describe('nextRotation', () => {
  it('CW: 0→1→2→3→0', () => {
    expect(nextRotation(0, 1)).toBe(1);
    expect(nextRotation(1, 1)).toBe(2);
    expect(nextRotation(2, 1)).toBe(3);
    expect(nextRotation(3, 1)).toBe(0);
  });

  it('CCW: 0→3→2→1→0', () => {
    expect(nextRotation(0, -1)).toBe(3);
    expect(nextRotation(3, -1)).toBe(2);
    expect(nextRotation(2, -1)).toBe(1);
    expect(nextRotation(1, -1)).toBe(0);
  });
});

describe('getSpawnPosition', () => {
  it('returns valid spawn position for all types', () => {
    for (const type of ALL_TETROMINO_TYPES) {
      const [row, col] = getSpawnPosition(type);
      expect(row).toBe(0);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(10);
    }
  });

  it('centers the piece horizontally', () => {
    // 3x3 pieces should be at col 3 (centered in 10-wide field)
    const [, colT] = getSpawnPosition(TetrominoType.T);
    expect(colT).toBe(3);

    // 4x4 pieces (I, O) should be at col 3
    const [, colI] = getSpawnPosition(TetrominoType.I);
    expect(colI).toBe(3);
  });
});
