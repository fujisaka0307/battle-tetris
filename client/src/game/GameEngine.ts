import {
  TetrominoType,
  GameState,
  GameAction,
  LOCK_DELAY_MS,
  LOCK_DELAY_MAX_RESETS,
  LINE_CLEAR_SCORES,
  SOFT_DROP_SCORE,
  HARD_DROP_SCORE,
  LINES_PER_LEVEL,
  getDropInterval,
} from '@battle-tetris/shared';
import { Board } from './Board';
import { BagRandomizer } from './BagRandomizer';
import { GarbageManager } from './GarbageManager';
import { InputHandler } from './InputHandler';
import {
  getWallKickData,
  nextRotation,
  getSpawnPosition,
} from './Tetromino';

// =============================================================================
// Callbacks
// =============================================================================

export interface GameCallbacks {
  onLinesCleared?: (count: number) => void;
  onGameOver?: () => void;
  onFieldUpdate?: () => void;
}

// =============================================================================
// Current piece state
// =============================================================================

interface ActivePiece {
  type: TetrominoType;
  rotation: number;
  row: number;
  col: number;
}

// =============================================================================
// GameEngine
// =============================================================================

export class GameEngine {
  readonly board: Board;
  readonly bag: BagRandomizer;
  readonly garbage: GarbageManager;
  readonly input: InputHandler;

  // --- State ---
  private _state: GameState = GameState.Idle;
  private _score: number = 0;
  private _level: number = 0;
  private _lines: number = 0;

  // --- Active piece ---
  private current: ActivePiece | null = null;

  // --- Hold ---
  private _holdPiece: TetrominoType | null = null;
  private holdUsedThisLock: boolean = false;

  // --- Drop timer ---
  private dropTimer: number = 0;

  // --- Lock delay ---
  private lockTimer: number = 0;
  private lockResets: number = 0;
  private isGrounded: boolean = false;

  // --- Callbacks ---
  private callbacks: GameCallbacks = {};

  constructor(seed: number = 0) {
    this.board = new Board();
    this.bag = new BagRandomizer(seed);
    this.garbage = new GarbageManager();
    this.input = new InputHandler();
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get state(): GameState {
    return this._state;
  }

  get score(): number {
    return this._score;
  }

  get level(): number {
    return this._level;
  }

  get lines(): number {
    return this._lines;
  }

  get holdPiece(): TetrominoType | null {
    return this._holdPiece;
  }

  get currentPiece(): ActivePiece | null {
    return this.current ? { ...this.current } : null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  setCallbacks(callbacks: GameCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * ゲームを開始する。
   */
  start(seed?: number): void {
    this.board.reset();
    if (seed !== undefined) {
      this.bag.reset(seed);
    }
    this.garbage.reset();
    this.input.reset();

    this._state = GameState.Playing;
    this._score = 0;
    this._level = 0;
    this._lines = 0;
    this._holdPiece = null;
    this.holdUsedThisLock = false;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.current = null;

    this.spawnPiece();
  }

  // ---------------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------------

  /**
   * 1フレーム分のゲーム更新を行う。
   * @param dt 前フレームからの経過ミリ秒
   */
  update(dt: number): void {
    if (this._state !== GameState.Playing) return;
    if (!this.current) return;

    // --- Input handling ---
    const now = performance.now();
    const actions = this.input.poll(now);
    for (const action of actions) {
      this.handleAction(action);
      if (this._state !== GameState.Playing) return;
    }

    // --- Auto drop ---
    const dropInterval = getDropInterval(this._level);
    this.dropTimer += dt;
    while (this.dropTimer >= dropInterval) {
      this.dropTimer -= dropInterval;
      this.tryMoveDown();
      if (this._state !== GameState.Playing) return;
    }

    // --- Lock delay ---
    if (this.isGrounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this.lockPiece();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private handleAction(action: GameAction): void {
    if (!this.current) return;

    switch (action) {
      case GameAction.MoveLeft:
        this.tryMove(0, -1);
        break;
      case GameAction.MoveRight:
        this.tryMove(0, 1);
        break;
      case GameAction.SoftDrop:
        this.softDrop();
        break;
      case GameAction.HardDrop:
        this.hardDrop();
        break;
      case GameAction.RotateCW:
        this.tryRotate(1);
        break;
      case GameAction.RotateCCW:
        this.tryRotate(-1);
        break;
      case GameAction.Hold:
        this.hold();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  private tryMove(dRow: number, dCol: number): boolean {
    if (!this.current) return false;
    const { type, rotation, row, col } = this.current;
    const newRow = row + dRow;
    const newCol = col + dCol;

    if (this.board.canPlace(type, rotation, newRow, newCol)) {
      this.current.row = newRow;
      this.current.col = newCol;
      this.updateGrounded();
      if (this.isGrounded) {
        this.resetLockDelay();
      }
      this.notifyFieldUpdate();
      return true;
    }
    return false;
  }

  private tryMoveDown(): void {
    if (!this.tryMove(1, 0)) {
      // 下に移動できない = 接地
      if (!this.isGrounded) {
        this.isGrounded = true;
        this.lockTimer = 0;
        this.lockResets = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rotation (SRS wall kick)
  // ---------------------------------------------------------------------------

  private tryRotate(delta: number): boolean {
    if (!this.current) return false;
    const { type, rotation, row, col } = this.current;
    const newRotation = nextRotation(rotation, delta);
    const kickData = getWallKickData(type);
    const key = `${rotation}>${newRotation}`;
    const offsets = kickData[key];

    if (!offsets) return false;

    for (const [dx, dy] of offsets) {
      // SRS: dx = right positive, dy = down positive (positive = up in standard SRS)
      // Our grid: row increases downward, col increases rightward
      // SRS offset dy is "up" in visual space, so we negate for grid
      const testCol = col + dx;
      const testRow = row - dy;
      if (this.board.canPlace(type, newRotation, testRow, testCol)) {
        this.current.rotation = newRotation;
        this.current.row = testRow;
        this.current.col = testCol;
        this.updateGrounded();
        if (this.isGrounded) {
          this.resetLockDelay();
        }
        this.notifyFieldUpdate();
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Drop
  // ---------------------------------------------------------------------------

  private softDrop(): void {
    if (this.tryMove(1, 0)) {
      this._score += SOFT_DROP_SCORE;
      this.dropTimer = 0; // reset auto-drop timer on soft drop
    }
  }

  private hardDrop(): void {
    if (!this.current) return;
    let distance = 0;
    while (this.tryMove(1, 0)) {
      distance++;
    }
    this._score += distance * HARD_DROP_SCORE;
    this.lockPiece();
  }

  // ---------------------------------------------------------------------------
  // Hold
  // ---------------------------------------------------------------------------

  private hold(): void {
    if (!this.current) return;
    if (this.holdUsedThisLock) return;

    const currentType = this.current.type;
    if (this._holdPiece !== null) {
      // Swap with held piece
      const held = this._holdPiece;
      this._holdPiece = currentType;
      this.spawnPieceOfType(held);
    } else {
      this._holdPiece = currentType;
      this.spawnPiece();
    }
    this.holdUsedThisLock = true;
    this.notifyFieldUpdate();
  }

  // ---------------------------------------------------------------------------
  // Lock
  // ---------------------------------------------------------------------------

  private lockPiece(): void {
    if (!this.current) return;
    const { type, rotation, row, col } = this.current;
    this.board.lock(type, rotation, row, col);

    // --- Line clear ---
    const cleared = this.board.clearLines();
    if (cleared > 0) {
      this._lines += cleared;
      this._level = Math.floor(this._lines / LINES_PER_LEVEL);
      const lineScore = (LINE_CLEAR_SCORES[cleared] ?? 0) * (this._level + 1);
      this._score += lineScore;
      this.callbacks.onLinesCleared?.(cleared);
    }

    // --- Garbage (after lock, before next spawn) ---
    this.garbage.flush(this.board);

    // --- Reset hold flag ---
    this.holdUsedThisLock = false;

    // --- Next piece ---
    this.spawnPiece();
  }

  // ---------------------------------------------------------------------------
  // Spawn
  // ---------------------------------------------------------------------------

  private spawnPiece(): void {
    const type = this.bag.next();
    this.spawnPieceOfType(type);
  }

  private spawnPieceOfType(type: TetrominoType): void {
    const [row, col] = getSpawnPosition(type);

    if (this.board.isGameOver(type, 0, row, col)) {
      this._state = GameState.GameOver;
      this.current = null;
      // Notify field update before game over so final stats are synced to store
      this.notifyFieldUpdate();
      this.callbacks.onGameOver?.();
      return;
    }

    this.current = { type, rotation: 0, row, col };
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.isGrounded = false;
    this.updateGrounded();
    this.notifyFieldUpdate();
  }

  // ---------------------------------------------------------------------------
  // Ghost piece (hard drop destination)
  // ---------------------------------------------------------------------------

  /**
   * ゴーストピースの位置を取得する（ハードドロップ先の row）。
   */
  getGhostRow(): number | null {
    if (!this.current) return null;
    const { type, rotation, col } = this.current;
    let row = this.current.row;
    while (this.board.canPlace(type, rotation, row + 1, col)) {
      row++;
    }
    return row;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private updateGrounded(): void {
    if (!this.current) {
      this.isGrounded = false;
      return;
    }
    const { type, rotation, row, col } = this.current;
    this.isGrounded = !this.board.canPlace(type, rotation, row + 1, col);
  }

  private resetLockDelay(): void {
    if (this.lockResets < LOCK_DELAY_MAX_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private notifyFieldUpdate(): void {
    this.callbacks.onFieldUpdate?.();
  }
}
