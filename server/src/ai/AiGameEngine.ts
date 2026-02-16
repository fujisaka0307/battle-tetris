import {
  TetrominoType,
  GameState,
  Board,
  BagRandomizer,
  GarbageManager,
  getSpawnPosition,
} from '@battle-tetris/shared';

// =============================================================================
// Types
// =============================================================================

export interface AiPlacement {
  col: number;
  rotation: number;
}

export interface AiGameCallbacks {
  onFieldUpdate?: (field: number[][], score: number, lines: number, level: number) => void;
  onLinesCleared?: (count: number) => void;
  onGameOver?: () => void;
  onAiThinking?: (prompt: string, response: string, model: string) => void;
}

// =============================================================================
// AiGameEngine
// =============================================================================

/**
 * サーバーサイドのテトリスゲームエンジン（AI用）。
 * shared の Board + BagRandomizer + GarbageManager を使い、
 * AIのゲームを独立して実行する。
 */
export class AiGameEngine {
  readonly board: Board;
  readonly bag: BagRandomizer;
  readonly garbage: GarbageManager;

  private _state: GameState = GameState.Idle;
  private _score: number = 0;
  private _level: number = 0;
  private _lines: number = 0;
  callbacks: AiGameCallbacks = {};

  constructor(seed: number) {
    this.board = new Board();
    this.bag = new BagRandomizer(seed);
    this.garbage = new GarbageManager();
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get state(): GameState { return this._state; }
  get score(): number { return this._score; }
  get level(): number { return this._level; }
  get lines(): number { return this._lines; }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  setCallbacks(callbacks: AiGameCallbacks): void {
    this.callbacks = callbacks;
  }

  start(): void {
    this.board.reset();
    this._state = GameState.Playing;
    this._score = 0;
    this._level = 0;
    this._lines = 0;
  }

  // ---------------------------------------------------------------------------
  // Piece access
  // ---------------------------------------------------------------------------

  peekCurrentPiece(): TetrominoType {
    return this.bag.peek(1)[0];
  }

  peekNextPieces(count: number): TetrominoType[] {
    // peek(count+1) then skip the first (current piece)
    return this.bag.peek(count + 1).slice(1);
  }

  // ---------------------------------------------------------------------------
  // Placement execution
  // ---------------------------------------------------------------------------

  /**
   * 指定位置にピースをハードドロップで配置する。
   * ライン消去・ガーベジ適用・スコア更新を含む。
   */
  executePlacement(placement: AiPlacement): void {
    if (this._state !== GameState.Playing) return;

    const type = this.bag.next();
    const { col, rotation } = placement;

    // ドロップ先の行を計算
    const dropRow = this.findDropRow(type, rotation, col);
    if (dropRow < 0) {
      // 配置不能 → ゲームオーバー
      this._state = GameState.GameOver;
      this.callbacks.onGameOver?.();
      return;
    }

    // スポーン位置にすでに置けないかチェック
    const [spawnRow, spawnCol] = getSpawnPosition(type);
    if (this.board.isGameOver(type, 0, spawnRow, spawnCol)) {
      this._state = GameState.GameOver;
      this.callbacks.onGameOver?.();
      return;
    }

    // ピースを配置
    this.board.lock(type, rotation, dropRow, col);

    // ライン消去
    const cleared = this.board.clearLines();
    if (cleared > 0) {
      this._lines += cleared;
      this._level = Math.floor(this._lines / 10);
      this._score += cleared * 100 * (this._level + 1);
      this.callbacks.onLinesCleared?.(cleared);
    }

    // ガーベジ適用
    this.garbage.flush(this.board);

    // フィールド更新通知
    this.callbacks.onFieldUpdate?.(
      this.board.getVisibleGrid(),
      this._score,
      this._lines,
      this._level,
    );

    // 次のピースが置けるかチェック
    const nextType = this.bag.peek(1)[0];
    const [nextRow, nextCol] = getSpawnPosition(nextType);
    if (this.board.isGameOver(nextType, 0, nextRow, nextCol)) {
      this._state = GameState.GameOver;
      this.callbacks.onGameOver?.();
    }
  }

  /**
   * 指定ピースが指定回転・列で落下する行を計算する。
   * @returns 落下先の行（配置不能なら -1）
   */
  findDropRow(type: TetrominoType, rotation: number, col: number): number {
    // まず最上段から配置可能かチェック
    let row = 0;
    if (!this.board.canPlace(type, rotation, row, col)) {
      return -1;
    }
    // 下に落とせるだけ落とす
    while (this.board.canPlace(type, rotation, row + 1, col)) {
      row++;
    }
    return row;
  }

  /**
   * おじゃまラインを受信キューに追加する。
   */
  addGarbage(lines: number): void {
    this.garbage.add(lines);
  }

  /**
   * ASCII形式のボード表現を返す（Bedrock用）。
   * . = 空, X = ブロック, G = ガーベジ
   */
  getBoardAsText(): string {
    const visible = this.board.getVisibleGrid();
    return visible.map((row) =>
      row.map((cell) => {
        if (cell === 0) return '.';
        if (cell === 8) return 'G';
        return 'X';
      }).join(''),
    ).join('\n');
  }
}
