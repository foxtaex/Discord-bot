import pino from 'pino';

export function createLogger(level = 'info') {
  const transport =
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        };

  return pino({ level, transport });
}
