import {
  HubConnectionBuilder,
  HubConnection,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import {
  ClientEvents,
  ServerEvents,
  FIELD_SYNC_INTERVAL_MS,
} from '@battle-tetris/shared';
import type {
  FieldUpdatePayload,
  RoomCreatedPayload,
  OpponentJoinedPayload,
  MatchFoundPayload,
  BothReadyPayload,
  GameStartPayload,
  OpponentFieldUpdatePayload,
  ReceiveGarbagePayload,
  GameResultPayload,
  OpponentDisconnectedPayload,
  ErrorPayload,
} from '@battle-tetris/shared';

// =============================================================================
// Connection State
// =============================================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// =============================================================================
// Server Event Handlers
// =============================================================================

export interface SignalREventHandlers {
  onRoomCreated?: (payload: RoomCreatedPayload) => void;
  onOpponentJoined?: (payload: OpponentJoinedPayload) => void;
  onMatchFound?: (payload: MatchFoundPayload) => void;
  onBothReady?: (payload: BothReadyPayload) => void;
  onGameStart?: (payload: GameStartPayload) => void;
  onOpponentFieldUpdate?: (payload: OpponentFieldUpdatePayload) => void;
  onReceiveGarbage?: (payload: ReceiveGarbagePayload) => void;
  onGameResult?: (payload: GameResultPayload) => void;
  onOpponentRematch?: () => void;
  onOpponentDisconnected?: (payload: OpponentDisconnectedPayload) => void;
  onOpponentReconnected?: () => void;
  onError?: (payload: ErrorPayload) => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
}

// =============================================================================
// SignalRClient
// =============================================================================

export class SignalRClient {
  private connection: HubConnection | null = null;
  private handlers: SignalREventHandlers = {};
  private _state: ConnectionState = 'disconnected';

  // --- FieldUpdate throttle ---
  private lastFieldUpdateTime: number = 0;
  private pendingFieldUpdate: FieldUpdatePayload | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  get state(): ConnectionState {
    return this._state;
  }

  /**
   * イベントハンドラを設定する。
   */
  setHandlers(handlers: SignalREventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * SignalR Hub に接続する。
   */
  async connect(url: string): Promise<void> {
    if (this.connection) {
      await this.disconnect();
    }

    this.connection = new HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.setupEventListeners();
    this.setupLifecycleHooks();

    this.updateState('connecting');

    try {
      await this.connection.start();
      this.updateState('connected');
    } catch {
      this.updateState('disconnected');
      throw new Error('Failed to connect to SignalR hub');
    }
  }

  /**
   * 接続を切断する。
   */
  async disconnect(): Promise<void> {
    this.clearThrottle();
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // Ignore stop errors
      }
      this.connection = null;
    }
    this.updateState('disconnected');
  }

  // ---------------------------------------------------------------------------
  // Client → Server: Send methods
  // ---------------------------------------------------------------------------

  sendCreateRoom(nickname: string): void {
    this.invoke(ClientEvents.CreateRoom, { nickname });
  }

  sendJoinRoom(nickname: string, roomId: string): void {
    this.invoke(ClientEvents.JoinRoom, { nickname, roomId });
  }

  sendJoinRandomMatch(nickname: string): void {
    this.invoke(ClientEvents.JoinRandomMatch, { nickname });
  }

  sendPlayerReady(): void {
    this.invoke(ClientEvents.PlayerReady);
  }

  /**
   * フィールド更新を送信する。FIELD_SYNC_INTERVAL_MS (50ms) のスロットリング付き。
   */
  sendFieldUpdate(payload: FieldUpdatePayload): void {
    const now = Date.now();
    const elapsed = now - this.lastFieldUpdateTime;

    if (elapsed >= FIELD_SYNC_INTERVAL_MS) {
      this.lastFieldUpdateTime = now;
      this.pendingFieldUpdate = null;
      this.invoke(ClientEvents.FieldUpdate, payload);
    } else {
      // Throttle: store pending and schedule
      this.pendingFieldUpdate = payload;
      if (!this.throttleTimer) {
        const delay = FIELD_SYNC_INTERVAL_MS - elapsed;
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null;
          if (this.pendingFieldUpdate) {
            this.lastFieldUpdateTime = Date.now();
            const pending = this.pendingFieldUpdate;
            this.pendingFieldUpdate = null;
            this.invoke(ClientEvents.FieldUpdate, pending);
          }
        }, delay);
      }
    }
  }

  sendLinesCleared(count: number): void {
    this.invoke(ClientEvents.LinesCleared, { count });
  }

  sendGameOver(): void {
    this.invoke(ClientEvents.GameOver);
  }

  sendRequestRematch(): void {
    this.invoke(ClientEvents.RequestRematch);
  }

  sendLeaveRoom(): void {
    this.invoke(ClientEvents.LeaveRoom);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private invoke(method: string, payload?: unknown): void {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      return;
    }
    if (payload !== undefined) {
      this.connection.send(method, payload).catch(() => {});
    } else {
      this.connection.send(method).catch(() => {});
    }
  }

  private setupEventListeners(): void {
    if (!this.connection) return;

    this.connection.on(ServerEvents.RoomCreated, (payload: RoomCreatedPayload) => {
      this.handlers.onRoomCreated?.(payload);
    });

    this.connection.on(ServerEvents.OpponentJoined, (payload: OpponentJoinedPayload) => {
      this.handlers.onOpponentJoined?.(payload);
    });

    this.connection.on(ServerEvents.MatchFound, (payload: MatchFoundPayload) => {
      this.handlers.onMatchFound?.(payload);
    });

    this.connection.on(ServerEvents.BothReady, (payload: BothReadyPayload) => {
      this.handlers.onBothReady?.(payload);
    });

    this.connection.on(ServerEvents.GameStart, (payload: GameStartPayload) => {
      this.handlers.onGameStart?.(payload);
    });

    this.connection.on(ServerEvents.OpponentFieldUpdate, (payload: OpponentFieldUpdatePayload) => {
      this.handlers.onOpponentFieldUpdate?.(payload);
    });

    this.connection.on(ServerEvents.ReceiveGarbage, (payload: ReceiveGarbagePayload) => {
      this.handlers.onReceiveGarbage?.(payload);
    });

    this.connection.on(ServerEvents.GameResult, (payload: GameResultPayload) => {
      this.handlers.onGameResult?.(payload);
    });

    this.connection.on(ServerEvents.OpponentRematch, () => {
      this.handlers.onOpponentRematch?.();
    });

    this.connection.on(ServerEvents.OpponentDisconnected, (payload: OpponentDisconnectedPayload) => {
      this.handlers.onOpponentDisconnected?.(payload);
    });

    this.connection.on(ServerEvents.OpponentReconnected, () => {
      this.handlers.onOpponentReconnected?.();
    });

    this.connection.on(ServerEvents.Error, (payload: ErrorPayload) => {
      this.handlers.onError?.(payload);
    });
  }

  private setupLifecycleHooks(): void {
    if (!this.connection) return;

    this.connection.onreconnecting(() => {
      this.updateState('reconnecting');
    });

    this.connection.onreconnected(() => {
      this.updateState('connected');
    });

    this.connection.onclose(() => {
      this.updateState('disconnected');
    });
  }

  private updateState(state: ConnectionState): void {
    if (this._state !== state) {
      this._state = state;
      this.handlers.onConnectionStateChanged?.(state);
    }
  }

  private clearThrottle(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingFieldUpdate = null;
  }
}

// =============================================================================
// Singleton instance
// =============================================================================

export const signalRClient = new SignalRClient();
