import pino from 'pino';
import { config } from './env';

// Log estruturado (JSON) em produção; bonitinho e colorido em dev.
export const logger = pino(
  config.isProd
    ? { level: config.LOG_LEVEL ?? 'info' }
    : {
        level: config.LOG_LEVEL ?? 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
);

export type Logger = typeof logger;
