import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeTunnelFile, removeTunnelFile, TUNNEL_FILE } from '../config/tunnelFile.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '../..');

const CLOUDFLARED = path.join(serverRoot, '.tools', 'cloudflared.exe');

const LOCAL_TARGET = 'http://127.0.0.1:5173';
const URL_PATTERN = /https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

const HEARTBEAT_MS = 30 * 1000;

function banner(publicUrl) {
  const line = '='.repeat(64);
  console.log(`\n${line}`);
  console.log('  Nirapod is now reachable from anywhere at:\n');
  console.log(`      ${publicUrl}\n`);
  console.log('  SOS tracking links emailed from now on use this address, so a');
  console.log('  contact can open them on mobile data or any other network.');
  console.log('\n  Leave this window open. Closing it takes the address down,');
  console.log('  and the app goes back to using the local network address.');
  console.log(`${line}\n`);
}

function main() {
  if (!fs.existsSync(CLOUDFLARED)) {
    console.error(`\ncloudflared is missing: ${CLOUDFLARED}`);
    console.error('Download the standalone binary into server/.tools/ and retry.\n');
    process.exit(1);
  }

  let publicUrl = null;
  let heartbeat = null;

  const child = spawn(CLOUDFLARED, ['tunnel', '--url', LOCAL_TARGET, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const onOutput = (chunk) => {
    const line = String(chunk);

    if (!publicUrl) {
      const found = line.match(URL_PATTERN);
      if (found) {
        [publicUrl] = found;

        writeTunnelFile(publicUrl);
        banner(publicUrl);
        console.log(`  Published to ${path.relative(process.cwd(), TUNNEL_FILE)}`);
        console.log('  The API picks it up within a few seconds - no restart needed.\n');

        heartbeat = setInterval(() => writeTunnelFile(publicUrl), HEARTBEAT_MS);
        heartbeat.unref?.();
      }
    }

    if (/ERR|error|failed/i.test(line)) process.stderr.write(line);
  };

  child.stdout.on('data', onOutput);
  child.stderr.on('data', onOutput);

  const shutDown = () => {
    if (heartbeat) clearInterval(heartbeat);
    removeTunnelFile();
  };

  child.on('exit', (code) => {
    shutDown();
    if (publicUrl) console.log('\nTunnel closed. Links now use the local network address again.');
    process.exit(code ?? 0);
  });

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      child.kill();
      shutDown();
      process.exit(0);
    });
  }

  console.log('Opening a public tunnel to the app, one moment...');
}

main();
