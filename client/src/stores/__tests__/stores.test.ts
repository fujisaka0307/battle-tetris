import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../usePlayerStore';
import { useGameStore } from '../useGameStore';
import { useBattleStore } from '../useBattleStore';
import { GameState, LoserReason } from '@battle-tetris/shared';

describe('usePlayerStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset();
  });

  it('初期状態が正しいこと', () => {
    const state = usePlayerStore.getState();
    expect(state.nickname).toBe('');
    expect(state.roomId).toBeNull();
    expect(state.connectionState).toBe('disconnected');
    expect(state.opponentNickname).toBeNull();
  });

  it('setNickname で値が更新されること', () => {
    usePlayerStore.getState().setNickname('Alice');
    expect(usePlayerStore.getState().nickname).toBe('Alice');
  });

  it('setRoomId で値が更新されること', () => {
    usePlayerStore.getState().setRoomId('ABC123');
    expect(usePlayerStore.getState().roomId).toBe('ABC123');
  });

  it('setConnectionState で値が更新されること', () => {
    usePlayerStore.getState().setConnectionState('connected');
    expect(usePlayerStore.getState().connectionState).toBe('connected');
  });

  it('setOpponentNickname で値が更新されること', () => {
    usePlayerStore.getState().setOpponentNickname('Bob');
    expect(usePlayerStore.getState().opponentNickname).toBe('Bob');
  });

  it('reset で初期状態に戻ること', () => {
    const store = usePlayerStore.getState();
    store.setNickname('Alice');
    store.setRoomId('XYZ');
    store.setConnectionState('connected');
    store.setOpponentNickname('Bob');

    store.reset();

    const state = usePlayerStore.getState();
    expect(state.nickname).toBe('');
    expect(state.roomId).toBeNull();
    expect(state.connectionState).toBe('disconnected');
    expect(state.opponentNickname).toBeNull();
  });
});

describe('useGameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('初期状態が正しいこと', () => {
    const state = useGameStore.getState();
    expect(state.gameState).toBe(GameState.Idle);
    expect(state.score).toBe(0);
    expect(state.level).toBe(0);
    expect(state.lines).toBe(0);
    expect(state.seed).toBeNull();
  });

  it('setGameState で値が更新されること', () => {
    useGameStore.getState().setGameState(GameState.Playing);
    expect(useGameStore.getState().gameState).toBe(GameState.Playing);
  });

  it('setSeed で値が更新されること', () => {
    useGameStore.getState().setSeed(42);
    expect(useGameStore.getState().seed).toBe(42);
  });

  it('updateStats で複数の値が同時に更新されること', () => {
    useGameStore.getState().updateStats(1500, 3, 25);
    const state = useGameStore.getState();
    expect(state.score).toBe(1500);
    expect(state.level).toBe(3);
    expect(state.lines).toBe(25);
  });

  it('reset で初期状態に戻ること', () => {
    const store = useGameStore.getState();
    store.setGameState(GameState.Playing);
    store.updateStats(999, 5, 50);
    store.setSeed(42);

    store.reset();

    const state = useGameStore.getState();
    expect(state.gameState).toBe(GameState.Idle);
    expect(state.score).toBe(0);
    expect(state.level).toBe(0);
    expect(state.lines).toBe(0);
    expect(state.seed).toBeNull();
  });
});

describe('useBattleStore', () => {
  beforeEach(() => {
    useBattleStore.getState().reset();
  });

  it('初期状態が正しいこと', () => {
    const state = useBattleStore.getState();
    expect(state.opponentField).toBeNull();
    expect(state.opponentScore).toBe(0);
    expect(state.opponentLines).toBe(0);
    expect(state.opponentLevel).toBe(0);
    expect(state.pendingGarbage).toBe(0);
    expect(state.result).toBeNull();
    expect(state.opponentRematchRequested).toBe(false);
  });

  it('setOpponentField で相手フィールドと統計が更新されること', () => {
    const field = [[1, 2], [3, 4]];
    useBattleStore.getState().setOpponentField(field, 500, 5, 1);

    const state = useBattleStore.getState();
    expect(state.opponentField).toEqual(field);
    expect(state.opponentScore).toBe(500);
    expect(state.opponentLines).toBe(5);
    expect(state.opponentLevel).toBe(1);
  });

  it('addPendingGarbage でおじゃまが累積されること', () => {
    useBattleStore.getState().addPendingGarbage(2);
    useBattleStore.getState().addPendingGarbage(3);
    expect(useBattleStore.getState().pendingGarbage).toBe(5);
  });

  it('clearPendingGarbage でおじゃまがクリアされること', () => {
    useBattleStore.getState().addPendingGarbage(4);
    useBattleStore.getState().clearPendingGarbage();
    expect(useBattleStore.getState().pendingGarbage).toBe(0);
  });

  it('setResult で対戦結果が設定されること', () => {
    useBattleStore.getState().setResult({
      winner: 'conn-1',
      loserReason: LoserReason.GameOver,
    });
    const state = useBattleStore.getState();
    expect(state.result?.winner).toBe('conn-1');
    expect(state.result?.loserReason).toBe(LoserReason.GameOver);
  });

  it('setOpponentRematchRequested で値が更新されること', () => {
    useBattleStore.getState().setOpponentRematchRequested(true);
    expect(useBattleStore.getState().opponentRematchRequested).toBe(true);
  });

  it('reset で初期状態に戻ること', () => {
    const store = useBattleStore.getState();
    store.setOpponentField([[1]], 100, 1, 1);
    store.addPendingGarbage(3);
    store.setResult({ winner: 'x', loserReason: LoserReason.Disconnect });
    store.setOpponentRematchRequested(true);

    store.reset();

    const state = useBattleStore.getState();
    expect(state.opponentField).toBeNull();
    expect(state.pendingGarbage).toBe(0);
    expect(state.result).toBeNull();
    expect(state.opponentRematchRequested).toBe(false);
  });
});
