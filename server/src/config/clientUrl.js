import os from 'os';
import { readTunnelUrl } from './tunnelFile.js';

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

function detectLanAddress() {
  const candidates = [];

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      candidates.push(address.address);
    }
  }

  const preferred = candidates.find((ip) => /^(192\.168\.|10\.)/.test(ip));
  return preferred || candidates[0] || null;
}

function resolveClientUrl(
  source = {},
  lanAddress = detectLanAddress(),
  tunnelUrl = readTunnelUrl()
) {
  const configured = stripTrailingSlash(source.CLIENT_URL || '');

  if (tunnelUrl) return stripTrailingSlash(tunnelUrl);

  if (configured && !LOOPBACK.test(configured)) return configured;

  if (lanAddress) {
    const port = configured.match(/:(\d+)/)?.[1] || '5173';
    return `http://${lanAddress}:${port}`;
  }

  return configured || 'http://localhost:5173';
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

export { resolveClientUrl };
