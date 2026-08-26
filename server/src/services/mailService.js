import nodemailer from 'nodemailer';
import env from '../config/env.js';
import * as logger from '../config/logger.js';
import MailJob from '../models/MailJob.js';
import SosEvent from '../models/SosEvent.js';
import { MAIL_STATUS } from '../config/constants.js';

/**
 * Outbound email. Nothing calls the SMTP server directly - callers `enqueue()`
 * and a worker drains the queue. That is what makes NFR-12 ("retry failed
 * deliveries") true rather than aspirational: if the process dies between the
 * SOS being raised and the mail going out, the job is still in the database.
 */

let transporter = null;
let transporterPromise = null;

/** Ethereal creates a throwaway inbox on demand, so dev needs no credentials. */
async function buildTransport() {
  switch (env.mail.transport) {
    case 'console':
      return nodemailer.createTransport({ jsonTransport: true });

    case 'ethereal': {
      const account = await nodemailer.createTestAccount();
      logger.info('Using Ethereal for email. Messages are captured, not delivered.', {
        user: account.user,
      });
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    }

    case 'smtp':
    default:
      if (!env.mail.user || !env.mail.pass) {
        logger.warn(
          'MAIL_TRANSPORT=smtp but SMTP_USER/SMTP_PASS are empty. Falling back to console output.'
        );
        return nodemailer.createTransport({ jsonTransport: true });
      }
      return nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure, // true for 465, false for 587 (STARTTLS)
        auth: { user: env.mail.user, pass: env.mail.pass },
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
      });
  }
}

/** Lazily built and memoised, so a bad SMTP config does not stop the API booting. */
async function getTransporter() {
  if (transporter) return transporter;
  if (!transporterPromise) {
    transporterPromise = buildTransport()
      .then((t) => {
        transporter = t;
        return t;
      })
      .catch((error) => {
        transporterPromise = null;
        throw error;
      });
  }
  return transporterPromise;
}

function fromHeader() {
  return `"${env.mail.fromName}" <${env.mail.fromAddress}>`;
}

/**
 * Puts a message on the queue. Returns the job document.
 *
 * @param {object} options
 * @param {string} options.kind       One of MAIL_KINDS - used for reporting.
 * @param {string} options.to
 * @param {string} [options.toName]
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} [options.text]
 * @param {number} [options.priority] 1 = highest. SOS uses 1.
 * @param {string} [options.dedupeKey] Prevents the same mail being queued twice.
 */
async function enqueue({
  kind,
  to,
  toName = '',
  subject,
  html,
  text = '',
  priority = 5,
  dedupeKey = null,
  relatedUser = null,
  relatedSos = null,
}) {
  try {
    return await MailJob.create({
      kind,
      to,
      toName,
      subject,
      html,
      text,
      priority,
      dedupeKey,
      relatedUser,
      relatedSos,
    });
  } catch (error) {
    // A duplicate dedupeKey means the message is already queued. That is the
    // point of the key, so return the existing job instead of throwing.
    if (error.code === 11000 && dedupeKey) {
      logger.debug('Mail already queued, skipping duplicate', { kind, to, dedupeKey });
      return MailJob.findOne({ dedupeKey });
    }
    throw error;
  }
}

/**
 * Copies a delivery outcome onto the matching recipient inside the SOS event
 * (NFR-12).
 *
 * `SosEvent.notifiedContacts` is a denormalised mirror of the mail queue: it is
 * what the SOS history and the live alert screen read, because they should not
 * have to join against MailJob on every render. Fan-out writes each entry as
 * "queued" and nothing used to move it on, so an alert whose emails had all
 * been delivered still reported "0 of 2 contacts reached" forever.
 *
 * Best effort by design. MailJob remains the source of truth - `/alert-status`
 * reads it directly - so if this write is lost the queue is still correct and
 * only the cached summary is stale.
 */
async function mirrorToSosEvent(job, { status, sentAt = null, error = '' }) {
  if (!job.relatedSos || !job.to) return;

  try {
    await SosEvent.updateOne(
      { _id: job.relatedSos, 'notifiedContacts.email': job.to },
      {
        $set: {
          'notifiedContacts.$[entry].status': status,
          'notifiedContacts.$[entry].sentAt': sentAt,
          'notifiedContacts.$[entry].error': String(error || '').slice(0, 200),
        },
      },
      { arrayFilters: [{ 'entry.email': job.to }] }
    );
  } catch (updateError) {
    logger.debug('Could not mirror delivery status onto the SOS event', {
      job: String(job._id),
      message: updateError.message,
    });
  }
}

/**
 * Sends one already-claimed job. Marks it sent, or schedules a retry.
 * Never throws - the worker must survive a bad recipient.
 *
 * @returns {Promise<boolean>} true when delivered
 */
async function deliver(job) {
  try {
    const tx = await getTransporter();

    const info = await tx.sendMail({
      from: fromHeader(),
      to: job.toName ? `"${job.toName.replace(/"/g, '')}" <${job.to}>` : job.to,
      subject: job.subject,
      html: job.html,
      text: job.text || undefined,
    });

    job.status = MAIL_STATUS.SENT;
    job.sentAt = new Date();
    job.messageId = info.messageId || '';
    job.lastError = '';

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      job.previewUrl = preview;
      logger.info(`Email preview (${job.kind} -> ${job.to}): ${preview}`);
    }
    if (env.mail.transport === 'console') {
      logger.info(`[mail:console] ${job.kind} -> ${job.to} :: ${job.subject}`);
    }

    await job.save();
    await mirrorToSosEvent(job, { status: 'sent', sentAt: job.sentAt });
    return true;
  } catch (error) {
    job.scheduleRetry(error.message);
    await job.save();

    // Only a job the queue has given up on is a failure the owner should see.
    // A job that will be retried is still in flight, and flipping it to
    // "failed" between attempts would be alarming and wrong.
    if (job.status === MAIL_STATUS.ABANDONED) {
      await mirrorToSosEvent(job, { status: 'failed', error: job.lastError });
    }

    logger[job.status === MAIL_STATUS.ABANDONED ? 'error' : 'warn'](
      `Email delivery failed (${job.kind} -> ${job.to}), attempt ${job.attempts}/${job.maxAttempts}`,
      { message: error.message }
    );
    return false;
  }
}

/**
 * How many messages are in flight at once while draining the queue.
 *
 * Delivery used to be strictly one at a time, which made the wall-clock time to
 * alert everybody the sum of every SMTP round trip: two contacts took about
 * seven seconds, and ten would have taken half a minute - well outside the five
 * seconds NFR-1 allows an SOS. Sending in parallel makes it the time of the
 * slowest single message instead of the total.
 *
 * Four matches the pooled transport's three connections with one spare, and
 * stays polite to a free relay's rate limit.
 */
const DELIVERY_CONCURRENCY = 4;

/**
 * Drains up to `batchSize` due jobs. Called by the cron worker and directly
 * after an SOS so the first alert does not wait for the next tick.
 *
 * @returns {Promise<{processed:number, sent:number, failed:number}>}
 */
async function processQueue(batchSize = 20) {
  const stats = { processed: 0, sent: 0, failed: 0 };
  let remaining = batchSize;

  /*
   * Each worker claims its own job and keeps going until the batch runs out.
   * `claimNext` is an atomic findOneAndUpdate, so two workers - or two server
   * instances - can never pick up the same message.
   */
  async function worker() {
    for (;;) {
      if (remaining <= 0) return;
      remaining -= 1;

      /* eslint-disable no-await-in-loop */
      const job = await MailJob.claimNext();
      if (!job) return;

      stats.processed += 1;
      const delivered = await deliver(job);
      if (delivered) stats.sent += 1;
      else stats.failed += 1;
    }
  }

  const workers = Math.max(1, Math.min(DELIVERY_CONCURRENCY, batchSize));
  await Promise.all(Array.from({ length: workers }, worker));

  return stats;
}

/** Used by the health endpoint and by `npm run seed` to prove the config works. */
async function verifyTransport() {
  const tx = await getTransporter();
  if (typeof tx.verify !== 'function') return { ok: true, transport: env.mail.transport };
  await tx.verify();
  return { ok: true, transport: env.mail.transport };
}

/** Test hook: forget the memoised transport so a new one is built. */
function resetTransport() {
  transporter = null;
  transporterPromise = null;
}

async function closeTransport() {
  if (transporter && typeof transporter.close === 'function') transporter.close();
  resetTransport();
}

/**
 * Sends one message immediately, bypassing the queue and the database.
 *
 * Diagnostics only -  uses it to prove SMTP works even
 * when MongoDB is unreachable, which is exactly when you most need to know
 * which of the two is broken. Real traffic must always go through enqueue(),
 * because a crash mid-send has to leave the alert recoverable.
 */
async function sendDirect({ to, toName = '', subject, html, text = '' }) {
  const tx = await getTransporter();

  return tx.sendMail({
    from: fromHeader(),
    to: toName ? `"${toName.replace(/"/g, '')}" <${to}>` : to,
    subject,
    html,
    text: text || undefined,
  });
}

export { enqueue, deliver, sendDirect, processQueue, verifyTransport, closeTransport };