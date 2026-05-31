import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Creates a child logger with a given module name.
 * Uses pino-pretty in development for readable output.
 */
export function createLogger(module: string): pino.Logger {
  const transport = isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined;

  return pino({
    level,
    name: module,
    transport,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
