process.env.NODE_ENV = 'test';
process.env.MAIL_TRANSPORT = 'console';

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * An in-memory MongoDB per test run. Real Mongo semantics - indexes, unique
 * constraints, geo queries - without needing a server installed, and the whole
 * thing disappears when the run ends.
 */

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  await mongoose.connect(mongoServer.getUri('nirapod_test'));

  // Unique and 2dsphere indexes must actually exist, or tests that rely on
  // duplicate rejection would pass for the wrong reason.
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

/** Each test starts from an empty database so order never matters. */
afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});
