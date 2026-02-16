export interface HealthInfo {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  connections: number;
  rooms: number;
  sessions: number;
  memoryMB: number;
}

export interface HealthStateProvider {
  connections: number;
  rooms: number;
  sessions: number;
}

type HealthStateProviderFn = () => HealthStateProvider;

let provider: HealthStateProviderFn | null = null;

/**
 * Register a function that returns current runtime state.
 * Called from the adapter after setup.
 */
export function setHealthStateProvider(fn: HealthStateProviderFn): void {
  provider = fn;
}

/**
 * Build a health info response including runtime stats.
 */
export function getHealthInfo(): HealthInfo {
  const state = provider?.() ?? { connections: 0, rooms: 0, sessions: 0 };

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version ?? '0.1.0',
    connections: state.connections,
    rooms: state.rooms,
    sessions: state.sessions,
    memoryMB: Math.round(process.memoryUsage.rss() / 1024 / 1024),
  };
}
