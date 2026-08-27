import mongoose from 'mongoose';
import dns from 'dns';
import env from './env.js';
import * as logger from './logger.js';

if (env.dnsServers.length) {
  try {
    dns.setServers(env.dnsServers);
  } catch (error) {
    logger.warn('Could not set custom DNS servers; using the system resolver.', {
      message: error.message,
    });
  }
}

mongoose.set('strictQuery', true);

const cache = globalThis.__nirapodMongo || (globalThis.__nirapodMongo = { connecting: null });

async function connectDatabase(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (cache.connecting) return cache.connecting;

  const options = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 2,

    autoIndex: !env.isProd,
  };

  cache.connecting = (async () => {
    let attempt = 0;

    while (true) {
      try {
        await mongoose.connect(uri, options);
        logger.info('MongoDB connected', { host: mongoose.connection.host });
        return mongoose.connection;
      } catch (error) {
        attempt += 1;
        if (env.isTest || attempt >= 5) {
          cache.connecting = null;
          throw error;
        }
        const waitMs = Math.min(30000, 1000 * 2 ** attempt);
        logger.warn(`MongoDB connection failed (attempt ${attempt}). Retrying in ${waitMs}ms.`, {
          message: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  })();

  return cache.connecting;
}

mongoose.connection.on('disconnected', () => {
  if (!env.isTest) logger.warn('MongoDB disconnected');
});
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (error) => logger.error('MongoDB error', error));

async function disconnectDatabase() {
  cache.connecting = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(false);
    logger.info('MongoDB connection closed');
  }
}

export { connectDatabase, disconnectDatabase, mongoose };
