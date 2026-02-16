import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
  redact: ['authorization', 'req.headers.authorization'],
});

/**
 * Create a child logger with bound context fields.
 * Usage: `createLogger({ connectionId, roomId })`
 */
export function createLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
