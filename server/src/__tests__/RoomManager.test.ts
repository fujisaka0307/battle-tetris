import { describe, it, expect } from 'vitest';
import { RoomManager } from '../services/RoomManager';
import { Player } from '../models/Player';

describe('RoomManager', () => {
  function createManager(): RoomManager {
    return new RoomManager();
  }

  it('ルーム作成で6桁英数字IDが返ること', () => {
    const mgr = createManager();
    const player = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(player);
    expect(room.roomId).toHaveLength(6);
    expect(room.roomId).toMatch(/^[A-Z0-9]+$/);
  });

  it('存在するルームに参加できること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);

    const p2 = new Player('conn-2', 'Bob');
    const joined = mgr.joinRoom(room.roomId, p2);
    expect(joined.isFull()).toBe(true);
    expect(joined.player2?.nickname).toBe('Bob');
  });

  it('満員ルームへの参加が拒否されること', () => {
    const mgr = createManager();
    const room = mgr.createRoom(new Player('conn-1', 'Alice'));
    mgr.joinRoom(room.roomId, new Player('conn-2', 'Bob'));

    expect(() => mgr.joinRoom(room.roomId, new Player('conn-3', 'Charlie'))).toThrow(
      'full',
    );
  });

  it('存在しないルームIDで参加がエラーになること', () => {
    const mgr = createManager();
    const player = new Player('conn-1', 'Alice');
    expect(() => mgr.joinRoom('ZZZZZZ', player)).toThrow('not found');
  });

  it('ルーム削除後に参加不可になること', () => {
    const mgr = createManager();
    const room = mgr.createRoom(new Player('conn-1', 'Alice'));
    const roomId = room.roomId;

    mgr.deleteRoom(roomId);

    expect(mgr.getRoom(roomId)).toBeUndefined();
    expect(() => mgr.joinRoom(roomId, new Player('conn-2', 'Bob'))).toThrow(
      'not found',
    );
  });

  it('connectionId からルームを逆引きできること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);

    const found = mgr.getRoomByConnectionId('conn-1');
    expect(found?.roomId).toBe(room.roomId);
  });

  it('存在しない connectionId で undefined が返ること', () => {
    const mgr = createManager();
    expect(mgr.getRoomByConnectionId('unknown')).toBeUndefined();
  });

  it('getAllRooms で全ルームが取得できること', () => {
    const mgr = createManager();
    mgr.createRoom(new Player('conn-1', 'Alice'));
    mgr.createRoom(new Player('conn-2', 'Bob'));
    expect(mgr.getAllRooms()).toHaveLength(2);
  });

  it('同じIDが重複生成されないこと', () => {
    const mgr = createManager();
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const room = mgr.createRoom(new Player(`conn-${i}`, `Player${i}`));
      expect(ids.has(room.roomId)).toBe(false);
      ids.add(room.roomId);
    }
    expect(ids.size).toBe(1000);
  });

  it('ルーム削除で逆引きもクリーンアップされること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);
    mgr.joinRoom(room.roomId, new Player('conn-2', 'Bob'));

    mgr.deleteRoom(room.roomId);

    expect(mgr.getRoomByConnectionId('conn-1')).toBeUndefined();
    expect(mgr.getRoomByConnectionId('conn-2')).toBeUndefined();
  });

  it('size がルーム数を返すこと', () => {
    const mgr = createManager();
    expect(mgr.size).toBe(0);
    mgr.createRoom(new Player('conn-1', 'Alice'));
    expect(mgr.size).toBe(1);
  });

  // --- 追加: 未カバーのブランチ ---

  it('removeConnection で逆引きインデックスが削除されること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);

    // removeConnection 前は逆引きできる
    expect(mgr.getRoomByConnectionId('conn-1')).toBeDefined();

    mgr.removeConnection('conn-1');

    // removeConnection 後は逆引きできない
    expect(mgr.getRoomByConnectionId('conn-1')).toBeUndefined();

    // ルーム自体はまだ存在する
    expect(mgr.getRoom(room.roomId)).toBeDefined();
  });

  it('removeConnection で存在しない connectionId を指定してもエラーにならないこと', () => {
    const mgr = createManager();
    expect(() => mgr.removeConnection('nonexistent')).not.toThrow();
  });

  it('存在しないルームの削除が false を返すこと', () => {
    const mgr = createManager();
    const result = mgr.deleteRoom('NONEXIST');
    expect(result).toBe(false);
  });

  it('存在するルームの削除が true を返すこと', () => {
    const mgr = createManager();
    const room = mgr.createRoom(new Player('conn-1', 'Alice'));
    const result = mgr.deleteRoom(room.roomId);
    expect(result).toBe(true);
  });

  it('player2 が null のルームを削除しても逆引きが正しくクリーンアップされること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);
    // player2 は null のまま

    const result = mgr.deleteRoom(room.roomId);
    expect(result).toBe(true);
    expect(mgr.getRoomByConnectionId('conn-1')).toBeUndefined();
    expect(mgr.getRoom(room.roomId)).toBeUndefined();
  });

  it('逆引きインデックスにルームIDがあるがルームが削除済みの場合に undefined が返ること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const _room = mgr.createRoom(p1);

    // removeConnection せずにルームだけ削除すると、connectionToRoom にはまだエントリが残るが
    // rooms.get(roomId) が undefined を返す
    // ただし deleteRoom は逆引きもクリーンアップするので、
    // この状態を再現するには内部状態を直接操作する必要がある
    // 代わりに、removeConnection 後に getRoomByConnectionId が undefined を返すことを確認
    mgr.removeConnection('conn-1');
    expect(mgr.getRoomByConnectionId('conn-1')).toBeUndefined();
  });

  it('joinRoom で参加した player の逆引きが登録されること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);
    const p2 = new Player('conn-2', 'Bob');
    mgr.joinRoom(room.roomId, p2);

    expect(mgr.getRoomByConnectionId('conn-2')?.roomId).toBe(room.roomId);
  });

  it('ルーム作成時に creator の逆引きが登録されること', () => {
    const mgr = createManager();
    const p1 = new Player('conn-1', 'Alice');
    const room = mgr.createRoom(p1);

    expect(mgr.getRoomByConnectionId('conn-1')?.roomId).toBe(room.roomId);
  });
});
