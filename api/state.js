// /api/state.js — Vercel Serverless Function using Vercel KV

const memoryStore = new Map();
export function __reset() {
  memoryStore.clear();
}

let kvClient;
try {
  const mod = await import('@vercel/kv');
  kvClient = mod.kv;
} catch {
  kvClient = {
    async get(key) {
      return memoryStore.get(key);
    },
    async set(key, value) {
      memoryStore.set(key, value);
    },
  };
}

const KEY = 'parking:state';
const DEFAULT_STATE = {
  version: 0,
  updatedAt: null,
  data: { spots: {}, models: {}, stats: {}, vehicles: [] },
};

const ORIGIN_RE = /^https?:\/\/([^\/]+\.)?(vercel\.app|csb\.app|codesandbox\.io)$/;

export default async function handler(req, res) {
  const { KV_REST_API_URL, KV_REST_API_TOKEN, KV_URL } = process.env;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN || !KV_URL) {
    return res.status(500).json({ error: 'KV not configured' });
  }

  const origin = req.headers?.origin || '';
  if (ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,If-Match-Version');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    let state = await kvClient.get(KEY);
    if (!state) state = { ...DEFAULT_STATE };

    if (req.method === 'GET') {
      return res.status(200).json(state);
    }

    if (req.method === 'PUT') {
      const headers = req.headers || {};
      const matchVersion = headers['if-match-version'] ?? headers['If-Match-Version'];
      const currentVersion = state.version || 0;
      if (Number(matchVersion) !== currentVersion) {
        return res.status(409).json({ currentVersion });
      }
      let parsedBody;
      try {
        parsedBody =
          typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
      const { data } = parsedBody || {};
      if (data === undefined) {
        return res.status(400).json({ error: 'Missing data' });
      }
      state = {
        version: currentVersion + 1,
        updatedAt: new Date().toISOString(),
        data,
      };
      await kvClient.set(KEY, state);
      return res.status(200).json(state);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
