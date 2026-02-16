/**
 * Custom game metrics using OpenTelemetry API.
 *
 * When OTel is not initialized (development), all instruments are automatically no-op.
 */
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('battle-tetris-server');

// ---------------------------------------------------------------------------
// Gauges (observable — callback-based)
// ---------------------------------------------------------------------------

export const activeRoomsGauge = meter.createObservableGauge('game.rooms.active', {
  description: 'Number of active rooms',
});

export const activeConnectionsGauge = meter.createObservableGauge('game.connections.active', {
  description: 'Number of active WebSocket connections',
});

export const activeSessionsGauge = meter.createObservableGauge('game.sessions.active', {
  description: 'Number of active game sessions (playing)',
});

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export const sessionsTotal = meter.createCounter('game.sessions.total', {
  description: 'Total number of game sessions started',
});

export const linesClearedTotal = meter.createCounter('game.lines_cleared.total', {
  description: 'Total number of lines cleared',
});

export const garbageSentTotal = meter.createCounter('game.garbage_sent.total', {
  description: 'Total garbage lines sent',
});

export const gameResults = meter.createCounter('game.results', {
  description: 'Game results by reason',
});

export const rematchTotal = meter.createCounter('game.rematch.total', {
  description: 'Total rematch requests',
});

export const wsMessagesReceived = meter.createCounter('ws.messages.received', {
  description: 'WebSocket messages received',
});

export const wsMessagesSent = meter.createCounter('ws.messages.sent', {
  description: 'WebSocket messages sent',
});

// ---------------------------------------------------------------------------
// Histograms
// ---------------------------------------------------------------------------

export const sessionDuration = meter.createHistogram('game.sessions.duration', {
  description: 'Game session duration in seconds',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [30, 60, 120, 180, 300, 600, 900, 1800],
  },
});
