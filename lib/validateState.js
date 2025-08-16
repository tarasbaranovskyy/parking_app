export const dataSchema = {
  type: "object",
  required: ["spots", "models"],
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
    stats: { type: "object", additionalProperties: true },
    vehicles: { type: "array" },
  },
  additionalProperties: false,
};

export const stateSchema = {
  type: "object",
  required: ["version", "updatedAt", "data"],
  properties: {
    version: { type: "number" },
    updatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
    data: dataSchema,
  },
  additionalProperties: false,
};

export function validateState(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "data must be an object";
  }
  const { spots, models, stats, vehicles } = payload;
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
  if (stats !== undefined) {
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
      return "stats must be an object";
    }
  }
  if (vehicles !== undefined) {
    if (!Array.isArray(vehicles)) {
      return "vehicles must be an array";
    }
  }
  return null;
}

export function validateEnvelope(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "request body must be an object";
  }
  const { version, updatedAt, data } = payload;
  if (typeof version !== "number") return "version must be a number";
  if (typeof updatedAt !== "string" && updatedAt !== null) {
    return "updatedAt must be string or null";
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "data must be an object";
  }
  return validateState(data);
}

export default validateEnvelope;

