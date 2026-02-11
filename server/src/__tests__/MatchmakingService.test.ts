import { describe, it, expect } from 'vitest';
import { MatchmakingService } from '../services/MatchmakingService';
import { RoomManager } from '../services/RoomManager';
import { Player } from '../models/Player';

describe('MatchmakingService', () => {
  function createService(): MatchmakingService {
    const roomManager = new RoomManager();
    return new MatchmakingService(roomManager);
  }

  it('1人追加しただけではマッチしないこと', () => {
    const svc = createService();
    const result = svc.enqueue(new Player('conn-1', 'Alice'));
    expect(result).toBeNull();
    expect(svc.waitingCount).toBe(1);
  });

  it('2人追加でマッチが成立し、ルームが作成されること', () => {
    const svc = createService();
    svc.enqueue(new Player('conn-1', 'Alice'));
    const result = svc.enqueue(new Player('conn-2', 'Bob'));

    expect(result).not.toBeNull();
    expect(result!.player1.nickname).toBe('Alice');
    expect(result!.player2.nickname).toBe('Bob');
    expect(result!.room.isFull()).toBe(true);
  });

  it('マッチ成立後にキューが空になること', () => {
    const svc = createService();
    svc.enqueue(new Player('conn-1', 'Alice'));
    svc.enqueue(new Player('conn-2', 'Bob'));
    expect(svc.waitingCount).toBe(0);
  });

  it('キュー削除後にマッチに含まれないこと', () => {
    const svc = createService();
    svc.enqueue(new Player('conn-1', 'Alice'));
    svc.dequeue('conn-1');
    expect(svc.waitingCount).toBe(0);

    // Add two new players — they should match, not Alice
    svc.enqueue(new Player('conn-2', 'Bob'));
    const result = svc.enqueue(new Player('conn-3', 'Charlie'));
    expect(result).not.toBeNull();
    expect(result!.player1.nickname).toBe('Bob');
    expect(result!.player2.nickname).toBe('Charlie');
  });

  it('3人追加で1マッチ成立 + 1人待機であること', () => {
    const svc = createService();
    svc.enqueue(new Player('conn-1', 'Alice'));
    const match = svc.enqueue(new Player('conn-2', 'Bob'));
    expect(match).not.toBeNull();

    const noMatch = svc.enqueue(new Player('conn-3', 'Charlie'));
    expect(noMatch).toBeNull();
    expect(svc.waitingCount).toBe(1);
  });

  it('存在しない connectionId の dequeue は false を返すこと', () => {
    const svc = createService();
    expect(svc.dequeue('unknown')).toBe(false);
  });
});
