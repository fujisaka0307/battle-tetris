// =============================================================================
// Game Types
// =============================================================================

/** 10x20 のフィールド。row=0 が最上段。0=空, 1-7=テトリミノ種別 */
export type Field = number[][];

/** テトリミノ種別 */
export enum TetrominoType {
  I = 1,
  O = 2,
  T = 3,
  S = 4,
  Z = 5,
  J = 6,
  L = 7,
}

/** ゲームの状態 */
export enum GameState {
  Idle = 'idle',
  Playing = 'playing',
  Paused = 'paused',
  GameOver = 'gameover',
}

/** ゲーム操作アクション */
export enum GameAction {
  MoveLeft = 'moveLeft',
  MoveRight = 'moveRight',
  SoftDrop = 'softDrop',
  HardDrop = 'hardDrop',
  RotateCW = 'rotateCW',
  RotateCCW = 'rotateCCW',
  Hold = 'hold',
}

// =============================================================================
// Room / Match Types
// =============================================================================

/** ルームの状態 */
export enum RoomStatus {
  Waiting = 'waiting',
  Ready = 'ready',
  Playing = 'playing',
  Finished = 'finished',
}

/** プレイヤー情報 */
export interface PlayerInfo {
  connectionId: string;
  enterpriseId: string;
  isReady: boolean;
  isConnected: boolean;
}

/** 対戦結果の敗因 */
export enum LoserReason {
  GameOver = 'gameover',
  Disconnect = 'disconnect',
}

/** AIレベル (1=最弱 〜 10=最強) */
export type AiLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// =============================================================================
// Leaderboard / Match History Types
// =============================================================================

/** 対戦履歴エントリ */
export interface MatchHistoryEntry {
  id: number;
  roomId: string;
  winnerId: string;
  loserId: string;
  winnerScore: number;
  loserScore: number;
  winnerLines: number;
  loserLines: number;
  loserReason: LoserReason;
  durationMs: number;
  playedAt: string; // ISO 8601
  isAiMatch: boolean;
}

/** ランキングエントリ */
export interface RankingEntry {
  rank: number;
  enterpriseId: string;
  wins: number;
  losses: number;
  totalScore: number;
  maxScore: number;
  winRate: number; // 0-100
}
