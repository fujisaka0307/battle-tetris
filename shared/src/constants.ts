// =============================================================================
// Field
// =============================================================================

/** フィールドの列数 */
export const FIELD_COLS = 10;

/** フィールドの行数（見える部分） */
export const FIELD_ROWS = 20;

/** フィールドの行数（バッファ含む。上部2行は非表示バッファ） */
export const FIELD_ROWS_BUFFER = 22;

// =============================================================================
// Timing
// =============================================================================

/** テトリミノ接地後のロックディレイ (ms) */
export const LOCK_DELAY_MS = 500;

/** ロックディレイのリセット上限回数 */
export const LOCK_DELAY_MAX_RESETS = 15;

/** DAS — キー長押し時の初期遅延 (ms) */
export const DAS_MS = 133;

/** ARR — 長押し後のリピート間隔 (ms) */
export const ARR_MS = 10;

/** フィールド状態の送信スロットル間隔 (ms) */
export const FIELD_SYNC_INTERVAL_MS = 50;

/** 切断タイムアウト (ms) */
export const DISCONNECT_TIMEOUT_MS = 30_000;

/** カウントダウン秒数 */
export const COUNTDOWN_SECONDS = 3;

// =============================================================================
// Scoring
// =============================================================================

/** ライン消去のスコア倍率（index = 消去ライン数, value = 倍率） */
export const LINE_CLEAR_SCORES: readonly number[] = [
  0,   // 0 lines
  100, // 1 line  (Single)
  300, // 2 lines (Double)
  500, // 3 lines (Triple)
  800, // 4 lines (Tetris)
];

/** ソフトドロップ 1セルあたりのスコア */
export const SOFT_DROP_SCORE = 1;

/** ハードドロップ 1セルあたりのスコア */
export const HARD_DROP_SCORE = 2;

/** レベルアップに必要な消去ライン数 */
export const LINES_PER_LEVEL = 10;

// =============================================================================
// Garbage (おじゃまライン)
// =============================================================================

/**
 * ライン消去数 → 相手に送るおじゃまライン数の変換テーブル
 * index = 消去ライン数, value = おじゃま送信数
 */
export const GARBAGE_TABLE: readonly number[] = [
  0, // 0 lines → 0
  0, // 1 line  → 0
  1, // 2 lines → 1
  2, // 3 lines → 2
  4, // 4 lines → 4
];

// =============================================================================
// Speed (落下速度テーブル)
// =============================================================================

/**
 * レベルごとの自動落下間隔 (ms)
 * レベル0 = 1000ms (1秒/セル), レベル15以降 = 最速
 * NES版テトリスの速度カーブを参考にした近似値
 */
export const SPEED_TABLE_MS: readonly number[] = [
  1000, // Level 0
  900,  // Level 1
  800,  // Level 2
  700,  // Level 3
  600,  // Level 4
  500,  // Level 5
  450,  // Level 6
  400,  // Level 7
  350,  // Level 8
  300,  // Level 9
  250,  // Level 10
  200,  // Level 11
  150,  // Level 12
  125,  // Level 13
  100,  // Level 14
  80,   // Level 15
  60,   // Level 16
  50,   // Level 17
  40,   // Level 18
  33,   // Level 19 (最速)
];

/**
 * 指定レベルの落下間隔を取得する。
 * テーブル範囲外のレベルは最速値を返す。
 */
export function getDropInterval(level: number): number {
  if (level < 0) return SPEED_TABLE_MS[0];
  if (level >= SPEED_TABLE_MS.length) return SPEED_TABLE_MS[SPEED_TABLE_MS.length - 1];
  return SPEED_TABLE_MS[level];
}

// =============================================================================
// Nickname
// =============================================================================

/** ニックネームの最小文字数 */
export const NICKNAME_MIN_LENGTH = 1;

/** ニックネームの最大文字数 */
export const NICKNAME_MAX_LENGTH = 16;

// =============================================================================
// Room
// =============================================================================

/** ルームIDの長さ */
export const ROOM_ID_LENGTH = 6;
