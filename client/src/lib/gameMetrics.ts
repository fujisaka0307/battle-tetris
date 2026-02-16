import { getFaro } from './faro';
import type { ConnectionState } from '../network/SignalRClient';

/**
 * Track FPS measurement via Faro.
 */
export function trackFps(fps: number): void {
  getFaro()?.api.pushMeasurement({
    type: 'game_fps',
    values: { fps },
  });
}

/**
 * Track SignalR connection state change.
 */
export function trackConnectionStateChange(
  from: ConnectionState,
  to: ConnectionState,
): void {
  getFaro()?.api.pushEvent('connection_state_change', { from, to });
}

/**
 * Track game start.
 */
export function trackGameStart(roomId: string): void {
  getFaro()?.api.pushEvent('game_start', { roomId });
}

/**
 * Track game end.
 */
export function trackGameEnd(
  roomId: string,
  result: 'win' | 'lose',
  durationMs: number,
): void {
  getFaro()?.api.pushEvent('game_end', {
    roomId,
    result,
    durationMs: String(durationMs),
  });
}

/**
 * Track page navigation.
 */
export function trackNavigation(page: string): void {
  getFaro()?.api.pushEvent('navigation', { page });
}
