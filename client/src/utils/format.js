export function timeAgo(value) {
  if (!value) return '';

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 90) return 'a minute ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;

  return formatDate(value);
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '-';

  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return 'less than a minute';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function colourFromString(value) {
  let hash = 0;
  for (let i = 0; i < String(value).length; i += 1) {
    hash = String(value).charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 46%, 46%)`;
}

export const CATEGORY_ICONS = {
  harassment: '\u{1F6AB}',
  stalking: '\u{1F441}',
  theft: '\u{1F45C}',
  robbery: '\u{1F6A8}',
  assault: '\u{26A0}',
  'domestic-violence': '\u{1F3E0}',
  'suspicious-person': '\u{1F464}',
  'unsafe-area': '\u{1F311}',
  other: '\u{1F4CD}',
};

export const SEVERITY_STYLE = {
  low: { label: 'Low', className: 'badge-info' },
  medium: { label: 'Medium', className: 'badge-warning' },
  high: { label: 'High', className: 'badge-danger' },
  critical: { label: 'Critical', className: 'badge-danger' },
};

export const STATUS_STYLE = {
  pending: { label: 'Awaiting review', className: 'badge' },
  verified: { label: 'Verified', className: 'badge-success' },
  rejected: { label: 'Rejected', className: 'badge-danger' },
  removed: { label: 'Removed', className: 'badge-danger' },
};
