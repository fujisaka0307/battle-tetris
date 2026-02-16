import {
  ServerEvents,
  ErrorCodes,
  COUNTDOWN_SECONDS,
  RoomStatus,
  LoserReason,
} from '@battle-tetris/shared';
import type { WaitingRoomInfo } from '@battle-tetris/shared';
import { insertMatchResult } from '../db/matchResultRepository.js';
import { upsertPlayerStats } from '../db/playerStatsRepository.js';
import { getTopRankings } from '../db/playerStatsRepository.js';
import { getRecentMatches } from '../db/matchResultRepository.js';
import { RoomManager } from '../services/RoomManager.js';
import { GameSessionManager } from '../services/GameSessionManager.js';
import { Player } from '../models/Player.js';
import {
  CreateAiRoomSchema,
  JoinRoomSchema,
  FieldUpdateSchema,
  LinesClearedSchema,
  validatePayload,
} from '../middleware/validation.js';
import { createLogger } from '../lib/logger.js';
import { activeRoomsGauge, rematchTotal } from '../lib/metrics.js';
import { withSpan } from '../lib/tracing.js';
import { trace } from '@opentelemetry/api';
import { AiPlayer } from '../ai/AiPlayer.js';

// =============================================================================
// Types — Hub の send/invoke 抽象化
// =============================================================================

/**
 * SignalR 接続の抽象インターフェース。
 * 実環境では Azure SignalR SDK を、テストではモックを注入する。
 */
export interface HubConnection {
  /** 指定クライアントへイベントを送信 */
  sendToClient(connectionId: string, event: string, payload: unknown): void;
  /** connectionId から Enterprise ID を取得 */
  getEnterpriseId(connectionId: string): string | undefined;
}

// =============================================================================
// GameHub
// =============================================================================

export class GameHub {
  private readonly roomManager: RoomManager;
  private readonly sessionManager: GameSessionManager;
  private readonly hub: HubConnection;
  private readonly roomListSubscribers = new Set<string>();
  private readonly leaderboardSubscribers = new Set<string>();
  private readonly aiPlayers = new Map<string, AiPlayer>();

  constructor(hub: HubConnection) {
    this.roomManager = new RoomManager();
    this.sessionManager = new GameSessionManager(this.roomManager);
    this.hub = hub;

    // Register active rooms gauge
    activeRoomsGauge.addCallback((result) => {
      result.observe(this.roomManager.size);
    });

    // Wire up session manager callbacks
    this.sessionManager.setCallbacks({
      sendGarbage: (connectionId, lines) => {
        if (this.isAiConnection(connectionId)) {
          const aiPlayer = this.aiPlayers.get(connectionId);
          aiPlayer?.addGarbage(lines);
        } else {
          this.hub.sendToClient(connectionId, ServerEvents.ReceiveGarbage, {
            lines,
          });
        }
      },
      sendGameResult: (winnerId, loserId, reason) => {
        const payload = { winner: winnerId, loserReason: reason };
        if (!this.isAiConnection(winnerId)) {
          this.hub.sendToClient(winnerId, ServerEvents.GameResult, payload);
        }
        if (!this.isAiConnection(loserId)) {
          this.hub.sendToClient(loserId, ServerEvents.GameResult, payload);
        }
        // Stop AI player on game end
        this.stopAiIfExists(winnerId);
        this.stopAiIfExists(loserId);

        // 対戦結果を永続化
        this.persistMatchResult(winnerId, loserId, reason);
      },
      sendOpponentDisconnected: (connectionId, timeout) => {
        if (!this.isAiConnection(connectionId)) {
          this.hub.sendToClient(connectionId, ServerEvents.OpponentDisconnected, {
            timeout,
          });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // For testing
  // ---------------------------------------------------------------------------

  getRoomManager(): RoomManager {
    return this.roomManager;
  }

  // ---------------------------------------------------------------------------
  // Client → Server handlers
  // ---------------------------------------------------------------------------

  handleCreateRoom(connectionId: string): void {
    withSpan('GameHub.handleCreateRoom', { 'player.connection_id': connectionId }, (span) => {
      const enterpriseId = this.hub.getEnterpriseId(connectionId);
      if (!enterpriseId) {
        span.addEvent('auth_failed', { reason: 'no_enterprise_id' });
        this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
        return;
      }
      span.setAttribute('player.enterprise_id', enterpriseId);

      const player = new Player(connectionId, enterpriseId);
      const room = this.roomManager.createRoom(player);
      span.setAttribute('room.id', room.roomId);

      const log = createLogger({ connectionId, roomId: room.roomId });
      log.info('Room created');

      this.hub.sendToClient(connectionId, ServerEvents.RoomCreated, {
        roomId: room.roomId,
      });

      this.broadcastWaitingRoomList();
    });
  }

  handleCreateAiRoom(connectionId: string, data: unknown): void {
    withSpan('GameHub.handleCreateAiRoom', { 'player.connection_id': connectionId }, (span) => {
      const enterpriseId = this.hub.getEnterpriseId(connectionId);
      if (!enterpriseId) {
        span.addEvent('auth_failed', { reason: 'no_enterprise_id' });
        this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
        return;
      }
      span.setAttribute('player.enterprise_id', enterpriseId);

      const payload = validatePayload(CreateAiRoomSchema, data);
      if (!payload) {
        span.addEvent('validation_failed', { schema: 'CreateAiRoomSchema' });
        this.sendError(connectionId, ErrorCodes.INVALID_PAYLOAD, 'Invalid payload');
        return;
      }

      const aiLevel = payload.aiLevel;
      span.setAttribute('ai.level', aiLevel);

      // 1. 人間プレイヤーでルーム作成
      const humanPlayer = new Player(connectionId, enterpriseId);
      const room = this.roomManager.createRoom(humanPlayer);
      const roomId = room.roomId;
      span.setAttribute('room.id', roomId);

      const log = createLogger({ connectionId, roomId });
      log.info({ aiLevel }, 'AI room created');

      // 2. AIプレイヤーでルーム参加
      const aiConnectionId = `ai-${roomId}`;
      const aiEnterpriseId = `AI Lv.${aiLevel}`;
      span.setAttribute('ai.connection_id', aiConnectionId);
      const aiPlayer = new Player(aiConnectionId, aiEnterpriseId);
      this.roomManager.joinRoom(roomId, aiPlayer);

      // 3. 両者 auto-ready
      humanPlayer.setReady();
      aiPlayer.setReady();

      // 4. セッション開始
      const seed = this.sessionManager.startSession(room);
      span.setAttribute('game.seed', seed);

      // 5. AiPlayer インスタンス作成
      const ai = new AiPlayer(seed, aiLevel);
      this.aiPlayers.set(aiConnectionId, ai);

      // 6. AIコールバック設定
      ai.setCallbacks({
        onFieldUpdate: (field, score, lines, level) => {
          // セッションにAIのスコアを記録
          const aiSession = this.sessionManager.getSession(roomId);
          if (aiSession) {
            aiSession.updateFieldStats(aiConnectionId, score, lines, level);
          }
          // 人間に OpponentFieldUpdate 送信
          this.hub.sendToClient(connectionId, ServerEvents.OpponentFieldUpdate, {
            field,
            score,
            lines,
            level,
          });
        },
        onLinesCleared: (count) => {
          // セッションマネージャー経由でガーベジ計算
          this.sessionManager.handleLinesCleared(roomId, aiConnectionId, count);
        },
        onGameOver: () => {
          // AI負け
          this.sessionManager.handleGameOver(roomId, aiConnectionId);
        },
        onAiThinking: (prompt, response, model, modelTier, temperature, seq) => {
          this.hub.sendToClient(connectionId, ServerEvents.AiThinking, { prompt, response, model, modelTier, temperature, seq });
        },
      });

      // 7. 人間に通知
      this.hub.sendToClient(connectionId, ServerEvents.RoomCreated, { roomId });
      this.hub.sendToClient(connectionId, ServerEvents.OpponentJoined, {
        enterpriseId: aiEnterpriseId,
      });
      this.hub.sendToClient(connectionId, ServerEvents.BothReady, {
        seed,
        countdown: COUNTDOWN_SECONDS,
      });

      span.addEvent('ai_room_ready', { countdown: COUNTDOWN_SECONDS });

      // 8. カウントダウン後にAI開始
      setTimeout(() => {
        ai.start();
      }, COUNTDOWN_SECONDS * 1000);
    });
  }

  handleJoinRoom(connectionId: string, data: unknown): void {
    withSpan('GameHub.handleJoinRoom', { 'player.connection_id': connectionId }, (span) => {
      const enterpriseId = this.hub.getEnterpriseId(connectionId);
      if (!enterpriseId) {
        span.addEvent('auth_failed');
        this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
        return;
      }
      span.setAttribute('player.enterprise_id', enterpriseId);

      const payload = validatePayload(JoinRoomSchema, data);
      if (!payload) {
        span.addEvent('validation_failed', { schema: 'JoinRoomSchema' });
        this.sendError(connectionId, ErrorCodes.INVALID_PAYLOAD, 'Invalid payload');
        return;
      }
      span.setAttribute('room.id', payload.roomId);

      const room = this.roomManager.getRoom(payload.roomId);
      if (!room) {
        span.addEvent('room_not_found', { 'room.id': payload.roomId });
        this.sendError(connectionId, ErrorCodes.ROOM_NOT_FOUND, 'Room not found');
        return;
      }

      if (room.isFull()) {
        span.addEvent('room_full', { 'room.id': payload.roomId });
        this.sendError(connectionId, ErrorCodes.ROOM_FULL, 'Room is full');
        return;
      }

      const player = new Player(connectionId, enterpriseId);
      this.roomManager.joinRoom(payload.roomId, player);

      createLogger({ connectionId, roomId: payload.roomId }).info('Player joined room');

      const opponent = room.getOpponent(connectionId);
      if (opponent) {
        span.setAttribute('opponent.connection_id', opponent.connectionId);
        this.hub.sendToClient(opponent.connectionId, ServerEvents.OpponentJoined, {
          enterpriseId,
        });
        this.hub.sendToClient(connectionId, ServerEvents.OpponentJoined, {
          enterpriseId: opponent.enterpriseId,
        });
      }

      this.broadcastWaitingRoomList();
    });
  }

  handlePlayerReady(connectionId: string): void {
    withSpan('GameHub.handlePlayerReady', { 'player.connection_id': connectionId }, (span) => {
      const room = this.roomManager.getRoomByConnectionId(connectionId);
      if (!room) {
        span.addEvent('not_in_room');
        this.sendError(connectionId, ErrorCodes.NOT_IN_ROOM, 'Not in a room');
        return;
      }
      span.setAttribute('room.id', room.roomId);

      const player = room.getPlayer(connectionId);
      if (!player) return;

      player.setReady();
      span.addEvent('player_ready');

      if (room.areBothReady()) {
        const seed = this.sessionManager.startSession(room);
        span.addEvent('game_starting', { seed, countdown: COUNTDOWN_SECONDS });

        createLogger({ connectionId, roomId: room.roomId }).info({ seed }, 'Both players ready, starting game');

        const bothReadyPayload = { seed, countdown: COUNTDOWN_SECONDS };
        if (room.player1) {
          this.hub.sendToClient(
            room.player1.connectionId,
            ServerEvents.BothReady,
            bothReadyPayload,
          );
        }
        if (room.player2) {
          this.hub.sendToClient(
            room.player2.connectionId,
            ServerEvents.BothReady,
            bothReadyPayload,
          );
        }
      }
    });
  }

  handleFieldUpdate(connectionId: string, data: unknown): void {
    // FieldUpdate is high-frequency — use lightweight span event instead of full span
    const payload = validatePayload(FieldUpdateSchema, data);
    if (!payload) return;

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    // セッションにスコア・ライン・レベルを記録
    const session = this.sessionManager.getSession(room.roomId);
    if (session) {
      session.updateFieldStats(connectionId, payload.score, payload.lines, payload.level);
    }

    const opponent = room.getOpponent(connectionId);
    if (!opponent) return;

    createLogger({ connectionId, roomId: room.roomId }).debug('FieldUpdate relayed');

    this.hub.sendToClient(
      opponent.connectionId,
      ServerEvents.OpponentFieldUpdate,
      payload,
    );
  }

  handleLinesCleared(connectionId: string, data: unknown): void {
    withSpan('GameHub.handleLinesCleared', { 'player.connection_id': connectionId }, (span) => {
      const payload = validatePayload(LinesClearedSchema, data);
      if (!payload) {
        span.addEvent('validation_failed');
        return;
      }
      span.setAttribute('lines.count', payload.count);

      const room = this.roomManager.getRoomByConnectionId(connectionId);
      if (!room) {
        span.addEvent('not_in_room');
        return;
      }
      span.setAttribute('room.id', room.roomId);

      this.sessionManager.handleLinesCleared(
        room.roomId,
        connectionId,
        payload.count,
      );
    });
  }

  handleGameOver(connectionId: string): void {
    withSpan('GameHub.handleGameOver', { 'player.connection_id': connectionId }, (span) => {
      const room = this.roomManager.getRoomByConnectionId(connectionId);
      if (!room) return;
      span.setAttribute('room.id', room.roomId);

      createLogger({ connectionId, roomId: room.roomId }).info('GameOver received');
      span.addEvent('game_over', { loser: connectionId });
      this.sessionManager.handleGameOver(room.roomId, connectionId);

      const opponent = room.getOpponent(connectionId);
      if (opponent && this.isAiConnection(opponent.connectionId)) {
        span.addEvent('stopping_ai_opponent', { 'ai.connection_id': opponent.connectionId });
        this.stopAiIfExists(opponent.connectionId);
      }
    });
  }

  handleRequestRematch(connectionId: string): void {
    withSpan('GameHub.handleRequestRematch', { 'player.connection_id': connectionId }, (span) => {
      const room = this.roomManager.getRoomByConnectionId(connectionId);
      if (!room) {
        span.addEvent('not_in_room');
        return;
      }
      span.setAttribute('room.id', room.roomId);

      const opponent = room.getOpponent(connectionId);
      if (!opponent) {
        span.addEvent('no_opponent');
        return;
      }

      createLogger({ connectionId, roomId: room.roomId }).info('Rematch requested');
      rematchTotal.add(1);
      room.requestRematch(connectionId);
      span.addEvent('rematch_requested');

      // AI auto-accept rematch
      if (this.isAiConnection(opponent.connectionId)) {
        room.requestRematch(opponent.connectionId);
        span.addEvent('ai_auto_accepted');
      } else {
        // Notify opponent that rematch was requested
        this.hub.sendToClient(
          opponent.connectionId,
          ServerEvents.OpponentRematch,
          {},
        );
      }

      // If both players requested rematch, reset room and send both back to lobby
      if (room.areBothRematchRequested()) {
        span.addEvent('rematch_starting');
        createLogger({ connectionId, roomId: room.roomId }).info('Rematch accepted by both players');
        this.sessionManager.endSession(room.roomId);
        room.resetForRematch();

        // Find AI connection and restart
        const aiConnId = this.isAiConnection(opponent.connectionId) ? opponent.connectionId : connectionId;
        const humanConnId = aiConnId === opponent.connectionId ? connectionId : opponent.connectionId;

        if (this.isAiConnection(aiConnId)) {
          // AI game restarts immediately — set both ready and start session
          if (room.player1) room.player1.setReady();
          if (room.player2) room.player2.setReady();

          const seed = this.sessionManager.startSession(room);
          span.setAttribute('game.seed', seed);
          // Recreate AI player with new seed
          this.stopAiIfExists(aiConnId);
          const aiLevel = this.getAiLevel(aiConnId);
          const ai = new AiPlayer(seed, aiLevel);
          this.aiPlayers.set(aiConnId, ai);

          ai.setCallbacks({
            onFieldUpdate: (field, score, lines, level) => {
              const aiSession = this.sessionManager.getSession(room.roomId);
              if (aiSession) {
                aiSession.updateFieldStats(aiConnId, score, lines, level);
              }
              this.hub.sendToClient(humanConnId, ServerEvents.OpponentFieldUpdate, {
                field, score, lines, level,
              });
            },
            onLinesCleared: (count) => {
              this.sessionManager.handleLinesCleared(room.roomId, aiConnId, count);
            },
            onGameOver: () => {
              this.sessionManager.handleGameOver(room.roomId, aiConnId);
            },
            onAiThinking: (prompt, response, model, modelTier, temperature, seq) => {
              this.hub.sendToClient(humanConnId, ServerEvents.AiThinking, { prompt, response, model, modelTier, temperature, seq });
            },
          });

          this.hub.sendToClient(humanConnId, ServerEvents.RematchAccepted, { roomId: room.roomId });
          this.hub.sendToClient(humanConnId, ServerEvents.BothReady, {
            seed,
            countdown: COUNTDOWN_SECONDS,
          });

          setTimeout(() => {
            ai.start();
          }, COUNTDOWN_SECONDS * 1000);
        } else {
          const payload = { roomId: room.roomId };
          if (room.player1) {
            this.hub.sendToClient(
              room.player1.connectionId,
              ServerEvents.RematchAccepted,
              payload,
            );
          }
          if (room.player2) {
            this.hub.sendToClient(
              room.player2.connectionId,
              ServerEvents.RematchAccepted,
              payload,
            );
          }
        }
      }
    });
  }

  handleLeaveRoom(connectionId: string): void {
    withSpan('GameHub.handleLeaveRoom', { 'player.connection_id': connectionId }, (span) => {
      const room = this.roomManager.getRoomByConnectionId(connectionId);
      if (!room) {
        span.addEvent('not_in_room');
        return;
      }
      span.setAttribute('room.id', room.roomId);

      createLogger({ connectionId, roomId: room.roomId }).info('Player leaving room');

      const opponent = room.getOpponent(connectionId);

      // Stop AI if opponent is AI
      if (opponent && this.isAiConnection(opponent.connectionId)) {
        span.addEvent('stopping_ai', { 'ai.connection_id': opponent.connectionId });
        this.stopAiIfExists(opponent.connectionId);
        this.aiPlayers.delete(opponent.connectionId);
      }

      // Clean up
      this.sessionManager.endSession(room.roomId);
      this.roomManager.deleteRoom(room.roomId);
      span.addEvent('room_deleted');

      if (opponent && !this.isAiConnection(opponent.connectionId)) {
        this.hub.sendToClient(
          opponent.connectionId,
          ServerEvents.OpponentDisconnected,
          { timeout: 0 },
        );
      }

      this.broadcastWaitingRoomList();
    });
  }

  // ---------------------------------------------------------------------------
  // Room list subscription
  // ---------------------------------------------------------------------------

  handleSubscribeRoomList(connectionId: string): void {
    this.roomListSubscribers.add(connectionId);
    // Send current waiting room list immediately
    const rooms = this.getWaitingRoomList();
    this.hub.sendToClient(connectionId, ServerEvents.WaitingRoomListUpdated, { rooms });
  }

  handleUnsubscribeRoomList(connectionId: string): void {
    this.roomListSubscribers.delete(connectionId);
  }

  private broadcastWaitingRoomList(): void {
    const rooms = this.getWaitingRoomList();
    const payload = { rooms };
    for (const connId of this.roomListSubscribers) {
      this.hub.sendToClient(connId, ServerEvents.WaitingRoomListUpdated, payload);
    }
  }

  private getWaitingRoomList(): WaitingRoomInfo[] {
    return this.roomManager
      .getAllRooms()
      .filter((r) => r.status === RoomStatus.Waiting && !r.isFull())
      .map((r) => ({
        roomId: r.roomId,
        creatorEnterpriseId: r.player1?.enterpriseId ?? '',
      }));
  }

  // ---------------------------------------------------------------------------
  // Leaderboard subscription
  // ---------------------------------------------------------------------------

  handleSubscribeLeaderboard(connectionId: string): void {
    this.leaderboardSubscribers.add(connectionId);
    // 即座に現在のデータを送信
    const rankings = getTopRankings(20);
    const matches = getRecentMatches(20);
    this.hub.sendToClient(connectionId, ServerEvents.LeaderboardUpdated, { rankings });
    this.hub.sendToClient(connectionId, ServerEvents.MatchHistoryUpdated, { matches });
  }

  handleUnsubscribeLeaderboard(connectionId: string): void {
    this.leaderboardSubscribers.delete(connectionId);
  }

  private broadcastLeaderboard(): void {
    const rankings = getTopRankings(20);
    const payload = { rankings };
    for (const connId of this.leaderboardSubscribers) {
      this.hub.sendToClient(connId, ServerEvents.LeaderboardUpdated, payload);
    }
  }

  private broadcastMatchHistory(): void {
    const matches = getRecentMatches(20);
    const payload = { matches };
    for (const connId of this.leaderboardSubscribers) {
      this.hub.sendToClient(connId, ServerEvents.MatchHistoryUpdated, payload);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  handleDisconnected(connectionId: string): void {
    withSpan('GameHub.handleDisconnected', { 'player.connection_id': connectionId }, (span) => {
    // Remove from subscribers
    this.roomListSubscribers.delete(connectionId);
    this.leaderboardSubscribers.delete(connectionId);

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;
    span.setAttribute('room.id', room.roomId);

    createLogger({ connectionId, roomId: room.roomId }).info('Player disconnected');
    span.addEvent('player_disconnected');

    // Stop AI if opponent is AI
    const opponent = room.getOpponent(connectionId);
    if (opponent && this.isAiConnection(opponent.connectionId)) {
      this.stopAiIfExists(opponent.connectionId);
      this.aiPlayers.delete(opponent.connectionId);
    }

    const player = room.getPlayer(connectionId);
    if (player) {
      player.disconnect();
    }

    // If in a game session, start disconnect timer
    const session = this.sessionManager.getSession(room.roomId);
    if (session && !session.isFinished()) {
      // If opponent is AI, just end the session immediately
      if (opponent && this.isAiConnection(opponent.connectionId)) {
        this.sessionManager.endSession(room.roomId);
        this.roomManager.deleteRoom(room.roomId);
      } else {
        this.sessionManager.handleDisconnect(room.roomId, connectionId);
      }
    } else {
      // Not playing — just clean up
      if (opponent && !this.isAiConnection(opponent.connectionId)) {
        this.hub.sendToClient(
          opponent.connectionId,
          ServerEvents.OpponentDisconnected,
          { timeout: 0 },
        );
      }
      this.roomManager.removeConnection(connectionId);
      this.broadcastWaitingRoomList();
    }
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private sendError(
    connectionId: string,
    code: number,
    message: string,
  ): void {
    // Record error in the current active span
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent('error_sent', {
        'error.code': code,
        'error.message': message,
        'player.connection_id': connectionId,
      });
    }
    this.hub.sendToClient(connectionId, ServerEvents.Error, { code, message });
  }

  // ---------------------------------------------------------------------------
  // AI helpers
  // ---------------------------------------------------------------------------

  private isAiConnection(connectionId: string): boolean {
    return connectionId.startsWith('ai-');
  }

  private stopAiIfExists(connectionId: string): void {
    const ai = this.aiPlayers.get(connectionId);
    if (ai) {
      ai.stop();
    }
  }

  private getAiLevel(aiConnectionId: string): number {
    // AI connection ID format: "ai-{roomId}"
    // Find the room and extract level from enterprise ID (format: "AI Lv.{level}")
    const room = this.roomManager.getRoomByConnectionId(aiConnectionId);
    if (!room) return 5;
    const aiPlayer = room.getPlayer(aiConnectionId);
    if (!aiPlayer) return 5;
    const match = aiPlayer.enterpriseId.match(/AI Lv\.(\d+)/);
    return match ? parseInt(match[1], 10) : 5;
  }

  // ---------------------------------------------------------------------------
  // Match result persistence
  // ---------------------------------------------------------------------------

  private persistMatchResult(winnerId: string, loserId: string, reason: LoserReason): void {
    try {
      const room = this.roomManager.getRoomByConnectionId(winnerId)
        ?? this.roomManager.getRoomByConnectionId(loserId);
      if (!room) return;

      const session = this.sessionManager.getSession(room.roomId);
      if (!session) return;

      const winnerEntId = this.resolveEnterpriseId(winnerId, room);
      const loserEntId = this.resolveEnterpriseId(loserId, room);
      if (!winnerEntId || !loserEntId) return;

      const isAiMatch = this.isAiConnection(winnerId) || this.isAiConnection(loserId);
      const durationMs = Date.now() - session.startedAt.getTime();

      insertMatchResult({
        roomId: room.roomId,
        winnerId: winnerEntId,
        loserId: loserEntId,
        winnerScore: session.getLatestScore(winnerId),
        winnerLines: session.getLatestLines(winnerId),
        winnerLevel: session.getLatestLevel(winnerId),
        loserScore: session.getLatestScore(loserId),
        loserLines: session.getLatestLines(loserId),
        loserLevel: session.getLatestLevel(loserId),
        loserReason: reason,
        durationMs,
        isAiMatch,
      });

      // プレイヤースタッツ更新（AI接続は除外）
      if (!this.isAiConnection(winnerId)) {
        upsertPlayerStats(winnerEntId, true, session.getLatestScore(winnerId), session.getLatestLines(winnerId));
      }
      if (!this.isAiConnection(loserId)) {
        upsertPlayerStats(loserEntId, false, session.getLatestScore(loserId), session.getLatestLines(loserId));
      }

      // リアルタイム配信
      this.broadcastLeaderboard();
      this.broadcastMatchHistory();
    } catch (err) {
      createLogger({}).warn({ err }, 'Failed to persist match result');
    }
  }

  private resolveEnterpriseId(connectionId: string, room: { getPlayer: (id: string) => { enterpriseId: string } | null }): string | undefined {
    const player = room.getPlayer(connectionId);
    return player?.enterpriseId;
  }
}
