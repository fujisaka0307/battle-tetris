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
