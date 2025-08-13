// /api/state.js — Vercel Serverless Function (Upstash Redis backend)
import validateState from "../lib/validateState.js";

export default async function handler(req, res) {
  // CORS (safe even if same-origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const url   = process.env.UPSTASH_REDIS_REST_URL;
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
    if (req.method === "GET") {
      const { result } = await redis("GET", KEY);
      if (!result) return res.status(200).json({});
      try {
        return res.status(200).json(JSON.parse(result));
      } catch (e) {
        return res.status(400).json({ error: "Invalid JSON" });
      }
    }

    if (req.method === "PUT") {
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
      await redis("SET", KEY, JSON.stringify(payload));
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}
