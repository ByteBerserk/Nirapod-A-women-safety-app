import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

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

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function durationToMs(duration) {
  const match = /^(\d+)\s*([smhdw])$/i.exec(String(duration).trim());
  if (!match) return 0;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factors = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return value * factors[unit];
}

export { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, randomToken, hashToken, safeCompare, durationToMs };
