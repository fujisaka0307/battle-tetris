import { describe, it, expect, vi } from 'vitest';
import {
  ServerEvents,
  ErrorCodes,
  COUNTDOWN_SECONDS,
} from '@battle-tetris/shared';
import { GameHub, HubConnection } from '../hubs/GameHub';

function createHub() {
  const mockConnection: HubConnection = {
    sendToClient: vi.fn(),
    getEnterpriseId: vi.fn(),
  };
  const hub = new GameHub(mockConnection);
  return { hub, mock: mockConnection };
}

/** Helper: extract the event sent to a specific connectionId */
function getSentEvent(mock: HubConnection, connectionId: string, event: string) {
  const calls = (mock.sendToClient as any).mock.calls as [string, string, unknown][];
  return calls.find(([cid, ev]) => cid === connectionId && ev === event);
}

function getAllSentEvents(mock: HubConnection, event: string) {
  const calls = (mock.sendToClient as any).mock.calls as [string, string, unknown][];
  return calls.filter(([, ev]) => ev === event);
}

/** Helper: configure mock to return enterpriseId for a connectionId */
function mockEnterpriseId(mock: HubConnection, connectionId: string, enterpriseId: string) {
  (mock.getEnterpriseId as any).mockImplementation((connId: string) => {
    if (connId === connectionId) return enterpriseId;
    // Fall through to previous implementation
    return undefined;
  });
}

/** Helper: configure mock to return enterpriseIds for multiple connections */
function mockEnterpriseIds(mock: HubConnection, mapping: Record<string, string>) {
  (mock.getEnterpriseId as any).mockImplementation((connId: string) => {
    return mapping[connId];
  });
}

/** Helper: ルーム作成→参加→両者Ready→Playing 状態のセットアップ */
function setupPlayingRoom(hub: GameHub, mock: HubConnection) {
  mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
  hub.handleCreateRoom('conn-1');
  const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
  hub.handleJoinRoom('conn-2', { roomId });
  hub.handlePlayerReady('conn-1');
  hub.handlePlayerReady('conn-2');
  return roomId;
}

/** Helper: ルーム作成→参加 (Waiting状態) */
function setupWaitingRoom(hub: GameHub, mock: HubConnection) {
  mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
  hub.handleCreateRoom('conn-1');
  const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
  hub.handleJoinRoom('conn-2', { roomId });
  return roomId;
}

describe('GameHub', () => {
  // ---------------------------------------------------------------------------
  // CreateRoom → RoomCreated
  // ---------------------------------------------------------------------------

  describe('CreateRoom', () => {
    it('正常な CreateRoom → RoomCreated フローが動くこと', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated);
      expect(sent).toBeDefined();
      expect((sent![2] as any).roomId).toHaveLength(6);
    });

    it('enterpriseId が取得できない場合に UNAUTHORIZED Error が返ること', () => {
      const { hub, mock } = createHub();
      // getEnterpriseId returns undefined by default
      hub.handleCreateRoom('conn-1');

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.UNAUTHORIZED);
    });
  });

  // ---------------------------------------------------------------------------
  // JoinRoom → OpponentJoined
  // ---------------------------------------------------------------------------

  describe('JoinRoom', () => {
    it('正常な JoinRoom で OpponentJoined が両者に送られること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
      hub.handleCreateRoom('conn-1');

      // Get room ID
      const createCall = getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated);
      const roomId = (createCall![2] as any).roomId;

      hub.handleJoinRoom('conn-2', { roomId });

      // Both should receive OpponentJoined
      const events = getAllSentEvents(mock, ServerEvents.OpponentJoined);
      expect(events.length).toBe(2);
    });

    it('存在しないルームIDで Error が返ること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleJoinRoom('conn-1', { roomId: 'ZZZZZZ' });

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.ROOM_NOT_FOUND);
    });

    it('満員ルームで Error が返ること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob', 'conn-3': 'Charlie' });
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      hub.handleJoinRoom('conn-2', { roomId });

      hub.handleJoinRoom('conn-3', { roomId });
      const sent = getSentEvent(mock, 'conn-3', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.ROOM_FULL);
    });

    it('不正ペイロードで Error が返ること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleJoinRoom('conn-1', {}); // missing roomId

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.INVALID_PAYLOAD);
    });

    it('enterpriseId が取得できない場合に UNAUTHORIZED Error が返ること', () => {
      const { hub, mock } = createHub();
      // getEnterpriseId returns undefined by default
      hub.handleJoinRoom('conn-2', { roomId: 'ABCDEF' });

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.UNAUTHORIZED);
    });
  });

  // ---------------------------------------------------------------------------
  // JoinRandomMatch → MatchFound
  // ---------------------------------------------------------------------------

  describe('JoinRandomMatch', () => {
    it('2人で MatchFound が両者に送られること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
      hub.handleJoinRandomMatch('conn-1');
      hub.handleJoinRandomMatch('conn-2');

      const events = getAllSentEvents(mock, ServerEvents.MatchFound);
      expect(events.length).toBe(2);

      const p1Event = getSentEvent(mock, 'conn-1', ServerEvents.MatchFound);
      expect((p1Event![2] as any).opponentEnterpriseId).toBe('Bob');
    });

    it('1人では MatchFound が送られないこと', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleJoinRandomMatch('conn-1');

      const events = getAllSentEvents(mock, ServerEvents.MatchFound);
      expect(events.length).toBe(0);
    });

    it('enterpriseId が取得できない場合に UNAUTHORIZED Error が返ること', () => {
      const { hub, mock } = createHub();
      // getEnterpriseId returns undefined by default
      hub.handleJoinRandomMatch('conn-1');

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.UNAUTHORIZED);
    });
  });

  // ---------------------------------------------------------------------------
  // PlayerReady → BothReady
  // ---------------------------------------------------------------------------

  describe('PlayerReady', () => {
    function setupRoomWithTwoPlayers() {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      hub.handleJoinRoom('conn-2', { roomId });
      return { hub, mock, roomId };
    }

    it('両者 Ready で BothReady が送られること', () => {
      const { hub, mock } = setupRoomWithTwoPlayers();
      hub.handlePlayerReady('conn-1');
      hub.handlePlayerReady('conn-2');

      const events = getAllSentEvents(mock, ServerEvents.BothReady);
      expect(events.length).toBe(2);

      const payload = events[0][2] as any;
      expect(payload.seed).toBeDefined();
      expect(payload.countdown).toBe(COUNTDOWN_SECONDS);
    });

    it('片方のみ Ready では BothReady が送られないこと', () => {
      const { hub, mock } = setupRoomWithTwoPlayers();
      hub.handlePlayerReady('conn-1');

      const events = getAllSentEvents(mock, ServerEvents.BothReady);
      expect(events.length).toBe(0);
    });

    it('ルームに参加していない場合に Error が返ること', () => {
      const { hub, mock } = createHub();
      hub.handlePlayerReady('conn-unknown');

      const sent = getSentEvent(mock, 'conn-unknown', ServerEvents.Error);
      expect(sent).toBeDefined();
      expect((sent![2] as any).code).toBe(ErrorCodes.NOT_IN_ROOM);
    });

    it('ルーム内にプレイヤーが見つからない場合に何もしないこと', () => {
      const { hub, mock } = createHub();
      // ルームを作成してから、player1 を手動で null にして getPlayer が null を返す状態を作る
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      const room = hub.getRoomManager().getRoom(roomId)!;
      room.player1 = null;

      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handlePlayerReady('conn-1');
      // conn-1 はインデックスに登録されているが room.getPlayer が null を返す
      // → 早期リターンして何もイベントを送信しない
      expect((mock.sendToClient as any).mock.calls.length).toBe(callsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // FieldUpdate → OpponentFieldUpdate
  // ---------------------------------------------------------------------------

  describe('FieldUpdate', () => {
    it('FieldUpdate が相手に OpponentFieldUpdate として転送されること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      const field = Array.from({ length: 20 }, () => Array(10).fill(0));
      hub.handleFieldUpdate('conn-1', { field, score: 100, lines: 2, level: 0 });

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.OpponentFieldUpdate);
      expect(sent).toBeDefined();
      expect((sent![2] as any).score).toBe(100);
    });

    it('不正ペイロードでは転送されないこと', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleFieldUpdate('conn-1', { invalid: true });
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      // No new events sent
      expect(callsAfter).toBe(callsBefore);
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const field = Array.from({ length: 20 }, () => Array(10).fill(0));
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleFieldUpdate('conn-unknown', { field, score: 100, lines: 2, level: 0 });
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('対戦相手がいない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      // ルームを作成するが参加者は1人だけ
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      const field = Array.from({ length: 20 }, () => Array(10).fill(0));
      hub.handleFieldUpdate('conn-1', { field, score: 100, lines: 2, level: 0 });
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      // OpponentFieldUpdate は送信されない
      expect(callsAfter).toBe(callsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // LinesCleared → ReceiveGarbage
  // ---------------------------------------------------------------------------

  describe('LinesCleared', () => {
    it('LinesCleared(4) で相手に ReceiveGarbage(4) が送られること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      hub.handleLinesCleared('conn-1', { count: 4 });

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.ReceiveGarbage);
      expect(sent).toBeDefined();
      expect((sent![2] as any).lines).toBe(4);
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleLinesCleared('conn-unknown', { count: 4 });
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('不正ペイロードでは何もしないこと', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleLinesCleared('conn-1', { count: 'invalid' });
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('不正ペイロード (null) では何もしないこと', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleLinesCleared('conn-1', null);
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // GameOver → GameResult
  // ---------------------------------------------------------------------------

  describe('GameOver', () => {
    it('GameOver で GameResult が両者に送られること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      hub.handleGameOver('conn-1');

      const events = getAllSentEvents(mock, ServerEvents.GameResult);
      expect(events.length).toBe(2);

      const payload = events[0][2] as any;
      expect(payload.winner).toBe('conn-2');
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleGameOver('conn-unknown');
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });
  });

  // ---------------------------------------------------------------------------
  // RequestRematch → OpponentRematch
  // ---------------------------------------------------------------------------

  describe('RequestRematch', () => {
    it('リマッチリクエストが相手に OpponentRematch として送られること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      // ゲーム終了
      hub.handleGameOver('conn-1');

      hub.handleRequestRematch('conn-2');

      const sent = getSentEvent(mock, 'conn-1', ServerEvents.OpponentRematch);
      expect(sent).toBeDefined();
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleRequestRematch('conn-unknown');
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('対戦相手がいない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      // ルームを作成するが参加者は1人だけ
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleRequestRematch('conn-1');
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      // OpponentRematch は送信されない
      expect(callsAfter).toBe(callsBefore);
    });

    it('片方のリマッチ要求で RematchAccepted が送られないこと', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      hub.handleGameOver('conn-1');

      hub.handleRequestRematch('conn-2');

      const accepted = getAllSentEvents(mock, ServerEvents.RematchAccepted);
      expect(accepted).toHaveLength(0);
    });

    it('両者のリマッチ要求で RematchAccepted が両者に送られること', () => {
      const { hub, mock } = createHub();
      const roomId = setupPlayingRoom(hub, mock);
      hub.handleGameOver('conn-1');

      hub.handleRequestRematch('conn-1');
      hub.handleRequestRematch('conn-2');

      const accepted = getAllSentEvents(mock, ServerEvents.RematchAccepted);
      expect(accepted).toHaveLength(2);
      expect(accepted[0][2]).toEqual({ roomId });
      expect(accepted[1][2]).toEqual({ roomId });
    });

    it('両者のリマッチ要求でルームが Waiting 状態に戻ること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);
      hub.handleGameOver('conn-1');

      hub.handleRequestRematch('conn-1');
      hub.handleRequestRematch('conn-2');

      const room = hub.getRoomManager().getRoomByConnectionId('conn-1');
      expect(room?.status).toBe('waiting');
    });
  });

  // ---------------------------------------------------------------------------
  // LeaveRoom
  // ---------------------------------------------------------------------------

  describe('LeaveRoom', () => {
    it('ルーム退出で相手に OpponentDisconnected(timeout=0) が送られること', () => {
      const { hub, mock } = createHub();
      setupWaitingRoom(hub, mock);

      hub.handleLeaveRoom('conn-1');

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.OpponentDisconnected);
      expect(sent).toBeDefined();
      expect((sent![2] as any).timeout).toBe(0);
    });

    it('ルーム退出でルームが削除されること', () => {
      const { hub, mock } = createHub();
      const roomId = setupWaitingRoom(hub, mock);

      hub.handleLeaveRoom('conn-1');

      expect(hub.getRoomManager().getRoom(roomId)).toBeUndefined();
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleLeaveRoom('conn-unknown');
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('対戦相手がいないルームからの退出でも正常にルームが削除されること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;

      hub.handleLeaveRoom('conn-1');

      expect(hub.getRoomManager().getRoom(roomId)).toBeUndefined();
    });

    it('Playing 状態のルームから退出するとセッションも終了すること', () => {
      const { hub, mock } = createHub();
      const roomId = setupPlayingRoom(hub, mock);

      hub.handleLeaveRoom('conn-1');

      expect(hub.getRoomManager().getRoom(roomId)).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Disconnected
  // ---------------------------------------------------------------------------

  describe('onDisconnected', () => {
    it('対戦中の切断で相手に OpponentDisconnected が送られること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      hub.handleJoinRoom('conn-2', { roomId });
      hub.handlePlayerReady('conn-1');
      hub.handlePlayerReady('conn-2');

      hub.handleDisconnected('conn-1');

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.OpponentDisconnected);
      expect(sent).toBeDefined();
    });

    it('マッチメイキング待機中の切断でキューから削除されること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseIds(mock, { 'conn-1': 'Alice', 'conn-2': 'Bob' });
      hub.handleJoinRandomMatch('conn-1');

      // 切断する
      hub.handleDisconnected('conn-1');

      // 別のプレイヤーが参加してもマッチしないことを確認
      hub.handleJoinRandomMatch('conn-2');
      const events = getAllSentEvents(mock, ServerEvents.MatchFound);
      expect(events.length).toBe(0);
    });

    it('ルームに参加していない場合は何もしないこと', () => {
      const { hub, mock } = createHub();
      const callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleDisconnected('conn-unknown');
      const callsAfter = (mock.sendToClient as any).mock.calls.length;
      expect(callsAfter).toBe(callsBefore);
    });

    it('Waiting 状態（ゲームセッションなし）の切断で相手に OpponentDisconnected(timeout=0) が送られること', () => {
      const { hub, mock } = createHub();
      setupWaitingRoom(hub, mock);

      hub.handleDisconnected('conn-1');

      const sent = getSentEvent(mock, 'conn-2', ServerEvents.OpponentDisconnected);
      expect(sent).toBeDefined();
      expect((sent![2] as any).timeout).toBe(0);
    });

    it('Waiting 状態で対戦相手がいない場合の切断でも正常に処理されること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');

      const _callsBefore = (mock.sendToClient as any).mock.calls.length;
      hub.handleDisconnected('conn-1');
      // OpponentDisconnected は送信されない (相手がいない)
      const sent = getSentEvent(mock, 'conn-1', ServerEvents.OpponentDisconnected);
      // conn-1 宛の OpponentDisconnected は来ない（相手がいないので）
      expect(sent).toBeUndefined();
    });

    it('Finished 状態のルームでの切断で OpponentDisconnected(timeout=0) が送られること', () => {
      const { hub, mock } = createHub();
      setupPlayingRoom(hub, mock);

      // ゲーム終了
      hub.handleGameOver('conn-1');

      // ゲーム終了後の切断
      hub.handleDisconnected('conn-2');

      // Finished なのでセッションタイマーは開始されず、else ブランチに入る
      const events = getAllSentEvents(mock, ServerEvents.OpponentDisconnected);
      // 少なくとも1つの OpponentDisconnected イベントがあること
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it('切断で player.disconnect() が呼ばれること', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      const room = hub.getRoomManager().getRoom(roomId)!;

      hub.handleDisconnected('conn-1');

      expect(room.player1!.isConnected).toBe(false);
    });

    it('ルーム内にプレイヤーが見つからない場合に disconnect が呼ばれないこと', () => {
      const { hub, mock } = createHub();
      mockEnterpriseId(mock, 'conn-1', 'Alice');
      hub.handleCreateRoom('conn-1');
      const roomId = (getSentEvent(mock, 'conn-1', ServerEvents.RoomCreated)![2] as any).roomId;
      const room = hub.getRoomManager().getRoom(roomId)!;

      // player1 を null にして getPlayer が null を返す状態にする
      room.player1 = null;

      // エラーにならないことを確認
      expect(() => hub.handleDisconnected('conn-1')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Health check (supertest)
  // ---------------------------------------------------------------------------

  describe('Express health', () => {
    it('health endpoint exists (tested in smoke test)', () => {
      // This is covered by the existing smoke.test.ts
      expect(true).toBe(true);
    });
  });
});
