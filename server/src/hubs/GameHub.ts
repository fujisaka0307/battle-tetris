import {
  ServerEvents,
  ErrorCodes,
  COUNTDOWN_SECONDS,
  RoomStatus,
} from '@battle-tetris/shared';
import type { WaitingRoomInfo } from '@battle-tetris/shared';
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
    const enterpriseId = this.hub.getEnterpriseId(connectionId);
    if (!enterpriseId) {
      this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    const player = new Player(connectionId, enterpriseId);
    const room = this.roomManager.createRoom(player);

    const log = createLogger({ connectionId, roomId: room.roomId });
    log.info('Room created');

    this.hub.sendToClient(connectionId, ServerEvents.RoomCreated, {
      roomId: room.roomId,
    });

    this.broadcastWaitingRoomList();
  }

  handleCreateAiRoom(connectionId: string, data: unknown): void {
    const enterpriseId = this.hub.getEnterpriseId(connectionId);
    if (!enterpriseId) {
      this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    const payload = validatePayload(CreateAiRoomSchema, data);
    if (!payload) {
      this.sendError(connectionId, ErrorCodes.INVALID_PAYLOAD, 'Invalid payload');
      return;
    }

    const aiLevel = payload.aiLevel;

    // 1. 人間プレイヤーでルーム作成
    const humanPlayer = new Player(connectionId, enterpriseId);
    const room = this.roomManager.createRoom(humanPlayer);
    const roomId = room.roomId;

    const log = createLogger({ connectionId, roomId });
    log.info({ aiLevel }, 'AI room created');

    // 2. AIプレイヤーでルーム参加
    const aiConnectionId = `ai-${roomId}`;
    const aiEnterpriseId = `AI Lv.${aiLevel}`;
    const aiPlayer = new Player(aiConnectionId, aiEnterpriseId);
    this.roomManager.joinRoom(roomId, aiPlayer);

    // 3. 両者 auto-ready
    humanPlayer.setReady();
    aiPlayer.setReady();

    // 4. セッション開始
    const seed = this.sessionManager.startSession(room);

    // 5. AiPlayer インスタンス作成
    const ai = new AiPlayer(seed, aiLevel);
    this.aiPlayers.set(aiConnectionId, ai);

    // 6. AIコールバック設定
    ai.setCallbacks({
      onFieldUpdate: (field, score, lines, level) => {
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

    // 8. カウントダウン後にAI開始
    setTimeout(() => {
      ai.start();
    }, COUNTDOWN_SECONDS * 1000);
  }

  handleJoinRoom(connectionId: string, data: unknown): void {
    const enterpriseId = this.hub.getEnterpriseId(connectionId);
    if (!enterpriseId) {
      this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    const payload = validatePayload(JoinRoomSchema, data);
    if (!payload) {
      this.sendError(connectionId, ErrorCodes.INVALID_PAYLOAD, 'Invalid payload');
      return;
    }

    const room = this.roomManager.getRoom(payload.roomId);
    if (!room) {
      this.sendError(connectionId, ErrorCodes.ROOM_NOT_FOUND, 'Room not found');
      return;
    }

    if (room.isFull()) {
      this.sendError(connectionId, ErrorCodes.ROOM_FULL, 'Room is full');
      return;
    }

    const player = new Player(connectionId, enterpriseId);
    this.roomManager.joinRoom(payload.roomId, player);

    createLogger({ connectionId, roomId: payload.roomId }).info('Player joined room');

    // Notify both players
    const opponent = room.getOpponent(connectionId);
    if (opponent) {
      this.hub.sendToClient(opponent.connectionId, ServerEvents.OpponentJoined, {
        enterpriseId,
      });
      this.hub.sendToClient(connectionId, ServerEvents.OpponentJoined, {
        enterpriseId: opponent.enterpriseId,
      });
    }

    this.broadcastWaitingRoomList();
  }

  handlePlayerReady(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) {
      this.sendError(connectionId, ErrorCodes.NOT_IN_ROOM, 'Not in a room');
      return;
    }

    const player = room.getPlayer(connectionId);
    if (!player) return;

    player.setReady();

    if (room.areBothReady()) {
      const seed = this.sessionManager.startSession(room);

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
  }

  handleFieldUpdate(connectionId: string, data: unknown): void {
    const payload = validatePayload(FieldUpdateSchema, data);
    if (!payload) return;

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

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
    const payload = validatePayload(LinesClearedSchema, data);
    if (!payload) return;

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    this.sessionManager.handleLinesCleared(
      room.roomId,
      connectionId,
      payload.count,
    );
  }

  handleGameOver(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    createLogger({ connectionId, roomId: room.roomId }).info('GameOver received');
    this.sessionManager.handleGameOver(room.roomId, connectionId);

    // Stop AI opponent if exists
    const opponent = room.getOpponent(connectionId);
    if (opponent && this.isAiConnection(opponent.connectionId)) {
      this.stopAiIfExists(opponent.connectionId);
    }
  }

  handleRequestRematch(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    const opponent = room.getOpponent(connectionId);
    if (!opponent) return;

    createLogger({ connectionId, roomId: room.roomId }).info('Rematch requested');
    rematchTotal.add(1);
    room.requestRematch(connectionId);

    // AI auto-accept rematch
    if (this.isAiConnection(opponent.connectionId)) {
      room.requestRematch(opponent.connectionId);
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
      createLogger({ connectionId, roomId: room.roomId }).info('Rematch accepted by both players');
      this.sessionManager.endSession(room.roomId);
      room.resetForRematch();

      // Both ready again
      if (room.player1) room.player1.setReady();
      if (room.player2) room.player2.setReady();

      const seed = this.sessionManager.startSession(room);

      // Find AI connection and restart
      const aiConnId = this.isAiConnection(opponent.connectionId) ? opponent.connectionId : connectionId;
      const humanConnId = aiConnId === opponent.connectionId ? connectionId : opponent.connectionId;

      if (this.isAiConnection(aiConnId)) {
        // Recreate AI player with new seed
        this.stopAiIfExists(aiConnId);
        const aiOldPlayer = this.aiPlayers.get(aiConnId);
        const aiLevel = this.getAiLevel(aiConnId);
        const ai = new AiPlayer(seed, aiLevel);
        this.aiPlayers.set(aiConnId, ai);

        ai.setCallbacks({
          onFieldUpdate: (field, score, lines, level) => {
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
  }

  handleLeaveRoom(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    createLogger({ connectionId, roomId: room.roomId }).info('Player leaving room');

    const opponent = room.getOpponent(connectionId);

    // Stop AI if opponent is AI
    if (opponent && this.isAiConnection(opponent.connectionId)) {
      this.stopAiIfExists(opponent.connectionId);
      this.aiPlayers.delete(opponent.connectionId);
    }

    // Clean up
    this.sessionManager.endSession(room.roomId);
    this.roomManager.deleteRoom(room.roomId);

    if (opponent && !this.isAiConnection(opponent.connectionId)) {
      this.hub.sendToClient(
        opponent.connectionId,
        ServerEvents.OpponentDisconnected,
        { timeout: 0 },
      );
    }

    this.broadcastWaitingRoomList();
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
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  handleDisconnected(connectionId: string): void {
    // Remove from room list subscribers
    this.roomListSubscribers.delete(connectionId);

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    createLogger({ connectionId, roomId: room.roomId }).info('Player disconnected');

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
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private sendError(
    connectionId: string,
    code: number,
    message: string,
  ): void {
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
}
