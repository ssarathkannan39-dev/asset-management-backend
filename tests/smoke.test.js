const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../app');

test('health check endpoint responds successfully', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.ok(response.headers['content-security-policy']);
  assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('uploaded files are not publicly exposed', async () => {
  const response = await request(app).get('/uploads/demo.txt');
  assert.equal(response.status, 404);
});

test('protected routes reject unauthenticated requests with 401', async () => {
  const response = await request(app).get('/api/assets');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'UnauthorizedError');
});

test('requirement catalog endpoint is mounted and protected', async () => {
  const response = await request(app).get('/api/requirements');
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'UnauthorizedError');
});

test('new dynamic module endpoints are mounted and protected', async () => {
  for (const path of ['/api/components', '/api/kits', '/api/eulas', '/api/import/assets', '/api/calendar/events', '/api/notifications']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} should require authentication`);
    assert.equal(response.body.error, 'UnauthorizedError');
  }
});

test('user records retain assigned menu access permissions', async () => {
  const User = require('../models/User');
  const user = new User({
    name: 'Menu Access User',
    email: 'menu.access@example.com',
    password: 'Password123',
    role: 'admin',
    menuAccess: ['assets', 'maintenance', 'reports'],
  });

  assert.deepEqual(user.menuAccess, ['assets', 'maintenance', 'reports']);
  assert.ok(User.schema.path('menuAccess'));
});

test('login cookie is scoped to the app root so protected API calls keep working', async () => {
  const User = require('../models/User');
  const AuditLog = require('../models/AuditLog');
  const authController = require('../controllers/authController');

  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

  const originalFindOne = User.findOne;
  const originalCreate = AuditLog.create;
  const email = 'cookie.scope@example.com';
  const password = 'Pass12345';

  const user = {
    _id: 'user-1',
    email,
    active: true,
    role: 'superadmin',
    refreshTokenVersion: 1,
    comparePassword: async () => true,
    toSafeJSON: () => ({ id: 'user-1', email, role: 'superadmin' }),
    save: async () => {},
  };

  user.select = async () => user;
  User.findOne = () => ({ select: async () => user });
  AuditLog.create = async () => ({ ok: true });

  const cookies = [];
  const res = {
    cookie(name, value, options) {
      cookies.push({ name, value, options });
    },
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await authController.login({ body: { email, password }, headers: {} }, res, () => {});
  } finally {
    User.findOne = originalFindOne;
    AuditLog.create = originalCreate;
  }

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, 'refresh_token');
  assert.equal(cookies[0].options.path, '/');
  assert.equal(cookies[0].options.sameSite, 'lax');
  assert.ok(res.payload.accessToken);
  assert.equal(res.payload.user.email, email);
});

test('invalid refresh tokens clear the stale refresh cookie', async () => {
  const response = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', 'refresh_token=stale-token');

  assert.equal(response.status, 401);
  assert.ok(response.headers['set-cookie']?.some((cookie) => cookie.startsWith('refresh_token=;')));
});

test('logout clears a stale session without requiring an access token', async () => {
  const response = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', 'refresh_token=stale-token');

  assert.equal(response.status, 204);
  assert.ok(response.headers['set-cookie']?.some((cookie) => cookie.startsWith('refresh_token=;')));
});
