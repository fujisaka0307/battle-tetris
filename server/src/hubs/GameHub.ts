import {
  ServerEvents,
  ErrorCodes,
  COUNTDOWN_SECONDS,
  RoomStatus,
} from '@battle-tetris/shared';
import type { WaitingRoomInfo } from '@battle-tetris/shared';
import { RoomManager } from '../services/RoomManager.js';
import { MatchmakingService } from '../services/MatchmakingService.js';
import { GameSessionManager } from '../services/GameSessionManager.js';
import { Player } from '../models/Player.js';
import {
  JoinRoomSchema,
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
  /** connectionId から Enterprise ID を取得 */
  getEnterpriseId(connectionId: string): string | undefined;
}

// =============================================================================
// GameHub
// =============================================================================

export class GameHub {
  private readonly roomManager: RoomManager;
  private readonly matchmaking: MatchmakingService;
  private readonly sessionManager: GameSessionManager;
  private readonly hub: HubConnection;
  private readonly roomListSubscribers = new Set<string>();

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

  handleCreateRoom(connectionId: string): void {
    const enterpriseId = this.hub.getEnterpriseId(connectionId);
    if (!enterpriseId) {
      this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    const player = new Player(connectionId, enterpriseId);
    const room = this.roomManager.createRoom(player);

    this.hub.sendToClient(connectionId, ServerEvents.RoomCreated, {
      roomId: room.roomId,
    });

    this.broadcastWaitingRoomList();
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

  handleJoinRandomMatch(connectionId: string): void {
    const enterpriseId = this.hub.getEnterpriseId(connectionId);
    if (!enterpriseId) {
      this.sendError(connectionId, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
      return;
    }

    const player = new Player(connectionId, enterpriseId);
    const result = this.matchmaking.enqueue(player);

    if (result) {
      // Match found — notify both players
      this.hub.sendToClient(result.player1.connectionId, ServerEvents.MatchFound, {
        roomId: result.room.roomId,
        opponentEnterpriseId: result.player2.enterpriseId,
      });
      this.hub.sendToClient(result.player2.connectionId, ServerEvents.MatchFound, {
        roomId: result.room.roomId,
        opponentEnterpriseId: result.player1.enterpriseId,
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
}
