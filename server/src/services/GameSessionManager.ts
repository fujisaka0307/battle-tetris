import { LoserReason, DISCONNECT_TIMEOUT_MS } from '@battle-tetris/shared';
import { GameSession } from '../models/GameSession.js';
import { Room } from '../models/Room.js';
import { RoomManager } from './RoomManager.js';
import { calculateGarbage } from './GarbageCalculator.js';
import { generateSeed } from '../utils/seedGenerator.js';

// =============================================================================
// Callbacks — Hub がこのマネージャーに渡すコールバック群
// =============================================================================

export interface SessionCallbacks {
  /** 相手におじゃまラインを送信 */
  sendGarbage: (connectionId: string, lines: number) => void;
  /** 対戦結果を両プレイヤーに通知 */
  sendGameResult: (
    winnerId: string,
    loserId: string,
    reason: LoserReason,
  ) => void;
  /** 相手の切断を通知 */
  sendOpponentDisconnected: (connectionId: string, timeout: number) => void;
}

// =============================================================================
// GameSessionManager
// =============================================================================

export class GameSessionManager {
  private readonly sessions = new Map<string, GameSession>();
  /** roomId → disconnect timer handle */
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly roomManager: RoomManager;
  private callbacks: SessionCallbacks | null = null;

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  setCallbacks(callbacks: SessionCallbacks): void {
    this.callbacks = callbacks;
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  /**
   * 対戦セッションを開始する。
   * @returns seed 値（両プレイヤーへ配布するテトリミノ生成シード）
   */
  startSession(room: Room): number {
    if (!room.player1 || !room.player2) {
      throw new Error('Room must have 2 players to start a session');
    }

    const seed = generateSeed();
    room.transitionToReady();
    room.transitionToPlaying(seed);

    const session = new GameSession(
      room.roomId,
      room.player1.connectionId,
      room.player2.connectionId,
    );
    this.sessions.set(room.roomId, session);

    return seed;
  }

  /**
   * セッションを取得する。
   */
  getSession(roomId: string): GameSession | undefined {
    return this.sessions.get(roomId);
  }

  // ---------------------------------------------------------------------------
  // Game events
  // ---------------------------------------------------------------------------

  /**
   * ライン消去イベントを処理する。
   * おじゃまライン数を計算し、相手に送信する。
   */
  handleLinesCleared(
    roomId: string,
    connectionId: string,
    count: number,
  ): void {
    const session = this.sessions.get(roomId);
    if (!session || session.isFinished()) return;

    session.addLinesCleared(connectionId, count);

    const garbage = calculateGarbage(count);
    if (garbage > 0) {
      const room = this.roomManager.getRoom(roomId);
      const opponent = room?.getOpponent(connectionId);
      if (opponent && this.callbacks) {
        this.callbacks.sendGarbage(opponent.connectionId, garbage);
      }
    }
  }

  /**
   * ゲームオーバーイベントを処理する。
   * 勝敗を判定し、結果を通知する。
   */
  handleGameOver(roomId: string, loserConnectionId: string): void {
    const session = this.sessions.get(roomId);
    if (!session || session.isFinished()) return;

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    session.setResult(loserConnectionId, LoserReason.GameOver);
    room.transitionToFinished();

    if (session.winner && this.callbacks) {
      this.callbacks.sendGameResult(
        session.winner,
        loserConnectionId,
        LoserReason.GameOver,
      );
    }

    this.clearDisconnectTimer(roomId);
  }

  // ---------------------------------------------------------------------------
  // Disconnection handling
  // ---------------------------------------------------------------------------

  /**
   * プレイヤー切断を処理する。
   * 30秒タイマーを開始し、タイムアウトで敗北判定。
   */
  handleDisconnect(roomId: string, disconnectedId: string): void {
    const session = this.sessions.get(roomId);
    if (!session || session.isFinished()) return;

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    const opponent = room.getOpponent(disconnectedId);
    if (opponent && this.callbacks) {
      this.callbacks.sendOpponentDisconnected(
        opponent.connectionId,
        DISCONNECT_TIMEOUT_MS,
      );
    }

    // Start timeout timer
    const timer = setTimeout(() => {
      this.handleDisconnectTimeout(roomId, disconnectedId);
    }, DISCONNECT_TIMEOUT_MS);

    this.disconnectTimers.set(roomId, timer);
  }

  /**
   * 再接続を処理する。
   * タイムアウトタイマーをキャンセルする。
   */
  handleReconnect(roomId: string): void {
    this.clearDisconnectTimer(roomId);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * セッションを終了・クリーンアップする。
   */
  endSession(roomId: string): void {
    this.clearDisconnectTimer(roomId);
    this.sessions.delete(roomId);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private handleDisconnectTimeout(
    roomId: string,
    disconnectedId: string,
  ): void {
    const session = this.sessions.get(roomId);
    if (!session || session.isFinished()) return;

    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    session.setResult(disconnectedId, LoserReason.Disconnect);
    room.transitionToFinished();

    if (session.winner && this.callbacks) {
      this.callbacks.sendGameResult(
        session.winner,
        disconnectedId,
        LoserReason.Disconnect,
      );
    }

    this.disconnectTimers.delete(roomId);
  }

  private clearDisconnectTimer(roomId: string): void {
    const timer = this.disconnectTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(roomId);
    }
  }
}
