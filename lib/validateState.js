export const stateSchema = {
  type: "object",
  required: ["version", "data"],
  properties: {
    version: { type: "number" },
    updatedAt: {
      anyOf: [
        { type: "string" },
        { type: "null" },
      ],
    },
    data: {
      type: "object",
      required: ["spots", "vehicles", "models", "stats"],
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
        vehicles: {
          type: "object",
          additionalProperties: {
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
        },
        models: {
          type: "object",
          additionalProperties: {
            type: "array",
            items: { type: "string" },
          },
        },
        stats: {
          type: "object",
          additionalProperties: { type: "number" },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

export default function validateState(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "request body must be an object";
  }
  const { version, updatedAt, data } = payload;
  if (typeof version !== "number") return "version must be a number";
  if (updatedAt !== undefined && updatedAt !== null && typeof updatedAt !== "string") {
    return "updatedAt must be a string or null";
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "data must be an object";
  }
  const { spots, vehicles, models, stats } = data;
  if (!spots || typeof spots !== "object" || Array.isArray(spots)) {
    return "data.spots must be an object";
  }
  for (const [id, spot] of Object.entries(spots)) {
    if (!spot || typeof spot !== "object" || Array.isArray(spot)) {
      return `data.spots['${id}'] must be an object`;
    }
    if (typeof spot.status !== "string") {
      return `data.spots['${id}'] missing string status`;
    }
    if (spot.vehicle !== null) {
      if (
        !spot.vehicle ||
        typeof spot.vehicle !== "object" ||
        Array.isArray(spot.vehicle)
      ) {
        return `data.spots['${id}'] vehicle must be object or null`;
      }
      const fields = ["model", "variant", "year", "color", "tires", "vin", "plate"];
      for (const f of fields) {
        if (typeof spot.vehicle[f] !== "string") {
          return `data.spots['${id}'] vehicle.${f} must be string`;
        }
      }
    }
  }
  if (!vehicles || typeof vehicles !== "object" || Array.isArray(vehicles)) {
    return "data.vehicles must be an object";
  }
  for (const [id, v] of Object.entries(vehicles)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return `data.vehicles['${id}'] must be an object`;
    }
    const fields = ["model", "variant", "year", "color", "tires", "vin", "plate"];
    for (const f of fields) {
      if (typeof v[f] !== "string") {
        return `data.vehicles['${id}'].${f} must be string`;
      }
    }
  }
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    return "data.models must be an object";
  }
  for (const [brand, arr] of Object.entries(models)) {
    if (!Array.isArray(arr)) {
      return `data.models.${brand} must be an array`;
    }
    for (const item of arr) {
      if (typeof item !== "string") {
        return `data.models.${brand} items must be strings`;
      }
    }
  }
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return "data.stats must be an object";
  }
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value !== "number") {
      return `data.stats.${key} must be number`;
    }
  }
  return null;
}
