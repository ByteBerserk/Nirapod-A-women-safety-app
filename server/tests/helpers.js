import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { ROLES } from '../src/config/constants.js';

let counter = 0;

function uniqueSuffix() {
  counter += 1;
  return `${Date.now().toString(36)}${counter}`;
}

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

async function signIn(identifier, password = 'Password123') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ identifier, password });

  if (response.status !== 200) {
    throw new Error(`Sign-in failed: ${JSON.stringify(response.body)}`);
  }
  return { token: response.body.data.accessToken, user: response.body.data.user };
}

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

const DHAKA = { lat: 23.8103, lng: 90.4125 };

function offsetNorth(point, meters) {
  return { lat: point.lat + meters / 111320, lng: point.lng };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 350));

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
