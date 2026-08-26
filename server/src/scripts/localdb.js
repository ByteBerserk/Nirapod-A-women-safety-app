/**
 * Starts a real MongoDB on 127.0.0.1:27017 using the binary that
 * mongodb-memory-server already downloaded for the test suite.
 *
 *   npm --prefix server run db:local
 *
 * This exists because Atlas is not always reachable - a paused free cluster, a
 * changed home IP, a network that blocks it - and none of that should stop you
 * running the app. Unlike the test database this one keeps its data on disk, so
 * `npm run seed` and anything you create survive a restart.
 *
 * Leave it running in its own terminal and point MONGO_URI at
 * mongodb://127.0.0.1:27017/nirapod.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

import { fileURLToPath as __toPath } from 'url';
import { dirname as __toDir } from 'path';

// import.meta.dirname exists in Node 20.11+ but is not populated by every
// ESM runtime (Jest, notably), so derive it the portable way.
const __dirname = __toDir(__toPath(import.meta.url));

const PORT = Number(process.argv[2]) || 27017;
const dataDir = path.join(__dirname, '..', '..', '.local-mongo', 'data');

/** The cache layout mongodb-memory-server uses, newest binary wins. */
function findBinary() {
  const roots = [
    path.join(os.homedir(), '.cache', 'mongodb-binaries'),
    path.join(__dirname, '..', '..', 'node_modules', '.cache', 'mongodb-binaries'),
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    const found = fs
      .readdirSync(root)
      .filter((name) => name.startsWith('mongod'))
      .sort()
      .reverse();

    if (found.length) return path.join(root, found[0]);
  }
  return null;
}

const binary = findBinary();

if (!binary) {
  console.error('');
  console.error('  No cached MongoDB binary found.');
  console.error('  Run the test suite once to download it:  npm --prefix server test');
  console.error('');
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });

console.log('');
console.log('  Local MongoDB');
console.log('  -------------');
console.log('  binary : ' + binary);
console.log('  data   : ' + dataDir);
console.log('  uri    : mongodb://127.0.0.1:' + PORT + '/nirapod');
console.log('');
console.log('  Set that as MONGO_URI in server/.env, then run the app in another');
console.log('  terminal. Press Ctrl+C here to stop the database.');
console.log('');

const child = spawn(binary, ['--dbpath', dataDir, '--port', String(PORT), '--bind_ip', '127.0.0.1'], {
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('  Could not start MongoDB: ' + error.message);
  process.exit(1);
});

child.on('exit', (code) => process.exit(code === null ? 0 : code));

// Ctrl+C should stop the database cleanly rather than orphaning the process.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
