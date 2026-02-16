import { describe, it, expect } from 'vitest';
import { ClientEvents, ServerEvents, ErrorCodes } from '../messages';

describe('ClientEvents', () => {
  it('defines all client-to-server event names', () => {
    expect(ClientEvents.CreateRoom).toBe('CreateRoom');
    expect(ClientEvents.JoinRoom).toBe('JoinRoom');
    expect(ClientEvents.PlayerReady).toBe('PlayerReady');
    expect(ClientEvents.FieldUpdate).toBe('FieldUpdate');
    expect(ClientEvents.LinesCleared).toBe('LinesCleared');
    expect(ClientEvents.GameOver).toBe('GameOver');
    expect(ClientEvents.RequestRematch).toBe('RequestRematch');
    expect(ClientEvents.LeaveRoom).toBe('LeaveRoom');
    expect(ClientEvents.SubscribeRoomList).toBe('SubscribeRoomList');
    expect(ClientEvents.UnsubscribeRoomList).toBe('UnsubscribeRoomList');
    expect(ClientEvents.SubscribeLeaderboard).toBe('SubscribeLeaderboard');
    expect(ClientEvents.UnsubscribeLeaderboard).toBe('UnsubscribeLeaderboard');
  });

  it('has exactly 13 events', () => {
    expect(Object.keys(ClientEvents)).toHaveLength(13);
  });
});

describe('ServerEvents', () => {
  it('defines all server-to-client event names', () => {
    expect(ServerEvents.RoomCreated).toBe('RoomCreated');
    expect(ServerEvents.OpponentJoined).toBe('OpponentJoined');
    expect(ServerEvents.BothReady).toBe('BothReady');
    expect(ServerEvents.GameStart).toBe('GameStart');
    expect(ServerEvents.OpponentFieldUpdate).toBe('OpponentFieldUpdate');
    expect(ServerEvents.ReceiveGarbage).toBe('ReceiveGarbage');
    expect(ServerEvents.GameResult).toBe('GameResult');
    expect(ServerEvents.OpponentRematch).toBe('OpponentRematch');
    expect(ServerEvents.RematchAccepted).toBe('RematchAccepted');
    expect(ServerEvents.OpponentDisconnected).toBe('OpponentDisconnected');
    expect(ServerEvents.OpponentReconnected).toBe('OpponentReconnected');
    expect(ServerEvents.WaitingRoomListUpdated).toBe('WaitingRoomListUpdated');
    expect(ServerEvents.AiThinking).toBe('AiThinking');
    expect(ServerEvents.LeaderboardUpdated).toBe('LeaderboardUpdated');
    expect(ServerEvents.MatchHistoryUpdated).toBe('MatchHistoryUpdated');
    expect(ServerEvents.Error).toBe('Error');
  });

  it('has exactly 16 events', () => {
    expect(Object.keys(ServerEvents)).toHaveLength(16);
  });
});

describe('ErrorCodes', () => {
  it('defines unique numeric error codes', () => {
    const values = Object.values(ErrorCodes);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all codes are numbers', () => {
    for (const code of Object.values(ErrorCodes)) {
      expect(typeof code).toBe('number');
    }
  });
});
