export const stateSchema = {
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

export default function validateState(payload) {
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
