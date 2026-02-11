import { ROOM_ID_LENGTH } from '@battle-tetris/shared';
import { Room } from '../models/Room.js';
import { Player } from '../models/Player.js';

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 曖昧な文字を除外

/**
 * ルーム管理サービス。
 * ルームの作成・参加・検索・削除を担当する。
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  /** connectionId → roomId の逆引きインデックス */
  private connectionToRoom = new Map<string, string>();

  /**
   * 新しいルームを作成する。
   */
  createRoom(creator: Player): Room {
    const roomId = this.generateUniqueId();
    const room = new Room(roomId, creator);
    this.rooms.set(roomId, room);
    this.connectionToRoom.set(creator.connectionId, roomId);
    return room;
  }

  /**
   * 既存ルームにプレイヤーを参加させる。
   * @throws ルームが存在しない / 満員の場合
   */
  joinRoom(roomId: string, player: Player): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }
    room.join(player);
    this.connectionToRoom.set(player.connectionId, roomId);
    return room;
  }

  /**
   * ルームID でルームを取得する。
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * connectionId からルームを逆引きする。
   */
  getRoomByConnectionId(connectionId: string): Room | undefined {
    const roomId = this.connectionToRoom.get(connectionId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  /**
   * ルームを削除する。
   */
  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // 逆引きインデックスもクリーンアップ
    if (room.player1) {
      this.connectionToRoom.delete(room.player1.connectionId);
    }
    if (room.player2) {
      this.connectionToRoom.delete(room.player2.connectionId);
    }

    this.rooms.delete(roomId);
    return true;
  }

  /**
   * connectionId の逆引きを削除する（プレイヤー退出時）。
   */
  removeConnection(connectionId: string): void {
    this.connectionToRoom.delete(connectionId);
  }

  /**
   * 全ルーム一覧を返す（デバッグ用）。
   */
  getAllRooms(): Room[] {
    return [...this.rooms.values()];
  }

  /**
   * ルーム数を返す。
   */
  get size(): number {
    return this.rooms.size;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * 衝突しないユニークなルームIDを生成する。
   */
  private generateUniqueId(): string {
    let id: string;
    let attempts = 0;
    do {
      id = this.generateRandomId();
      attempts++;
      if (attempts > 1000) {
        throw new Error('Failed to generate unique room ID');
      }
    } while (this.rooms.has(id));
    return id;
  }

  private generateRandomId(): string {
    let id = '';
    for (let i = 0; i < ROOM_ID_LENGTH; i++) {
      id += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
    }
    return id;
  }
}
