import * as geo from '../src/utils/geo.js';
import * as query from '../src/utils/query.js';
import * as sanitize from '../src/utils/sanitize.js';
import * as tokens from '../src/utils/tokens.js';
import TtlCache from '../src/services/cache.js';
import MailJob from '../src/models/MailJob.js';
import * as templates from '../src/views/emails/templates.js';
import * as userView from '../src/views/userView.js';
import { MAIL_STATUS } from '../src/config/constants.js';
import { resolveClientUrl } from '../src/config/clientUrl.js';

describe('geo helpers', () => {
  it('measures a known distance', () => {

    const distance = geo.distanceInMeters(
      { lat: 23.8103, lng: 90.4125 },
      { lat: 22.3569, lng: 91.7832 }
    );
    expect(distance).toBeGreaterThan(200000);
    expect(distance).toBeLessThan(230000);
  });

  it('returns zero for the same point', () => {
    const point = { lat: 23.8103, lng: 90.4125 };
    expect(geo.distanceInMeters(point, point)).toBeCloseTo(0, 5);
  });

  it('handles the antimeridian without going the long way round', () => {
    const distance = geo.distanceInMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });

    expect(distance).toBeLessThan(30000);
  });

  it('accepts the several spellings of longitude', () => {
    expect(geo.parseCoordinates({ lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(geo.parseCoordinates({ lat: 1, lon: 2 })).toEqual({ lat: 1, lng: 2 });
    expect(geo.parseCoordinates({ latitude: 1, longitude: 2 })).toEqual({ lat: 1, lng: 2 });

    expect(geo.parseCoordinates({ lat: '1.5', lng: '2.5' })).toEqual({ lat: 1.5, lng: 2.5 });
  });

  it('rejects out-of-range and missing coordinates', () => {
    expect(geo.parseCoordinates({ lat: 91, lng: 0 })).toBeNull();
    expect(geo.parseCoordinates({ lat: 0, lng: 181 })).toBeNull();
    expect(geo.parseCoordinates({ lat: 'north', lng: 0 })).toBeNull();
    expect(geo.parseCoordinates(null)).toBeNull();
    expect(geo.parseCoordinates({})).toBeNull();
  });

  it('treats zero as a valid coordinate rather than as missing', () => {
    expect(geo.parseCoordinates({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 });
  });

  it('builds GeoJSON in longitude-latitude order', () => {
    expect(geo.toGeoJSONPoint(23.8, 90.4)).toEqual({ type: 'Point', coordinates: [90.4, 23.8] });
  });

  it('does not divide by zero at the pole', () => {
    const box = geo.boundingBox({ lat: 90, lng: 0 }, 1000);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });

  it('formats distances the way a person would say them', () => {
    expect(geo.formatDistance(430)).toBe('430 m');
    expect(geo.formatDistance(3400)).toBe('3.4 km');
    expect(geo.formatDistance(24000)).toBe('24 km');
  });
});

describe('query helpers', () => {
  it('clamps pagination to safe values', () => {
    expect(query.getPagination({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
    expect(query.getPagination({ page: '-5' }).page).toBe(1);
    expect(query.getPagination({ limit: '99999' }).limit).toBe(100);
    expect(query.getPagination({ limit: '0' }).limit).toBe(1);
    expect(query.getPagination({ page: 'abc' }).page).toBe(1);
  });

  it('only allows sorting by whitelisted fields', () => {
    expect(query.getSort('-createdAt', ['createdAt'])).toBe('-createdAt');
    expect(query.getSort('password', ['createdAt'])).toBe('-createdAt');
    expect(query.getSort(undefined, ['createdAt'])).toBe('-createdAt');
  });

  it('escapes regex metacharacters in a search term', () => {
    const filter = query.keywordFilter('c++ (test)', ['title']);

    expect(() => new RegExp(filter.title)).not.toThrow();
    expect(filter.title.test('C++ (test) results')).toBe(true);
  });

  it('does not turn ".*" into a full scan', () => {
    const filter = query.keywordFilter('.*', ['title']);
    expect(filter.title.test('anything at all')).toBe(false);
    expect(filter.title.test('literally .* here')).toBe(true);
  });

  it('returns null for an empty search term', () => {
    expect(query.keywordFilter('   ', ['title'])).toBeNull();
  });

  it('makes a date-only "to" bound inclusive', () => {
    const range = query.dateRangeFilter(undefined, '2026-01-31');
    expect(range.$lte.toISOString()).toContain('2026-01-31T23:59:59');
  });

  it('drops values not in the allowed enum', () => {
    expect(query.parseEnumList('theft,aliens,assault', ['theft', 'assault'])).toEqual([
      'theft',
      'assault',
    ]);
    expect(query.parseEnumList(undefined, ['theft'])).toEqual([]);
  });
});

describe('sanitize helpers', () => {
  it('escapes HTML so email bodies cannot be injected', () => {
    expect(sanitize.escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(sanitize.escapeHtml('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;');
  });

  it('strips path separators from a filename', () => {
    expect(sanitize.safeFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitize.safeFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitize.safeFilename('')).toBe('file');
  });

  it('normalises phone numbers without losing the plus', () => {
    expect(sanitize.normalisePhone('+880 171-111 1111')).toBe('+8801711111111');
    expect(sanitize.normalisePhone('(017) 1111 1111')).toBe('01711111111');
    expect(sanitize.normalisePhone('not a number')).toBe('');
  });

  it('collapses whitespace so a field of spaces is not "filled in"', () => {
    expect(sanitize.normaliseText('  hello   world  ')).toBe('hello world');
    expect(sanitize.normaliseText('     ')).toBe('');
  });
});

describe('token helpers', () => {
  it('produces a different token every time', () => {
    const tokenSet = new Set(Array.from({ length: 50 }, () => tokens.randomToken(16)));
    expect(tokenSet.size).toBe(50);
  });

  it('hashes deterministically and irreversibly', () => {
    const plain = tokens.randomToken(16);
    expect(tokens.hashToken(plain)).toBe(tokens.hashToken(plain));
    expect(tokens.hashToken(plain)).not.toBe(plain);
    expect(tokens.hashToken(plain)).toHaveLength(64);
  });

  it('compares in constant time without throwing on length mismatch', () => {
    expect(tokens.safeCompare('abc', 'abc')).toBe(true);
    expect(tokens.safeCompare('abc', 'abd')).toBe(false);
    expect(tokens.safeCompare('abc', 'much longer string')).toBe(false);
  });

  it('parses duration strings', () => {
    expect(tokens.durationToMs('30m')).toBe(1800000);
    expect(tokens.durationToMs('1h')).toBe(3600000);
    expect(tokens.durationToMs('30d')).toBe(2592000000);
    expect(tokens.durationToMs('nonsense')).toBe(0);
  });
});

describe('TTL cache', () => {
  it('stores and returns a value', () => {
    const cache = new TtlCache();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('forgets an expired entry', async () => {
    const cache = new TtlCache({ defaultTtlMs: 20 });
    cache.set('key', 'value');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(cache.get('key')).toBeUndefined();
  });

  it('evicts the least recently used entry when full', () => {
    const cache = new TtlCache({ maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});

describe('mail retry backoff (NFR-12)', () => {
  it('grows the delay with each attempt', () => {
    const job = new MailJob({ kind: 'test', to: 'a@b.com', subject: 's', html: 'h' });

    job.scheduleRetry('first failure');
    const firstDelay = job.nextAttemptAt.getTime() - Date.now();

    job.scheduleRetry('second failure');
    const secondDelay = job.nextAttemptAt.getTime() - Date.now();

    expect(job.attempts).toBe(2);
    expect(secondDelay).toBeGreaterThan(firstDelay);
    expect(job.status).toBe(MAIL_STATUS.QUEUED);
  });

  it('gives up after the maximum number of attempts', () => {
    const job = new MailJob({
      kind: 'test',
      to: 'a@b.com',
      subject: 's',
      html: 'h',
      maxAttempts: 3,
    });

    job.scheduleRetry('one');
    job.scheduleRetry('two');
    job.scheduleRetry('three');

    expect(job.status).toBe(MAIL_STATUS.ABANDONED);
    expect(job.nextAttemptAt).toBeNull();
  });

  it('caps the delay rather than growing forever', () => {
    const job = new MailJob({
      kind: 'test',
      to: 'a@b.com',
      subject: 's',
      html: 'h',
      maxAttempts: 20,
    });

    for (let i = 0; i < 15; i += 1) job.scheduleRetry('failure');

    const delay = job.nextAttemptAt.getTime() - Date.now();
    expect(delay).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);
  });

  it('truncates a huge error message instead of storing it whole', () => {
    const job = new MailJob({ kind: 'test', to: 'a@b.com', subject: 's', html: 'h' });
    job.scheduleRetry('x'.repeat(5000));
    expect(job.lastError.length).toBeLessThanOrEqual(500);
  });
});

describe('email templates', () => {
  const user = {
    name: 'Ayesha Rahman',
    phone: '+8801711111111',
    bloodGroup: 'O+',
    medicalInfo: 'Peanut allergy',
  };

  it('puts everything a responder needs into the SOS alert', () => {
    const mail = templates.sosAlert({
      contactName: 'Mother',
      user,
      location: { lat: 23.8103, lng: 90.4125 },
      address: 'Dhanmondi, Dhaka',
      message: 'Being followed',
      trackingUrl: 'https://nirapod.app/track/abc123',
      startedAt: new Date(),
    });

    expect(mail.subject).toContain('Ayesha Rahman');
    expect(mail.html).toContain('O+');
    expect(mail.html).toContain('Peanut allergy');
    expect(mail.html).toContain('abc123');
    expect(mail.text).toContain('Peanut allergy');
    expect(mail.text).toContain('abc123');
  });

  it('escapes user text rather than rendering it as markup', () => {
    const mail = templates.sosAlert({
      contactName: 'Mother',
      user: { ...user, name: '<img src=x onerror=alert(1)>' },
      location: { lat: 23.8, lng: 90.4 },
      address: '',
      message: '<script>steal()</script>',
      trackingUrl: 'https://nirapod.app/track/abc',
      startedAt: new Date(),
    });

    expect(mail.html).not.toContain('<script>steal()');
    expect(mail.html).not.toContain('onerror=alert(1)>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('says so plainly when there is no location', () => {
    const mail = templates.sosAlert({
      contactName: 'Mother',
      user,
      location: null,
      address: '',
      message: '',
      trackingUrl: 'https://nirapod.app/track/abc',
      startedAt: new Date(),
    });

    expect(mail.html).toContain('could not be read');
    expect(mail.text).toContain('not available');
  });
});

describe('view presenters (NFR-5)', () => {
  const record = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Ayesha Rahman',
    username: 'ayesha',
    email: 'ayesha@example.com',
    phone: '+8801711111111',
    medicalInfo: 'Asthma',
    bloodGroup: 'B+',
    password: '$2a$12$hashedvalue',
    role: 'user',
    accountStatus: 'active',
  };

  it('never leaks the password hash, even from the self view', () => {
    expect(JSON.stringify(userView.self(record))).not.toContain('$2a$');
  });

  it('keeps contact and medical details out of the public profile', () => {
    const publicProfile = userView.publicProfile(record);

    expect(publicProfile.email).toBeUndefined();
    expect(publicProfile.phone).toBeUndefined();
    expect(publicProfile.medicalInfo).toBeUndefined();
    expect(publicProfile.name).toBe('Ayesha Rahman');
  });

  it('collapses an anonymous author to a placeholder', () => {
    const anonymous = userView.author(record, true);

    expect(anonymous.name).toBe('Anonymous');
    expect(anonymous.id).toBeNull();
    expect(JSON.stringify(anonymous)).not.toContain('ayesha');
  });

  it('handles a deleted author without throwing', () => {
    expect(userView.author(null, false).name).toBe('Deleted user');
  });
});

describe('Client URL resolution', () => {

  const LAN = '192.168.0.187';

  it('honours a real host exactly as configured', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'https://nirapod.app' }, LAN, null)).toBe(
      'https://nirapod.app'
    );
  });

  it('trims a trailing slash so links do not end up with a double slash', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'https://nirapod.app/' }, LAN, null)).toBe(
      'https://nirapod.app'
    );
  });

  it('rewrites a loopback address to this machine on the network', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'http://localhost:5173' }, LAN, null)).toBe(
      `http://${LAN}:5173`
    );
    expect(resolveClientUrl({ CLIENT_URL: 'http://127.0.0.1:5173' }, LAN, null)).toBe(
      `http://${LAN}:5173`
    );
  });

  it('keeps the configured port when it rewrites the host', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'http://localhost:4000' }, LAN, null)).toBe(
      `http://${LAN}:4000`
    );
  });

  it('uses the network address when nothing is configured at all', () => {
    expect(resolveClientUrl({}, LAN, null)).toBe(`http://${LAN}:5173`);
  });

  it('falls back to localhost when the machine is not on a network', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'http://localhost:5173' }, null, null)).toBe(
      'http://localhost:5173'
    );
    expect(resolveClientUrl({}, null, null)).toBe('http://localhost:5173');
  });

  it('prefers a live tunnel over everything else', () => {
    expect(
      resolveClientUrl({ CLIENT_URL: 'https://nirapod.app' }, LAN, 'https://x.trycloudflare.com')
    ).toBe('https://x.trycloudflare.com');
  });

  it('ignores the tunnel once it has gone, and falls back', () => {
    expect(resolveClientUrl({ CLIENT_URL: 'http://localhost:5173' }, LAN, null)).toBe(
      `http://${LAN}:5173`
    );
  });

  it('trims a trailing slash from the tunnel address too', () => {
    expect(resolveClientUrl({}, LAN, 'https://x.trycloudflare.com/')).toBe(
      'https://x.trycloudflare.com'
    );
  });
});
