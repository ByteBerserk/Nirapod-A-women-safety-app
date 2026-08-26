import * as logger from '../config/logger.js';

/**
 * Runs work that must finish, but that the caller should not wait for.
 *
 * The process outlives the request, so a dangling promise simply resolves in
 * its own time - no bookkeeping needed. What this adds is the catch: an
 * unhandled rejection in detached work would otherwise take the process down,
 * and the SOS fan-out runs through here.
 *
 * The work is still durable if the process dies mid-flight, because everything
 * that matters goes through the MailJob queue rather than living only in this
 * promise (NFR-3).
 */

/**
 * @param {Promise<unknown>} promise  work to finish in the background
 * @param {string} label              used only for the error log
 */
function runInBackground(promise, label = 'background task') {
  if (!promise || typeof promise.then !== 'function') return;

  // Deliberately not awaited.
  Promise.resolve(promise).catch((error) => {
    logger.error(`${label} failed`, { message: error?.message });
  });
}

export { runInBackground };
