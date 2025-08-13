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

// parse json first
app.use(express.json({ limit: "2mb" }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "PUT", "OPTIONS"],
  })
);

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

function getStateHandler(_req, res) {
  res.set("Cache-Control", "no-store");
  res.json(readState());
}

async function putStateHandler(req, res) {
  const err = validateState(req.body);
  if (err) {
    return res.status(400).json({ ok: false, error: err });
  }
  const { spots, models, version } = req.body;
  const state = await writeState({ spots, models, version });
  res.json({ ok: true, state });
}

app.get("/state", getStateHandler);
app.get("/api/state", getStateHandler);
app.put("/state", putStateHandler);
app.put("/api/state", putStateHandler);

// catch-all: serve index.html if someone hits a route directly
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("State server listening on " + port));
