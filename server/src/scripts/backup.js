import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import * as logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

import '../models/User.js';
import '../models/EmergencyContact.js';
import '../models/SosEvent.js';
import '../models/Incident.js';
import '../models/Comment.js';
import '../models/ContentReport.js';
import '../models/SafetyGroup.js';
import '../models/GroupMessage.js';
import '../models/SafePlace.js';
import '../models/SafePlaceEvent.js';
import '../models/Resource.js';
import '../models/Bookmark.js';
import '../models/Feedback.js';
import '../models/Notification.js';
import '../models/AuditLog.js';
import '../models/MailJob.js';

import { fileURLToPath as __toPath } from 'url';
import { dirname as __toDir } from 'path';

const __dirname = __toDir(__toPath(import.meta.url));
const BACKUP_ROOT = path.resolve(__dirname, '../../../backups');

const SKIP = new Set(['mailjobs', 'notifications']);

async function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(target, { recursive: true });

  const summary = {};

  for (const [name, model] of Object.entries(mongoose.models)) {
    const collection = model.collection.collectionName;
    if (SKIP.has(collection)) continue;

    const docs = await model.find({}).lean();
    fs.writeFileSync(
      path.join(target, `${collection}.json`),
      JSON.stringify(docs, null, 2),
      'utf8'
    );

    summary[collection] = docs.length;
    logger.info(`  ${collection}: ${docs.length} document(s)`);
  }

  fs.writeFileSync(
    path.join(target, '_manifest.json'),
    JSON.stringify(
      { createdAt: new Date().toISOString(), database: mongoose.connection.name, summary },
      null,
      2
    ),
    'utf8'
  );

  logger.info(`Backup written to ${target}`);
  return target;
}

async function restore(folder) {
  const source = path.resolve(folder);
  if (!fs.existsSync(source)) throw new Error(`No backup folder at ${source}`);

  const byCollection = new Map();
  for (const model of Object.values(mongoose.models)) {
    byCollection.set(model.collection.collectionName, model);
  }

  for (const file of fs.readdirSync(source)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;

    const collection = file.replace(/\.json$/, '');
    const model = byCollection.get(collection);
    if (!model) {
      logger.warn(`Skipping ${file}: no model is registered for that collection.`);
      continue;
    }

    const docs = JSON.parse(fs.readFileSync(path.join(source, file), 'utf8'));
    if (!docs.length) continue;

    await model.bulkWrite(
      docs.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      })),
      { ordered: false }
    );

    logger.info(`  ${collection}: ${docs.length} document(s) restored`);
  }

  logger.info('Restore complete.');
}

async function run() {
  const restoreIndex = process.argv.indexOf('--restore');

  await connectDatabase();

  if (restoreIndex !== -1) {
    const folder = process.argv[restoreIndex + 1];
    if (!folder) throw new Error('Usage: node src/scripts/backup.js --restore <folder>');
    await restore(folder);
  } else {
    await backup();
  }

  await disconnectDatabase();
  process.exit(0);
}

run().catch(async (error) => {
  logger.error('Backup script failed', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
