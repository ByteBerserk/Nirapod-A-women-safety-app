# Nirapod

A community-driven personal safety application for women. One-tap SOS with live
location, safety check-in timers, community incident reporting, private safety
groups, nearby emergency services and safety resources.

MERN stack — MongoDB, Express, React, Node — with strict MVC on the server.

---
## Contents

- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Running](#running)
- [Testing](#testing)
- [Architecture](#architecture)
- [API reference](#api-reference)
- [Realtime events](#realtime-events)
- [Requirement traceability](#requirement-traceability)
- [Operations](#operations)

---

## Requirements

| | |
|---|---|
| Node.js | 18 or newer |
| MongoDB | 6 or newer — a local server, Docker, or a free Atlas M0 cluster |
| npm | 9 or newer |

Every third-party service used here has a free tier that does not expire.
No paid API keys are required.

---

## Getting started

```bash
# 1. Install every workspace (root, server, client)
npm run install:all

# 2. Create the server configuration
cp server/.env.example server/.env

# 3. Generate two signing secrets and paste them into server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Getting a database

Pick whichever is easiest — the app does not care which you use.

**Docker (quickest):**

```bash
docker run -d --name nirapod-mongo -p 27017:27017 -v nirapod-data:/data/db mongo:7
```

**MongoDB Atlas M0** (free forever, nothing to install): create a cluster, add
your IP to the access list, then put the connection string in `MONGO_URI`.

**Local install:** install MongoDB Community Server and make sure `mongod` is
running on port 27017.

### Seeding

Creates the bootstrap administrator and a starter set of safety resources:

```bash
npm run seed
```

The administrator's credentials come from `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` in `server/.env`. **Change the password before deploying.**

---

## Configuration

All server configuration lives in `server/.env`. `server/.env.example` documents
every key; the ones that matter most:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | Database connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Token signing. Must be long, random and different from each other |
| `CLIENT_URL` | Used to build links inside emails (tracking pages, password resets) |
| `CORS_ORIGINS` | Comma-separated list of origins allowed to call the API |
| `MAIL_TRANSPORT` | `smtp`, `ethereal` or `console` — see below |
| `MAX_UPLOAD_MB` | Size cap for incident evidence |

The process refuses to start in production if a secret is missing or left at its
placeholder value, rather than booting with a guessable key.

### Email

Alerting is the core of this application, so the mail transport is explicit:

| `MAIL_TRANSPORT` | Behaviour |
|---|---|
| `ethereal` | Creates a throwaway inbox on demand and logs a preview URL. Nothing is delivered. **Best for development** — no credentials needed. |
| `console` | Logs the message and stops. Used by the test suite. |
| `smtp` | Real delivery. Gmail (turn on 2FA, then create an *App password*) or Brevo's free 300/day relay both work. |

Nothing calls SMTP directly. Callers enqueue a `MailJob` and a worker drains the
queue with exponential backoff, so an alert survives a crash or an SMTP outage.

### Links inside emails

An SOS alert carries a live tracking link, and the person who opens it is on
their own phone — not on the machine running the app. `http://localhost:5173`
means *their* device, so a link built from it shows a connection error instead
of a map.

The app therefore rewrites a loopback `CLIENT_URL` to this machine's address on
the local network (`http://192.168.0.187:5173`, or whatever yours is) and Vite
listens there too. An emergency contact on the same Wi-Fi can open the link and
watch the location move.

Two things follow from that:

- **The recipient must be on the same network.** For a link that works from
  anywhere, run `npm run tunnel` — it opens a public HTTPS address and sets
  `CLIENT_URL` to it for you.
- **A non-loopback `CLIENT_URL` is always honoured exactly as written**, so
  setting a real hostname overrides all of this.

The address in use is the one `env.clientUrl` resolves to; it appears in the
boot log as *Client origin*.

---

## Running

```bash
npm run dev        # API on :5000 and client on :5173, together
npm run server     # API only
npm run client     # client only
npm run seed       # bootstrap administrator + safety resources
npm run seed:demo  # ...plus sample accounts and Dhaka incident reports
npm run tunnel     # put the app on a public HTTPS address (see below)
npm run build      # production build of the client
npm test           # server test suite
```

### Reaching it from another device

The client listens on the network as well as localhost, so anything on the same
wifi can open `http://<your-lan-ip>:5173`, and emailed tracking links use that
address rather than `localhost` - which would otherwise resolve to the
recipient's own phone and show a connection error.

For a device that is *not* on the same network - which is the normal case for an
emergency contact - run:

```bash
npm run tunnel
```

That opens a free Cloudflare quick tunnel, prints a public HTTPS address and
rewrites `CLIENT_URL` so every emailed link uses it. Leave it running; closing it
takes the address down and restores the previous value. The hostname is
different each time, which is why the script writes it rather than asking you to
copy it.

In production the API serves the built client, so a single process hosts
everything:

```bash
npm run build
NODE_ENV=production npm --prefix server start
```

---

## Testing

```bash
npm test              # every suite
```

292 tests across 11 suites. They run against an in-memory MongoDB
(`mongodb-memory-server`), so no database needs to be running, and the
database is emptied between tests so order never matters.

| Suite | Covers |
|---|---|
| `auth.test.js` | registration, login, refresh, password reset |
| `contacts.test.js` | emergency contact lifecycle and the cap |
| `sos.test.js` | activation, trail, tracking tokens, resolution, alert mail |
| `incidents.test.js` | reporting, search, comments, reactions |
| `moderation.test.js` | content reports, the moderator queue, suspensions |
| `groups.test.js` | groups, invitations, messaging, group SOS fan-out |
| `places.test.js` | nearby services, safe places, geofence transitions |
| `admin.test.js` | analytics, user administration, audit log, mail queue |
| `checkins.test.js` | check-in timers, the prompt, extending, escalation to SOS |
| `security.test.js` | CORS rules, security headers, CSP directives |
| `units.test.js` | haversine, mail backoff, presenters, client-URL resolution |

The suite never calls a third-party service, so it passes offline.

---

## Architecture

```
server/src/
  models/       Mongoose schemas — all persistence rules live here
  views/        Response presenters — decide what each audience may see
  controllers/  request -> validate -> service -> present -> respond
  services/     SOS orchestration, mail queue, geo, notifications, audit
  middleware/   auth, rate limits, uploads, error handling
  validators/   declarative request validation
  sockets/      JWT-authenticated realtime gateway
  jobs/         cron workers (mail queue, SOS expiry)
  utils/        shared helpers
client/src/
  pages/        one file per screen
  components/   layout, map, SOS button, shared UI
  context/      auth, socket, SOS and toast providers
  api/          axios instance with refresh-token interceptor
```

**On MVC in a MERN app.** The *view* layer is deliberately split. `server/src/views/*`
holds response presenters: a controller never returns a raw document, it passes
it through a presenter that decides which fields the current audience is allowed
to see. That is where privacy is actually enforced, rather than hoping every
controller remembers to strip a field. The React SPA is the human-facing view.

### Notable decisions

- **The SOS response does not wait for email.** The event is written and the
  response returns; fan-out happens afterwards and is durable through the mail
  queue. A phone in an emergency never waits on an SMTP handshake.
- **Reverse geocoding cannot delay an alert.** Resolving a street name is
  best-effort and capped at 1.2 s. If the lookup is slower the alert goes out
  with coordinates and a map link, and the address is written to the event when
  it arrives.
- **A missing location never blocks the alert.** A phone indoors, with location
  switched off, or that has just had the permission denied still raises the
  alarm; the email tells the contact to ring instead, and the trail starts the
  moment a fix arrives. Coordinates that *are* sent but are out of range are
  still rejected, so a broken client is not quietly hidden. The browser waits
  at most 4 s for a fix before going ahead without one.
- **Alerts are delivered in parallel.** The queue drains four at a time, so the
  time to reach everybody is the slowest single message rather than the sum of
  them all (NFR-1).
- **What each contact was told is written back onto the alert.**
  `notifiedContacts` mirrors the mail queue, so the history agrees with
  `/sos/:id/alert-status`. That same record is what addresses the all-clear.
- **Uploads are checked against their contents**, not the type the client
  claims. A file whose leading bytes contradict its declared MIME type is
  refused, and anything already written to disk is removed.
- **Tracking links are expiring, revocable and stored as hashes.** The plain
  token exists only in the email.
- **Ownership is enforced in the query**, not by fetching and comparing
  afterwards, so there is no window in which the wrong document is loaded.
- **A stranger gets 404, not 403**, for a group they are not in — a 403 would
  confirm the group exists.
- **A removal can be undone.** Every other moderation action is final once a
  flag is resolved, but `restore-content` stays available on a report whose
  content is still removed — otherwise a mistaken removal would be permanent.

---

## API reference

Base path `/api`. All responses are JSON and share one envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "message": "optional" }

// failure
{ "success": false, "message": "Human readable", "details": { "field": "why" } }
```

Authenticate with `Authorization: Bearer <accessToken>`. Access tokens are
short-lived; the refresh token is an httpOnly cookie set by `/auth/login`.

**Legend** — 🔓 public · 🔒 signed in · 🛡️ moderator · ⚙️ admin

### Meta

| | Endpoint | |
|---|---|---|
| GET | `/health` | 🔓 Liveness, plus database state |
| GET | `/meta` | 🔓 Every enum the forms need (categories, blood groups, limits) |

### Auth — FR-1

| | Endpoint | |
|---|---|---|
| POST | `/auth/register` | 🔓 Create an account |
| POST | `/auth/login` | 🔓 Sign in |
| POST | `/auth/refresh` | 🔓 Exchange the refresh cookie for a new access token |
| POST | `/auth/logout` | 🔓 Clear the refresh cookie |
| POST | `/auth/forgot-password` | 🔓 Email a reset token |
| POST | `/auth/reset-password` | 🔓 Complete the reset |
| GET | `/auth/me` | 🔒 Current session |
| POST | `/auth/logout-all` | 🔒 End every session |
| PATCH | `/auth/change-password` | 🔒 Change password |

### Profile — FR-1

| | Endpoint | |
|---|---|---|
| GET | `/users/profile` | 🔒 Own profile, including medical fields |
| PATCH | `/users/profile` | 🔒 Update name, blood group, medical notes, address |
| PATCH | `/users/profile/avatar` | 🔒 Upload a profile picture |
| PATCH | `/users/preferences` | 🔒 Notification and privacy preferences |
| POST | `/users/deactivate` | 🔒 Deactivate the account |
| GET | `/users/search` | 🔒 Find people to invite to a group |
| GET | `/users/:id` | 🔒 Public profile |
| GET | `/users` | 🛡️ List accounts |

### Emergency contacts — FR-5

| | Endpoint | |
|---|---|---|
| GET | `/contacts` | 🔒 List, ordered by priority |
| POST | `/contacts` | 🔒 Add a trusted person |
| PATCH | `/contacts/:id` | 🔒 Edit, or switch off without deleting |
| DELETE | `/contacts/:id` | 🔒 Remove |

### SOS — FR-2, FR-3, FR-4, FR-10

| | Endpoint | |
|---|---|---|
| GET | `/sos/track/:token` | 🔓 Live tracking page for a contact holding the link |
| POST | `/sos` | 🔒 Raise an alert — emails every active contact and every group. Coordinates are optional; an alert with no fix still goes out |
| GET | `/sos/active` | 🔒 The alert currently running, if any |
| GET | `/sos/history` | 🔒 Past activations with duration and location |
| GET | `/sos/:id` | 🔒 One activation in detail |
| GET | `/sos/:id/alert-status` | 🔒 Per-recipient delivery status |
| PATCH | `/sos/:id/location` | 🔒 Append a point to the live trail |
| PATCH | `/sos/:id/resolve` | 🔒 "I'm safe" — emails the all-clear |
| PATCH | `/sos/:id/revoke-tracking` | 🔒 Kill the tracking link early |
| POST | `/sos/:id/resend` | 🔒 Re-queue alerts that failed |

### Incidents — FR-6 to FR-9, FR-11

| | Endpoint | |
|---|---|---|
| GET | `/incidents` | 🔓 Feed, with keyword, category and radius filters |
| GET | `/incidents/map` | 🔓 Map pins around a centre point (`lat`, `lng`, `radius`) |
| POST | `/incidents` | 🔒 Report an incident, with photo/video/audio evidence |
| GET | `/incidents/:id` | 🔓 Full detail including verification status |
| PATCH | `/incidents/:id` | 🔒 Edit your own report |
| DELETE | `/incidents/:id` | 🔒 Delete your own report |
| POST | `/incidents/:id/react` | 🔒 Helpful / important / support |
| GET | `/incidents/:id/comments` | 🔓 Comment thread |
| POST | `/incidents/:id/comments` | 🔒 Add a comment |
| DELETE | `/incidents/:id/comments/:commentId` | 🔒 Delete your own comment |
| PATCH | `/incidents/:id/status` | 🛡️ Verify or reject a report |

### Safety groups — FR-14 to FR-17

| | Endpoint | |
|---|---|---|
| GET / POST | `/groups` | 🔒 List / create |
| GET / PATCH / DELETE | `/groups/:id` | 🔒 Detail / rename / delete |
| GET / POST | `/groups/invite/:id/:code` | 🔒 Preview / accept or decline an invitation |
| POST | `/groups/:id/invites` | 🔒 Invite by email — sends the invitation mail |
| DELETE | `/groups/:id/invites/:inviteId` | 🔒 Revoke an invitation |
| POST | `/groups/:id/leave` | 🔒 Leave, transferring ownership if needed |
| DELETE | `/groups/:id/members/:userId` | 🔒 Remove a member |
| PATCH | `/groups/:id/members/:userId/role` | 🔒 Change a member's group role |
| GET / POST | `/groups/:id/messages` | 🔒 Group chat |
| POST / DELETE | `/groups/:id/location` | 🔒 Start / stop sharing your location |
| GET | `/groups/:id/locations` | 🔒 Where sharing members are |
| PATCH | `/groups/:id/mute` | 🔒 Silence chat without leaving |

### Places — FR-18, FR-19, FR-20

| | Endpoint | |
|---|---|---|
| GET | `/places/nearby` | 🔓 Police, hospitals or pharmacies near a point |
| GET | `/places/nearby/all` | 🔓 All three categories at once |
| GET | `/places/search` | 🔓 Geocode an area name |
| GET | `/places/reverse` | 🔓 Coordinates to an address |
| GET / POST | `/places/safe-places` | 🔒 List / save a trusted place |
| PATCH / DELETE | `/places/safe-places/:id` | 🔒 Edit / remove |
| POST | `/places/safe-places/check` | 🔒 Evaluate a position, raising enter/leave events |
| GET | `/places/safe-places/events` | 🔒 Arrival and departure history |

### Resources and feedback — FR-21, FR-22, FR-23

| | Endpoint | |
|---|---|---|
| GET | `/resources` | 🔓 Safety guides, legal rights, helplines |
| GET | `/resources/:idOrSlug` | 🔓 One article |
| POST / PATCH / DELETE | `/resources` , `/resources/:id` | ⚙️ Manage the library |
| GET / POST | `/resources/bookmarks` | 🔒 Saved items |
| DELETE | `/resources/bookmarks/:targetType/:targetId` | 🔒 Unsave |
| POST | `/feedback` | 🔓 Submit a suggestion, bug or complaint |
| GET | `/feedback/mine` | 🔒 Your submissions |
| GET / PATCH | `/feedback` , `/feedback/:id` | ⚙️ Triage |

### Notifications

| | Endpoint | |
|---|---|---|
| GET | `/notifications` | 🔒 In-app feed |
| PATCH | `/notifications/read-all` | 🔒 Mark everything read |
| PATCH | `/notifications/:id/read` | 🔒 Mark one read |
| DELETE | `/notifications/:id` | 🔒 Dismiss |

### Moderation and administration — FR-12, FR-13, FR-24, FR-25

| | Endpoint | |
|---|---|---|
| POST | `/admin/reports` | 🔒 Report a post or comment |
| GET | `/admin/reports` | 🛡️ The moderation queue |
| GET | `/admin/reports/:id` | 🛡️ One report in detail |
| PATCH | `/admin/reports/:id/resolve` | 🛡️ Dismiss, remove, restore, warn or suspend |
| GET | `/admin/users` | 🛡️ Accounts |
| GET | `/admin/users/:id` | 🛡️ One account |
| PATCH | `/admin/users/:id/status` | 🛡️ Suspend or reinstate |
| PATCH | `/admin/users/:id/role` | ⚙️ Change a role |
| GET | `/admin/dashboard` | ⚙️ Headline statistics |
| GET | `/admin/analytics/categories` | ⚙️ Incidents by category |
| GET | `/admin/analytics/trends` | ⚙️ Reports and SOS over time |
| GET | `/admin/analytics/hotspots` | ⚙️ Repeatedly reported locations |
| GET | `/admin/audit-logs` | ⚙️ Audit trail |
| GET | `/admin/mail-queue` | ⚙️ Outbound queue health |
| POST | `/admin/mail-queue/retry` | ⚙️ Re-queue abandoned mail |

---

## Realtime events

Socket.IO, authenticated with the same access token as the REST API.

**Client → server:** `sos:watch`, `sos:unwatch`, `group:join`, `group:leave`,
`group:typing`

**Server → client:** `sos:location`, `sos:resolved`, `group:sos`,
`group:message`, `group:location`, `group:location-stopped`,
`group:member-joined`, `group:member-left`, `group:removed`, `group:updated`,
`group:deleted`, `group:typing`, `notification:new`

If the server ever reports `capabilities.realtime: false`, or `/api/meta`
cannot be reached at all, the client's `SocketContext` polls instead and re-emits
`group:message`, `group:location` and `notification:new` through the same
`subscribe()` API — so no screen knows which transport is in use. Typing
indicators are the one casualty: they have no polling equivalent and are
dropped rather than faked.

---

## Requirement traceability

Every functional requirement is marked in the source with an `FR-n` comment, so
`grep -rn "FR-17" server/src` finds the code that implements it.

| FR | Requirement | Where |
|---|---|---|
| 1 | Manage user profile | `controllers/userController.js` |
| 2 | Share live location during SOS | `services/sosService.js` |
| 3 | Continuous live tracking | `services/sosService.js`, `sockets/` |
| 4 | Email SOS alerts | `services/sosService.js`, `services/mailService.js` |
| 5 | Add and remove contacts | `controllers/contactController.js` |
| 6 | Report incidents, upload evidence | `controllers/incidentController.js`, `middleware/upload.js` |
| 7 | Categorise incidents | `models/Incident.js`, `config/constants.js` |
| 8 | Community safety map | `controllers/incidentController.js` (`/map`) |
| 9 | Search, detail, comments | `controllers/incidentController.js` |
| 10 | SOS history | `controllers/sosController.js` |
| 11 | React to reports | `controllers/incidentController.js` |
| 12 | Report inappropriate content | `controllers/moderationController.js` |
| 13 | Moderate content | `controllers/moderationController.js` |
| 14 | Create, invite, leave groups | `controllers/groupController.js` |
| 15 | Group messaging | `controllers/groupController.js`, `models/GroupMessage.js` |
| 16 | Share location with a group | `controllers/groupController.js` |
| 17 | Group emergency alerts | `services/sosService.js` |
| 18 | Nearby police, hospitals, pharmacies | `services/geoService.js` |
| 19 | Save safe places | `controllers/placeController.js` |
| 20 | Safe place notifications | `controllers/placeController.js`, `models/SafePlaceEvent.js` |
| 21 | Safety tips and resources | `controllers/resourceController.js` |
| 22 | Bookmark resources | `controllers/resourceController.js` |
| 23 | Submit feedback | `controllers/feedbackController.js` |
| 24 | Incident analytics | `controllers/adminController.js` |
| 25 | Manage users and reports | `controllers/adminController.js` |
| 26 | Safety check-in | `services/checkInService.js`, `jobs/index.js` |

Non-functional requirements are marked the same way (`NFR-n`):

| NFR | Where it is implemented |
|---|---|
| 1 Performance | 2dsphere and compound indexes, `.lean()`, pagination caps, POI cache, compression, bounded geocode |
| 2 Availability | `/api/health` reporting degraded separately from dead, stateless API, graceful shutdown |
| 3 Reliability | durable `MailJob` queue with backoff, stuck-job requeue, SOS retry |
| 4 Security | helmet, bcrypt, JWT with token versioning, rate limits, mongo-sanitize, hpp, upload validation |
| 5 Privacy | view presenters, consent flags, expiring revocable tracking tokens |
| 6 Usability | one-tap SOS on every signed-in screen |
| 7 Scalability | stateless, indexed, paginated, no server-held session state |
| 8 Compatibility | responsive CSS, progressive enhancement |
| 9 Maintainability | MVC layering, one concern per file, JSDoc on services |
| 10 Data integrity | schema validation, unique compound indexes, referential cleanup |
| 11 Backup | `npm --prefix server run backup` |
| 12 Notification reliability | mail queue, per-recipient delivery status, manual resend |
| 13 Accessibility | semantic HTML, ARIA, focus rings, 4.5:1 contrast, 16px base |
| 14 Error handling | central handler, field-level messages, client preserves form state |
| 15 Audit logging | `AuditLog` written by `auditService` on every sensitive action |

---

## Operations

### Backups — NFR-11

```bash
npm --prefix server run backup
```

Writes a JSON export of every collection to `backups/<timestamp>/`. It uses the
MongoDB driver the app already depends on rather than `mongodump`, so it works
anywhere the app runs — including a free host with no shell access and no
database tools installed.

Restore from a backup folder:

```bash
node server/src/scripts/backup.js --restore backups/2026-01-01T00-00-00
```

### Scheduled work

`node-cron` runs inside the API process:

| Schedule | Job |
|---|---|
| every minute | drain the outbound mail queue |
| every 5 minutes | requeue jobs a crashed process left claimed |
| hourly | close SOS events nobody resolved |

An SOS also drains the queue immediately, so the cron job is the safety net
rather than the main path.

### Security checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long, random, different
- [ ] `SEED_ADMIN_PASSWORD` changed from the default
- [ ] `CORS_ORIGINS` lists only your real front-end origins
- [ ] `NODE_ENV=production`
- [ ] TLS terminated in front of the app (tracking links and reset tokens travel in email)
- [ ] `MONGO_URI` points at a database with authentication enabled
