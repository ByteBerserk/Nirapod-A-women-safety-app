import cron from 'node-cron';
import * as logger from '../config/logger.js';
import env from '../config/env.js';
import * as mailService from '../services/mailService.js';
import * as sosService from '../services/sosService.js';
import * as checkInService from '../services/checkInService.js';
import MailJob from '../models/MailJob.js';

const tasks = [];

function guard(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (error) {
      logger.error(`Scheduled job "${name}" failed`, error);
    }
  };
}

function startJobs() {

  if (!env.cronEnabled) return;

  tasks.push(
    cron.schedule(
      '* * * * *',
      guard('mail-queue', async () => {
        const stats = await mailService.processQueue(25);
        if (stats.processed) {
          logger.debug(`Mail queue: ${stats.sent} sent, ${stats.failed} failed`);
        }
      })
    )
  );

  tasks.push(
    cron.schedule(
      '*/5 * * * *',
      guard('mail-requeue', async () => {
        const result = await MailJob.requeueStuck();
        if (result.modifiedCount) {
          logger.warn(`Requeued ${result.modifiedCount} stuck email job(s)`);
        }
      })
    )
  );

  tasks.push(
    cron.schedule(
      '* * * * *',
      guard('safety-check-ins', async () => {
        const { prompted, escalated } = await checkInService.runDueChecks();
        if (prompted || escalated) {
          logger.debug(`Check-ins: ${prompted} prompted, ${escalated} escalated`);
        }
      })
    )
  );

  tasks.push(cron.schedule('0 * * * *', guard('sos-expiry', () => sosService.expireStale())));

  logger.info(`Started ${tasks.length} scheduled job(s)`);
}

function stopJobs() {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
}

export { startJobs, stopJobs };
