import * as logger from '../config/logger.js';

function runInBackground(promise, label = 'background task') {
  if (!promise || typeof promise.then !== 'function') return;

  Promise.resolve(promise).catch((error) => {
    logger.error(`${label} failed`, { message: error?.message });
  });
}

export { runInBackground };
