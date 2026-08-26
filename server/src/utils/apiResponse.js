/**
 * One envelope for every successful response so the client never has to guess
 * where the payload lives:
 *
 *   { success: true, message?, data?, meta? }
 */

function ok(res, data, message, meta) {
  return send(res, 200, data, message, meta);
}

function created(res, data, message = 'Created successfully.') {
  return send(res, 201, data, message);
}

function noContent(res) {
  return res.status(204).end();
}

function send(res, statusCode, data, message, meta) {
  const body = { success: true };
  if (message) body.message = message;
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * Builds the `meta` block for a paginated list.
 *
 * @param {{page:number,limit:number}} pagination
 * @param {number} total  Total documents matching the filter.
 */
function paginationMeta({ page, limit }, total) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export { ok, created, noContent, send, paginationMeta };