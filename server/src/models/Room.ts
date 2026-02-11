import { RoomStatus } from '@battle-tetris/shared';
import { Player } from './Player.js';

/**
 * 対戦ルーム。
 * 最大2名のプレイヤーを収容し、状態遷移を管理する。
 */
export class Room {
  readonly roomId: string;
  readonly createdAt: Date;
  player1: Player | null;
  player2: Player | null;
  status: RoomStatus;
  seed: number | null;

  constructor(roomId: string, creator: Player) {
    this.roomId = roomId;
    this.createdAt = new Date();
    this.player1 = creator;
    this.player2 = null;
    this.status = RoomStatus.Waiting;
    this.seed = null;
  }

  /**
   * ルームが満員かどうか。
   */
  isFull(): boolean {
    return this.player1 !== null && this.player2 !== null;
  }

  /**
   * プレイヤーを参加させる。
   * @throws 満員の場合はエラー
   */
  join(player: Player): void {
    if (this.isFull()) {
      throw new Error('Room is full');
    }
    if (this.player1 === null) {
      this.player1 = player;
    } else {
      this.player2 = player;
    }
  }

  /**
   * 指定 connectionId のプレイヤーを取得する。
   */
  getPlayer(connectionId: string): Player | null {
    if (this.player1?.connectionId === connectionId) return this.player1;
    if (this.player2?.connectionId === connectionId) return this.player2;
    return null;
  }

  /**
   * 指定 connectionId の対戦相手を取得する。
   */
  getOpponent(connectionId: string): Player | null {
    if (this.player1?.connectionId === connectionId) return this.player2;
    if (this.player2?.connectionId === connectionId) return this.player1;
    return null;
  }

  /**
   * 両プレイヤーが Ready かどうか。
   */
  areBothReady(): boolean {
    return (this.player1?.isReady ?? false) && (this.player2?.isReady ?? false);
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  /**
   * 状態を Ready に遷移する。
   * @throws Waiting 状態でない場合はエラー
   */
  transitionToReady(): void {
    if (this.status !== RoomStatus.Waiting) {
      throw new Error(`Cannot transition to Ready from ${this.status}`);
    }
    this.status = RoomStatus.Ready;
  }

  /**
   * 状態を Playing に遷移する。
   * @throws Ready 状態でない場合はエラー
   */
  transitionToPlaying(seed: number): void {
    if (this.status !== RoomStatus.Ready) {
      throw new Error(`Cannot transition to Playing from ${this.status}`);
    }
    this.status = RoomStatus.Playing;
    this.seed = seed;
  }

  /**
   * 状態を Finished に遷移する。
   * @throws Playing 状態でない場合はエラー
   */
  transitionToFinished(): void {
    if (this.status !== RoomStatus.Playing) {
      throw new Error(`Cannot transition to Finished from ${this.status}`);
    }
    this.status = RoomStatus.Finished;
  }
}
