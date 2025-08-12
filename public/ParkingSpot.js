// ===== Remote state (CodeSandbox) =====
// Auto-disable remote state unless we are on CodeSandbox
const REMOTE_BASE = window.location.origin;
const REMOTE_ENABLED = /(?:csb\.app|codesandbox\.io)$/i.test(location.host);

// Optional: version log so you KNOW the fresh build loaded
console.log("Parking App build", "2025-08-12-14:20");


async function remoteLoad() {
  const r = await fetch(`${REMOTE_BASE}/state`, { cache: "no-store" });
  return (await r.json()) || {};
}
async function remoteSave(payload) {
  await fetch(`${REMOTE_BASE}/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* =============== SAFE LOCAL STORAGE HELPERS =============== */
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("Storage save failed:", e); }
}
function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Storage load failed:", e);
    return null;
  }
}

const canvas = document.getElementById("parking-canvas");

/* =============== CORE LAYOUT =============== */
function createSpot(id, x, y, orientation = "vertical") {
  return {
    id,
    x,
    y,
    orientation,
    status: "available",
    vehicle: null, // { model, variant, year, color, vin, plate, tires }
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

/* =============== ZOOM & DRAG =============== */
let zoom = 1;
const minZoom = 0.2, maxZoom = 2;
window.zoomIn = () => {
  zoom = Math.min(maxZoom, zoom + 0.1);
  canvas.style.transform = `scale(${zoom})`;
};
window.zoomOut = () => {
  zoom = Math.max(minZoom, zoom - 0.1);
  canvas.style.transform = `scale(${zoom})`;
};

const wrapper = document.getElementById("canvas-container");
let isDragging = false, startX, startY, scrollLeft, scrollTop;
wrapper.addEventListener("mousedown", (e) => {
  isDragging = true;
  wrapper.classList.add("grabbing");
  startX = e.clientX;
  startY = e.clientY;
  scrollLeft = wrapper.scrollLeft;
  scrollTop = wrapper.scrollTop;
});
wrapper.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  wrapper.scrollLeft = scrollLeft - (e.clientX - startX);
  wrapper.scrollTop = scrollTop - (e.clientY - startY);
});
wrapper.addEventListener("mouseup", () => {
  isDragging = false;
  wrapper.classList.remove("grabbing");
});
wrapper.addEventListener("mouseleave", () => {
  isDragging = false;
  wrapper.classList.remove("grabbing");
});

/* =============== WIDGET + FORM =============== */
let currentSpot = null;
const widget = document.getElementById("info-widget");
const formFields = document.getElementById("form-fields");
const widgetTitle = document.getElementById("widget-title");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");
const actionsBar = document.querySelector(".widget-actions");

// Persistent Clear button
const clearBtn = document.createElement("button");
clearBtn.id = "clear-btn";
clearBtn.textContent = "Clear";
clearBtn.style.display = "none";
clearBtn.addEventListener("click", clearSpotData);
actionsBar.appendChild(clearBtn);

/* =============== STATIC FORM DATA =============== */
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 2004 }, (_, i) => `${2005 + i}`);
const colors = ["Black", "White", "Red", "Blue", "Green", "Silver"];
const tireTypes = ["Summer", "Winter"];

/* =============== HELPERS (FORM/RENDER) =============== */
function createDropdown(name, value, disabled = false, list = []) {
  return `
    <label>${name}<select name="${name}" ${disabled ? "disabled" : ""}>
      ${list.map((opt) => `<option ${value === opt ? "selected" : ""}>${opt}</option>`).join("")}
    </select></label>`;
}
function createInput(name, value = "", disabled = false) {
  return `<label>${name}<input name="${name}" value="${value}" ${disabled ? "readonly" : ""}></label>`;
}
function renderSpotColor(spot) {
  const el = spotElMap.get(spot.id);
  if (!el) return;
  el.style.backgroundColor = spot.status === "occupied" ? "#ef4444" : "#10b981";
  const icon = getOrCreateSpotIcon(el);
  icon.style.opacity = spot.status === "occupied" ? "1" : "0";
}

/* =============== STATE PERSISTENCE (REMOTE + FALLBACK) =============== */
const STORAGE_KEY = "parking_layout_v1"; // fallback only

function mergeModels(local, remote) {
  const out = { ...local };
  for (const [brand, variants] of Object.entries(remote || {})) {
    if (!out[brand]) out[brand] = [];
    const set = new Set(out[brand].map((v) => (v || "").trim()).filter(Boolean));
    (variants || []).forEach((v) => {
      const t = (v || "").trim();
      if (t) set.add(t);
    });
    out[brand] = Array.from(set).sort((a, b) => a.localeCompare(b));
  }
  return out;
}

async function loadState() {
  try {
    if (REMOTE_ENABLED) {
      const s = await remoteLoad();

      // spots
      layout.forEach((spot) => {
        const saved = s.spots?.[spot.id];
        if (saved) {
          spot.status = saved.status || "available";
          spot.vehicle = saved.vehicle || null;
        }
      });

      // models: MERGE server with locally-seeded list (not replace)
      if (s.models && typeof s.models === "object") {
        modelStore = mergeModels(modelStore, s.models);
      }

      // push merged list back to server once so everyone shares it
      await remoteSave({ spots: s.spots || {}, models: modelStore });
      return;
    }
  } catch (e) {
    console.warn("remote load failed:", e);
  }

  // Fallback: local-only
  try {
    const snapshot = safeGet(STORAGE_KEY);
    if (!snapshot) return;
    layout.forEach((s) => {
      const saved = snapshot[s.id];
      if (saved) {
        s.status = saved.status || "available";
        s.vehicle = saved.vehicle || null;
      }
    });
  } catch (e) {
    console.warn("local load failed:", e);
  }
}

async function saveState() {
  const spots = {};
  layout.forEach((s) => {
    spots[s.id] = {
      status: s.status,
      vehicle: s.vehicle ? { ...s.vehicle } : null,
    };
  });

  try {
    if (REMOTE_ENABLED) {
      await remoteSave({ spots, models: modelStore });
      return;
    }
  } catch (e) {
    console.warn("remote save failed:", e);
  }

  try {
    safeSet(STORAGE_KEY, spots);
  } catch (e) {
    console.warn("local save failed:", e);
  }
}

/* =========================================================
   MODELS & VARIANTS STORAGE (PERSISTENT, DROPDOWNS)
   ========================================================= */
const MODELS_KEY = "parking_models_v1";
let modelStore = {}; // { Brand: [Variant,...] }

function formatName(str) {
  if (!str) return "";
  const t = str.trim().replace(/\s+/g, " ");
  return t.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function keyOf(str) {
  return (str || "").trim().toLowerCase();
}

function loadModelStore() {
  try {
    const obj = safeGet(MODELS_KEY);
    modelStore = obj || {};
  } catch {
    modelStore = {};
  }
  if (Object.keys(modelStore).length === 0) seedDefaultModels();
}
function saveModelStore() {
  try {
    safeSet(MODELS_KEY, modelStore);
  } catch (e) {
    console.warn("Failed to save models locally:", e);
  }
  saveState(); // also persist to server
}
function seedDefaultModels() {
  modelStore = {
    Ford: ["F-150", "T-250", "T-350", "T-350 HD", "Explorer"],
    RAM: ["4500", "2500", "ProMaster"],
    Chevrolet: ["Silverado"],
    Kia: [],
    Toyota: [],
    Chrysler: [], // corrected spelling
    Dodge: [],
    Nissan: [],
    Mitsubishi: [],
  };
  saveModelStore();
}
function getModelNames() {
  return Object.keys(modelStore).sort((a, b) => a.localeCompare(b));
}
function getVariantsFor(modelName) {
  return (modelStore[modelName] || []).slice().sort((a, b) => a.localeCompare(b));
}
function addModel(modelName) {
  const display = formatName(modelName);
  if (!display) return { ok: false, reason: "Empty model" };
  const exists = getModelNames().some((m) => keyOf(m) === keyOf(display));
  if (!exists) modelStore[display] = [];
  saveModelStore();
  return { ok: true, model: display };
}
function addVariant(modelName, variant) {
  const model = formatName(modelName), varName = formatName(variant);
  if (!model) return { ok: false, reason: "Model required" };
  if (!varName) return addModel(model);
  if (!modelStore[model]) modelStore[model] = [];
  const exists = modelStore[model].some((v) => keyOf(v) === keyOf(varName));
  if (!exists) modelStore[model].push(varName);
  saveModelStore();
  return { ok: true, model, variant: varName };
}

/* =============== QUICK-ADD UI (one line) =============== */
let quickModelSelect = document.getElementById("quick-model-select");
let quickVariantInput = document.getElementById("quick-variant-input");
let quickAddBtn = document.getElementById("quick-add-btn");

function ensureQuickAddUI() {
  if (quickModelSelect && quickVariantInput && quickAddBtn) return;
  const rightToolbar = document.getElementById("right-toolbar");
  if (!rightToolbar) return;

  const section = document.createElement("div");
  section.className = "rt-section";
  section.id = "model-manager";
  section.innerHTML = `
    <h4>Quick Add Model/Variant</h4>
    <div style="display:flex; gap:6px; flex-wrap:wrap;">
      <select id="quick-model-select" style="flex:1;"></select>
      <input id="quick-variant-input" type="text" placeholder="Variant" style="flex:1; min-width:100px;" />
      <button id="quick-add-btn" style="flex:0;">➕</button>
    </div>`;
  rightToolbar.insertBefore(section, rightToolbar.firstChild);

  quickModelSelect = document.getElementById("quick-model-select");
  quickVariantInput = document.getElementById("quick-variant-input");
  quickAddBtn = document.getElementById("quick-add-btn");
}
function populateQuickModelSelect() {
  if (!quickModelSelect) return;
  quickModelSelect.innerHTML =
    `<option value="">— New Model —</option>` +
    getModelNames().map((m) => `<option>${m}</option>`).join("");
}
function handleQuickAdd() {
  if (!quickAddBtn) return;
  quickAddBtn.addEventListener("click", () => {
    const selectedModel = quickModelSelect.value;
    const variantVal = (quickVariantInput.value || "").trim();

    if (!selectedModel) {
      const newModel = prompt("Enter new model name:");
      if (!newModel) return;
      const resM = addModel(newModel);
      if (!resM.ok) {
        alert(resM.reason || "Could not add model.");
        return;
      }
      if (variantVal) {
        const resV = addVariant(newModel, variantVal);
        if (!resV.ok) alert(resV.reason || "Could not add variant.");
      }
    } else {
      if (!variantVal) {
        alert("Please enter a variant.");
        return;
      }
      const res = addVariant(selectedModel, variantVal);
      if (!res.ok) {
        alert(res.reason || "Could not add variant.");
        return;
      }
    }

    quickVariantInput.value = "";
    populateQuickModelSelect();
    onModelsChanged(); // refresh dropdowns
  });
}

/* =============== HIGHLIGHTING (model/variant/tire/VIN) =============== */
let vinFlashTimeout = null, vinFlashSpotId = null;

function applyHighlights() {
  layout.forEach(renderSpotColor);

  const modelVal = modelFilter.value || "";
  const variantVal = (variantFilter && variantFilter.value) || "";
  const tireVal = (tireFilter && tireFilter.value) || "";

  layout.forEach((spot) => {
    if (spot.status !== "occupied") return;
    const el = spotElMap.get(spot.id);
    if (!el) return;

    const matchesModel = modelVal && spot.vehicle?.model === modelVal;
    const matchesVariant =
      matchesModel && variantVal && spot.vehicle?.variant === variantVal;
    if (matchesVariant || (matchesModel && !variantVal))
      el.style.backgroundColor = "#8b5cf6"; // purple for model/variant
    if (tireVal && spot.vehicle?.tires === tireVal)
      el.style.backgroundColor = "#f59e0b"; // yellow for tires
  });

  if (vinFlashSpotId) {
    const el = spotElMap.get(vinFlashSpotId);
    if (el) el.style.backgroundColor = "#3b82f6"; // blue for VIN flash
  }
}

function flashVINSpot(spotId, ms = 3500) {
  if (vinFlashTimeout) clearTimeout(vinFlashTimeout);
  vinFlashSpotId = spotId;
  applyHighlights();
  vinFlashTimeout = setTimeout(() => {
    vinFlashSpotId = null;
    applyHighlights();
  }, ms);
}

/* =============== WIDGET ACTIONS =============== */
function setActions({
  showSave,
  saveLabel,
  showModify,
  showCancel,
  cancelLabel,
  cancelHandler,
  showClear,
}) {
  saveBtn.style.display = showSave ? "" : "none";
  if (saveLabel) saveBtn.textContent = saveLabel;

  cancelBtn.style.display = showCancel || showModify ? "" : "none";
  if (cancelLabel) cancelBtn.textContent = cancelLabel;
  cancelBtn.onclick = null;
  if ((showCancel || showModify) && typeof cancelHandler === "function") {
    cancelBtn.addEventListener("click", cancelHandler);
  }

  clearBtn.style.display = showClear ? "" : "none";
}

/* =============== OPEN/CLOSE WIDGET =============== */
function openWidget(spot, isEditMode = false) {
  currentSpot = spot;
  widget.classList.remove("hidden");

  const isOccupied = spot.status === "occupied";
  const v = spot.vehicle || {};
  const disabled = isOccupied && !isEditMode;

  // Dynamic model/variant from store (dropdowns)
  const allModels = getModelNames();
  let selectedModel =
    v.model && allModels.some((m) => keyOf(m) === keyOf(v.model))
      ? v.model
      : allModels[0] || "";
  if (v.model && !allModels.some((m) => keyOf(m) === keyOf(v.model))) {
    allModels.unshift(v.model); // include legacy temp
    selectedModel = v.model;
  }
  let variantsForModel = getVariantsFor(selectedModel);
  if (v.variant && variantsForModel.every((x) => keyOf(x) !== keyOf(v.variant))) {
    variantsForModel = [v.variant, ...variantsForModel];
  }
  const selectedVariant = v.variant || variantsForModel[0] || "";

  widgetTitle.innerText = isOccupied
    ? isEditMode ? "Edit Car Info" : "Car Details"
    : "Add New Car";

  formFields.innerHTML = `
    ${createDropdown("Car Model", selectedModel, disabled, allModels)}
    ${createDropdown("Model Variant", selectedVariant, disabled || variantsForModel.length === 0, variantsForModel)}
    ${createDropdown("Year", v.year || years[years.length - 1], disabled, years)}
    ${createDropdown("Color", v.color || colors[0], disabled, colors)}
    ${createDropdown("Tires", v.tires || tireTypes[0], disabled, tireTypes)}
    ${createInput("VIN Number", v.vin || "", disabled)}
    ${createInput("Immatriculation Plate", v.plate || "", disabled)}
  `;

  if (!disabled) {
    const modelSelect = formFields.querySelector('select[name="Car Model"]');
    const variantSelect = formFields.querySelector('select[name="Model Variant"]');
    modelSelect.addEventListener("change", () => {
      const newModel = modelSelect.value;
      const newVariants = getVariantsFor(newModel);
      variantSelect.innerHTML = newVariants.map((opt) => `<option>${opt}</option>`).join("");
      variantSelect.disabled = newVariants.length === 0;
      variantSelect.value = newVariants.length ? newVariants[0] : "";
    });
  }

  if (!isOccupied) {
    setActions({ showSave: true, saveLabel: "Save", showCancel: false, showModify: false, showClear: false });
  } else if (!isEditMode) {
    setActions({ showSave: false, showModify: true, cancelLabel: "Modify", cancelHandler: () => enableEdit(), showClear: true });
  } else {
    setActions({ showSave: true, saveLabel: "Save Changes", showCancel: true, cancelLabel: "Cancel", cancelHandler: () => cancelEdit(), showClear: true });
  }
}
function closeWidget() {
  widget.classList.add("hidden");
  currentSpot = null;
}
function enableEdit() {
  openWidget(currentSpot, true);
}
function cancelEdit() {
  openWidget(currentSpot, false);
}

/* =============== SAVE/CLEAR SPOT =============== */
function saveSpotData() {
  if (!currentSpot) return;
  const inputs = widget.querySelectorAll("input, select");
  const data = {};
  inputs.forEach((input) => (data[input.name] = input.value));

  currentSpot.vehicle = {
    model: data["Car Model"],
    variant: data["Model Variant"] || "",
    year: data["Year"],
    color: data["Color"],
    tires: data["Tires"],
    vin: data["VIN Number"],
    plate: data["Immatriculation Plate"],
  };
  currentSpot.status = "occupied";
  renderSpotColor(currentSpot);

  // (Optional) learn newly saved model/variant
  if (currentSpot.vehicle.model) addModel(currentSpot.vehicle.model);
  if (currentSpot.vehicle.model && currentSpot.vehicle.variant)
    addVariant(currentSpot.vehicle.model, currentSpot.vehicle.variant);
  onModelsChanged();

  saveState();
  refreshRightPanel();
  applyHighlights();
  closeWidget();
}
function clearSpotData() {
  if (!currentSpot) return;
  currentSpot.vehicle = null;
  currentSpot.status = "available";
  renderSpotColor(currentSpot);

  saveState();
  refreshRightPanel();
  applyHighlights();
  closeWidget();
}

/* =============== TOOLBAR & STATS =============== */
const modelFilter = document.getElementById("model-filter");
const clearHighlightBtn = document.getElementById("clear-highlights-btn");
const statTotal = document.getElementById("stat-total");
const statOccupied = document.getElementById("stat-occupied");
const statAvailable = document.getElementById("stat-available");
const modelCountsContainer = document.getElementById("model-counts");
const vinInput = document.getElementById("vin-search");

let variantFilter = null, tireFilter = null, tireStatsSection = null, statWinterEl = null, statSummerEl = null;

function initInjectedControls() {
  // Variant filter under model filter
  variantFilter = document.createElement("select");
  variantFilter.id = "variant-filter";
  variantFilter.disabled = true;
  variantFilter.style.marginTop = "8px";
  modelFilter.insertAdjacentElement("afterend", variantFilter);

  // Tire filter section
  const rightToolbar = document.getElementById("right-toolbar");
  const tireFilterSection = document.createElement("div");
  tireFilterSection.className = "rt-section";
  tireFilterSection.innerHTML = `<h4>Highlight by Tires</h4>`;
  tireFilter = document.createElement("select");
  tireFilter.id = "tire-filter";
  tireFilter.innerHTML = `<option value="">— Select tires —</option>${["Summer","Winter"].map((t) => `<option>${t}</option>`).join("")}`;
  tireFilterSection.appendChild(tireFilter);
  rightToolbar.insertBefore(
    tireFilterSection,
    rightToolbar.querySelector(".rt-section:nth-of-type(3)")
  );
}

function initTireStatsSection() {
  const rightToolbar = document.getElementById("right-toolbar");
  tireStatsSection = document.createElement("div");
  tireStatsSection.className = "rt-section";
  tireStatsSection.innerHTML = `
    <h4>Tire Statistics</h4>
    <div class="stat-line"><span>Winter</span><strong id="stat-winter">0</strong></div>
    <div class="stat-line"><span>Summer</span><strong id="stat-summer">0</strong></div>`;
  rightToolbar.appendChild(tireStatsSection);
  statWinterEl = tireStatsSection.querySelector("#stat-winter");
  statSummerEl = tireStatsSection.querySelector("#stat-summer");
}

/* =============== VIN search (blue flash) =============== */
function normalizeVIN(v) { return (v || "").toString().trim().toUpperCase(); }
function findSpotByVIN(vin) {
  const needle = normalizeVIN(vin);
  if (!needle) return null;
  return layout.find(
    (s) => s.status === "occupied" && normalizeVIN(s.vehicle?.vin) === needle
  ) || null;
}
function scrollSpotIntoView(spotId) {
  const el = spotElMap.get(spotId);
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  } catch {
    const rect = el.getBoundingClientRect();
    wrapper.scrollLeft += rect.left - wrapper.clientWidth / 2;
    wrapper.scrollTop += rect.top - wrapper.clientHeight / 2;
  }
}
function handleVINSearch() {
  const vin = vinInput.value;
  const spot = findSpotByVIN(vin);
  if (!spot) {
    vinInput.style.borderColor = "#ef4444";
    setTimeout(() => (vinInput.style.borderColor = ""), 800);
    return;
  }
  scrollSpotIntoView(spot.id);
  flashVINSpot(spot.id, 3500);
}
vinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleVINSearch();
});

/* =============== STATS & COUNTS =============== */
function recomputeStats() {
  const total = layout.length;
  const occupied = layout.filter((s) => s.status === "occupied").length;
  const available = total - occupied;
  statTotal.textContent = total;
  statOccupied.textContent = occupied;
  statAvailable.textContent = available;
}
function updateTireStats() {
  const tireCounts = { Summer: 0, Winter: 0 };
  layout.forEach((s) => {
    if (s.status === "occupied" && s.vehicle?.tires) {
      if (s.vehicle.tires === "Summer") tireCounts.Summer++;
      if (s.vehicle.tires === "Winter") tireCounts.Winter++;
    }
  });
  if (statWinterEl) statWinterEl.textContent = tireCounts.Winter;
  if (statSummerEl) statSummerEl.textContent = tireCounts.Summer;
}
function renderModelCounts() {
  const counts = {};
  layout.forEach((s) => {
    if (s.status === "occupied" && s.vehicle?.model) {
      const key = s.vehicle.variant ? `${s.vehicle.model} ${s.vehicle.variant}` : s.vehicle.model;
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  modelCountsContainer.innerHTML =
    entries.length === 0
      ? `<div style="color:#6b7280;font-size:13px;">No cars yet.</div>`
      : entries.map(
          ([label, count]) =>
            `<div class="stat-line"><span>${label}</span><strong>${count}</strong></div>`
        ).join("");
}
function refreshRightPanel() {
  recomputeStats();
  renderModelCounts();
  updateTireStats();
}

/* =============== DROPDOWN SYNC (toolbar + widget) =============== */
function populateModelFilterFromStore() {
  const options = ["— Select model —", ...getModelNames()];
  modelFilter.innerHTML = options
    .map((m, i) => `<option value="${i === 0 ? "" : m}">${m}</option>`)
    .join("");
  variantFilter.innerHTML = `<option value="">— Select variant —</option>`;
  variantFilter.disabled = true;
}
function onModelsChanged() {
  populateModelFilterFromStore();
  const selected = modelFilter.value;
  if (selected) {
    const variants = getVariantsFor(selected);
    variantFilter.innerHTML = `<option value="">— All variants —</option>${variants
      .map((v) => `<option>${v}</option>`)
      .join("")}`;
    variantFilter.disabled = variants.length === 0;
  }
  if (!widget.classList.contains("hidden") && currentSpot) {
    const wasEdit = widgetTitle.innerText.includes("Edit");
    openWidget(currentSpot, wasEdit);
  }
}

/* =============== ICON (car.jpg) =============== */
function getOrCreateSpotIcon(el) {
  let ic = el.querySelector(".spot-icon");
  if (!ic) {
    ic = document.createElement("img");
    ic.className = "spot-icon";
    ic.src = "car.jpg"; // place car.jpg in /public next to index.html
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

/* =============== INIT =============== */
async function initRightToolbar() {
  initInjectedControls();
  initTireStatsSection();

  // 1) Seed/load local models first
  loadModelStore();

  // 2) Then remote load (merges with seeds and pushes back)
  await loadState();

  // 3) Build minimal quick-add line
  ensureQuickAddUI();
  populateQuickModelSelect();
  handleQuickAdd();

  // 4) Populate toolbar dropdowns
  populateModelFilterFromStore();

  // 5) Render and wire listeners
  layout.forEach(renderSpotColor);
  refreshRightPanel();

  modelFilter.addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected) {
      const variants = getVariantsFor(selected) || [];
      variantFilter.innerHTML = `<option value="">— All variants —</option>${variants
        .map((v) => `<option>${v}</option>`)
        .join("")}`;
      variantFilter.disabled = variants.length === 0;
    } else {
      variantFilter.innerHTML = `<option value="">— Select variant —</option>`;
      variantFilter.disabled = true;
    }
    applyHighlights();
  });
  variantFilter.addEventListener("change", applyHighlights);
  tireFilter.addEventListener("change", applyHighlights);

  clearHighlightBtn.addEventListener("click", () => {
    modelFilter.value = "";
    variantFilter.value = "";
    variantFilter.disabled = true;
    tireFilter.value = "";
    if (vinFlashTimeout) clearTimeout(vinFlashTimeout);
    vinFlashSpotId = null;
    layout.forEach(renderSpotColor);
  });
}

window.addEventListener("load", () => {
  initRightToolbar();
});

