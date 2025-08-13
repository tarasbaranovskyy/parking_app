import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './state.js';

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

test('PUT invalid JSON returns 400', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

  const req = { method: 'PUT', body: '{invalid}' };
  const res = createRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid JSON' });
});
