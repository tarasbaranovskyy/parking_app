// server.js (ESM)
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// parse json first
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "*", methods: ["GET", "PUT", "OPTIONS"] }));

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

function writeState(obj) {
  const state = {
    ...obj,
    updatedAt: new Date().toISOString(),
    version: (obj.version || 0) + 1,
  };
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
  return state;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/state", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(readState());
});

app.put("/state", (req, res) => {
  const b = req.body || {};
  const next = {
    spots: b.spots && typeof b.spots === "object" ? b.spots : {},
    models: b.models && typeof b.models === "object" ? b.models : {},
    version: b.version || 0,
  };
  res.json({ ok: true, state: writeState(next) });
});

// catch-all: serve index.html if someone hits a route directly
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("State server listening on " + port));
