import env from './env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const activeLevel = env.isTest ? -1 : env.isProd ? LEVELS.info : LEVELS.debug;

const COLOURS = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m',
  reset: '\x1b[0m',
};

function stamp() {
  return new Date().toISOString();
}

function write(level, message, meta) {
  if (LEVELS[level] > activeLevel) return;

  const head = `${COLOURS[level]}[${level.toUpperCase()}]${COLOURS.reset} ${stamp()}`;
  const line = `${head} ${message}`;

  if (meta === undefined) {
    console[level === 'debug' ? 'log' : level](line);
    return;
  }

  let rendered;
  if (meta instanceof Error) {
    rendered = env.isProd ? meta.message : meta.stack;
  } else {
    try {
      rendered = JSON.stringify(meta);
    } catch {
      rendered = '[unserialisable meta]';
    }
  }
  console[level === 'debug' ? 'log' : level](`${line} ${rendered}`);
}

export const error = (message, meta) => write('error', message, meta);
export const warn = (message, meta) => write('warn', message, meta);
export const info = (message, meta) => write('info', message, meta);
export const debug = (message, meta) => write('debug', message, meta);
