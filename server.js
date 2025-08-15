// server.js (ESM)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import validateState from "./lib/validateState.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// in-memory editor lock and SSE clients
let editorId = null;
const clients = new Set();
let lockTimer = null;
const LOCK_TIMEOUT = 30_000; // 30s

function releaseLock(id) {
  if (editorId === id) {
    editorId = null;
  }
  if (lockTimer) {
    clearTimeout(lockTimer);
    lockTimer = null;
  }
}

// Enhanced function to broadcast lock status to all clients
function broadcastLockStatus() {
  const lockStatus = { 
    type: 'lock_status', 
    editorId, 
    locked: !!editorId,
    timestamp: new Date().toISOString()
  };
  for (const client of clients) {
    try {
      client.write("data: " + JSON.stringify(lockStatus) + "\n\n");
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Function to broadcast state updates to all clients
function broadcastStateUpdate(state) {
  for (const client of clients) {
    try {
      client.write("data: " + JSON.stringify({ type: 'state_update', ...state }) + "\n\n");
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Connection health monitoring - clean up disconnected clients
function cleanupClients() {
  const toRemove = [];
  for (const client of clients) {
    try {
      client.write(": heartbeat\n\n");
    } catch (e) {
      toRemove.push(client);
    }
  }
  toRemove.forEach(client => clients.delete(client));
}

// Clean up disconnected clients every 30 seconds
setInterval(cleanupClients, 30000);

// parse json first
app.use(express.json({ limit: "2mb" }));

app.use(cors());

// serve your frontend from /public (make sure the folder exists)
app.use(express.static(path.join(__dirname, "public")));

const FILE = path.join(__dirname, "state.json");

// Upstash Redis configuration (optional)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "parking_app_state_v1";
const useRedis = REDIS_URL && REDIS_TOKEN;

// ensure state file exists for local fallback
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(
    FILE,
    JSON.stringify(
      {
        spots: {},
        models: {},
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

async function redis(cmd, ...args) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!r.ok) throw new Error(`Upstash ${cmd} failed: ${r.status}`);
  return r.json();
}

async function readState() {
  if (useRedis) {
    try {
      const { result } = await redis("GET", REDIS_KEY);
      if (result) return JSON.parse(result);
    } catch (e) {
      console.warn("Redis GET failed, falling back to file:", e);
    }
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {
      spots: {},
      models: {},
      version: 1,
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeState(obj) {
  const state = {
    ...obj,
    updatedAt: new Date().toISOString(),
    version: (obj.version || 0) + 1,
  };
  if (useRedis) {
    try {
      await redis("SET", REDIS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Redis SET failed, writing to file:", e);
      await fs.promises.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
    }
  } else {
    await fs.promises.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
  }
  return state;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

async function eventsHandler(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  clients.add(res);
  
  // Send current state and lock status immediately
  const currentState = await readState();
  res.write("data: " + JSON.stringify({ type: 'state_update', ...currentState }) + "\n\n");
  
  // Send current lock status
  const lockStatus = { 
    type: 'lock_status', 
    editorId, 
    locked: !!editorId,
    timestamp: new Date().toISOString()
  };
  res.write("data: " + JSON.stringify(lockStatus) + "\n\n");

  req.on("close", () => {
    clients.delete(res);
  });
}

async function getStateHandler(_req, res) {
  res.set("Cache-Control", "no-store");
  const state = await readState();
  res.json(state);
}

async function putStateHandler(req, res) {
  const id = req.get("x-editor-id");
  
  // Validate state regardless of lock status
  const err = validateState(req.body);
  if (err) {
    return res.status(400).json({ ok: false, error: err });
  }

  const { spots, models, version } = req.body;
  const state = await writeState({ spots, models, version });
  
  // Always broadcast updated state to all clients
  broadcastStateUpdate(state);

  // If the editor ID doesn't match, return 403, but the state has already been updated and broadcast.
  if (id !== editorId) {
    return res.status(403).json({ ok: false, error: "Forbidden - you don't have the edit lock" });
  }

  res.json({ ok: true, state });
}

app.get("/state", getStateHandler);
app.get("/api/state", getStateHandler);
app.put("/state", putStateHandler);
app.put("/api/state", putStateHandler);

function postLockHandler(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ locked: false, editorId, error: "Missing editor ID" });

  if (!editorId) {
    editorId = id;
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      releaseLock(id);
      broadcastLockStatus(); // Broadcast when lock times out
    }, LOCK_TIMEOUT);
    broadcastLockStatus(); // Broadcast when lock is acquired
    return res.json({ locked: true, editorId });
  }
  return res.json({ locked: editorId === id, editorId });
}

function deleteLockHandler(req, res) {
  releaseLock(req.params.id);
  broadcastLockStatus(); // Broadcast when lock is released
  res.json({ ok: true, editorId });
}

app.get("/events", eventsHandler);
app.get("/api/events", eventsHandler);
app.post("/lock", postLockHandler);
app.post("/api/lock", postLockHandler);
app.delete("/lock/:id", deleteLockHandler);
app.delete("/api/lock/:id", deleteLockHandler);

// catch-all: serve index.html if someone hits a route directly
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log("State server listening on " + port));

