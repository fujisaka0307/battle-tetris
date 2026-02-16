import { LoserReason, DISCONNECT_TIMEOUT_MS } from '@battle-tetris/shared';
import { GameSession } from '../models/GameSession.js';
import { Room } from '../models/Room.js';
import { RoomManager } from './RoomManager.js';
import { calculateGarbage } from './GarbageCalculator.js';
import { generateSeed } from '../utils/seedGenerator.js';
import { createLogger } from '../lib/logger.js';
import { withSpan } from '../lib/tracing.js';
import {
  activeSessionsGauge,
  sessionsTotal,
  linesClearedTotal,
  garbageSentTotal,
  sessionDuration,
  gameResults,
} from '../lib/metrics.js';

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

    activeSessionsGauge.addCallback((result) => {
      result.observe(this.sessions.size);
    });
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
    return withSpan('GameSession.startSession', { 'room.id': room.roomId }, (span) => {
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
      sessionsTotal.add(1);

      span.setAttribute('game.seed', seed);
      span.setAttribute('player1.connection_id', room.player1.connectionId);
      span.setAttribute('player2.connection_id', room.player2.connectionId);
      span.addEvent('session_started');

      createLogger({ roomId: room.roomId }).info({ seed }, 'Session started');

      return seed;
    });
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
    withSpan('GameSession.handleLinesCleared', { 'room.id': roomId, 'player.connection_id': connectionId, 'lines.count': count }, (span) => {
      const session = this.sessions.get(roomId);
      if (!session || session.isFinished()) {
        span.addEvent('skipped', { reason: session ? 'finished' : 'no_session' });
        return;
      }

      session.addLinesCleared(connectionId, count);
      linesClearedTotal.add(count);

      const garbage = calculateGarbage(count);
      span.setAttribute('garbage.count', garbage);
      if (garbage > 0) {
        garbageSentTotal.add(garbage);
        const room = this.roomManager.getRoom(roomId);
        const opponent = room?.getOpponent(connectionId);
        if (opponent && this.callbacks) {
          span.addEvent('garbage_sent', { 'opponent.connection_id': opponent.connectionId, garbage });
          this.callbacks.sendGarbage(opponent.connectionId, garbage);
        }
      }
    });
  }

  /**
   * ゲームオーバーイベントを処理する。
   * 勝敗を判定し、結果を通知する。
   */
  handleGameOver(roomId: string, loserConnectionId: string): void {
    withSpan('GameSession.handleGameOver', { 'room.id': roomId, 'loser.connection_id': loserConnectionId }, (span) => {
      const session = this.sessions.get(roomId);
      if (!session || session.isFinished()) {
        span.addEvent('skipped', { reason: session ? 'finished' : 'no_session' });
        return;
      }

      const room = this.roomManager.getRoom(roomId);
      if (!room) {
        span.addEvent('skipped', { reason: 'no_room' });
        return;
      }

      session.setResult(loserConnectionId, LoserReason.GameOver);
      room.transitionToFinished();

      const durationMs = Date.now() - session.startedAt.getTime();
      const durationSec = durationMs / 1000;
      sessionDuration.record(durationSec);
      gameResults.add(1, { reason: 'game_over' });

      span.setAttribute('game.winner', session.winner ?? 'unknown');
      span.setAttribute('game.duration_ms', durationMs);
      span.setAttribute('game.reason', 'game_over');
      span.addEvent('game_ended');

      createLogger({ roomId }).info(
        { winner: session.winner, loser: loserConnectionId, reason: 'game_over', durationMs },
        'Game ended',
      );

      if (session.winner && this.callbacks) {
        this.callbacks.sendGameResult(
          session.winner,
          loserConnectionId,
          LoserReason.GameOver,
        );
      }

      this.clearDisconnectTimer(roomId);
    });
  }

  // ---------------------------------------------------------------------------
  // Disconnection handling
  // ---------------------------------------------------------------------------

  /**
   * プレイヤー切断を処理する。
   * 30秒タイマーを開始し、タイムアウトで敗北判定。
   */
  handleDisconnect(roomId: string, disconnectedId: string): void {
    withSpan('GameSession.handleDisconnect', { 'room.id': roomId, 'player.connection_id': disconnectedId }, (span) => {
      const session = this.sessions.get(roomId);
      if (!session || session.isFinished()) {
        span.addEvent('skipped', { reason: session ? 'finished' : 'no_session' });
        return;
      }

      const room = this.roomManager.getRoom(roomId);
      if (!room) {
        span.addEvent('skipped', { reason: 'no_room' });
        return;
      }

      span.setAttribute('disconnect.timeout_ms', DISCONNECT_TIMEOUT_MS);
      span.addEvent('disconnect_timer_started');

      createLogger({ roomId, connectionId: disconnectedId }).info(
        { timeoutMs: DISCONNECT_TIMEOUT_MS },
        'Player disconnected during game, starting timeout',
      );

      const opponent = room.getOpponent(disconnectedId);
      if (opponent && this.callbacks) {
        span.setAttribute('opponent.connection_id', opponent.connectionId);
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
    });
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
    withSpan('GameSession.endSession', { 'room.id': roomId }, (span) => {
      const session = this.sessions.get(roomId);
      span.setAttribute('session.existed', !!session);
      if (session) {
        span.setAttribute('session.finished', session.isFinished());
      }
      span.addEvent('session_cleanup');
      this.clearDisconnectTimer(roomId);
      this.sessions.delete(roomId);
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private handleDisconnectTimeout(
    roomId: string,
    disconnectedId: string,
  ): void {
    withSpan('GameSession.handleDisconnectTimeout', { 'room.id': roomId, 'player.connection_id': disconnectedId }, (span) => {
      const session = this.sessions.get(roomId);
      if (!session || session.isFinished()) {
        span.addEvent('skipped', { reason: session ? 'finished' : 'no_session' });
        return;
      }

      const room = this.roomManager.getRoom(roomId);
      if (!room) {
        span.addEvent('skipped', { reason: 'no_room' });
        return;
      }

      session.setResult(disconnectedId, LoserReason.Disconnect);
      room.transitionToFinished();

      const durationMs = Date.now() - session.startedAt.getTime();
      const durationSec = durationMs / 1000;
      sessionDuration.record(durationSec);
      gameResults.add(1, { reason: 'disconnect' });

      span.setAttribute('game.winner', session.winner ?? 'unknown');
      span.setAttribute('game.duration_ms', durationMs);
      span.setAttribute('game.reason', 'disconnect');
      span.addEvent('game_ended_by_disconnect_timeout');

      createLogger({ roomId }).info(
        { winner: session.winner, loser: disconnectedId, reason: 'disconnect', durationMs },
        'Game ended by disconnect timeout',
      );

      if (session.winner && this.callbacks) {
        this.callbacks.sendGameResult(
          session.winner,
          disconnectedId,
          LoserReason.Disconnect,
        );
      }

      this.disconnectTimers.delete(roomId);
    });
  }

  private clearDisconnectTimer(roomId: string): void {
    const timer = this.disconnectTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(roomId);
    }
  }
}
