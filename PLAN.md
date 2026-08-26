# Nirapod — Build Plan

Women's community safety web app. MERN, strict MVC on the server, React SPA as the
presentation layer. Every third-party dependency below has a free tier that never expires.

---

## 1. Stack & cost audit

| Concern | Choice | Cost |
|---|---|---|
| Database | MongoDB Atlas **M0** (512 MB, free forever) or local `mongod` | Free |
| API | Node + Express 4 | Free |
| Client | React 18 + Vite + React Router 6 | Free |
| Realtime | Socket.IO | Free |
| Maps | Leaflet + OpenStreetMap raster tiles | Free, no API key |
| Geocoding / search | Nominatim (OSM) | Free, 1 req/s policy — we cache + throttle server-side |
| Nearby POIs (police/hospital/pharmacy) | Overpass API (OSM) | Free — cached server-side |
| Directions | Deep-link to OSM / Google directions URL | Free |
| Email | Nodemailer over SMTP. Gmail App Password, Brevo (300/day) or Ethereal in dev | Free |
| File storage | Local disk via Multer, served by Express | Free |
| Auth | jsonwebtoken + bcryptjs | Free |
| Tests | Jest + Supertest + mongodb-memory-server | Free |

**No SMS anywhere.** Every alert path is email + in-app + socket push, per the brief.

---

## 2. MVC interpretation

The SRS asks for MVC. In a MERN split that maps to:

- **Model** — `server/src/models/*` — Mongoose schemas, validation, indexes, instance
  methods. All persistence rules live here, nowhere else.
- **View** — two layers:
  - `server/src/views/*` — response *presenters*. Controllers never `res.json(doc)`
    directly; they pass documents through a presenter that decides which fields a given
    audience is allowed to see. This is where privacy (NFR-5) is actually enforced.
  - `client/` — the React SPA, the human-facing view.
- **Controller** — `server/src/controllers/*` — request → validate → call service/model →
  present → respond. Thin. No business rules.
- Supporting layers that keep controllers thin: `services/` (SOS orchestration, mail,
  geo, overpass), `middleware/`, `validators/`, `sockets/`, `jobs/`.

---

## 3. Data model

| Collection | Purpose | FR |
|---|---|---|
| `User` | account, profile, blood group, medical notes, role | 1 |
| `EmergencyContact` | trusted people (name, phone, email) | 5 |
| `SosEvent` | activation, GeoJSON trail, duration, tracking token | 2,3,4,10 |
| `SafetyCheckIn` | countdown before travelling, prompt, escalation to SOS | 26 |
| `MailJob` | durable outbound-email queue with retry/backoff | NFR-3, NFR-12 |
| `Incident` | report, category, GeoJSON point, media, reactions, status | 6,7,8,11 |
| `Comment` | threadless comments on incidents | 9 |
| `ContentReport` | moderation queue for incidents/comments | 12,13 |
| `SafetyGroup` | private group, members, roles, invites | 14,16,17 |
| `GroupMessage` | group chat + system messages | 15 |
| `SafePlace` | named geofence (centre + radius) | 19 |
| `SafePlaceEvent` | enter/leave transitions | 20 |
| `Resource` | safety articles / tips / legal rights | 21 |
| `Bookmark` | polymorphic saves (resource or incident) | 22 |
| `Feedback` | suggestions, bugs, complaints | 23 |
| `Notification` | in-app notification feed | 17,20 |
| `AuditLog` | SOS, moderation, admin actions, errors | NFR-15 |

Geo queries use `2dsphere` indexes on GeoJSON `Point`s so the safety map and "incidents
near me" are index-backed rather than full scans (NFR-1, NFR-7).

---

## 4. Work breakdown

### Phase 0 — Scaffold
- 0.1 Root layout, `.gitignore`, root `package.json` with concurrently scripts
- 0.2 Server `package.json` + deps
- 0.3 `.env.example`, env validation module (fail fast on missing secrets)
- 0.4 Client scaffold (Vite + React)

### Phase 1 — Core infrastructure
- 1.1 `config/database.js` — connection, retry, graceful shutdown
- 1.2 `config/constants.js` — roles, categories, statuses, reaction kinds
- 1.3 `utils/AppError.js`, `utils/asyncHandler.js`, `utils/apiResponse.js`
- 1.4 `middleware/errorHandler.js` — meaningful messages, never leak stack (NFR-14)
- 1.5 `config/logger.js` + `services/auditService.js` (NFR-15)
- 1.6 Security middleware: helmet, CORS allowlist, rate limits, mongo-sanitize, hpp
- 1.7 `services/mailService.js` + `jobs/mailQueue.js` — enqueue, send, backoff retry
- 1.8 `sockets/` — JWT handshake auth, room registry

### Phase 2 — Models
- 2.1–2.16: one file per collection above, with indexes and schema-level validation

### Phase 3 — Auth & profile (FR-1)
- 3.1 Register / login / refresh / logout, bcrypt, JWT
- 3.2 Password reset by email token
- 3.3 `protect` + `restrictTo` middleware
- 3.4 Profile read/update, avatar upload, password change
- 3.5 `views/userView.js` — self vs public vs admin projections

### Phase 4 — Emergency core (FR-2,3,4,5,10)
- 4.1 Emergency contacts CRUD, dedupe, cap
- 4.2 `services/sosService.js` — activate, append location, resolve, duration
- 4.3 Tracking token + public live-tracking endpoint (expiring, revocable)
- 4.4 SOS alert email template (name, medical info, coords, map link, tracking link)
- 4.5 "I'm safe" resolution email
- 4.6 SOS history with pagination
- 4.7 Socket channel for live trail

### Phase 5 — Incidents (FR-6,7,8,9,11)
- 5.1 Multer upload (image/video/audio), magic-byte + size validation
- 5.2 Create / list / detail / update / delete with ownership checks
- 5.3 Geo search: bbox + radius, category filter, keyword text search
- 5.4 Comments
- 5.5 Reactions (helpful / important / support) — one per user per incident
- 5.6 Verification status lifecycle

### Phase 6 — Moderation (FR-12,13)
- 6.1 Report content
- 6.2 Moderator queue, resolve/dismiss, remove content, suspend user
- 6.3 Suspension enforcement in `protect`

### Phase 7 — Safety groups (FR-14,15,16,17)
- 7.1 Create / list / detail / leave / delete, owner transfer
- 7.2 Invite by email or username, accept/decline
- 7.3 Group messaging REST + socket
- 7.4 Share location to group
- 7.5 Group SOS fan-out (notification + socket + email)

### Phase 8 — Places (FR-18,19,20)
- 8.1 Overpass proxy with in-memory TTL cache + throttle
- 8.2 Nominatim geocode/reverse proxy
- 8.3 Safe places CRUD
- 8.4 Geofence evaluation endpoint, enter/leave events, optional contact email

### Phase 9 — Content & support (FR-21,22,23)
- 9.1 Resources CRUD (admin) + public list/detail + seed data
- 9.2 Bookmarks
- 9.3 Feedback submit + admin triage

### Phase 10 — Admin (FR-24,25)
- 10.1 Analytics aggregations: counts, by category, by month, top areas
- 10.2 User management: list, role change, suspend/reinstate
- 10.3 Audit log viewer

### Phase 11 — Client shell
- 11.1 Vite config, proxy, axios instance with refresh interceptor
- 11.2 Auth context, protected/role routes
- 11.3 Layout, nav, toast system, design tokens CSS
- 11.4 Login / register / forgot / reset pages

### Phase 12 — Client features
- 12.1 Dashboard + always-visible one-tap SOS (NFR-6)
- 12.2 SOS active screen, history, public tracking page
- 12.3 Contacts, profile
- 12.4 Incident feed, create form w/ media, detail, comments, reactions
- 12.5 Safety map (Leaflet clustering)
- 12.6 Groups + chat
- 12.7 Nearby services, safe places
- 12.8 Resources, bookmarks, feedback
- 12.9 Admin dashboard
- 12.10 Accessibility pass (NFR-13), responsive pass (NFR-8)

### Phase 13 — Testing
- 13.1 Jest + supertest + in-memory Mongo harness
- 13.2 Suites: auth, contacts, sos, incidents, moderation, groups, places, admin
- 13.3 Unit tests: haversine, mail retry backoff, presenters

### Phase 15 — Safety check-in (FR-26)
- 15.1 `SafetyCheckIn` model: dueAt, graceMinutes, escalateAt, status
- 15.2 `services/checkInService.js` — start, confirm, extend, cancel
- 15.3 Scheduler: prompt at `dueAt`, escalate at `escalateAt`
- 15.4 Escalation calls `sosService.activate` with trigger `timer`, so a missed
       check-in produces exactly the same alert as the button
- 15.5 Client page, live countdown, and a prompt banner in the app shell

### Phase 14 — Hardening
- 14.1 Self-review sweep for logical / technical / security defects, written up
- 14.2 Fix, re-run
- 14.3 README, API reference, backup script (NFR-11)

---

## 5. Non-functional requirement traceability

| NFR | Where it is implemented |
|---|---|
| 1 Performance | indexes, `.lean()`, pagination caps, POI cache, compression |
| 2 Availability | `/api/health`, stateless API, graceful shutdown |
| 3 Reliability | `MailJob` durable queue + backoff cron, SOS retry on reconnect |
| 4 Security | helmet, bcrypt(12), JWT, rate limits, sanitize, hpp, upload validation |
| 5 Privacy | view presenters, explicit consent flags, expiring tracking tokens |
| 6 Usability | single-tap SOS on every authed screen |
| 7 Scalability | stateless, indexed, paginated, no server-held session state |
| 8 Compatibility | responsive CSS, no browser-specific APIs without fallback |
| 9 Maintainability | MVC layering, one concern per file, JSDoc on services |
| 10 Data integrity | schema validation, unique compound indexes, referential cleanup |
| 11 Backup | `scripts/backup.js` wrapping mongodump + restore notes |
| 12 Notification reliability | mail queue, delivery status per contact, manual resend |
| 13 Accessibility | semantic HTML, ARIA, focus rings, 4.5:1 contrast, 16px base |
| 14 Error handling | central handler, field-level messages, client preserves form state |
| 15 Audit logging | `AuditLog` written by `auditService` on every sensitive action |
