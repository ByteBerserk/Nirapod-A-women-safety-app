import nodemailer from 'nodemailer';
import env from '../config/env.js';
import * as logger from '../config/logger.js';
import MailJob from '../models/MailJob.js';
import SosEvent from '../models/SosEvent.js';
import { MAIL_STATUS } from '../config/constants.js';

let transporter = null;
let transporterPromise = null;

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
        secure: env.mail.secure,
        auth: { user: env.mail.user, pass: env.mail.pass },
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
      });
  }
}

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

    if (error.code === 11000 && dedupeKey) {
      logger.debug('Mail already queued, skipping duplicate', { kind, to, dedupeKey });
      return MailJob.findOne({ dedupeKey });
    }
    throw error;
  }
}

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

const DELIVERY_CONCURRENCY = 4;

async function processQueue(batchSize = 20) {
  const stats = { processed: 0, sent: 0, failed: 0 };
  let remaining = batchSize;

  async function worker() {
    for (;;) {
      if (remaining <= 0) return;
      remaining -= 1;

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

async function verifyTransport() {
  const tx = await getTransporter();
  if (typeof tx.verify !== 'function') return { ok: true, transport: env.mail.transport };
  await tx.verify();
  return { ok: true, transport: env.mail.transport };
}

function resetTransport() {
  transporter = null;
  transporterPromise = null;
}

async function closeTransport() {
  if (transporter && typeof transporter.close === 'function') transporter.close();
  resetTransport();
}

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
