import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { resolveClientUrl } from './clientUrl.js';

import { fileURLToPath as __toPath } from 'url';
import { dirname as __toDir } from 'path';

const __dirname = __toDir(__toPath(import.meta.url));

const ENV_PATH = path.resolve(__dirname, '../../.env');

dotenv.config({ path: ENV_PATH });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function read(key, fallback) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (fallback === undefined) {
      throw new Error(
        `Missing required environment variable "${key}". ` +
          'Copy server/.env.example to server/.env and fill it in.'
      );
    }
    return fallback;
  }
  return value;
}

function readInt(key, fallback) {
  const raw = read(key, fallback === undefined ? undefined : String(fallback));
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${key}" must be an integer, got "${raw}".`);
  }
  return parsed;
}

function readBool(key, fallback) {
  const raw = read(key, fallback === undefined ? undefined : String(fallback));
  return String(raw).toLowerCase() === 'true';
}

function readList(key, fallback) {
  return read(key, fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const devSecret = (name) => (isProd ? undefined : `dev-only-insecure-${name}-secret`);

const env = {
  nodeEnv: NODE_ENV,
  isProd,
  isTest,
  isDev: NODE_ENV === 'development',

  realtimeEnabled: !isTest,
  cronEnabled: !isTest,

  port: readInt('PORT', 5000),

  mongoUri: isTest
    ? read('MONGO_URI_TEST', 'mongodb://127.0.0.1:27017/nirapod_test')
    : read('MONGO_URI', 'mongodb://127.0.0.1:27017/nirapod'),

  dnsServers: read('DNS_SERVERS', '8.8.8.8,1.1.1.1')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),

  jwt: {
    accessSecret: read('JWT_ACCESS_SECRET', devSecret('access')),
    refreshSecret: read('JWT_REFRESH_SECRET', devSecret('refresh')),
    accessExpiresIn: read('JWT_ACCESS_EXPIRES_IN', '30m'),
    refreshExpiresIn: read('JWT_REFRESH_EXPIRES_IN', '30d'),
  },

  bcryptRounds: isTest ? 4 : readInt('BCRYPT_ROUNDS', 12),

  clientUrl: resolveClientUrl(process.env),

  corsOrigins: [
    ...readList('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'),
    resolveClientUrl(process.env),
  ].filter((value, index, all) => value && all.indexOf(value) === index),

  mail: {
    transport: isTest ? 'console' : read('MAIL_TRANSPORT', 'ethereal'),
    host: read('SMTP_HOST', 'smtp.gmail.com'),
    port: readInt('SMTP_PORT', 587),
    secure: readBool('SMTP_SECURE', false),
    user: read('SMTP_USER', ''),
    pass: read('SMTP_PASS', ''),
    fromName: read('MAIL_FROM_NAME', 'Nirapod Safety'),
    fromAddress: read('MAIL_FROM_ADDRESS', 'no-reply@nirapod.app'),
  },

  uploads: {

    dir: path.resolve(__dirname, '../../', read('UPLOAD_DIR', 'uploads')),
    maxBytes: readInt('MAX_UPLOAD_MB', 15) * 1024 * 1024,
  },

  geo: {
    userAgent: read('GEO_USER_AGENT', 'Nirapod/1.0 (contact: admin@nirapod.app)'),
    nominatimUrl: read('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
    overpassUrl: read('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
  },

  seed: {
    adminEmail: read('SEED_ADMIN_EMAIL', 'admin@nirapod.app'),
    adminPassword: read('SEED_ADMIN_PASSWORD', 'Admin@12345'),
  },
};

if (isProd) {
  const weak = ['replace-me', 'dev-only-insecure'];
  for (const [label, secret] of [
    ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
    ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
  ]) {
    if (weak.some((w) => secret.includes(w)) || secret.length < 32) {
      throw new Error(`${label} is too weak for production. Use at least 32 random characters.`);
    }
  }
  if (env.jwt.accessSecret === env.jwt.refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
}

if (!isProd && !isTest) {
  const followTunnel = setInterval(() => {
    const next = resolveClientUrl(process.env);
    if (next === env.clientUrl) return;

    const before = env.clientUrl;
    env.clientUrl = next;
    if (!env.corsOrigins.includes(next)) env.corsOrigins.push(next);

    console.log(`[env] client URL changed: ${before} -> ${next}`);
  }, 5000);

  followTunnel.unref?.();
}

export default env;
