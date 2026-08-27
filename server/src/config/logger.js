import env from './env.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

/*
 * Silent under test. The SOS fan-out is deliberately not awaited, so it can
 * still be running when a test finishes and the harness wipes the database -
 * the resulting "collection dropped" errors are an artefact of the teardown,
 * not a defect, and printing them buries the real assertion failures.
 */
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

/**
 * Deliberately small. A file/transport logger such as winston is nice to have
 * but it is one more dependency, and stdout is what every free host reads
 * anyway. Structured extras are printed as JSON so they stay greppable.
 */
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

/* One thin wrapper per level. Exported individually so callers can either
   `import * as logger` and keep logger.info(), or pull in just what they use. */
export const error = (message, meta) => write('error', message, meta);
export const warn = (message, meta) => write('warn', message, meta);
export const info = (message, meta) => write('info', message, meta);
export const debug = (message, meta) => write('debug', message, meta);
