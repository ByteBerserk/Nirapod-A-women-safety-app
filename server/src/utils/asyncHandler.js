/**
 * Wraps an async controller so a rejected promise reaches Express' error
 * middleware. Without this every controller needs its own try/catch and one
 * forgotten catch takes the process down.
 *
 * @param {(req, res, next) => Promise<any>} fn
 * @returns {(req, res, next) => void}
 */
export default function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
