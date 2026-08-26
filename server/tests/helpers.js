import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { ROLES } from '../src/config/constants.js';

/** Shared fixtures so each test file does not reinvent account creation. */

let counter = 0;

function uniqueSuffix() {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

/**
 * Registers a user through the API, so the password hashing, token issuing and
 * validation paths are exercised exactly as they are in production.
 *
 * @returns {Promise<{user:object, token:string, agent:object, password:string}>}
 */
async function createUser(overrides = {}) {
  const suffix = uniqueSuffix();
  const password = overrides.password || 'Password123';

  const payload = {
    name: overrides.name || 'Test User',
    username: overrides.username || `user${suffix}`,
    email: overrides.email || `user${suffix}@example.com`,
    password,
    ...(overrides.phone ? { phone: overrides.phone } : {}),
  };

  const response = await request(app).post('/api/auth/register').send(payload);

  if (response.status !== 201) {
    throw new Error(`Fixture user creation failed: ${JSON.stringify(response.body)}`);
  }

  const { user, accessToken } = response.body.data;

  // Fields the register endpoint does not accept are applied directly.
  const direct = {};
  if (overrides.role) direct.role = overrides.role;
  if (overrides.bloodGroup) direct.bloodGroup = overrides.bloodGroup;
  if (overrides.medicalInfo) direct.medicalInfo = overrides.medicalInfo;
  if (overrides.accountStatus) direct.accountStatus = overrides.accountStatus;

  if (Object.keys(direct).length) {
    await User.updateOne({ _id: user.id }, { $set: direct });
    Object.assign(user, direct);
  }

  return { user, token: accessToken, password, cookie: extractCookie(response) };
}

function createAdmin(overrides = {}) {
  return createUser({ ...overrides, role: ROLES.ADMIN });
}

function createModerator(overrides = {}) {
  return createUser({ ...overrides, role: ROLES.MODERATOR });
}

/**
 * A role change bumps tokenVersion, so a token minted at registration is dead.
 * Signing in again is the honest way to get a usable one.
 */
async function signIn(identifier, password = 'Password123') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier, password });

  if (response.status !== 200) {
    throw new Error(`Sign-in failed: ${JSON.stringify(response.body)}`);
  }
  return { token: response.body.data.accessToken, user: response.body.data.user };
}

/** Creates a user and returns a token that reflects any role override. */
async function createUserWithFreshToken(overrides = {}) {
  const created = await createUser(overrides);
  if (overrides.role) {
    const { token } = await signIn(created.user.email, created.password);
    return { ...created, token };
  }
  return created;
}

function extractCookie(response) {
  const cookies = response.headers['set-cookie'];
  if (!cookies) return null;
  const refresh = cookies.find((cookie) => cookie.startsWith('refreshToken='));
  return refresh ? refresh.split(';')[0] : null;
}

/** `auth(token).get('/api/...')` reads better than repeating .set() everywhere. */
function auth(token) {
  const agent = request(app);
  const wrap = (method) => (url) => agent[method](url).set('Authorization', `Bearer ${token}`);

  return {
    get: wrap('get'),
    post: wrap('post'),
    patch: wrap('patch'),
    put: wrap('put'),
    delete: wrap('delete'),
  };
}

/** Dhaka, roughly. Used so geo queries have realistic coordinates. */
const DHAKA = { lat: 23.8103, lng: 90.4125 };

/** Offsets a point by approximately `meters` to the north. */
function offsetNorth(point, meters) {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

/**
 * Waits for work the controller deliberately did not await.
 *
 * An SOS responds before its fan-out finishes, and a check-in escalates from a
 * scheduler tick, so a test that asserts on the resulting mail or notifications
 * has to let the microtask queue drain first. One value in one place, so a
 * flaky suite is tuned here rather than in five files that had drifted to two
 * different numbers.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 350));

/**
 * Gives a user someone to alert. Most suites only care that a contact exists.
 *
 * @param {string} token
 * @param {object} [overrides] anything the contact endpoint accepts
 */
async function addContact(token, overrides = {}) {
  const response = await auth(token)
    .post('/api/contacts')
    .send({
      name: 'Mother',
      email: `contact${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`,
      phone: '+8801711111111',
      relationship: 'Mother',
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.data.contact;
}

export { app, request, createUser, createAdmin, createModerator, createUserWithFreshToken, signIn, auth, extractCookie, settle, addContact, DHAKA, offsetNorth };