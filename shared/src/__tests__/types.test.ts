import { describe, it, expect } from 'vitest';
import { TetrominoType, GameState, GameAction, RoomStatus, LoserReason } from '../types';

describe('TetrominoType enum', () => {
  it('has exactly 7 types', () => {
    const numericValues = Object.values(TetrominoType).filter(
      (v) => typeof v === 'number',
    );
    expect(numericValues).toHaveLength(7);
  });

  it('values are 1 through 7 (0 is reserved for empty)', () => {
    expect(TetrominoType.I).toBe(1);
    expect(TetrominoType.O).toBe(2);
    expect(TetrominoType.T).toBe(3);
    expect(TetrominoType.S).toBe(4);
    expect(TetrominoType.Z).toBe(5);
    expect(TetrominoType.J).toBe(6);
    expect(TetrominoType.L).toBe(7);
  });
});

describe('GameState enum', () => {
  it('has all required states', () => {
    expect(GameState.Idle).toBe('idle');
    expect(GameState.Playing).toBe('playing');
    expect(GameState.Paused).toBe('paused');
    expect(GameState.GameOver).toBe('gameover');
  });
});

describe('GameAction enum', () => {
  it('has all required actions', () => {
    const actions = Object.values(GameAction);
    expect(actions).toContain('moveLeft');
    expect(actions).toContain('moveRight');
    expect(actions).toContain('softDrop');
    expect(actions).toContain('hardDrop');
    expect(actions).toContain('rotateCW');
    expect(actions).toContain('rotateCCW');
    expect(actions).toContain('hold');
  });
});

describe('RoomStatus enum', () => {
  it('has correct state progression values', () => {
    expect(RoomStatus.Waiting).toBe('waiting');
    expect(RoomStatus.Ready).toBe('ready');
    expect(RoomStatus.Playing).toBe('playing');
    expect(RoomStatus.Finished).toBe('finished');
  });
});

describe('LoserReason enum', () => {
  it('has gameover and disconnect reasons', () => {
    expect(LoserReason.GameOver).toBe('gameover');
    expect(LoserReason.Disconnect).toBe('disconnect');
  });
});
