import { GameAction, DAS_MS, ARR_MS } from '@battle-tetris/shared';
import { InputHandler } from '../InputHandler';

// =============================================================================
// Helpers
// =============================================================================

/** Create and dispatch a KeyboardEvent on the target. */
function pressKey(
  target: EventTarget,
  key: string,
  timeStamp = 0,
): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  // jsdom KeyboardEvent doesn't accept timeStamp via constructor options, so
  // we override the property.
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

function releaseKey(
  target: EventTarget,
  key: string,
  timeStamp = 0,
): void {
  const event = new KeyboardEvent('keyup', { key, bubbles: true });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

// =============================================================================
// Tests
// =============================================================================

describe('InputHandler', () => {
  let handler: InputHandler;
  let target: EventTarget;

  beforeEach(() => {
    handler = new InputHandler();
    target = new EventTarget();
    handler.attach(target);
  });

  afterEach(() => {
    handler.detach();
  });

  // ---------------------------------------------------------------------------
  // Key mapping
  // ---------------------------------------------------------------------------

  describe('key mapping', () => {
    const cases: [string, GameAction][] = [
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
    ];

    it.each(cases)(
      'pressing "%s" returns %s',
      (key, expectedAction) => {
        pressKey(target, key, 0);
        const actions = handler.poll(0);
        expect(actions).toContain(expectedAction);
      },
    );

    it('ignores unmapped keys', () => {
      pressKey(target, 'q', 0);
      pressKey(target, 'Enter', 0);
      pressKey(target, '1', 0);
      const actions = handler.poll(0);
      expect(actions).toHaveLength(0);
    });

    it('ignores OS key repeat (duplicate keydown without keyup)', () => {
      pressKey(target, 'ArrowLeft', 0);
      const first = handler.poll(0);
      expect(first).toContain(GameAction.MoveLeft);

      // Dispatch another keydown for the same key without releasing first
      // This simulates OS key repeat which should be ignored
      pressKey(target, 'ArrowLeft', 10);

      // The key should not trigger dasStartTime to be reset or cause issues
      // Poll should not produce an extra initial action
      const second = handler.poll(10);
      // It should produce nothing (initial was already consumed, and we're within DAS delay)
      expect(second).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // DAS / ARR (MoveLeft, MoveRight)
  // ---------------------------------------------------------------------------

  describe('DAS (Delayed Auto Shift)', () => {
    it('fires once immediately on initial press, then no repeat before DAS_MS', () => {
      pressKey(target, 'ArrowLeft', 0);

      // First poll fires the initial press action immediately.
      const t1 = handler.poll(0);
      expect(t1).toContain(GameAction.MoveLeft);

      // Before DAS threshold, no further repeats.
      const t2 = handler.poll(DAS_MS - 1);
      expect(t2).toHaveLength(0);
    });

    it('starts repeating after DAS_MS elapses', () => {
      pressKey(target, 'ArrowLeft', 0);

      // Consume initial press
      handler.poll(0);

      const actions = handler.poll(DAS_MS);
      expect(actions).toContain(GameAction.MoveLeft);
    });

    it('dasStartTime が未設定の場合に continue されること', () => {
      pressKey(target, 'ArrowLeft', 0);

      // Consume initial press
      handler.poll(0);

      // Manually delete dasStartTime for MoveLeft while leaving other state intact
      // This simulates the edge case where dasInitialFired is set but dasStartTime is not
      (handler as any).dasStartTime.delete(GameAction.MoveLeft);

      // Poll should not crash and should skip the action
      const actions = handler.poll(DAS_MS);
      expect(actions).toHaveLength(0);
    });

    it('applies to MoveRight as well', () => {
      pressKey(target, 'ArrowRight', 0);

      // Consume initial press
      const initial = handler.poll(0);
      expect(initial).toContain(GameAction.MoveRight);

      // Before DAS threshold, no further repeats.
      expect(handler.poll(DAS_MS - 1)).toHaveLength(0);

      // After DAS threshold, repeats start.
      expect(handler.poll(DAS_MS)).toContain(GameAction.MoveRight);
    });
  });

  describe('ARR (Auto Repeat Rate)', () => {
    it('repeats at ARR_MS intervals after DAS triggers', () => {
      pressKey(target, 'ArrowLeft', 0);

      // Consume initial press
      handler.poll(0);

      // Trigger DAS
      const a1 = handler.poll(DAS_MS);
      expect(a1).toContain(GameAction.MoveLeft);

      // Too early for next ARR repeat
      const a2 = handler.poll(DAS_MS + ARR_MS - 1);
      expect(a2.filter((a) => a === GameAction.MoveLeft)).toHaveLength(0);

      // Exactly at next ARR tick
      const a3 = handler.poll(DAS_MS + ARR_MS);
      expect(a3).toContain(GameAction.MoveLeft);

      // Another ARR tick
      const a4 = handler.poll(DAS_MS + ARR_MS * 2);
      expect(a4).toContain(GameAction.MoveLeft);
    });
  });

  // ---------------------------------------------------------------------------
  // Key release stops action
  // ---------------------------------------------------------------------------

  describe('key release', () => {
    it('stops DAS actions when key is released', () => {
      pressKey(target, 'ArrowLeft', 0);

      // Trigger DAS
      expect(handler.poll(DAS_MS)).toContain(GameAction.MoveLeft);

      // Release
      releaseKey(target, 'ArrowLeft', DAS_MS + 5);

      // Should produce nothing now
      expect(handler.poll(DAS_MS + ARR_MS)).toHaveLength(0);
    });

    it('stops SoftDrop when key is released', () => {
      pressKey(target, 'ArrowDown', 0);
      expect(handler.poll(0)).toContain(GameAction.SoftDrop);

      releaseKey(target, 'ArrowDown', 1);
      expect(handler.poll(2)).not.toContain(GameAction.SoftDrop);
    });

    it('ignores keyup for unmapped keys', () => {
      pressKey(target, 'ArrowLeft', 0);
      handler.poll(0); // consume

      // Release an unmapped key - should not crash or affect state
      releaseKey(target, 'q', 5);
      releaseKey(target, 'Enter', 5);

      // The ArrowLeft DAS should still work
      const actions = handler.poll(DAS_MS);
      expect(actions).toContain(GameAction.MoveLeft);
    });
  });

  // ---------------------------------------------------------------------------
  // Once-per-press actions
  // ---------------------------------------------------------------------------

  describe('once-per-press actions', () => {
    const onceCases: [string, GameAction][] = [
      [' ', GameAction.HardDrop],
      ['ArrowUp', GameAction.RotateCW],
      ['z', GameAction.RotateCCW],
      ['Shift', GameAction.Hold],
    ];

    it.each(onceCases)(
      '"%s" (%s) fires only once per press',
      (key, action) => {
        pressKey(target, key, 0);

        // First poll fires the action
        const first = handler.poll(0);
        expect(first).toContain(action);

        // Second poll with the key still held should NOT fire again
        const second = handler.poll(100);
        expect(second).not.toContain(action);

        // Third poll still nothing
        const third = handler.poll(500);
        expect(third).not.toContain(action);
      },
    );

    it('fires again after release and re-press', () => {
      pressKey(target, ' ', 0);
      expect(handler.poll(0)).toContain(GameAction.HardDrop);

      releaseKey(target, ' ', 10);
      pressKey(target, ' ', 20);

      expect(handler.poll(20)).toContain(GameAction.HardDrop);
    });
  });

  // ---------------------------------------------------------------------------
  // SoftDrop repeats every frame
  // ---------------------------------------------------------------------------

  describe('SoftDrop', () => {
    it('fires every frame while held', () => {
      pressKey(target, 'ArrowDown', 0);

      expect(handler.poll(0)).toContain(GameAction.SoftDrop);
      expect(handler.poll(16)).toContain(GameAction.SoftDrop);
      expect(handler.poll(32)).toContain(GameAction.SoftDrop);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple simultaneous keys
  // ---------------------------------------------------------------------------

  describe('multiple simultaneous keys', () => {
    it('handles multiple actions at once', () => {
      pressKey(target, 'ArrowDown', 0); // SoftDrop
      pressKey(target, ' ', 0);         // HardDrop

      const actions = handler.poll(0);
      expect(actions).toContain(GameAction.SoftDrop);
      expect(actions).toContain(GameAction.HardDrop);
    });

    it('handles movement + rotation simultaneously', () => {
      pressKey(target, 'ArrowLeft', 0);
      pressKey(target, 'ArrowUp', 0);

      const actions = handler.poll(DAS_MS); // after DAS for left
      expect(actions).toContain(GameAction.MoveLeft);
      // RotateCW is once-per-press, and we haven't polled before, so it fires
      expect(actions).toContain(GameAction.RotateCW);
    });

    it('deduplicates when two keys map to the same action', () => {
      // Both 'a' and 'ArrowLeft' map to MoveLeft
      pressKey(target, 'a', 0);
      pressKey(target, 'ArrowLeft', 0);

      const actions = handler.poll(DAS_MS);
      const moveLeftCount = actions.filter(
        (a) => a === GameAction.MoveLeft,
      ).length;
      expect(moveLeftCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // DAS key release when alternate key still held
  // ---------------------------------------------------------------------------

  describe('DAS キーリリース時に同じアクションの別キーが押されている場合', () => {
    it('ArrowLeft を離しても "a" が押されていれば DAS が継続すること', () => {
      // Press both keys that map to MoveLeft
      pressKey(target, 'ArrowLeft', 0);
      pressKey(target, 'a', 0);

      // Consume initial press
      const initial = handler.poll(0);
      expect(initial).toContain(GameAction.MoveLeft);

      // Release ArrowLeft while 'a' is still held
      releaseKey(target, 'ArrowLeft', 50);

      // DAS state should NOT be cleared because 'a' is still held
      // The action should still be producible
      const afterRelease = handler.poll(DAS_MS);
      expect(afterRelease).toContain(GameAction.MoveLeft);
    });

    it('両方のキーを離すと DAS が停止すること', () => {
      pressKey(target, 'ArrowLeft', 0);
      pressKey(target, 'a', 0);

      // Consume initial press
      handler.poll(0);

      // Release both keys
      releaseKey(target, 'ArrowLeft', 50);
      releaseKey(target, 'a', 60);

      // DAS should be fully cleared now
      const actions = handler.poll(DAS_MS + 100);
      expect(actions).not.toContain(GameAction.MoveLeft);
    });

    it('ArrowRight と "d" で同様にDASが継続すること', () => {
      pressKey(target, 'ArrowRight', 0);
      pressKey(target, 'd', 0);

      // Consume initial press
      handler.poll(0);

      // Release ArrowRight while 'd' is still held
      releaseKey(target, 'ArrowRight', 50);

      // DAS should still work via 'd'
      const actions = handler.poll(DAS_MS);
      expect(actions).toContain(GameAction.MoveRight);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears all key state', () => {
      pressKey(target, 'ArrowDown', 0);
      pressKey(target, 'ArrowLeft', 0);
      pressKey(target, ' ', 0);

      // Confirm actions are pending
      expect(handler.poll(0).length).toBeGreaterThan(0);

      handler.reset();

      // After reset, nothing should be emitted
      expect(handler.poll(DAS_MS + 100)).toHaveLength(0);
    });

    it('clears DAS timing so re-press starts fresh', () => {
      pressKey(target, 'ArrowLeft', 0);
      handler.poll(0); // consume initial press
      handler.poll(DAS_MS); // trigger DAS

      handler.reset();

      // Re-press after reset
      pressKey(target, 'ArrowLeft', 1000);

      // Initial press fires immediately
      const initial = handler.poll(1000);
      expect(initial).toContain(GameAction.MoveLeft);

      // Should not auto-repeat until DAS_MS from the new press
      expect(handler.poll(1000 + DAS_MS - 1)).toHaveLength(0);
      expect(handler.poll(1000 + DAS_MS)).toContain(GameAction.MoveLeft);
    });

    it('allows once-per-press actions to fire again', () => {
      pressKey(target, ' ', 0);
      expect(handler.poll(0)).toContain(GameAction.HardDrop);

      handler.reset();

      // Re-press
      pressKey(target, ' ', 100);
      expect(handler.poll(100)).toContain(GameAction.HardDrop);
    });
  });

  // ---------------------------------------------------------------------------
  // attach / detach
  // ---------------------------------------------------------------------------

  describe('attach / detach', () => {
    it('does not receive events after detach', () => {
      handler.detach();

      pressKey(target, 'ArrowDown', 0);
      expect(handler.poll(0)).toHaveLength(0);
    });

    it('receives events after re-attach', () => {
      handler.detach();
      handler.attach(target);

      pressKey(target, 'ArrowDown', 0);
      expect(handler.poll(0)).toContain(GameAction.SoftDrop);
    });
  });

  // ---------------------------------------------------------------------------
  // Defensive branches
  // ---------------------------------------------------------------------------

  describe('defensive branches', () => {
    it('pressedKeys にマップ外のキーがある場合 poll でスキップされること', () => {
      // Directly inject an unmapped key into pressedKeys
      (handler as any).pressedKeys.add('F13');

      // poll should skip 'F13' (action === undefined) and return empty
      const actions = handler.poll(0);
      expect(actions).toHaveLength(0);
    });
  });
});
