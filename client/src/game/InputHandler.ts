import { GameAction, DAS_MS, ARR_MS } from '@battle-tetris/shared';

// =============================================================================
// Key-to-action mapping
// =============================================================================

const KEY_MAP: ReadonlyMap<string, GameAction> = new Map([
  ['ArrowLeft', GameAction.MoveLeft],
  ['a', GameAction.MoveLeft],
  ['ArrowRight', GameAction.MoveRight],
  ['d', GameAction.MoveRight],
  ['ArrowDown', GameAction.SoftDrop],
  ['s', GameAction.SoftDrop],
  [' ', GameAction.HardDrop],
  ['ArrowUp', GameAction.RotateCW],
  ['w', GameAction.RotateCW],
  ['x', GameAction.RotateCW],
  ['z', GameAction.RotateCCW],
  ['Shift', GameAction.Hold],
  ['c', GameAction.Hold],
]);

/** Actions that fire once per key press and do not auto-repeat. */
const ONCE_PER_PRESS: ReadonlySet<GameAction> = new Set([
  GameAction.HardDrop,
  GameAction.RotateCW,
  GameAction.RotateCCW,
  GameAction.Hold,
]);

/** Movement actions subject to DAS/ARR timing. */
const DAS_ACTIONS: ReadonlySet<GameAction> = new Set([
  GameAction.MoveLeft,
  GameAction.MoveRight,
]);

// =============================================================================
// InputHandler
// =============================================================================

export class InputHandler {
  /** Keys currently held down. */
  private pressedKeys = new Set<string>();

  /**
   * For one-shot actions (HardDrop, RotateCW, RotateCCW, Hold) and for the
   * initial DAS press, track whether the action has already been emitted for
   * the current press so we don't repeat it.
   */
  private firedOnceActions = new Set<GameAction>();

  /**
   * Queue for one-shot actions captured at keydown time so they fire even
   * if the key is released before the next poll() call.
   */
  private pendingOnceActions: GameAction[] = [];

  /**
   * Track whether the initial press action has been emitted for DAS-eligible
   * keys. This allows them to fire once immediately on keydown, then pause for
   * DAS_MS before auto-repeating.
   */
  private dasInitialFired = new Set<GameAction>();

  /**
   * For DAS-eligible keys, record when they were first pressed so we can
   * compute the initial delay and subsequent repeat timing.
   */
  private dasStartTime = new Map<GameAction, number>();

  /**
   * The timestamp at which we last emitted an auto-repeat for a DAS action.
   * Used to pace repeats at ARR_MS intervals after the initial DAS_MS delay.
   */
  private dasLastRepeatTime = new Map<GameAction, number>();

  /** Bound references so we can remove them in detach(). */
  private handleKeyDown: (e: Event) => void;
  private handleKeyUp: (e: Event) => void;

  /** The target we attached listeners to (null when detached). */
  private target: EventTarget | null = null;

  constructor() {
    this.handleKeyDown = (e: Event) => this.onKeyDown(e as KeyboardEvent);
    this.handleKeyUp = (e: Event) => this.onKeyUp(e as KeyboardEvent);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Register keydown/keyup listeners on the given target. */
  attach(target: EventTarget): void {
    this.target = target;
    target.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('keyup', this.handleKeyUp);
  }

  /** Remove previously registered listeners. */
  detach(): void {
    if (this.target) {
      this.target.removeEventListener('keydown', this.handleKeyDown);
      this.target.removeEventListener('keyup', this.handleKeyUp);
      this.target = null;
    }
  }

  /** Clear all internal state (pressed keys, DAS timers, fired flags). */
  reset(): void {
    this.pressedKeys.clear();
    this.firedOnceActions.clear();
    this.pendingOnceActions = [];
    this.dasInitialFired.clear();
    this.dasStartTime.clear();
    this.dasLastRepeatTime.clear();
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  /**
   * Return the list of actions that should be applied this frame.
   *
   * @param currentTime - The current timestamp in milliseconds (e.g. from
   *   `performance.now()`). Used solely for DAS/ARR calculations.
   */
  poll(currentTime: number): GameAction[] {
    const actions: GameAction[] = [];

    // Drain one-shot actions queued at keydown time (handles fast press+release)
    while (this.pendingOnceActions.length > 0) {
      const action = this.pendingOnceActions.shift()!;
      if (!this.firedOnceActions.has(action)) {
        this.firedOnceActions.add(action);
        actions.push(action);
      }
    }

    for (const key of this.pressedKeys) {
      const action = KEY_MAP.get(key);
      if (action === undefined) continue;

      // --- One-shot actions (fire once per press) ---
      if (ONCE_PER_PRESS.has(action)) {
        if (!this.firedOnceActions.has(action)) {
          this.firedOnceActions.add(action);
          actions.push(action);
        }
        continue;
      }

      // --- SoftDrop: fire every frame while held ---
      if (action === GameAction.SoftDrop) {
        actions.push(action);
        continue;
      }

      // --- DAS/ARR movement (MoveLeft / MoveRight) ---
      if (DAS_ACTIONS.has(action)) {
        // Emit one action immediately on first press.
        if (!this.dasInitialFired.has(action)) {
          this.dasInitialFired.add(action);
          actions.push(action);
          continue;
        }

        const startTime = this.dasStartTime.get(action);
        if (startTime === undefined) continue;

        const elapsed = currentTime - startTime;

        if (elapsed < DAS_MS) {
          // Still within the initial DAS delay; wait.
          continue;
        }

        // DAS threshold passed. Check ARR pacing.
        const lastRepeat = this.dasLastRepeatTime.get(action);
        if (lastRepeat === undefined) {
          // First repeat after DAS triggers.
          this.dasLastRepeatTime.set(action, currentTime);
          actions.push(action);
        } else {
          const sinceLast = currentTime - lastRepeat;
          if (sinceLast >= ARR_MS) {
            // Emit as many repeats as elapsed ARR intervals allow, but cap at
            // a single action per poll call to keep behaviour predictable.
            this.dasLastRepeatTime.set(action, currentTime);
            actions.push(action);
          }
        }
        continue;
      }
    }

    // Deduplicate: if the same action was contributed by multiple keys (e.g.
    // both 'a' and 'ArrowLeft' held), keep only the first occurrence.
    return [...new Set(actions)];
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.key;
    if (this.pressedKeys.has(key)) return; // ignore OS key repeat

    const action = KEY_MAP.get(key);
    if (action === undefined) return;

    this.pressedKeys.add(key);

    // Queue one-shot actions so they fire even if released before next poll
    if (ONCE_PER_PRESS.has(action)) {
      this.pendingOnceActions.push(action);
    }

    // For DAS-eligible keys, record the press timestamp.
    if (DAS_ACTIONS.has(action)) {
      if (!this.dasStartTime.has(action)) {
        this.dasStartTime.set(action, e.timeStamp);
      }
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.key;
    this.pressedKeys.delete(key);

    const action = KEY_MAP.get(key);
    if (action === undefined) return;

    // Clear once-per-press flag so the next press fires again.
    this.firedOnceActions.delete(action);

    // Clear DAS state.
    if (DAS_ACTIONS.has(action)) {
      // Only clear if no other key maps to the same action and is still held.
      const stillHeld = [...this.pressedKeys].some(
        (k) => KEY_MAP.get(k) === action,
      );
      if (!stillHeld) {
        this.dasStartTime.delete(action);
        this.dasLastRepeatTime.delete(action);
        this.dasInitialFired.delete(action);
      }
    }
  }
}
