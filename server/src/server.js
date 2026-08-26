import http from 'http';
import env from './config/env.js';
import * as logger from './config/logger.js';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSockets } from './sockets/index.js';
import { startJobs, stopJobs } from './jobs/index.js';
import * as mailService from './services/mailService.js';

/**
 * Process entry point: connect, listen, and shut down cleanly.
 *
 * NFR-2 asks for 24/7 availability. That is mostly a hosting question, but the
 * part this file owns is not losing in-flight work on a deploy: on SIGTERM we
 * stop accepting new connections, let the open ones finish, then close the
 * database.
 */

let server;
let shuttingDown = false;

async function start() {
  try {
    await connectDatabase();
  } catch (error) {
    logger.error('Could not reach MongoDB. The API cannot start.', error);
    logger.error(
      'Check MONGO_URI in server/.env. For a free database, create an M0 cluster at ' +
        'https://www.mongodb.com/cloud/atlas/register and allow your IP address.'
    );
    process.exit(1);
  }

  server = http.createServer(app);
  initSockets(server);
  startJobs();

  // Verified but not awaited: a wrong SMTP password should show up as a
  // warning in the log, not stop the SOS button from existing.
  mailService
    .verifyTransport()
    .then((info) => logger.info(`Email transport ready (${info.transport})`))
    .catch((error) =>
      logger.warn('Email transport could not be verified. Alerts will be queued and retried.', {
        message: error.message,
      })
    );

  server.listen(env.port, () => {
    logger.info(`Nirapod API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
    logger.info(`Client origin: ${env.clientUrl}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${env.port} is already in use. Set PORT in server/.env to something else.`);
      process.exit(1);
    }
    logger.error('HTTP server error', error);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} received. Shutting down.`);
  stopJobs();

  // Anything still running after 10 seconds is not going to finish.
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed');
    }
    await mailService.closeTransport();
    await disconnectDatabase();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/*
 * A rejection nobody handled means state is unknown. Log it loudly and restart
 * rather than carrying on in a half-broken state - the host will bring the
 * process back.
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason : { reason });
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

start();
