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

// parse json first
app.use(express.json({ limit: "2mb" }));

app.use(cors());

// serve your frontend from /public (make sure the folder exists)
app.use(express.static(path.join(__dirname, "public")));

const FILE = path.join(__dirname, "state.json");

// ensure state file exists
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

function readState() {
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
  await fs.promises.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
  return state;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

function eventsHandler(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  clients.add(res);
  res.write("data: " + JSON.stringify(readState()) + "\n\n");

  req.on("close", () => {
    clients.delete(res);
  });
}

function getStateHandler(_req, res) {
  res.set("Cache-Control", "no-store");
  res.json(readState());
}

async function putStateHandler(req, res) {
  const id = req.get("x-editor-id");
  if (id !== editorId) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  const err = validateState(req.body);
  if (err) {
    return res.status(400).json({ ok: false, error: err });
  }
  const { spots, models, version } = req.body;
  const state = await writeState({ spots, models, version });
  for (const client of clients) {
    client.write("data: " + JSON.stringify(state) + "\n\n");
  }
  res.json({ ok: true, state });
}

app.get("/state", getStateHandler);
app.get("/api/state", getStateHandler);
app.put("/state", putStateHandler);
app.put("/api/state", putStateHandler);

function postLockHandler(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ locked: false, editorId });

  if (!editorId) {
    editorId = id;
    if (lockTimer) clearTimeout(lockTimer);
    lockTimer = setTimeout(() => releaseLock(id), LOCK_TIMEOUT);
    return res.json({ locked: true, editorId });
  }
  return res.json({ locked: editorId === id, editorId });
}

function deleteLockHandler(req, res) {
  releaseLock(req.params.id);
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
app.listen(port, () => console.log("State server listening on " + port));
