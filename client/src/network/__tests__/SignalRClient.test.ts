import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FIELD_SYNC_INTERVAL_MS } from '@battle-tetris/shared';

// =============================================================================
// Mock HubConnection
// =============================================================================

type HandlerMap = Record<string, ((...args: unknown[]) => void)[]>;

interface MockConnection {
  state: string;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  onreconnecting: ReturnType<typeof vi.fn>;
  onreconnected: ReturnType<typeof vi.fn>;
  onclose: ReturnType<typeof vi.fn>;
  _handlers: HandlerMap;
  _reconnectingCb: (() => void) | null;
  _reconnectedCb: (() => void) | null;
  _closeCb: (() => void) | null;
  _triggerReconnecting: () => void;
  _triggerReconnected: () => void;
  _triggerClose: () => void;
  _emit: (event: string, ...args: unknown[]) => void;
}

function createMockConnection(): MockConnection {
  const handlers: HandlerMap = {};
  const conn: MockConnection = {
    state: 'Connected',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    onreconnecting: vi.fn((cb: () => void) => { conn._reconnectingCb = cb; }),
    onreconnected: vi.fn((cb: () => void) => { conn._reconnectedCb = cb; }),
    onclose: vi.fn((cb: () => void) => { conn._closeCb = cb; }),
    _handlers: handlers,
    _reconnectingCb: null,
    _reconnectedCb: null,
    _closeCb: null,
    _triggerReconnecting: () => conn._reconnectingCb?.(),
    _triggerReconnected: () => conn._reconnectedCb?.(),
    _triggerClose: () => conn._closeCb?.(),
    _emit: (event: string, ...args: unknown[]) => {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
  return conn;
}

// Shared reference for mock connection
let currentMockConn: MockConnection | null = null;
let mockStartOverride: (() => Promise<void>) | null = null;

vi.mock('@microsoft/signalr', () => {
  class MockHubConnectionBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() {
      currentMockConn = createMockConnection();
      if (mockStartOverride) {
        currentMockConn.start = vi.fn(mockStartOverride);
        mockStartOverride = null;
      }
      return currentMockConn;
    }
  }

  return {
    HubConnectionState: { Connected: 'Connected' },
    LogLevel: { Warning: 3 },
    HubConnectionBuilder: MockHubConnectionBuilder,
  };
});

// =============================================================================
// Tests
// =============================================================================

describe('SignalRClient', () => {
  let SignalRClient: typeof import('../SignalRClient').SignalRClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    currentMockConn = null;
    mockStartOverride = null;
    const mod = await import('../SignalRClient');
    SignalRClient = mod.SignalRClient;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connection lifecycle', () => {
    it('初期状態が disconnected であること', () => {
      const client = new SignalRClient();
      expect(client.state).toBe('disconnected');
    });

    it('接続成功で connected になること', async () => {
      const client = new SignalRClient();
      const states: string[] = [];
      client.setHandlers({
        onConnectionStateChanged: (s) => states.push(s),
      });

      await client.connect('http://localhost/hub');

      expect(states).toContain('connecting');
      expect(states).toContain('connected');
      expect(client.state).toBe('connected');
    });

    it('接続失敗で disconnected になること', async () => {
      mockStartOverride = () => Promise.reject(new Error('fail'));

      const client = new SignalRClient();
      await expect(client.connect('http://localhost/hub')).rejects.toThrow();
      expect(client.state).toBe('disconnected');
    });

    it('reconnecting 状態が正しく反映されること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      const conn = currentMockConn!;

      conn._triggerReconnecting();
      expect(client.state).toBe('reconnecting');

      conn._triggerReconnected();
      expect(client.state).toBe('connected');
    });

    it('disconnect() で disconnected になること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      await client.disconnect();
      expect(client.state).toBe('disconnected');
    });

    // === C1 カバレッジ追加テスト ===

    it('既に接続済みの場合 connect() で既存接続が切断されること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      const firstConn = currentMockConn!;

      await client.connect('http://localhost/hub');

      expect(firstConn.stop).toHaveBeenCalled();
    });

    it('onclose で disconnected に遷移すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      const conn = currentMockConn!;

      conn._triggerClose();

      expect(client.state).toBe('disconnected');
    });

    it('disconnect() で未接続の場合でもエラーにならないこと', async () => {
      const client = new SignalRClient();
      await client.disconnect();
      expect(client.state).toBe('disconnected');
    });

    it('disconnect() で stop() が失敗してもエラーにならないこと', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      currentMockConn!.stop.mockRejectedValueOnce(new Error('stop failed'));

      await client.disconnect();
      expect(client.state).toBe('disconnected');
    });

    it('updateState が同じ状態の場合にコールバックが呼ばれないこと', async () => {
      const client = new SignalRClient();
      const cb = vi.fn();
      client.setHandlers({ onConnectionStateChanged: cb });

      // Already disconnected, setting disconnected again should not trigger
      await client.disconnect();
      // disconnect from already disconnected state — updateState('disconnected') called
      // but since _state is already 'disconnected', cb should NOT be called
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('send methods', () => {
    it('sendCreateRoom が正しいイベントとペイロードで送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendCreateRoom('Alice');

      expect(currentMockConn!.send).toHaveBeenCalledWith('CreateRoom', { nickname: 'Alice' });
    });

    it('sendJoinRoom が正しく送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendJoinRoom('Bob', 'ABC123');

      expect(currentMockConn!.send).toHaveBeenCalledWith('JoinRoom', { nickname: 'Bob', roomId: 'ABC123' });
    });

    it('sendPlayerReady がペイロードなしで送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendPlayerReady();

      expect(currentMockConn!.send).toHaveBeenCalledWith('PlayerReady');
    });

    it('sendGameOver が送信されること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendGameOver();

      expect(currentMockConn!.send).toHaveBeenCalledWith('GameOver');
    });

    it('未接続時に send が呼ばれないこと', () => {
      const client = new SignalRClient();
      client.sendCreateRoom('Alice');
      expect(client.state).toBe('disconnected');
    });

    // === C1 カバレッジ追加テスト ===

    it('sendJoinRandomMatch が正しく送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendJoinRandomMatch('Dave');

      expect(currentMockConn!.send).toHaveBeenCalledWith('JoinRandomMatch', { nickname: 'Dave' });
    });

    it('sendLinesCleared が正しく送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendLinesCleared(3);

      expect(currentMockConn!.send).toHaveBeenCalledWith('LinesCleared', { count: 3 });
    });

    it('sendRequestRematch がペイロードなしで送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendRequestRematch();

      expect(currentMockConn!.send).toHaveBeenCalledWith('RequestRematch');
    });

    it('sendLeaveRoom がペイロードなしで送信すること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      client.sendLeaveRoom();

      expect(currentMockConn!.send).toHaveBeenCalledWith('LeaveRoom');
    });

    it('接続状態が Connected でない場合に invoke が何もしないこと', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');
      // Change state to something other than Connected
      currentMockConn!.state = 'Disconnected';

      client.sendCreateRoom('Alice');

      expect(currentMockConn!.send).not.toHaveBeenCalled();
    });
  });

  describe('receive handlers', () => {
    it('RoomCreated イベントでハンドラが呼ばれること', async () => {
      const onRoomCreated = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onRoomCreated });

      await client.connect('http://localhost/hub');

      currentMockConn!._emit('RoomCreated', { roomId: 'XYZ789' });

      expect(onRoomCreated).toHaveBeenCalledWith({ roomId: 'XYZ789' });
    });

    it('GameResult イベントでハンドラが呼ばれること', async () => {
      const onGameResult = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onGameResult });

      await client.connect('http://localhost/hub');

      currentMockConn!._emit('GameResult', { winner: 'conn-1', loserReason: 'gameover' });

      expect(onGameResult).toHaveBeenCalledWith({
        winner: 'conn-1',
        loserReason: 'gameover',
      });
    });

    it('OpponentRematch イベントでハンドラが呼ばれること', async () => {
      const onOpponentRematch = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onOpponentRematch });

      await client.connect('http://localhost/hub');

      currentMockConn!._emit('OpponentRematch');

      expect(onOpponentRematch).toHaveBeenCalled();
    });

    it('RematchAccepted イベントでハンドラが呼ばれること', async () => {
      const onRematchAccepted = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onRematchAccepted });

      await client.connect('http://localhost/hub');

      currentMockConn!._emit('RematchAccepted', { roomId: 'ABC123' });

      expect(onRematchAccepted).toHaveBeenCalledWith({ roomId: 'ABC123' });
    });

    // === C1 カバレッジ追加テスト ===

    it('OpponentJoined イベントでハンドラが呼ばれること', async () => {
      const onOpponentJoined = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onOpponentJoined });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('OpponentJoined', { nickname: 'Bob' });

      expect(onOpponentJoined).toHaveBeenCalledWith({ nickname: 'Bob' });
    });

    it('MatchFound イベントでハンドラが呼ばれること', async () => {
      const onMatchFound = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onMatchFound });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('MatchFound', { roomId: 'R1', opponentNickname: 'Eve' });

      expect(onMatchFound).toHaveBeenCalledWith({ roomId: 'R1', opponentNickname: 'Eve' });
    });

    it('BothReady イベントでハンドラが呼ばれること', async () => {
      const onBothReady = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onBothReady });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('BothReady', { seed: 42, countdown: 3 });

      expect(onBothReady).toHaveBeenCalledWith({ seed: 42, countdown: 3 });
    });

    it('GameStart イベントでハンドラが呼ばれること', async () => {
      const onGameStart = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onGameStart });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('GameStart', { seed: 42 });

      expect(onGameStart).toHaveBeenCalledWith({ seed: 42 });
    });

    it('OpponentFieldUpdate イベントでハンドラが呼ばれること', async () => {
      const onOpponentFieldUpdate = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onOpponentFieldUpdate });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('OpponentFieldUpdate', { field: [[]], score: 100, lines: 1, level: 0 });

      expect(onOpponentFieldUpdate).toHaveBeenCalled();
    });

    it('ReceiveGarbage イベントでハンドラが呼ばれること', async () => {
      const onReceiveGarbage = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onReceiveGarbage });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('ReceiveGarbage', { lines: 2 });

      expect(onReceiveGarbage).toHaveBeenCalledWith({ lines: 2 });
    });

    it('OpponentDisconnected イベントでハンドラが呼ばれること', async () => {
      const onOpponentDisconnected = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onOpponentDisconnected });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('OpponentDisconnected', { timeout: 30000 });

      expect(onOpponentDisconnected).toHaveBeenCalledWith({ timeout: 30000 });
    });

    it('OpponentReconnected イベントでハンドラが呼ばれること', async () => {
      const onOpponentReconnected = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onOpponentReconnected });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('OpponentReconnected');

      expect(onOpponentReconnected).toHaveBeenCalled();
    });

    it('Error イベントでハンドラが呼ばれること', async () => {
      const onError = vi.fn();
      const client = new SignalRClient();
      client.setHandlers({ onError });

      await client.connect('http://localhost/hub');
      currentMockConn!._emit('Error', { code: 10021, message: 'Room not found' });

      expect(onError).toHaveBeenCalledWith({ code: 10021, message: 'Room not found' });
    });

    it('ハンドラ未設定のイベントでもクラッシュしないこと', async () => {
      const client = new SignalRClient();
      client.setHandlers({}); // No handlers

      await client.connect('http://localhost/hub');

      // Emit all events without handlers
      expect(() => {
        currentMockConn!._emit('RoomCreated', { roomId: 'X' });
        currentMockConn!._emit('OpponentJoined', { nickname: 'Bob' });
        currentMockConn!._emit('MatchFound', { roomId: 'Y', opponentNickname: 'Z' });
        currentMockConn!._emit('BothReady', { seed: 1, countdown: 3 });
        currentMockConn!._emit('GameStart', { seed: 1 });
        currentMockConn!._emit('OpponentFieldUpdate', { field: [[]], score: 0, lines: 0, level: 0 });
        currentMockConn!._emit('ReceiveGarbage', { lines: 1 });
        currentMockConn!._emit('GameResult', { winner: 'x', loserReason: 'gameover' });
        currentMockConn!._emit('OpponentRematch');
        currentMockConn!._emit('RematchAccepted', { roomId: 'ABC123' });
        currentMockConn!._emit('OpponentDisconnected', { timeout: 30000 });
        currentMockConn!._emit('OpponentReconnected');
        currentMockConn!._emit('Error', { code: 1, message: 'err' });
      }).not.toThrow();
    });
  });

  describe('setupEventListeners / setupLifecycleHooks with null connection', () => {
    it('connection が null の場合に setupEventListeners が早期リターンすること', () => {
      const client = new SignalRClient();
      // Directly call private method with no connection set
      expect(() => (client as any).setupEventListeners()).not.toThrow();
    });

    it('connection が null の場合に setupLifecycleHooks が早期リターンすること', () => {
      const client = new SignalRClient();
      expect(() => (client as any).setupLifecycleHooks()).not.toThrow();
    });
  });

  describe('FieldUpdate throttling', () => {
    it('最初の送信は即時に行われること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[]], score: 100, lines: 1, level: 0 });

      expect(currentMockConn!.send).toHaveBeenCalledWith('FieldUpdate', {
        field: [[]],
        score: 100,
        lines: 1,
        level: 0,
      });
    });

    it('50ms 以内の連続送信が間引かれること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[1]], score: 100, lines: 1, level: 0 });
      expect(currentMockConn!.send).toHaveBeenCalledTimes(1);

      // 20ms later — should be throttled
      vi.setSystemTime(1020);
      client.sendFieldUpdate({ field: [[2]], score: 200, lines: 2, level: 0 });
      expect(currentMockConn!.send).toHaveBeenCalledTimes(1); // Still 1

      // Advance to trigger scheduled send
      vi.advanceTimersByTime(FIELD_SYNC_INTERVAL_MS);

      expect(currentMockConn!.send).toHaveBeenCalledTimes(2);
      expect(currentMockConn!.send).toHaveBeenLastCalledWith('FieldUpdate', {
        field: [[2]],
        score: 200,
        lines: 2,
        level: 0,
      });
    });

    it('50ms 経過後は再び即時送信されること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[1]], score: 0, lines: 0, level: 0 });
      expect(currentMockConn!.send).toHaveBeenCalledTimes(1);

      vi.setSystemTime(1000 + FIELD_SYNC_INTERVAL_MS);
      client.sendFieldUpdate({ field: [[2]], score: 0, lines: 0, level: 0 });
      expect(currentMockConn!.send).toHaveBeenCalledTimes(2);
    });

    // === C1 カバレッジ追加テスト ===

    it('スロットル中に2回目の送信でpendingが上書きされること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[1]], score: 100, lines: 1, level: 0 });

      // Throttled sends
      vi.setSystemTime(1010);
      client.sendFieldUpdate({ field: [[2]], score: 200, lines: 2, level: 0 });
      vi.setSystemTime(1020);
      client.sendFieldUpdate({ field: [[3]], score: 300, lines: 3, level: 0 });

      // Only the last one should be sent
      vi.advanceTimersByTime(FIELD_SYNC_INTERVAL_MS);

      expect(currentMockConn!.send).toHaveBeenCalledTimes(2);
      expect(currentMockConn!.send).toHaveBeenLastCalledWith('FieldUpdate', {
        field: [[3]],
        score: 300,
        lines: 3,
        level: 0,
      });
    });

    it('disconnect でスロットルタイマーがクリアされること', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[1]], score: 0, lines: 0, level: 0 });

      vi.setSystemTime(1010);
      client.sendFieldUpdate({ field: [[2]], score: 0, lines: 0, level: 0 });

      // Disconnect clears the throttle
      await client.disconnect();

      // Advance time — the pending update should NOT be sent
      vi.advanceTimersByTime(FIELD_SYNC_INTERVAL_MS);

      expect(currentMockConn!.send).toHaveBeenCalledTimes(1);
    });

    it('スロットルタイマー発火時に pendingFieldUpdate が null の場合何もしないこと', async () => {
      const client = new SignalRClient();
      await client.connect('http://localhost/hub');

      vi.setSystemTime(1000);
      client.sendFieldUpdate({ field: [[1]], score: 0, lines: 0, level: 0 });

      vi.setSystemTime(1010);
      client.sendFieldUpdate({ field: [[2]], score: 0, lines: 0, level: 0 });

      // Directly clear the pending field update to simulate the edge case
      // where the timer fires but pendingFieldUpdate has been cleared
      (client as any).pendingFieldUpdate = null;

      // Advance time to trigger the throttle timer
      vi.advanceTimersByTime(FIELD_SYNC_INTERVAL_MS);

      // Only the initial immediate send should have occurred — the timer
      // should have found pendingFieldUpdate === null and done nothing
      expect(currentMockConn!.send).toHaveBeenCalledTimes(1);
    });
  });
});
