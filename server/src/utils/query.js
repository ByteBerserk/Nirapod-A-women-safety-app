import { LIMITS } from '../config/constants.js';

function getPagination(query = {}, defaultLimit = LIMITS.DEFAULT_PAGE_SIZE) {
  const parsedPage = Number.parseInt(query.page, 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;

  const parsedLimit = Number.parseInt(query.limit, 10);
  const requested = Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit;
  const limit = Math.min(LIMITS.MAX_PAGE_SIZE, Math.max(1, requested));

  return { page, limit, skip: (page - 1) * limit };
}

function getSort(sortParam, allowed, fallback = '-createdAt') {
  if (typeof sortParam !== 'string' || !sortParam.trim()) return fallback;

  const parts = sortParam
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => allowed.includes(part.replace(/^-/, '')));

  return parts.length ? parts.join(' ') : fallback;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordFilter(term, fields) {
  const trimmed = String(term || '').trim();
  if (!trimmed) return null;

  const rx = new RegExp(escapeRegex(trimmed), 'i');
  return fields.length === 1 ? { [fields[0]]: rx } : { $or: fields.map((f) => ({ [f]: rx })) };
}

function dateRangeFilter(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {

      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) d.setUTCHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : null;
}

function parseEnumList(value, allowed) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return [...new Set(raw.map((v) => String(v).trim()).filter((v) => allowed.includes(v)))];
}

export { getPagination, getSort, keywordFilter, dateRangeFilter, parseEnumList };
