import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

const TUNNEL_FILE = path.resolve(here, '../../.tunnel.json');

const STALE_AFTER_MS = 90 * 1000;

function isRunning(pid) {
  if (!pid) return false;
  try {

    process.kill(pid, 0);
    return true;
  } catch (error) {

    return error.code === 'EPERM';
  }
}

function readTunnelUrl() {
  try {
    const raw = fs.readFileSync(TUNNEL_FILE, 'utf8');
    const { url, pid, updatedAt } = JSON.parse(raw);

    if (!url) return null;
    if (!isRunning(pid)) return null;
    if (Date.now() - new Date(updatedAt).getTime() > STALE_AFTER_MS) return null;

    return url;
  } catch {

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

  }
}

export { TUNNEL_FILE, STALE_AFTER_MS, readTunnelUrl, writeTunnelFile, removeTunnelFile };
