// /api/state.js — Vercel Serverless Function (Upstash Redis backend)
import validateState from "../lib/validateState.js";

function normalizeState(obj) {
  if (obj && !obj.data) {
    const {
      spots = {},
      vehicles = {},
      models = {},
      stats = {},
      version = 0,
      updatedAt = null,
    } = obj;
    return { version, updatedAt, data: { spots, vehicles, models, stats } };
  }
  return obj;
}

let editorId = null;
const clients = new Set();
let lockTimer = null;
const LOCK_TIMEOUT = 30_000;

function releaseLock(id) {
  if (editorId === id) {
    editorId = null;
  }
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}

export default async function handler(req, res) {
  // CORS (safe even if same-origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-editor-id");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { pathname } = new URL(req.url || "/api/state", "http://localhost");

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(500).json({ error: "KV not configured" });
  }

  const KEY = "parking_app_state_v1";

  async function redis(cmd, ...args) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([cmd, ...args]),
    });
    if (!r.ok) throw new Error(`Upstash ${cmd} failed: ${r.status}`);
    return r.json();
  }

  try {
    if (pathname.endsWith("/events") && req.method === "GET") {
      const { result } = await redis("GET", KEY);
      let state = {};
      if (result) {
        try {
          state = normalizeState(JSON.parse(result));
        } catch {
          state = {};
        }
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      clients.add(res);
      res.write("data: " + JSON.stringify(state) + "\n\n");
      req.on("close", () => {
        clients.delete(res);
      });
      return;
    }

    if (pathname.endsWith("/lock") && req.method === "POST") {
      let body = req.body;
      try {
        body = typeof body === "string" ? JSON.parse(body) : body;
      } catch {
        body = {};
      }
      const { id } = body || {};
      if (!id) return res.status(400).json({ locked: false, editorId });

      if (!editorId) {
        editorId = id;
        if (lockTimer) clearTimeout(lockTimer);
        lockTimer = setTimeout(() => releaseLock(id), LOCK_TIMEOUT);
        return res.status(200).json({ locked: true, editorId });
      }
      return res.status(200).json({ locked: editorId === id, editorId });
    }

    if (pathname.includes("/lock/") && req.method === "DELETE") {
      const id = pathname.split("/").pop();
      releaseLock(id);
      return res.status(200).json({ ok: true, editorId });
    }

    if (pathname.endsWith("/state") && req.method === "GET") {
      const { result } = await redis("GET", KEY);
      if (!result) return res.status(200).json({});
      try {
        return res.status(200).json(normalizeState(JSON.parse(result)));
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    if (pathname.endsWith("/state") && req.method === "PUT") {
      const reqId = (req.headers || {})["x-editor-id"];
      if (reqId !== editorId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      let payload;
      try {
        payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
      const err = validateState(payload);
      if (err) {
        return res.status(400).json({ error: err });
      }
      const state = {
        version: (payload.version || 0) + 1,
        updatedAt: new Date().toISOString(),
        data: payload.data,
      };
      await redis("SET", KEY, JSON.stringify(state));
      for (const client of clients) {
        try {
          client.write("data: " + JSON.stringify(state) + "\n\n");
        } catch {
          /* ignore write errors */
        }
      }
      return res.status(200).json({ ok: true, state });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
