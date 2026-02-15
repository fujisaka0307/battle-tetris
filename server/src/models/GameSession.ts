import { LoserReason } from '@battle-tetris/shared';

/**
 * 対戦セッション。
 * ルームに紐づき、対戦中のスコアや勝敗を管理する。
 */
export class GameSession {
  readonly roomId: string;
  readonly startedAt: Date;
  winner: string | null;
  loserReason: LoserReason | null;

  /** connectionId → score */
  private readonly scores: Map<string, number>;

  /** connectionId → linesCleared */
  private readonly linesCleared: Map<string, number>;

  constructor(roomId: string, player1Id: string, player2Id: string) {
    this.roomId = roomId;
    this.startedAt = new Date();
    this.winner = null;
    this.loserReason = null;
    this.scores = new Map([
      [player1Id, 0],
      [player2Id, 0],
    ]);
    this.linesCleared = new Map([
      [player1Id, 0],
      [player2Id, 0],
    ]);
  }

  /**
   * スコアを更新する。
   */
  updateScore(connectionId: string, score: number): void {
    this.scores.set(connectionId, score);
  }

  /**
   * 消去ライン数を加算する。
   */
  addLinesCleared(connectionId: string, count: number): void {
    const current = this.linesCleared.get(connectionId) ?? 0;
    this.linesCleared.set(connectionId, current + count);
  }

  /**
   * スコアを取得する。
   */
  getScore(connectionId: string): number {
    return this.scores.get(connectionId) ?? 0;
  }

  /**
   * 消去ライン数を取得する。
   */
  getLinesCleared(connectionId: string): number {
    return this.linesCleared.get(connectionId) ?? 0;
  }

  /**
   * 勝者を設定する（敗者の connectionId とその敗因を指定）。
   */
  setResult(loserConnectionId: string, reason: LoserReason): void {
    this.loserReason = reason;
    // Find the winner (the other player)
    for (const id of this.scores.keys()) {
      if (id !== loserConnectionId) {
        this.winner = id;
        return;
      }
    }
  }

  /**
   * 対戦が終了しているか。
   */
  isFinished(): boolean {
    return this.winner !== null;
  }
}
