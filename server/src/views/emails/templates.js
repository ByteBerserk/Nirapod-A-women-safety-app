import { wrap, button, detailTable, calloutBox, paragraph, PALETTE } from './layout.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { directionsLink } from '../../utils/geo.js';

/**
 * Every template returns { subject, html, text }. The plain-text alternative is
 * not decoration: some phones show it on the lock screen, and it is what a
 * screen reader falls back to (NFR-13).
 */

const fmtTime = (date) =>
  new Date(date).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';

const coordText = (loc) =>
  loc ? `${Number(loc.lat).toFixed(6)}, ${Number(loc.lng).toFixed(6)}` : 'not available';

/**
 * How much to trust the coordinates.
 *
 * A phone with a GPS lock is accurate to a few metres. A laptop, or a phone
 * indoors, is positioned from nearby wifi or the mobile network and can be a
 * kilometre or more out - but the coordinates look just as precise, and the
 * reverse-geocoded street name makes them look more authoritative still. Saying
 * so plainly is the difference between a contact going to the right street and
 * a contact trusting the wrong one.
 */
function accuracyText(accuracy) {
  const metres = Number(accuracy);
  if (!Number.isFinite(metres) || metres <= 0) return 'Not reported by their device';
  if (metres < 100) return `Within about ${Math.round(metres)} m - a good fix`;
  if (metres < 1000) return `Within about ${Math.round(metres)} m - approximate`;
  return `Within about ${(metres / 1000).toFixed(1)} km - rough, treat as an area`;
}

/** A visible caution above the map link when the fix is too vague to walk to. */
function accuracyWarning(accuracy) {
  const metres = Number(accuracy);
  if (!Number.isFinite(metres) || metres < 1000) return '';

  return calloutBox(
    `This position is only accurate to about ${(metres / 1000).toFixed(1)} km, so the address
     below is the nearest one to a rough area rather than where they actually are. Call them,
     and watch the live tracking link - it sharpens as their phone gets a better fix.`,
    '#e65100',
    '#fff4e5'
  );
}

/* ------------------------------------------------------------------ FR-4 --- */

/**
 * The one that matters. Everything a contact needs is above the fold: who they
 * are, where they are on a live map, and the medical details a responder asks
 * for.
 */
function sosAlert({ contactName, user, location, address, message, trackingUrl, startedAt }) {
  const person = escapeHtml(user.name);
  const subject = `URGENT: ${user.name} has triggered an SOS alert`;

  /*
   * One map link, not two.
   *
   * This used to offer "Follow live location" and a separate "Open in
   * OpenStreetMap", which read as a choice between two different things. It
   * was not: the tracking page is itself an OpenStreetMap map, centred on
   * their position, and it keeps moving as they do. The plain osm.org link was
   * the same map frozen at the first fix, minus the trail, the medical details
   * and the button to call them - strictly worse, and a coin flip which one a
   * worried contact clicked. Directions stays, because navigating to someone
   * is a genuinely different action from watching where they are.
   */
  const locationBlock = location
    ? `${button(trackingUrl, 'Follow live location on the map', PALETTE.danger)}
       ${accuracyWarning(location.accuracy)}
       ${detailTable([
         ['Coordinates', coordText(location)],
         ['How precise', accuracyText(location.accuracy)],
         [address ? 'Nearest address' : 'Address', address || 'Could not be resolved'],
       ])}
       <p style="margin:6px 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
         <a href="${escapeHtml(directionsLink(location.lat, location.lng))}"
            style="color:${PALETTE.brand};">Get directions</a>
       </p>`
    : calloutBox(
        'Their location could not be read from their device. Please call them directly.',
        '#e65100',
        '#fff4e5'
      );

  const body = `
    ${paragraph(`Hello ${escapeHtml(contactName || 'there')},`)}
    ${calloutBox(
      `<strong>${person}</strong> has activated an emergency SOS on Nirapod and listed you as
       an emergency contact. They may need help right now.`
    )}
    ${message ? paragraph(`<em>Their message:</em> &ldquo;${escapeHtml(message)}&rdquo;`) : ''}
    <h3 style="margin:22px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
               color:${PALETTE.ink};">Where they are</h3>
    ${locationBlock}
    <h3 style="margin:22px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:15px;
               color:${PALETTE.ink};">Details a responder may ask for</h3>
    ${detailTable([
      ['Name', user.name],
      ['Phone', user.phone || 'Not provided'],
      ['Blood group', user.bloodGroup && user.bloodGroup !== 'unknown' ? user.bloodGroup : 'Not provided'],
      ['Medical notes', user.medicalInfo || 'None recorded'],
      ['Alert raised at', fmtTime(startedAt)],
    ])}
    ${paragraph(
      `<strong>What to do now:</strong> try calling ${person} first. If you cannot reach
       them, contact your local emergency services and give them the coordinates above.`
    )}
    ${paragraph(
      `<span style="font-size:13px;color:${PALETTE.muted};">The live tracking link stops
       working 24 hours after the alert, or as soon as ${person} marks themselves safe.</span>`
    )}`;

  const text = [
    `URGENT - ${user.name} has triggered an SOS alert on Nirapod.`,
    '',
    message ? `Their message: "${message}"` : '',
    location ? `Location: ${coordText(location)}` : 'Location: not available',
    location ? `How precise: ${accuracyText(location.accuracy)}` : '',
    address ? `Nearest address: ${address}` : '',
    `Follow live location: ${trackingUrl}`,
    location ? `Directions: ${directionsLink(location.lat, location.lng)}` : '',
    '',
    `Phone: ${user.phone || 'Not provided'}`,
    `Blood group: ${user.bloodGroup && user.bloodGroup !== 'unknown' ? user.bloodGroup : 'Not provided'}`,
    `Medical notes: ${user.medicalInfo || 'None recorded'}`,
    `Raised at: ${fmtTime(startedAt)}`,
    '',
    'Try calling them first. If you cannot reach them, contact your local emergency services.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    html: wrap({
      title: 'Emergency SOS alert',
      accent: PALETTE.danger,
      preheader: `${user.name} needs help. Location and contact details inside.`,
      body,
    }),
    text,
  };
}

function sosResolved({ contactName, user, startedAt, resolvedAt, durationMs, note }) {
  const minutes = durationMs ? Math.max(1, Math.round(durationMs / 60000)) : null;

  const body = `
    ${paragraph(`Hello ${escapeHtml(contactName || 'there')},`)}
    ${calloutBox(
      `<strong>${escapeHtml(user.name)}</strong> has marked themselves as safe. The emergency
       alert is now closed and the live tracking link has stopped working.`,
      PALETTE.ok,
      '#e8f5e9'
    )}
    ${note ? paragraph(`<em>Their note:</em> &ldquo;${escapeHtml(note)}&rdquo;`) : ''}
    ${detailTable([
      ['Alert raised', fmtTime(startedAt)],
      ['Marked safe', fmtTime(resolvedAt)],
      ['Duration', minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'Not recorded'],
    ])}
    ${paragraph('Thank you for being someone they can rely on.')}`;

  return {
    subject: `${user.name} is safe - SOS alert closed`,
    html: wrap({
      title: 'SOS alert closed',
      accent: PALETTE.ok,
      preheader: `${user.name} has marked themselves safe.`,
      body,
    }),
    text: [
      `${user.name} has marked themselves as safe. The Nirapod SOS alert is closed.`,
      note ? `Their note: "${note}"` : '',
      `Raised: ${fmtTime(startedAt)}`,
      `Marked safe: ${fmtTime(resolvedAt)}`,
      minutes ? `Duration: ${minutes} minutes` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/* ----------------------------------------------------------------- FR-17 --- */

function groupSosAlert({ memberName, user, groupName, location, trackingUrl, startedAt }) {
  const body = `
    ${paragraph(`Hello ${escapeHtml(memberName || 'there')},`)}
    ${calloutBox(
      `<strong>${escapeHtml(user.name)}</strong> from your safety group
       &ldquo;${escapeHtml(groupName)}&rdquo; has activated an SOS.`
    )}
    ${location ? button(trackingUrl, 'View their location', PALETTE.danger) : ''}
    ${detailTable([
      ['Group', groupName],
      ['Location', location ? coordText(location) : 'Not available'],
      ['Raised at', fmtTime(startedAt)],
    ])}
    ${paragraph('If you are nearby and it is safe to do so, please check on them.')}`;

  return {
    subject: `SOS in "${groupName}" - ${user.name} needs help`,
    html: wrap({
      title: 'Group emergency alert',
      accent: PALETTE.danger,
      preheader: `${user.name} raised an SOS in ${groupName}.`,
      body,
    }),
    text: [
      `${user.name} from your safety group "${groupName}" has activated an SOS on Nirapod.`,
      location ? `Location: ${coordText(location)}` : 'Location: not available',
      `Live tracking: ${trackingUrl}`,
      `Raised at: ${fmtTime(startedAt)}`,
    ].join('\n'),
  };
}

/* ----------------------------------------------------------------- FR-14 --- */

function groupInvite({ inviteeName, inviterName, groupName, acceptUrl, expiresAt }) {
  const body = `
    ${paragraph(`Hello ${escapeHtml(inviteeName || 'there')},`)}
    ${paragraph(
      `<strong>${escapeHtml(inviterName)}</strong> has invited you to join the Nirapod safety
       group <strong>${escapeHtml(groupName)}</strong>.`
    )}
    ${paragraph(
      'Members of a safety group can message one another, share their location when they ' +
        'choose to, and are alerted immediately if anyone in the group raises an SOS.'
    )}
    ${button(acceptUrl, 'View the invitation')}
    ${paragraph(
      `<span style="font-size:13px;color:${PALETTE.muted};">This invitation expires on
       ${escapeHtml(fmtTime(expiresAt))}. If you were not expecting it you can ignore this
       email &mdash; nothing happens until you accept.</span>`
    )}`;

  return {
    subject: `${inviterName} invited you to the safety group "${groupName}"`,
    html: wrap({ title: 'Safety group invitation', body, preheader: `Join "${groupName}" on Nirapod.` }),
    text: [
      `${inviterName} has invited you to join the Nirapod safety group "${groupName}".`,
      `Accept here: ${acceptUrl}`,
      `This invitation expires on ${fmtTime(expiresAt)}.`,
    ].join('\n'),
  };
}

/* ----------------------------------------------------------------- FR-20 --- */

function safePlaceTransition({ contactName, user, placeLabel, event, occurredAt }) {
  const verb = event === 'enter' ? 'arrived at' : 'left';

  const body = `
    ${paragraph(`Hello ${escapeHtml(contactName || 'there')},`)}
    ${paragraph(
      `<strong>${escapeHtml(user.name)}</strong> has ${verb}
       <strong>${escapeHtml(placeLabel)}</strong>.`
    )}
    ${detailTable([['Time', fmtTime(occurredAt)]])}
    ${paragraph(
      `<span style="font-size:13px;color:${PALETTE.muted};">${escapeHtml(user.name)} chose to
       share these updates with you and can switch them off at any time.</span>`
    )}`;

  return {
    subject: `${user.name} has ${verb} ${placeLabel}`,
    html: wrap({
      title: event === 'enter' ? 'Arrived safely' : 'Left a safe place',
      accent: event === 'enter' ? PALETTE.ok : PALETTE.brand,
      preheader: `${user.name} ${verb} ${placeLabel}.`,
      body,
    }),
    text: `${user.name} has ${verb} ${placeLabel} at ${fmtTime(occurredAt)}.`,
  };
}

/* ------------------------------------------------------------------ auth --- */

function passwordReset({ name, resetUrl }) {
  const body = `
    ${paragraph(`Hello ${escapeHtml(name)},`)}
    ${paragraph('We received a request to reset your Nirapod password.')}
    ${button(resetUrl, 'Choose a new password')}
    ${paragraph(
      `<span style="font-size:13px;color:${PALETTE.muted};">This link works once and expires
       in one hour. If you did not ask for it, ignore this email &mdash; your password has
       not changed.</span>`
    )}`;

  return {
    subject: 'Reset your Nirapod password',
    html: wrap({ title: 'Password reset', body, preheader: 'This link expires in one hour.' }),
    text: `Reset your Nirapod password: ${resetUrl}\n\nThis link expires in one hour. If you did not request it, ignore this email.`,
  };
}

function welcome({ name, loginUrl }) {
  const body = `
    ${paragraph(`Welcome, ${escapeHtml(name)}.`)}
    ${paragraph('Your Nirapod account is ready. Three things are worth doing straight away:')}
    <ol style="margin:0 0 16px 20px;padding:0;font-family:Arial,Helvetica,sans-serif;
               font-size:15px;line-height:1.8;color:${PALETTE.ink};">
      <li><strong>Add emergency contacts.</strong> The SOS button has nobody to alert until you do.</li>
      <li><strong>Fill in your blood group and medical notes.</strong> They are included in every alert.</li>
      <li><strong>Save your home and workplace</strong> so the app can tell you when you have arrived.</li>
    </ol>
    ${button(loginUrl, 'Open Nirapod')}`;

  return {
    subject: 'Welcome to Nirapod',
    html: wrap({ title: 'Welcome to Nirapod', body, preheader: 'Set up your safety network.' }),
    text: `Welcome to Nirapod, ${name}.\n\nAdd your emergency contacts, fill in your medical details, and save your home and workplace.\n\n${loginUrl}`,
  };
}

function accountStatus({ name, status, reason, until }) {
  const suspended = status === 'suspended';

  const body = `
    ${paragraph(`Hello ${escapeHtml(name)},`)}
    ${calloutBox(
      suspended
        ? 'Your Nirapod account has been suspended by a moderator.'
        : 'Your Nirapod account has been reinstated. You can sign in again.',
      suspended ? PALETTE.danger : PALETTE.ok,
      suspended ? '#fdecea' : '#e8f5e9'
    )}
    ${
      suspended
        ? detailTable([
            ['Reason', reason || 'Breach of the community guidelines'],
            ['Suspended until', until ? fmtTime(until) : 'Further notice'],
          ])
        : ''
    }
    ${paragraph('If you believe this is a mistake, reply to this message and we will review it.')}`;

  return {
    subject: suspended ? 'Your Nirapod account has been suspended' : 'Your Nirapod account is active again',
    html: wrap({
      title: suspended ? 'Account suspended' : 'Account reinstated',
      accent: suspended ? PALETTE.danger : PALETTE.ok,
      body,
    }),
    text: suspended
      ? `Your Nirapod account has been suspended.\nReason: ${reason || 'Breach of the community guidelines'}\nUntil: ${until ? fmtTime(until) : 'further notice'}`
      : 'Your Nirapod account has been reinstated. You can sign in again.',
  };
}

function feedbackAck({ name, subject: topic, type }) {
  const body = `
    ${paragraph(`Hello ${escapeHtml(name || 'there')},`)}
    ${paragraph(
      `Thank you for your ${escapeHtml(type)}. We have logged it and someone will look at it.`
    )}
    ${detailTable([['Subject', topic]])}
    ${paragraph('There is no need to send it again - you will get a reply on this thread.')}`;

  return {
    subject: `We received your feedback: ${topic}`,
    html: wrap({ title: 'Feedback received', body }),
    text: `Thank you for your ${type}. We have logged "${topic}" and will get back to you.`,
  };
}


/* ----------------------------------------------------------------- FR-26 --- */

/**
 * "Your check-in is due - are you safe?"
 *
 * Sent to the person themselves, not their contacts. It exists because the
 * browser tab may well be closed by the time the timer runs out, and this is
 * their last chance to answer before everyone they trust gets an emergency
 * alert. The deadline is stated plainly for that reason.
 */
function checkInDue({ name, label, escalateAt, graceMinutes }) {
  const safeLabel = escapeHtml(label);
  const plural = graceMinutes === 1 ? '' : 's';

  const body = `
    ${paragraph(`Hello ${escapeHtml(name || 'there')},`)}
    ${calloutBox(
      `Your safety check-in <strong>&ldquo;${safeLabel}&rdquo;</strong> is due. Open Nirapod and
       confirm that you are safe.`,
      '#e65100',
      '#fff4e5'
    )}
    ${paragraph(
      `<strong>If you do not confirm within ${graceMinutes} minute${plural}</strong>, an emergency
       alert goes out to every one of your emergency contacts with your location and medical
       details. That is what you asked this timer to do.`
    )}
    ${detailTable([
      ['Check-in', label],
      ['Alerts your contacts at', fmtTime(escalateAt)],
    ])}
    ${paragraph(
      `<span style="font-size:13px;color:${PALETTE.muted};">If you are safe, mark yourself safe in
       the app. If you need more time, you can push the timer back instead.</span>`
    )}`;

  const text = [
    `Your safety check-in "${label}" is due.`,
    '',
    `Confirm you are safe in Nirapod within ${graceMinutes} minute${plural}.`,
    `If you do not, your emergency contacts are alerted at ${fmtTime(escalateAt)}.`,
    '',
    'If you need longer, you can extend the timer instead.',
  ].join('\n');

  return {
    subject: `Are you safe? Check-in "${label}" is due`,
    html: wrap({
      title: 'Safety check-in due',
      accent: '#e65100',
      preheader: `Confirm you are safe, or your contacts are alerted in ${graceMinutes} minute${plural}.`,
      body,
    }),
    text,
  };
}

export { sosAlert, sosResolved, groupSosAlert, checkInDue, groupInvite, safePlaceTransition, passwordReset, welcome, accountStatus, feedbackAck };