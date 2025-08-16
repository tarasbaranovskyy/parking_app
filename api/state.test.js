import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { __reset } from './state.js';
import { validateEnvelope } from '../lib/validateState.js';

function createRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

function setEnv() {
  process.env.KV_REST_API_URL = 'url';
  process.env.KV_REST_API_TOKEN = 'token';
  process.env.KV_URL = 'url';
}

test('GET returns default state', async () => {
  __reset();
  setEnv();
  const res = createRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ifError(validateEnvelope(res.body));
  assert.deepEqual(res.body, {
    version: 0,
    updatedAt: null,
    data: { spots: {}, models: {}, stats: {}, vehicles: [] },
  });
});

test('PUT version mismatch returns 409', async () => {
  __reset();
  setEnv();
  const res = createRes();
  await handler(
    { method: 'PUT', headers: { 'If-Match-Version': '1' }, body: { data: {} } },
    res
  );
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { currentVersion: 0 });
});

test('PUT increments version and persists', async () => {
  __reset();
  setEnv();
  const putRes = createRes();
  await handler(
    {
      method: 'PUT',
      headers: { 'If-Match-Version': '0' },
      body: { data: { spots: {}, models: {} } },
    },
    putRes
  );
  assert.equal(putRes.statusCode, 200);
  assert.ifError(validateEnvelope(putRes.body));
  assert.equal(putRes.body.version, 1);
  assert.ok(putRes.body.updatedAt);
  assert.deepEqual(putRes.body.data, { spots: {}, models: {} });

  const getRes = createRes();
  await handler({ method: 'GET' }, getRes);
  assert.ifError(validateEnvelope(getRes.body));
  assert.equal(getRes.body.version, 1);
  assert.deepEqual(getRes.body.data, { spots: {}, models: {} });
});
