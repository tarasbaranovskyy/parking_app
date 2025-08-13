const canvas = document.getElementById("parking-canvas");

function createSpot(id, x, y, orientation = "vertical") {
  return {
    id,
    x,
    y,
    orientation,
    status: "available",
    vehicle: null,
  };
}

function createRow(
  idPrefix,
  startX,
  startY,
  count,
  orientation = "vertical",
  spacing = 70,
  reverse = false
) {
  return Array.from({ length: count }, (_, i) => {
    const index = reverse ? count - 1 - i : i;
    return createSpot(
      `${idPrefix}-${i + 1}`,
      startX + index * spacing,
      startY,
      orientation
    );
  });
}

const layout = [
  ...createRow("A1", 100, 600, 10),
  ...createRow("A2", 100, 700, 10),
  ...createRow("B1", 100, 1000, 12),
  ...createRow("B2", 100, 1100, 12),
  ...createRow("B3V", 800, 1200, 5, "vertical", -70),
  ...createRow("B3H", 420, 1200, 2, "horizontal", -90),
  ...createRow("C1", 800, 100, 7),
  ...createRow("C2", 800, 200, 8),
  ...createRow("C3", 870, 300, 8),
  ...createRow("C4", 870, 400, 9),
  ...createRow("C5", 870, 500, 8),
  ...createRow("C6", 870, 600, 7),
  ...createRow("C7V", 870, 700, 3),
  ...createRow("C7H", 1060, 720, 1, "horizontal"),
  ...createRow("D1V", 1650, -230, 2),
  ...createRow("D1H", 1800, -210, 4, "horizontal", 120),
  ...createRow("D2", 1800, -140, 8),
  ...createRow("D3", 1800, -40, 8),
  ...createRow("D4", 1800, 60, 8),
  ...createRow("E1", 1040, 1000, 6),
  ...createRow("E2", 1040, 1100, 6),
  ...createRow("E3", 1040, 1200, 6),
];

const spotElMap = new Map();

export function initLayout(openWidget) {
  // Render normal spots (A–C)
  layout.forEach((spot) => {
    if (spot.id.startsWith("D") || spot.id.startsWith("E")) return;
    const el = document.createElement("div");
    el.className = `parking-spot ${spot.orientation === "horizontal" ? "horizontal" : ""}`;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    el.title = spot.id;
    el.addEventListener("click", () => openWidget(spot));
    canvas.appendChild(el);
    spotElMap.set(spot.id, el);
  });

  // Rotated block D
  const blockD = document.createElement("div");
  blockD.className = "parking-block";
  blockD.style.transform = "rotate(90deg)";
  blockD.style.transformOrigin = "1400px 400px";
  layout.forEach((spot) => {
    if (!spot.id.startsWith("D")) return;
    const el = document.createElement("div");
    el.className = `parking-spot ${spot.orientation === "horizontal" ? "horizontal" : ""}`;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    el.title = spot.id;
    el.addEventListener("click", () => openWidget(spot));
    blockD.appendChild(el);
    spotElMap.set(spot.id, el);
  });
  canvas.appendChild(blockD);

  // Rotated block E
  const blockE = document.createElement("div");
  blockE.className = "parking-block";
  blockE.style.transform = "rotate(25deg)";
  blockE.style.transformOrigin = "1100px 1000px";
  layout.forEach((spot) => {
    if (!spot.id.startsWith("E")) return;
    const el = document.createElement("div");
    el.className = `parking-spot ${spot.orientation === "horizontal" ? "horizontal" : ""}`;
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    el.title = spot.id;
    el.addEventListener("click", () => openWidget(spot));
    blockE.appendChild(el);
    spotElMap.set(spot.id, el);
  });
  canvas.appendChild(blockE);
}

function getOrCreateSpotIcon(el) {
  let ic = el.querySelector(".spot-icon");
  if (!ic) {
    ic = document.createElement("img");
    ic.className = "spot-icon";
    ic.src = "car.jpg";
    Object.assign(ic.style, {
      position: "absolute",
      inset: "0",
      width: "70%",
      height: "70%",
      margin: "auto",
      pointerEvents: "none",
      opacity: "0",
      objectFit: "contain",
      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
    });
    el.appendChild(ic);
  }
  return ic;
}

export function renderSpotColor(spot) {
  const el = spotElMap.get(spot.id);
  if (!el) return;
  el.style.backgroundColor = spot.status === "occupied" ? "#ef4444" : "#10b981";
  const icon = getOrCreateSpotIcon(el);
  icon.style.opacity = spot.status === "occupied" ? "1" : "0";
}

export { canvas, layout, spotElMap };
