import { LIMITS } from '../config/constants.js';

/**
 * Turns `?page=&limit=` into safe numbers. A caller can never ask for page 0,
 * a negative limit, or 100000 documents in one go (NFR-1/NFR-7).
 */
function getPagination(query = {}, defaultLimit = LIMITS.DEFAULT_PAGE_SIZE) {
  const parsedPage = Number.parseInt(query.page, 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;

  // `Number.isFinite` rather than `||`, so that "limit=0" clamps to 1 like any
  // other too-small value instead of being treated as absent and silently
  // becoming the default page size.
  const parsedLimit = Number.parseInt(query.limit, 10);
  const requested = Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit;
  const limit = Math.min(LIMITS.MAX_PAGE_SIZE, Math.max(1, requested));

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Whitelisted sorting. Anything not in `allowed` falls back to the default, so
 * a user cannot sort by a field we have no index for and stall the database.
 *
 * @param {string|undefined} sortParam  e.g. "-createdAt" or "title"
 * @param {string[]} allowed            field names without the sign
 * @param {string} fallback
 */
function getSort(sortParam, allowed, fallback = '-createdAt') {
  if (typeof sortParam !== 'string' || !sortParam.trim()) return fallback;

  const parts = sortParam
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => allowed.includes(part.replace(/^-/, '')));

  return parts.length ? parts.join(' ') : fallback;
}

/**
 * Escapes user input so it can sit inside a RegExp literally. Without this a
 * search for "c++" or "(" throws, and ".*" turns into an accidental full scan.
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a case-insensitive "contains" matcher for one or more fields. */
function keywordFilter(term, fields) {
  const trimmed = String(term || '').trim();
  if (!trimmed) return null;

  const rx = new RegExp(escapeRegex(trimmed), 'i');
  return fields.length === 1 ? { [fields[0]]: rx } : { $or: fields.map((f) => ({ [f]: rx })) };
}

/** Parses `?from=&to=` into a Mongo range object, or null when both are absent. */
function dateRangeFilter(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // An inclusive end date: "to=2025-01-31" should include all of the 31st.
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) d.setUTCHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : null;
}

/** `?category=a,b` or `?category=a&category=b` -> ['a','b'], filtered to `allowed`. */
function parseEnumList(value, allowed) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(raw.map((v) => String(v).trim()).filter((v) => allowed.includes(v)))];
}

export { getPagination, getSort, keywordFilter, dateRangeFilter, parseEnumList };