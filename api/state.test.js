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

test('GET returns stored state', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

  const stored = { foo: 'bar' };
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.deepEqual(body, ['GET', 'parking_app_state_v1']);
    return {
      ok: true,
      json: async () => ({ result: JSON.stringify(stored) }),
    };
  };

  try {
    const req = { method: 'GET' };
    const res = createRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, stored);
  } finally {
    global.fetch = originalFetch;
  }
});

test('PUT persists state and returns ok', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

  let store;
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const [cmd, key, value] = JSON.parse(opts.body);
    assert.equal(key, 'parking_app_state_v1');
    if (cmd === 'SET') {
      store = value;
      return { ok: true, json: async () => ({}) };
    }
    if (cmd === 'GET') {
      return { ok: true, json: async () => ({ result: store }) };
    }
  };

  try {
    const payload = { spots: {}, models: {}, version: 1 };
    const resPut = createRes();
    await handler({ method: 'PUT', body: payload }, resPut);
    assert.equal(resPut.statusCode, 200);
    assert.deepEqual(resPut.body, { ok: true });

    const resGet = createRes();
    await handler({ method: 'GET' }, resGet);
    assert.equal(resGet.statusCode, 200);
    assert.deepEqual(resGet.body, payload);
  } finally {
    global.fetch = originalFetch;
  }
});

test('PUT invalid state returns 400', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  const originalFetch = global.fetch;
  global.fetch = () => { throw new Error('should not fetch'); };

  try {
    const res = createRes();
    await handler({ method: 'PUT', body: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'version must be a number' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Upstash GET failure returns 500', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 });

  try {
    const res = createRes();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Upstash PUT failure returns 500', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'url';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500 });

  try {
    const res = createRes();
    const payload = { spots: {}, models: {}, version: 1 };
    await handler({ method: 'PUT', body: payload }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Server error' });
  } finally {
    global.fetch = originalFetch;
  }
});
