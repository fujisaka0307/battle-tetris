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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wsModule = require('ws') as any;
const WS_OPEN: number = wsModule.OPEN;

type WebSocket = WS;
import type { Express, Request, Response } from 'express';
import { GameHub, type HubConnection } from './GameHub.js';
import { ClientEvents, RoomStatus } from '@battle-tetris/shared';
import { verifyToken, extractToken } from '../middleware/jwtAuth.js';
import { logger, createLogger } from '../lib/logger.js';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  activeConnectionsGauge,
  wsMessagesReceived,
  wsMessagesSent,
} from '../lib/metrics.js';
import { setHealthStateProvider } from '../lib/healthState.js';

// SignalR レコードセパレータ
const RECORD_SEPARATOR = String.fromCharCode(0x1e);

// WebSocket ハートビート間隔。
// SignalR クライアントの keepAliveIntervalInMilliseconds（デフォルト15秒）
// より長く設定し、生存中の接続が必ず1回以上メッセージを送るようにする。
// WebSocket レベルの ping/pong ではなくアプリケーションレベル（SignalR type-6）
// の ping を使用する。WebSocket ping は Vite 開発プロキシまでしか届かず、
// プロキシが常に pong を返すため、切断済み接続を検出できないため。
const HEARTBEAT_INTERVAL_MS = 20_000;

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
  private readonly connections = new Map<string, WebSocket>();
  private readonly alive = new Map<string, boolean>();
  private readonly connectionUsers = new Map<string, string>();
  private gameHub: GameHub;
  private nextConnectionId = 1;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.gameHub = new GameHub(this);
  }

  // ---------------------------------------------------------------------------
  // HubConnection 実装
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
    wsMessagesSent.add(1, { 'ws.message.type': event });
  }

  getEnterpriseId(connectionId: string): string | undefined {
    return this.connectionUsers.get(connectionId);
  }

  // ---------------------------------------------------------------------------
  // セットアップ
  // ---------------------------------------------------------------------------

  /**
   * Express にネゴシエーションエンドポイントを登録し、
   * HTTP サーバーに WebSocket サーバーをアタッチする。
   */
  setup(app: Express, server: HttpServer): void {
    // SignalR ネゴシエーションエンドポイント
    app.post('/hub/negotiate', async (req: Request, res: Response) => {
      if (process.env.SKIP_AUTH === 'true') {
        // SKIP_AUTH mode: assign test enterprise ID for E2E testing
        const connectionId = `conn-${this.nextConnectionId++}`;
        this.connectionUsers.set(connectionId, `test-player-${connectionId}@dxc.com`);
        logger.info({ connectionId }, 'Negotiate: SKIP_AUTH mode');
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
        return;
      }

      const token = extractToken(req.headers.authorization);
      if (token) {
        const result = await verifyToken(token);
        if (!result) {
          logger.warn('Negotiate: JWT verification failed');
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const connectionId = `conn-${this.nextConnectionId++}`;
        this.connectionUsers.set(connectionId, result.enterpriseId);
        logger.info({ connectionId, enterpriseId: result.enterpriseId }, 'Negotiate: authenticated');
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
      } else {
        // No token — allow for dev/test but mark as unauthenticated
        const connectionId = `conn-${this.nextConnectionId++}`;
        logger.info({ connectionId }, 'Negotiate: unauthenticated (dev mode)');
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
      }
    });

    // WebSocket サーバー
    this.wss = new wsModule.Server({ server, path: '/hub' });

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      // クエリパラメータから connectionId を取得
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const connectionId = url.searchParams.get('id') || `conn-${this.nextConnectionId++}`;

      // JWT auth via access_token query param (if not already authenticated at negotiate)
      if (!this.connectionUsers.has(connectionId)) {
        if (process.env.SKIP_AUTH === 'true') {
          this.connectionUsers.set(connectionId, `test-player-${connectionId}@dxc.com`);
        } else {
          const queryToken = url.searchParams.get('access_token');
          if (queryToken) {
            const result = await verifyToken(queryToken);
            if (result) {
              this.connectionUsers.set(connectionId, result.enterpriseId);
            }
          }
        }
      }

      this.connections.set(connectionId, ws);
      this.alive.set(connectionId, true);

      const connLog = createLogger({ connectionId });
      connLog.info('WebSocket connected');

      ws.on('message', (data: WS.RawData) => {
        this.alive.set(connectionId, true);
        this.handleMessage(connectionId, data.toString());
      });

      ws.on('close', () => {
        connLog.info('WebSocket disconnected');
        this.alive.delete(connectionId);
        this.connectionUsers.delete(connectionId);
        this.gameHub.handleDisconnected(connectionId);
        this.connections.delete(connectionId);
      });

      ws.on('error', () => {
        connLog.warn('WebSocket error');
        this.alive.delete(connectionId);
        this.connectionUsers.delete(connectionId);
        this.connections.delete(connectionId);
      });
    });

    // ハートビート: アプリケーションレベルの SignalR ping で切断済み接続を検出
    this.heartbeatTimer = setInterval(() => {
      for (const [connectionId, ws] of this.connections) {
        if (!this.alive.get(connectionId)) {
          logger.info({ connectionId }, 'Heartbeat timeout, terminating connection');
          this.alive.delete(connectionId);
          this.connections.delete(connectionId);
          this.connectionUsers.delete(connectionId);
          this.gameHub.handleDisconnected(connectionId);
          ws.terminate();
          continue;
        }
        this.alive.set(connectionId, false);
        // WebSocket ping ではなく SignalR レベルの ping（type 6）を送信。
        // このメッセージは Vite プロキシを通過して実際のブラウザに届き、
        // クライアントの serverTimeout タイマーもリセットする。
        this.sendPing(connectionId);
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.wss.on('close', () => {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    });

    // Register observable gauge callbacks
    activeConnectionsGauge.addCallback((result) => {
      result.observe(this.connections.size);
    });

    // Register health state provider
    setHealthStateProvider(() => {
      const roomManager = this.gameHub.getRoomManager();
      const allRooms = roomManager.getAllRooms();
      const playingSessions = allRooms.filter(
        (r) => r.status === RoomStatus.Playing,
      ).length;
      return {
        connections: this.connections.size,
        rooms: roomManager.size,
        sessions: playingSessions,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // テスト用
  // ---------------------------------------------------------------------------

  getGameHub(): GameHub {
    return this.gameHub;
  }

  // ---------------------------------------------------------------------------
  // プライベート
  // ---------------------------------------------------------------------------

  private handleMessage(connectionId: string, raw: string): void {
    // SignalR はレコードセパレータ区切りでメッセージを送信する
    const parts = raw.split(RECORD_SEPARATOR).filter((p) => p.length > 0);

    for (const part of parts) {
      try {
        const msg: SignalRMessage = JSON.parse(part);
        this.processMessage(connectionId, msg);
      } catch {
        // 不正なメッセージは無視
      }
    }
  }

  private processMessage(connectionId: string, msg: SignalRMessage): void {
    switch (msg.type) {
      case 1: // 呼び出し
        this.handleInvocation(connectionId, msg);
        break;
      case 6: // Ping
        this.sendPing(connectionId);
        break;
      case 7: // クローズ
        // クライアントが切断を要求
        break;
      default:
        // ハンドシェイク応答（type 未定義 or 0）: 接続後にクライアントが {} を送信
        // これがハンドシェイク — 空のハンドシェイク応答を返す
        this.sendHandshakeResponse(connectionId);
        break;
    }
  }

  private handleInvocation(connectionId: string, msg: SignalRMessage): void {
    const target = msg.target;
    const args = msg.arguments || [];

    wsMessagesReceived.add(1, { 'ws.message.type': target ?? 'unknown' });

    const tracer = trace.getTracer('battle-tetris-server');
    tracer.startActiveSpan(`ws.invoke ${target}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'ws.target': target ?? 'unknown',
        'ws.connection_id': connectionId,
      },
    }, (span) => {
      try {
        this.dispatchInvocation(connectionId, target, args);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        span.setAttribute('error.type', error.constructor.name);
        span.setAttribute('error.message', error.message);
        if (error.stack) {
          span.setAttribute('error.stack', error.stack);
        }
      } finally {
        span.end();
      }
    });
  }

  private dispatchInvocation(connectionId: string, target: string | undefined, args: unknown[]): void {
    switch (target) {
      case ClientEvents.CreateRoom:
        this.gameHub.handleCreateRoom(connectionId);
        break;
      case ClientEvents.CreateAiRoom:
        this.gameHub.handleCreateAiRoom(connectionId, args[0]);
        break;
      case ClientEvents.JoinRoom:
        this.gameHub.handleJoinRoom(connectionId, args[0]);
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
      case ClientEvents.SubscribeRoomList:
        this.gameHub.handleSubscribeRoomList(connectionId);
        break;
      case ClientEvents.UnsubscribeRoomList:
        this.gameHub.handleUnsubscribeRoomList(connectionId);
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
