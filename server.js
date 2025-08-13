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

// JSON schema describing the expected shape of incoming state
const stateSchema = {
  type: "object",
  required: ["spots", "models", "version"],
  properties: {
    spots: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["status", "vehicle"],
        properties: {
          status: { type: "string" },
          vehicle: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                required: [
                  "model",
                  "variant",
                  "year",
                  "color",
                  "tires",
                  "vin",
                  "plate",
                ],
                properties: {
                  model: { type: "string" },
                  variant: { type: "string" },
                  year: { type: "string" },
                  color: { type: "string" },
                  tires: { type: "string" },
                  vin: { type: "string" },
                  plate: { type: "string" },
                },
                additionalProperties: false,
              },
            ],
          },
        },
        additionalProperties: false,
      },
    },
    models: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
    version: { type: "number" },
  },
  additionalProperties: false,
};

function validateState(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "request body must be an object";
  }
  const { spots, models, version } = payload;
  if (typeof version !== "number") return "version must be a number";
  if (!spots || typeof spots !== "object" || Array.isArray(spots)) {
    return "spots must be an object";
  }
  for (const [id, spot] of Object.entries(spots)) {
    if (!spot || typeof spot !== "object" || Array.isArray(spot)) {
      return `spot '${id}' must be an object`;
    }
    if (typeof spot.status !== "string") {
      return `spot '${id}' missing string status`;
    }
    if (spot.vehicle !== null) {
      if (
        !spot.vehicle ||
        typeof spot.vehicle !== "object" ||
        Array.isArray(spot.vehicle)
      ) {
        return `spot '${id}' vehicle must be object or null`;
      }
      const fields = [
        "model",
        "variant",
        "year",
        "color",
        "tires",
        "vin",
        "plate",
      ];
      for (const f of fields) {
        if (typeof spot.vehicle[f] !== "string") {
          return `spot '${id}' vehicle.${f} must be string`;
        }
      }
    }
  }
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    return "models must be an object";
  }
  for (const [brand, arr] of Object.entries(models)) {
    if (!Array.isArray(arr)) {
      return `models.${brand} must be an array`;
    }
    for (const item of arr) {
      if (typeof item !== "string") {
        return `models.${brand} items must be strings`;
      }
    }
  }
  return null;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/state", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(readState());
});

app.put("/state", (req, res) => {
  const err = validateState(req.body);
  if (err) {
    return res.status(400).json({ ok: false, error: err });
  }
  const { spots, models, version } = req.body;
  res.json({ ok: true, state: writeState({ spots, models, version }) });
});

// catch-all: serve index.html if someone hits a route directly
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("State server listening on " + port));
