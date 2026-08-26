/**
 * Proves that outbound email actually works.
 *
 *   npm --prefix server run mail:check
 *   npm --prefix server run mail:check -- someone@example.com
 *
 * Email is not a nice-to-have here: it is the entire delivery channel for the
 * SOS alert (FR-4). A silent SMTP misconfiguration means the button appears to
 * work and nobody is told, which is the worst failure this system can have. So
 * this runs the real pipeline rather than a shortcut - it enqueues a MailJob
 * and lets the same worker that serves a live SOS drain it, then reports what
 * the queue row ended up saying.
 */

import env from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import * as mailService from '../services/mailService.js';
import * as templates from '../views/emails/templates.js';
import MailJob from '../models/MailJob.js';
import { MAIL_STATUS } from '../config/constants.js';

const recipient = process.argv[2] || env.mail.user;

async function main() {
  console.log('');
  console.log('  Nirapod mail check');
  console.log('  ------------------');
  console.log(`  transport : ${env.mail.transport}`);
  console.log(`  host      : ${env.mail.host}:${env.mail.port} (secure=${env.mail.secure})`);
  console.log(`  user      : ${env.mail.user || '(none)'}`);
  console.log(`  from      : ${env.mail.fromName} <${env.mail.fromAddress}>`);
  console.log(`  to        : ${recipient}`);
  console.log('');

  if (!recipient) {
    console.error('  No recipient. Pass one as an argument, or set SMTP_USER.');
    process.exitCode = 1;
    return;
  }

  // Step 1: the handshake. This is where a wrong password or a blocked port
  // shows up, and it costs nothing to find out before sending anything.
  process.stdout.write('  1. Connecting and authenticating... ');
  try {
    await mailService.verifyTransport();
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error('');
    console.error(`     ${error.message}`);
    console.error('');
    console.error(diagnose(error));
    process.exitCode = 1;
    return;
  }

  // Step 2: the real queue, so the worker and the retry bookkeeping are
  // exercised exactly as they are during an emergency. If the database is
  // down we still send, directly - when both are broken you need to know
  // which one, and "email is fine, Mongo is not" is the useful answer.
  const sample = templates.sosAlert({
    contactName: 'Test recipient',
    user: {
      name: 'Nirapod Mail Check',
      phone: '+880 1711 111111',
      bloodGroup: 'O+',
      medicalInfo: 'This is a test message, not a real emergency.',
    },
    location: { lat: 23.8103, lng: 90.4125 },
    address: 'Dhanmondi, Dhaka',
    message: 'If you are reading this, outbound email is working.',
    trackingUrl: `${env.clientUrl}/track/sample-token`,
    startedAt: new Date(),
  });

  const subject = `[TEST] ${sample.subject}`;

  process.stdout.write('  2. Connecting to MongoDB... ');
  let databaseUp = false;
  try {
    await connectDatabase();
    databaseUp = true;
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.log('     ' + String(error.message).slice(0, 140));
    console.log('     Skipping the queue and sending directly instead.');
  }

  if (!databaseUp) {
    process.stdout.write('  3. Sending directly (queue bypassed)... ');
    try {
      const info = await mailService.sendDirect({
        to: recipient,
        toName: 'Test recipient',
        subject,
        html: sample.html,
        text: sample.text,
      });
      console.log('sent');
      console.log('');
      console.log(`  Delivered. Message id: ${info.messageId}`);
      console.log(`  Check the inbox for ${recipient} (look in spam too, on a first send).`);
      console.log('');
      console.log('  Email works. MongoDB does not - fix that before running the app.');
      console.log('');
    } catch (error) {
      console.log('FAILED');
      console.error('');
      console.error(`     ${error.message}`);
      console.error('');
      console.error(diagnose(error));
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write('  3. Queueing a sample SOS alert... ');
  const job = await mailService.enqueue({
    kind: 'test',
    to: recipient,
    toName: 'Test recipient',
    subject,
    html: sample.html,
    text: sample.text,
    priority: 1,
  });
  console.log(`ok (job ${job._id})`);

  process.stdout.write('  4. Draining the queue... ');
  await mailService.processQueue(5);

  const settled = await MailJob.findById(job._id).lean();
  console.log(settled.status);
  console.log('');

  if (settled.status === MAIL_STATUS.SENT) {
    console.log(`  Delivered. Message id: ${settled.messageId}`);
    if (settled.previewUrl) console.log(`  Preview: ${settled.previewUrl}`);
    console.log(`  Check the inbox for ${recipient} (look in spam too, on a first send).`);
  } else {
    console.error(`  Not delivered. Last error: ${settled.lastError}`);
    console.error('');
    console.error(diagnose({ message: settled.lastError }));
    process.exitCode = 1;
  }
  console.log('');
}

/** Turns the usual SMTP errors into the thing you actually need to change. */
function diagnose(error) {
  const text = String(error.message || '').toLowerCase();

  if (text.includes('invalid login') || text.includes('username and password not accepted')) {
    return [
      '     Gmail rejected the credentials. Two things are usually wrong:',
      '       - The account needs 2-Step Verification switched on, and the',
      '         password must be a 16-character App password, not the normal one.',
      '       - App passwords are shown as four groups of four for readability.',
      '         Put them in SMTP_PASS with no spaces.',
    ].join('\n');
  }
  if (text.includes('etimedout') || text.includes('econnrefused')) {
    return [
      '     Could not reach the SMTP server. Check SMTP_HOST and SMTP_PORT, and',
      '     whether a firewall or your network blocks outbound port 587.',
    ].join('\n');
  }
  if (text.includes('self signed') || text.includes('certificate')) {
    return '     TLS problem. For port 587 keep SMTP_SECURE=false (STARTTLS upgrades it).';
  }
  return '     Check the SMTP_* values in server/.env.';
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mailService.closeTransport().catch(() => {});
    await disconnectDatabase().catch(() => {});
  });
