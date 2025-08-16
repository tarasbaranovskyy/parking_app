// server.js - Minimal state server using Vercel KV fallback
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateState } from "./lib/validateState.js";
import { kv } from "@vercel/kv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const FILE = path.join(__dirname, "state.json");
const KEY = "parking:state";
const DEFAULT_STATE = {
  version: 0,
  updatedAt: null,
  data: { spots: {}, models: {}, stats: {}, vehicles: [] },
};

// Ensure local file exists
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
}

async function readState() {
  try {
    const state = await kv.get(KEY);
    if (state) return state;
  } catch (e) {
    console.warn("KV get failed, falling back to file:", e);
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(state) {
  try {
    await kv.set(KEY, state);
  } catch (e) {
    console.warn("KV set failed, writing to file:", e);
    await fs.promises.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
  }
}

app.get("/state", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const state = await readState();
  res.json(state);
});

app.put("/state", async (req, res) => {
  const current = await readState();
  const matchVersion = req.get("If-Match-Version");
  const currentVersion = current.version || 0;
  if (Number(matchVersion) !== currentVersion) {
    return res.status(409).json({ currentVersion });
  }
  const { data } = req.body || {};
  if (data === undefined) {
    return res.status(400).json({ error: "Missing data" });
  }
  const err = validateState(data);
  if (err) {
    return res.status(400).json({ error: err });
  }
  const newState = {
    version: currentVersion + 1,
    updatedAt: new Date().toISOString(),
    data,
  };
  await writeState(newState);
  res.json(newState);
});

// Catch-all to serve index.html for any other route
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log("State server listening on " + port);
});
