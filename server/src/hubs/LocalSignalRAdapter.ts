/**
 * LocalSignalRAdapter — ローカル開発用の SignalR Hub プロトコルアダプター。
 *
 * Azure SignalR Service を使わずに、WebSocket + JSON Hub Protocol で
 * @microsoft/signalr クライアントと通信する。
 *
 * SignalR JSON Hub Protocol:
 * - メッセージは JSON + レコードセパレータ (0x1E) で区切る
 * - type=1: Invocation (クライアント→サーバーのメソッド呼び出し)
 * - type=1: Invocation (サーバー→クライアントのイベント送信)
 * - type=6: Ping
 * - type=7: Close
 * - ネゴシエーション: /hub/negotiate で connectionId と転送方式を返す
 */
import type { Server as HttpServer, IncomingMessage } from 'http';
import { createRequire } from 'module';
import type WS from 'ws';

const require = createRequire(import.meta.url);
// ws は CJS モジュールのため createRequire でロードする
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const wsModule = require('ws') as any;
const WS_OPEN: number = wsModule.OPEN;

type WebSocket = WS;
import type { Express, Request, Response } from 'express';
import { GameHub, type HubConnection } from './GameHub.js';
import { ClientEvents } from '@battle-tetris/shared';

// SignalR record separator
const RECORD_SEPARATOR = String.fromCharCode(0x1e);

// =============================================================================
// Types
// =============================================================================

interface SignalRMessage {
  type: number;
  target?: string;
  arguments?: unknown[];
  invocationId?: string;
  error?: string;
}

// =============================================================================
// LocalSignalRAdapter
// =============================================================================

export class LocalSignalRAdapter implements HubConnection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private wss: any = null;
  private connections = new Map<string, WebSocket>();
  private gameHub: GameHub;
  private nextConnectionId = 1;

  constructor() {
    this.gameHub = new GameHub(this);
  }

  // ---------------------------------------------------------------------------
  // HubConnection implementation
  // ---------------------------------------------------------------------------

  sendToClient(connectionId: string, event: string, payload: unknown): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WS_OPEN) return;

    const message: SignalRMessage = {
      type: 1,
      target: event,
      arguments: [payload],
    };
    ws.send(JSON.stringify(message) + RECORD_SEPARATOR);
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /**
   * Express にネゴシエーションエンドポイントを登録し、
   * HTTP サーバーに WebSocket サーバーをアタッチする。
   */
  setup(app: Express, server: HttpServer): void {
    // SignalR negotiate endpoint
    app.post('/hub/negotiate', (req: Request, res: Response) => {
      const connectionId = `conn-${this.nextConnectionId++}`;
      res.json({
        connectionId,
        negotiateVersion: 1,
        availableTransports: [
          {
            transport: 'WebSockets',
            transferFormats: ['Text'],
          },
        ],
      });
    });

    // WebSocket server
    this.wss = new wsModule.Server({ server, path: '/hub' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      // Extract connectionId from query param
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const connectionId = url.searchParams.get('id') || `conn-${this.nextConnectionId++}`;

      this.connections.set(connectionId, ws);

      ws.on('message', (data: WS.RawData) => {
        this.handleMessage(connectionId, data.toString());
      });

      ws.on('close', () => {
        this.gameHub.handleDisconnected(connectionId);
        this.connections.delete(connectionId);
      });

      ws.on('error', () => {
        this.connections.delete(connectionId);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // For testing
  // ---------------------------------------------------------------------------

  getGameHub(): GameHub {
    return this.gameHub;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private handleMessage(connectionId: string, raw: string): void {
    // SignalR sends messages separated by record separator
    const parts = raw.split(RECORD_SEPARATOR).filter((p) => p.length > 0);

    for (const part of parts) {
      try {
        const msg: SignalRMessage = JSON.parse(part);
        this.processMessage(connectionId, msg);
      } catch {
        // Ignore malformed messages
      }
    }
  }

  private processMessage(connectionId: string, msg: SignalRMessage): void {
    switch (msg.type) {
      case 1: // Invocation
        this.handleInvocation(connectionId, msg);
        break;
      case 6: // Ping
        this.sendPing(connectionId);
        break;
      case 7: // Close
        // Client wants to close
        break;
      default:
        // Handshake response (type undefined or 0): client sends {} after connect
        // This is the handshake — respond with empty handshake response
        this.sendHandshakeResponse(connectionId);
        break;
    }
  }

  private handleInvocation(connectionId: string, msg: SignalRMessage): void {
    const target = msg.target;
    const args = msg.arguments || [];

    switch (target) {
      case ClientEvents.CreateRoom:
        this.gameHub.handleCreateRoom(connectionId, args[0]);
        break;
      case ClientEvents.JoinRoom:
        this.gameHub.handleJoinRoom(connectionId, args[0]);
        break;
      case ClientEvents.JoinRandomMatch:
        this.gameHub.handleJoinRandomMatch(connectionId, args[0]);
        break;
      case ClientEvents.PlayerReady:
        this.gameHub.handlePlayerReady(connectionId);
        break;
      case ClientEvents.FieldUpdate:
        this.gameHub.handleFieldUpdate(connectionId, args[0]);
        break;
      case ClientEvents.LinesCleared:
        this.gameHub.handleLinesCleared(connectionId, args[0]);
        break;
      case ClientEvents.GameOver:
        this.gameHub.handleGameOver(connectionId);
        break;
      case ClientEvents.RequestRematch:
        this.gameHub.handleRequestRematch(connectionId);
        break;
      case ClientEvents.LeaveRoom:
        this.gameHub.handleLeaveRoom(connectionId);
        break;
    }
  }

  private sendHandshakeResponse(connectionId: string): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WS_OPEN) return;
    ws.send('{}' + RECORD_SEPARATOR);
  }

  private sendPing(connectionId: string): void {
    const ws = this.connections.get(connectionId);
    if (!ws || ws.readyState !== WS_OPEN) return;
    ws.send(JSON.stringify({ type: 6 }) + RECORD_SEPARATOR);
  }
}
