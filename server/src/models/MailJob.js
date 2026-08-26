import mongoose from 'mongoose';
import { MAIL_STATUS, MAIL_STATUS_VALUES, MAIL_KINDS, LIMITS } from '../config/constants.js';

/**
 * NFR-3 and NFR-12. Every outbound message is written here first and sent
 * afterwards, so a dropped connection during an SOS turns into a retry rather
 * than a silently lost alert. A background worker drains the queue.
 */
const mailJobSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: MAIL_KINDS, required: true },

    to: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    toName: { type: String, default: '' },

    subject: { type: String, required: true, maxlength: 200 },
    html: { type: String, required: true },
    text: { type: String, default: '' },

    /**
     * SOS mail jumps the queue. 1 = highest.
     */
    priority: { type: Number, default: 5, min: 1, max: 10 },

    status: { type: String, enum: MAIL_STATUS_VALUES, default: MAIL_STATUS.QUEUED, index: true },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: LIMITS.MAIL_MAX_ATTEMPTS },

    /** Next moment the worker is allowed to try. Drives the backoff. */
    nextAttemptAt: { type: Date, default: Date.now },

    lastError: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: '' },
    previewUrl: { type: String, default: '' }, // Ethereal only

    /** Backlinks so the UI can show "3 of 4 contacts notified". */
    relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    relatedSos: { type: mongoose.Schema.Types.ObjectId, ref: 'SosEvent', default: null },

    /**
     * Stops a retry storm from mailing the same person the same thing twice
     * (for example when two browser tabs both fire the SOS request).
     */
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

// The worker's claim query: pick due jobs, best priority first, oldest first.
mailJobSchema.index({ status: 1, nextAttemptAt: 1, priority: 1, createdAt: 1 });
mailJobSchema.index({ relatedSos: 1 });
mailJobSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
// Housekeeping: successfully delivered mail is discarded after 30 days.
mailJobSchema.index(
  { sentAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { status: MAIL_STATUS.SENT } }
);

/**
 * Exponential backoff with a ceiling: 30s, 1m, 2m, 4m, 8m ... capped at 30
 * minutes. Jitter avoids every job in a batch waking at the same instant.
 */
mailJobSchema.methods.scheduleRetry = function scheduleRetry(errorMessage) {
  this.attempts += 1;
  this.lastError = String(errorMessage || '').slice(0, 500);

  if (this.attempts >= this.maxAttempts) {
    this.status = MAIL_STATUS.ABANDONED;
    this.nextAttemptAt = null;
    return this;
  }

  const base = Math.min(30 * 60 * 1000, 30 * 1000 * 2 ** (this.attempts - 1));
  const jitter = Math.floor(Math.random() * 5000);
  this.status = MAIL_STATUS.QUEUED;
  this.nextAttemptAt = new Date(Date.now() + base + jitter);
  return this;
};

/**
 * Atomically claims one due job. `findOneAndUpdate` means two workers (or two
 * server instances) can never grab the same job.
 */
mailJobSchema.statics.claimNext = function claimNext() {
  return this.findOneAndUpdate(
    { status: MAIL_STATUS.QUEUED, nextAttemptAt: { $lte: new Date() } },
    { $set: { status: MAIL_STATUS.SENDING } },
    { sort: { priority: 1, nextAttemptAt: 1, createdAt: 1 }, new: true }
  );
};

/**
 * Releases jobs that were claimed but never finished - the process was killed
 * mid-send. Anything stuck in SENDING for more than five minutes goes back.
 */
mailJobSchema.statics.requeueStuck = function requeueStuck(olderThanMs = 5 * 60 * 1000) {
  return this.updateMany(
    { status: MAIL_STATUS.SENDING, updatedAt: { $lt: new Date(Date.now() - olderThanMs) } },
    { $set: { status: MAIL_STATUS.QUEUED, nextAttemptAt: new Date() } }
  );
};

export default mongoose.model('MailJob', mailJobSchema);
