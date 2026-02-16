import {
  initializeFaro as initFaroSDK,
  getWebInstrumentations,
  type Faro,
} from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

let faro: Faro | null = null;

/**
 * Initialize Grafana Faro RUM.
 * No-op when VITE_GRAFANA_FARO_URL is not set (safe for development).
 */
export function initFaro(): void {
  const url = import.meta.env.VITE_GRAFANA_FARO_URL;
  if (!url) return;

  faro = initFaroSDK({
    url,
    app: {
      name: 'battle-tetris-client',
      version: '0.1.0',
      environment: import.meta.env.MODE,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation(),
    ],
  });
}

export function getFaro(): Faro | null {
  return faro;
}
