import cron from 'node-cron';
import * as logger from '../config/logger.js';
import env from '../config/env.js';
import * as mailService from '../services/mailService.js';
import * as sosService from '../services/sosService.js';
import * as checkInService from '../services/checkInService.js';
import MailJob from '../models/MailJob.js';

/**
 * Background work. node-cron rather than a hosted scheduler, because it is
 * free and runs inside the process we already have.
 */

const tasks = [];

/** Stops one tick's failure from taking the whole process down. */
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
  // Tests drive these directly rather than waiting on a schedule.
  if (!env.cronEnabled) return;

  // NFR-12: drain the outbound queue. Every minute is a good balance between
  // responsiveness and not hammering a free SMTP relay. Note that an SOS also
  // drains the queue immediately, so this is the safety net, not the main path.
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

  // Release jobs a crashed process left claimed.
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

  /*
   * FR-26. Every minute is the resolution of the whole feature: it is how
   * closely the prompt and the escalation can track the deadline the user set,
   * and a minute of slack on a five minute grace period is acceptable where an
   * hour would not be.
   */
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

  // Close SOS events nobody ever resolved.
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