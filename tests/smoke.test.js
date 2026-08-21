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
