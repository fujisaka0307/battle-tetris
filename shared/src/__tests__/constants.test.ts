import { describe, it, expect } from 'vitest';
import {
  FIELD_COLS,
  FIELD_ROWS,
  FIELD_ROWS_BUFFER,
  LOCK_DELAY_MS,
  LOCK_DELAY_MAX_RESETS,
  DAS_MS,
  ARR_MS,
  FIELD_SYNC_INTERVAL_MS,
  DISCONNECT_TIMEOUT_MS,
  COUNTDOWN_SECONDS,
  LINE_CLEAR_SCORES,
  SOFT_DROP_SCORE,
  HARD_DROP_SCORE,
  LINES_PER_LEVEL,
  GARBAGE_TABLE,
  SPEED_TABLE_MS,
  getDropInterval,
  ROOM_ID_LENGTH,
} from '../constants';

describe('Field constants', () => {
  it('field is 10 columns x 20 rows', () => {
    expect(FIELD_COLS).toBe(10);
    expect(FIELD_ROWS).toBe(20);
  });

  it('buffer rows include 2 extra rows above visible area', () => {
    expect(FIELD_ROWS_BUFFER).toBe(FIELD_ROWS + 2);
  });
});

describe('Timing constants', () => {
  it('lock delay is 500ms', () => {
    expect(LOCK_DELAY_MS).toBe(500);
  });

  it('lock delay max resets is 15', () => {
    expect(LOCK_DELAY_MAX_RESETS).toBe(15);
  });

  it('DAS and ARR are positive', () => {
    expect(DAS_MS).toBeGreaterThan(0);
    expect(ARR_MS).toBeGreaterThan(0);
  });

  it('field sync interval is 50ms', () => {
    expect(FIELD_SYNC_INTERVAL_MS).toBe(50);
  });

  it('disconnect timeout is 30 seconds', () => {
    expect(DISCONNECT_TIMEOUT_MS).toBe(30_000);
  });

  it('countdown is 3 seconds', () => {
    expect(COUNTDOWN_SECONDS).toBe(3);
  });
});

describe('Scoring constants', () => {
  it('line clear scores match spec (0, 100, 300, 500, 800)', () => {
    expect(LINE_CLEAR_SCORES[0]).toBe(0);
    expect(LINE_CLEAR_SCORES[1]).toBe(100);
    expect(LINE_CLEAR_SCORES[2]).toBe(300);
    expect(LINE_CLEAR_SCORES[3]).toBe(500);
    expect(LINE_CLEAR_SCORES[4]).toBe(800);
  });

  it('drop scores are positive', () => {
    expect(SOFT_DROP_SCORE).toBeGreaterThan(0);
    expect(HARD_DROP_SCORE).toBeGreaterThan(SOFT_DROP_SCORE);
  });

  it('level up requires 10 lines', () => {
    expect(LINES_PER_LEVEL).toBe(10);
  });
});

describe('Garbage table', () => {
  it('matches spec: 1→0, 2→1, 3→2, 4→4', () => {
    expect(GARBAGE_TABLE[0]).toBe(0); // 0 lines → 0
    expect(GARBAGE_TABLE[1]).toBe(0); // 1 line  → 0
    expect(GARBAGE_TABLE[2]).toBe(1); // 2 lines → 1
    expect(GARBAGE_TABLE[3]).toBe(2); // 3 lines → 2
    expect(GARBAGE_TABLE[4]).toBe(4); // 4 lines → 4
  });

  it('has entries for 0 through 4 lines', () => {
    expect(GARBAGE_TABLE.length).toBe(5);
  });
});

describe('Speed table', () => {
  it('has at least 15 levels defined', () => {
    expect(SPEED_TABLE_MS.length).toBeGreaterThanOrEqual(15);
  });

  it('level 0 is the slowest (1000ms)', () => {
    expect(SPEED_TABLE_MS[0]).toBe(1000);
  });

  it('each level is faster than or equal to the previous', () => {
    for (let i = 1; i < SPEED_TABLE_MS.length; i++) {
      expect(SPEED_TABLE_MS[i]).toBeLessThanOrEqual(SPEED_TABLE_MS[i - 1]);
    }
  });

  it('all values are positive', () => {
    for (const ms of SPEED_TABLE_MS) {
      expect(ms).toBeGreaterThan(0);
    }
  });
});

describe('getDropInterval', () => {
  it('returns correct value for valid levels', () => {
    expect(getDropInterval(0)).toBe(1000);
    expect(getDropInterval(5)).toBe(500);
    expect(getDropInterval(10)).toBe(250);
  });

  it('returns slowest for negative level', () => {
    expect(getDropInterval(-1)).toBe(SPEED_TABLE_MS[0]);
  });

  it('returns fastest for level beyond table', () => {
    const fastest = SPEED_TABLE_MS[SPEED_TABLE_MS.length - 1];
    expect(getDropInterval(100)).toBe(fastest);
    expect(getDropInterval(999)).toBe(fastest);
  });
});

describe('Room constants', () => {
  it('room ID length is 6', () => {
    expect(ROOM_ID_LENGTH).toBe(6);
  });
});
