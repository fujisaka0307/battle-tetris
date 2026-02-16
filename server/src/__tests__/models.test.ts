import { describe, it, expect } from 'vitest';
import { RoomStatus, LoserReason } from '@battle-tetris/shared';
import { Player } from '../models/Player';
import { Room } from '../models/Room';
import { GameSession } from '../models/GameSession';

// =============================================================================
// Player
// =============================================================================

describe('Player', () => {
  it('生成時のデフォルト状態が正しいこと', () => {
    const p = new Player('conn-1', 'Alice');
    expect(p.connectionId).toBe('conn-1');
    expect(p.enterpriseId).toBe('Alice');
    expect(p.isReady).toBe(false);
    expect(p.isConnected).toBe(true);
  });

  it('setReady で isReady が true になること', () => {
    const p = new Player('conn-1', 'Alice');
    p.setReady();
    expect(p.isReady).toBe(true);
  });

  it('disconnect で isConnected が false になること', () => {
    const p = new Player('conn-1', 'Alice');
    p.disconnect();
    expect(p.isConnected).toBe(false);
  });

  it('reconnect で connectionId が更新され isConnected が true になること', () => {
    const p = new Player('conn-1', 'Alice');
    p.disconnect();
    p.reconnect('conn-2');
    expect(p.connectionId).toBe('conn-2');
    expect(p.isConnected).toBe(true);
  });

  it('reset で isReady が false に戻ること', () => {
    const p = new Player('conn-1', 'Alice');
    p.setReady();
    p.reset();
    expect(p.isReady).toBe(false);
  });
});

// =============================================================================
// Room
// =============================================================================

describe('Room', () => {
  function createRoom(): Room {
    const creator = new Player('conn-1', 'Alice');
    return new Room('ABC123', creator);
  }

  it('生成時の初期状態が正しいこと', () => {
    const room = createRoom();
    expect(room.roomId).toBe('ABC123');
    expect(room.status).toBe(RoomStatus.Waiting);
    expect(room.player1?.enterpriseId).toBe('Alice');
    expect(room.player2).toBeNull();
    expect(room.seed).toBeNull();
    expect(room.isFull()).toBe(false);
  });

  it('プレイヤーが参加できること', () => {
    const room = createRoom();
    const p2 = new Player('conn-2', 'Bob');
    room.join(p2);
    expect(room.player2?.enterpriseId).toBe('Bob');
    expect(room.isFull()).toBe(true);
  });

  it('満員ルームへの参加が拒否されること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    expect(() => room.join(new Player('conn-3', 'Charlie'))).toThrow('full');
  });

  it('getPlayer で connectionId からプレイヤーを取得できること', () => {
    const room = createRoom();
    expect(room.getPlayer('conn-1')?.enterpriseId).toBe('Alice');
    expect(room.getPlayer('conn-999')).toBeNull();
  });

  it('getOpponent で対戦相手を取得できること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    expect(room.getOpponent('conn-1')?.enterpriseId).toBe('Bob');
    expect(room.getOpponent('conn-2')?.enterpriseId).toBe('Alice');
  });

  it('areBothReady が正しく判定されること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    expect(room.areBothReady()).toBe(false);

    room.player1!.setReady();
    expect(room.areBothReady()).toBe(false);

    room.player2!.setReady();
    expect(room.areBothReady()).toBe(true);
  });

  // --- State transitions ---

  it('Waiting → Ready への遷移が正しいこと', () => {
    const room = createRoom();
    room.transitionToReady();
    expect(room.status).toBe(RoomStatus.Ready);
  });

  it('Ready → Playing への遷移が正しいこと', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    expect(room.status).toBe(RoomStatus.Playing);
    expect(room.seed).toBe(12345);
  });

  it('Playing → Finished への遷移が正しいこと', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    expect(room.status).toBe(RoomStatus.Finished);
  });

  it('不正な状態遷移が拒否されること (Waiting → Playing)', () => {
    const room = createRoom();
    expect(() => room.transitionToPlaying(1)).toThrow();
  });

  it('不正な状態遷移が拒否されること (Waiting → Finished)', () => {
    const room = createRoom();
    expect(() => room.transitionToFinished()).toThrow();
  });

  it('不正な状態遷移が拒否されること (Ready → Finished)', () => {
    const room = createRoom();
    room.transitionToReady();
    expect(() => room.transitionToFinished()).toThrow();
  });

  // --- 追加: 未カバーのブランチ ---

  it('player1 が null の場合に join で player1 スロットに入ること', () => {
    const room = createRoom();
    // player1 を手動で null にして player1 スロット分岐をテスト
    room.player1 = null;
    const p = new Player('conn-new', 'NewPlayer');
    room.join(p);
    expect(room.player1!.enterpriseId).toBe('NewPlayer');
    expect(room.player2).toBeNull();
  });

  it('player1 が null で player2 もある場合に isFull が false であること', () => {
    const room = createRoom();
    room.player1 = null;
    expect(room.isFull()).toBe(false);
  });

  it('getOpponent でプレイヤーが1人しかいない場合に null を返すこと', () => {
    const room = createRoom();
    // player2 がいないので、conn-1 の opponent は null
    expect(room.getOpponent('conn-1')).toBeNull();
  });

  it('getOpponent で存在しない connectionId を指定した場合に null を返すこと', () => {
    const room = createRoom();
    expect(room.getOpponent('conn-999')).toBeNull();
  });

  it('getPlayer で player2 側の connectionId を指定して取得できること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    expect(room.getPlayer('conn-2')?.enterpriseId).toBe('Bob');
  });

  it('areBothReady で player1 が null の場合に false を返すこと', () => {
    const room = createRoom();
    room.player1 = null;
    expect(room.areBothReady()).toBe(false);
  });

  it('areBothReady で player2 が null の場合に false を返すこと', () => {
    const room = createRoom();
    // player2 は null のまま
    room.player1!.setReady();
    expect(room.areBothReady()).toBe(false);
  });

  // --- 追加: 不正遷移のブランチカバレッジ ---

  it('不正な状態遷移が拒否されること (Ready → Ready)', () => {
    const room = createRoom();
    room.transitionToReady();
    expect(() => room.transitionToReady()).toThrow('Cannot transition to Ready');
  });

  it('不正な状態遷移が拒否されること (Playing → Ready)', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    expect(() => room.transitionToReady()).toThrow('Cannot transition to Ready');
  });

  it('不正な状態遷移が拒否されること (Playing → Playing)', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    expect(() => room.transitionToPlaying(99)).toThrow('Cannot transition to Playing');
  });

  it('不正な状態遷移が拒否されること (Finished → Ready)', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    expect(() => room.transitionToReady()).toThrow('Cannot transition to Ready');
  });

  it('不正な状態遷移が拒否されること (Finished → Playing)', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    expect(() => room.transitionToPlaying(99)).toThrow('Cannot transition to Playing');
  });

  it('不正な状態遷移が拒否されること (Finished → Finished)', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    expect(() => room.transitionToFinished()).toThrow('Cannot transition to Finished');
  });

  // --- Rematch ---

  it('requestRematch で rematchRequestedBy に connectionId が追加されること', () => {
    const room = createRoom();
    room.requestRematch('conn-1');
    expect(room.rematchRequestedBy.has('conn-1')).toBe(true);
  });

  it('areBothRematchRequested で片方のみの場合 false を返すこと', () => {
    const room = createRoom();
    room.requestRematch('conn-1');
    expect(room.areBothRematchRequested()).toBe(false);
  });

  it('areBothRematchRequested で両方の場合 true を返すこと', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    room.requestRematch('conn-1');
    room.requestRematch('conn-2');
    expect(room.areBothRematchRequested()).toBe(true);
  });

  it('resetForRematch で status が Waiting に戻ること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    room.resetForRematch();
    expect(room.status).toBe(RoomStatus.Waiting);
  });

  it('resetForRematch で rematchRequestedBy がクリアされること', () => {
    const room = createRoom();
    room.requestRematch('conn-1');
    room.resetForRematch();
    expect(room.rematchRequestedBy.size).toBe(0);
  });

  it('resetForRematch で seed が null になること', () => {
    const room = createRoom();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    room.resetForRematch();
    expect(room.seed).toBeNull();
  });

  it('resetForRematch で両プレイヤーの isReady が false になること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    room.player1!.setReady();
    room.player2!.setReady();
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    room.resetForRematch();
    expect(room.player1!.isReady).toBe(false);
    expect(room.player2!.isReady).toBe(false);
  });

  it('resetForRematch 後に再度 transitionToReady が可能であること', () => {
    const room = createRoom();
    room.join(new Player('conn-2', 'Bob'));
    room.transitionToReady();
    room.transitionToPlaying(12345);
    room.transitionToFinished();
    room.resetForRematch();
    expect(() => room.transitionToReady()).not.toThrow();
    expect(room.status).toBe(RoomStatus.Ready);
  });
});

// =============================================================================
// GameSession
// =============================================================================

describe('GameSession', () => {
  function createSession(): GameSession {
    return new GameSession('room-1', 'conn-1', 'conn-2');
  }

  it('生成時の初期状態が正しいこと', () => {
    const session = createSession();
    expect(session.roomId).toBe('room-1');
    expect(session.winner).toBeNull();
    expect(session.loserReason).toBeNull();
    expect(session.isFinished()).toBe(false);
    expect(session.getScore('conn-1')).toBe(0);
    expect(session.getScore('conn-2')).toBe(0);
    expect(session.getLinesCleared('conn-1')).toBe(0);
  });

  it('スコアが更新できること', () => {
    const session = createSession();
    session.updateScore('conn-1', 1500);
    expect(session.getScore('conn-1')).toBe(1500);
    expect(session.getScore('conn-2')).toBe(0);
  });

  it('消去ライン数が加算できること', () => {
    const session = createSession();
    session.addLinesCleared('conn-1', 4);
    session.addLinesCleared('conn-1', 2);
    expect(session.getLinesCleared('conn-1')).toBe(6);
  });

  it('勝敗が正しく設定されること (conn-1 が敗北)', () => {
    const session = createSession();
    session.setResult('conn-1', LoserReason.GameOver);
    expect(session.winner).toBe('conn-2');
    expect(session.loserReason).toBe(LoserReason.GameOver);
    expect(session.isFinished()).toBe(true);
  });

  it('勝敗が正しく設定されること (conn-2 が切断で敗北)', () => {
    const session = createSession();
    session.setResult('conn-2', LoserReason.Disconnect);
    expect(session.winner).toBe('conn-1');
    expect(session.loserReason).toBe(LoserReason.Disconnect);
  });

  // --- 追加: 未カバーのブランチ ---

  it('存在しない connectionId で getScore が 0 を返すこと', () => {
    const session = createSession();
    expect(session.getScore('conn-unknown')).toBe(0);
  });

  it('存在しない connectionId で getLinesCleared が 0 を返すこと', () => {
    const session = createSession();
    expect(session.getLinesCleared('conn-unknown')).toBe(0);
  });

  it('存在しない connectionId で addLinesCleared が 0 からスタートすること', () => {
    const session = createSession();
    session.addLinesCleared('conn-unknown', 3);
    expect(session.getLinesCleared('conn-unknown')).toBe(3);
  });

  it('setResult で loser が Map の最初のキーの場合に正しく winner が設定されること', () => {
    // conn-1 は Map の最初のキー。loser=conn-1 の場合、ループで conn-1 をスキップして conn-2 を winner にする
    const session = createSession();
    session.setResult('conn-1', LoserReason.GameOver);
    expect(session.winner).toBe('conn-2');
    expect(session.isFinished()).toBe(true);
  });

  it('setResult で loser が Map の2番目のキーの場合に正しく winner が設定されること', () => {
    // conn-2 は Map の2番目のキー。loser=conn-2 の場合、最初のイテレーションで conn-1 が winner になる
    const session = createSession();
    session.setResult('conn-2', LoserReason.Disconnect);
    expect(session.winner).toBe('conn-1');
    expect(session.isFinished()).toBe(true);
  });

  it('startedAt が Date インスタンスであること', () => {
    const session = createSession();
    expect(session.startedAt).toBeInstanceOf(Date);
  });
});
