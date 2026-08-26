import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Where `npm run tunnel` records the public address it opened.
 *
 * This used to be written straight into .env, which had a nasty failure mode:
 * kill the tunnel window rather than stopping it politely and the restore step
 * never ran, so .env kept a hostname that had stopped resolving. The app went
 * on cheerfully emailing tracking links to a tunnel that closed hours ago -
 * silent, and the first sign of it is a contact who cannot open the map.
 *
 * A separate runtime file fixes that, because it can be *disbelieved*. The
 * tunnel refreshes a timestamp while it runs; a reader that finds a stale one,
 * or a dead pid, ignores the file and falls back to the local address. Nothing
 * has to be cleaned up for the fallback to be correct.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** Not in .env, and gitignored - this is runtime state, not configuration. */
const TUNNEL_FILE = path.resolve(here, '../../.tunnel.json');

/**
 * How old the heartbeat may be before the tunnel is presumed gone.
 *
 * Comfortably more than the write interval, so a busy machine skipping a beat
 * does not make a perfectly good tunnel look dead.
 */
const STALE_AFTER_MS = 90 * 1000;

/** True when the process that wrote the file is still alive. */
function isRunning(pid) {
  if (!pid) return false;
  try {
    // Signal 0 tests for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else - still alive.
    return error.code === 'EPERM';
  }
}

/**
 * The public address, or null when no tunnel is currently up.
 *
 * @returns {string|null}
 */
function readTunnelUrl() {
  try {
    const raw = fs.readFileSync(TUNNEL_FILE, 'utf8');
    const { url, pid, updatedAt } = JSON.parse(raw);

    if (!url) return null;
    if (!isRunning(pid)) return null;
    if (Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS) return null;

    return url;
  } catch {
    // Missing or unreadable means no tunnel, which is the normal case.
    return null;
  }
}

function writeTunnelFile(url) {
  fs.writeFileSync(
    TUNNEL_FILE,
    `${JSON.stringify({ url, pid: process.pid, updatedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

function removeTunnelFile() {
  try {
    fs.unlinkSync(TUNNEL_FILE);
  } catch {
    /* already gone */
  }
}

export { TUNNEL_FILE, STALE_AFTER_MS, readTunnelUrl, writeTunnelFile, removeTunnelFile };
