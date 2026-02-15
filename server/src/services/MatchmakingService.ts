import { Player } from '../models/Player.js';
import { Room } from '../models/Room.js';
import { RoomManager } from './RoomManager.js';

export interface MatchResult {
  room: Room;
  player1: Player;
  player2: Player;
}

/**
 * マッチメイキングサービス。
 * 待機キュー（FIFO）で2人揃ったら自動マッチ → ルーム作成。
 */
export class MatchmakingService {
  private queue: Player[] = [];
  private readonly roomManager: RoomManager;

  constructor(roomManager: RoomManager) {
    this.roomManager = roomManager;
  }

  /**
   * 待機キューにプレイヤーを追加する。
   * 2人揃ったらマッチ成立し、ルームを自動作成して返す。
   * まだマッチしない場合は null を返す。
   */
  enqueue(player: Player): MatchResult | null {
    this.queue.push(player);

    if (this.queue.length >= 2) {
      const p1 = this.queue.shift()!;
      const p2 = this.queue.shift()!;

      const room = this.roomManager.createRoom(p1);
      this.roomManager.joinRoom(room.roomId, p2);

      return { room, player1: p1, player2: p2 };
    }

    return null;
  }

  /**
   * 待機キューからプレイヤーを削除する（切断・キャンセル時）。
   */
  dequeue(connectionId: string): boolean {
    const index = this.queue.findIndex((p) => p.connectionId === connectionId);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /**
   * 待機人数を返す。
   */
  get waitingCount(): number {
    return this.queue.length;
  }
}
