import {
  ServerEvents,
  ErrorCodes,
  COUNTDOWN_SECONDS,
} from '@battle-tetris/shared';
import { RoomManager } from '../services/RoomManager.js';
import { MatchmakingService } from '../services/MatchmakingService.js';
import { GameSessionManager } from '../services/GameSessionManager.js';
import { Player } from '../models/Player.js';
import { validateNickname } from '../utils/nicknameFilter.js';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  JoinRandomMatchSchema,
  FieldUpdateSchema,
  LinesClearedSchema,
  validatePayload,
} from '../middleware/validation.js';

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
}

// =============================================================================
// GameHub
// =============================================================================

export class GameHub {
  private roomManager: RoomManager;
  private matchmaking: MatchmakingService;
  private sessionManager: GameSessionManager;
  private hub: HubConnection;

  constructor(hub: HubConnection) {
    this.roomManager = new RoomManager();
    this.matchmaking = new MatchmakingService(this.roomManager);
    this.sessionManager = new GameSessionManager(this.roomManager);
    this.hub = hub;

    // Wire up session manager callbacks
    this.sessionManager.setCallbacks({
      sendGarbage: (connectionId, lines) => {
        this.hub.sendToClient(connectionId, ServerEvents.ReceiveGarbage, {
          lines,
        });
      },
      sendGameResult: (winnerId, loserId, reason) => {
        const payload = { winner: winnerId, loserReason: reason };
        this.hub.sendToClient(winnerId, ServerEvents.GameResult, payload);
        this.hub.sendToClient(loserId, ServerEvents.GameResult, payload);
      },
      sendOpponentDisconnected: (connectionId, timeout) => {
        this.hub.sendToClient(connectionId, ServerEvents.OpponentDisconnected, {
          timeout,
        });
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

  handleCreateRoom(connectionId: string, data: unknown): void {
    const payload = validatePayload(CreateRoomSchema, data);
    if (!payload) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, 'Invalid payload');
      return;
    }

    const validation = validateNickname(payload.nickname);
    if (!validation.valid) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, validation.error!);
      return;
    }

    const player = new Player(connectionId, validation.nickname);
    const room = this.roomManager.createRoom(player);

    this.hub.sendToClient(connectionId, ServerEvents.RoomCreated, {
      roomId: room.roomId,
    });
  }

  handleJoinRoom(connectionId: string, data: unknown): void {
    const payload = validatePayload(JoinRoomSchema, data);
    if (!payload) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, 'Invalid payload');
      return;
    }

    const validation = validateNickname(payload.nickname);
    if (!validation.valid) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, validation.error!);
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

    const player = new Player(connectionId, validation.nickname);
    this.roomManager.joinRoom(payload.roomId, player);

    // Notify both players
    const opponent = room.getOpponent(connectionId);
    if (opponent) {
      this.hub.sendToClient(opponent.connectionId, ServerEvents.OpponentJoined, {
        nickname: validation.nickname,
      });
      this.hub.sendToClient(connectionId, ServerEvents.OpponentJoined, {
        nickname: opponent.nickname,
      });
    }
  }

  handleJoinRandomMatch(connectionId: string, data: unknown): void {
    const payload = validatePayload(JoinRandomMatchSchema, data);
    if (!payload) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, 'Invalid payload');
      return;
    }

    const validation = validateNickname(payload.nickname);
    if (!validation.valid) {
      this.sendError(connectionId, ErrorCodes.INVALID_NICKNAME, validation.error!);
      return;
    }

    const player = new Player(connectionId, validation.nickname);
    const result = this.matchmaking.enqueue(player);

    if (result) {
      // Match found — notify both players
      this.hub.sendToClient(result.player1.connectionId, ServerEvents.MatchFound, {
        roomId: result.room.roomId,
        opponentNickname: result.player2.nickname,
      });
      this.hub.sendToClient(result.player2.connectionId, ServerEvents.MatchFound, {
        roomId: result.room.roomId,
        opponentNickname: result.player1.nickname,
      });
    }
    // If no match yet, player waits in queue
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

    this.sessionManager.handleGameOver(room.roomId, connectionId);
  }

  handleRequestRematch(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    const opponent = room.getOpponent(connectionId);
    if (!opponent) return;

    room.requestRematch(connectionId);

    // Notify opponent that rematch was requested
    this.hub.sendToClient(
      opponent.connectionId,
      ServerEvents.OpponentRematch,
      {},
    );

    // If both players requested rematch, reset room and send both back to lobby
    if (room.areBothRematchRequested()) {
      this.sessionManager.endSession(room.roomId);
      room.resetForRematch();

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

  handleLeaveRoom(connectionId: string): void {
    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    const opponent = room.getOpponent(connectionId);

    // Clean up
    this.sessionManager.endSession(room.roomId);
    this.roomManager.deleteRoom(room.roomId);

    if (opponent) {
      this.hub.sendToClient(
        opponent.connectionId,
        ServerEvents.OpponentDisconnected,
        { timeout: 0 },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  handleDisconnected(connectionId: string): void {
    // Remove from matchmaking queue
    this.matchmaking.dequeue(connectionId);

    const room = this.roomManager.getRoomByConnectionId(connectionId);
    if (!room) return;

    const player = room.getPlayer(connectionId);
    if (player) {
      player.disconnect();
    }

    // If in a game session, start disconnect timer
    const session = this.sessionManager.getSession(room.roomId);
    if (session && !session.isFinished()) {
      this.sessionManager.handleDisconnect(room.roomId, connectionId);
    } else {
      // Not playing — just clean up
      const opponent = room.getOpponent(connectionId);
      if (opponent) {
        this.hub.sendToClient(
          opponent.connectionId,
          ServerEvents.OpponentDisconnected,
          { timeout: 0 },
        );
      }
      this.roomManager.removeConnection(connectionId);
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
}
