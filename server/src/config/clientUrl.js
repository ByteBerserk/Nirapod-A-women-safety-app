import os from 'os';
import { readTunnelUrl } from './tunnelFile.js';

/**
 * Works out the public origin of the client.
 *
 * Kept as a pure function, separate from config/env.js, because env.js reads
 * process.env once at require time and is therefore impossible to test across
 * scenarios in a single process. Getting this wrong is not a loud failure: the
 * app runs perfectly and every password reset and SOS tracking link quietly
 * points somewhere useless.
 */

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

/**
 * This machine's address on the local network, e.g. "192.168.0.187".
 *
 * Link-local addresses (169.254.x.x) are what Windows assigns to an adapter
 * that never got a DHCP lease - a disconnected Ethernet port, usually - and
 * are no use to anyone, so they are skipped in favour of a real one.
 *
 * @returns {string|null}
 */
function detectLanAddress() {
  const candidates = [];

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      candidates.push(address.address);
    }
  }

  // Prefer the usual home/office ranges over anything exotic.
  const preferred = candidates.find((ip) => /^(192\.168\.|10\.)/.test(ip));
  return preferred || candidates[0] || null;
}

/**
 * @param {NodeJS.ProcessEnv} source     usually process.env
 * @param {string|null} [lanAddress]     injectable for tests
 * @param {string|null} [tunnelUrl]      injectable for tests
 * @returns {string} an origin with no trailing slash
 */
function resolveClientUrl(
  source = {},
  lanAddress = detectLanAddress(),
  tunnelUrl = readTunnelUrl()
) {
  const configured = stripTrailingSlash(source.CLIENT_URL || '');

  /*
   * A live tunnel wins, because it is the only address that works from a phone
   * on mobile data - which is where an emergency contact actually is. It is
   * checked before CLIENT_URL rather than after so that starting a tunnel takes
   * effect without anyone having to edit configuration, and checked for
   * liveness so a tunnel that has stopped simply stops being used.
   */
  if (tunnelUrl) return stripTrailingSlash(tunnelUrl);

  // Anything that is not a loopback address is taken at face value.
  if (configured && !LOOPBACK.test(configured)) return configured;

  /*
   * A loopback address is rewritten to this machine's address on the network.
   *
   * Emails are the one thing here that leave this computer. "localhost" in a
   * tracking link means the recipient's own device, so an emergency contact
   * opening the alert on their phone gets a connection error instead of a map
   * - which is the single worst way for this application to fail. The port the
   * client is served on is kept; only the host changes.
   */
  if (lanAddress) {
    const port = configured.match(/:(\d+)/)?.[1] || '5173';
    return `http://${lanAddress}:${port}`;
  }

  // No network at all. Keep whatever was configured so nothing else breaks.
  return configured || 'http://localhost:5173';
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

export { resolveClientUrl };
