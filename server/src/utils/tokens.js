import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

/**
 * Signs the short-lived access token. `tokenVersion` is copied from the user
 * document; bumping it on the user invalidates every token already issued,
 * which is how "log out everywhere" and suspension take effect immediately.
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, tv: user.tokenVersion || 0 },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn, issuer: 'nirapod', audience: 'nirapod-client' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), tv: user.tokenVersion || 0, typ: 'refresh' },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn, issuer: 'nirapod', audience: 'nirapod-client' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, {
    issuer: 'nirapod',
    audience: 'nirapod-client',
  });
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwt.refreshSecret, {
    issuer: 'nirapod',
    audience: 'nirapod-client',
  });
  if (payload.typ !== 'refresh') {
    throw new jwt.JsonWebTokenError('Not a refresh token');
  }
  return payload;
}

/**
 * A URL-safe random string. Used for password reset tokens, SOS tracking links
 * and group invite codes.
 */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * We store only the hash of long-lived tokens, so a database leak does not hand
 * an attacker working reset links or live tracking URLs (NFR-4).
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Constant-time compare that tolerates different lengths. */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Converts "30d" / "12h" / "45m" / "90s" into milliseconds. */
function durationToMs(duration) {
  const match = /^(\d+)\s*([smhdw])$/i.exec(String(duration).trim());
  if (!match) return 0;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factors = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return value * factors[unit];
}

export { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, randomToken, hashToken, safeCompare, durationToMs };