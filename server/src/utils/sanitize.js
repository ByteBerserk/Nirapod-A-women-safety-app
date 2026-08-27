/**
 * Output-side escaping helpers. User text goes into HTML emails and is rendered
 * by React, so we escape at the point where it stops being data.
 */

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text destined for an HTML email body. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** Collapses whitespace and trims - stops "   " passing a required check. */
function normaliseText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** Trims and caps length, preserving internal line breaks (for descriptions). */
function normaliseMultiline(value, maxLength = 5000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

/**
 * Strips characters that turn a string into a path. Applied to every uploaded
 * filename so nothing can escape the uploads directory.
 */
function safeFilename(name) {
  return String(name)
    .replace(/[\\/]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w.\- ]/g, '')
    .trim()
    .slice(0, 120) || 'file';
}

/**
 * Keeps digits and a single leading "+". Phone numbers are contact metadata
 * here, never used for SMS, so we only need them to be storable and dialable.
 */
function normalisePhone(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${hasPlus ? '+' : ''}${digits}` : '';
}

function normaliseEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Picks only the listed keys from an object, skipping undefined values. */
function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

export { escapeHtml, normaliseText, normaliseMultiline, safeFilename, normalisePhone, normaliseEmail, pick };