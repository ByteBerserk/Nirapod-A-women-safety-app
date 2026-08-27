import mongoose from 'mongoose';
import dns from 'dns';
import env from './env.js';
import * as logger from './logger.js';

/*
 * Resolve DNS through public resolvers rather than whatever the network hands
 * out via DHCP.
 *
 * Atlas connection strings are mongodb+srv://, so connecting means an SRV
 * lookup followed by A lookups for each shard host. Some ISPs intercept that
 * second step and answer with their own addresses. The SRV record resolves,
 * the driver dials what it is told, and the TLS handshake then fails against a
 * server that is not Atlas - which surfaces as the maddeningly unhelpful
 * "tlsv1 alert internal error" rather than anything mentioning DNS.
 *
 * Pointing at Google and Cloudflare sidesteps the interception. It is a no-op
 * on networks that were behaving anyway.
 */
if (env.dnsServers.length) {
  try {
    dns.setServers(env.dnsServers);
  } catch (error) {
    logger.warn('Could not set custom DNS servers; using the system resolver.', {
      message: error.message,
    });
  }
}

// Reject queries that reference paths absent from the schema instead of
// silently dropping them - a whole class of "why did my filter do nothing"
// bugs disappears (NFR-10).
mongoose.set('strictQuery', true);

/*
 * Cached on globalThis rather than in a module variable, so a module that gets
 * re-evaluated (Jest does this per suite) reuses the pool instead of opening a
 * second one.
 */
const cache = globalThis.__nirapodMongo || (globalThis.__nirapodMongo = { connecting: null });

/**
 * Connects (once) and keeps retrying with a capped backoff. Mongoose buffers
 * commands while disconnected, so a brief Atlas hiccup does not fail requests.
 */
async function connectDatabase(uri = env.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (cache.connecting) return cache.connecting;

  const options = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 20,
    minPoolSize: 2,
    /*
     * Indexes are built once at boot by `npm run seed`, so production does not
     * pay for the check on every connect. Everywhere else Mongoose ensures
     * them, because the safety map and "incidents near me" are wrong rather
     * than merely slow without their 2dsphere indexes.
     */
    autoIndex: !env.isProd,
  };

  cache.connecting = (async () => {
    let attempt = 0;
    /* eslint-disable no-constant-condition */
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