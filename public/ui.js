import { remoteLoad, remoteSave, subscribe, acquireLock, releaseLock, getEditorId } from './remote.js';
import { canvas, layout, spotElMap, initLayout, renderSpotColor } from './layout.js';

// Lock status tracking
let isEditing = false;
let lockStatusElement = null;

// Subscribe to server updates including lock status
subscribe(updateFromServer);

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

// Create lock status indicator
function createLockStatusIndicator() {
  if (lockStatusElement) return;
  
  lockStatusElement = document.createElement('div');
  lockStatusElement.id = 'lock-status';
  lockStatusElement.className = 'lock-status';
  lockStatusElement.innerHTML = `
    <span id="lock-icon">👁️</span>
    <span id="lock-text">Read Only</span>
  `;
  document.body.appendChild(lockStatusElement);
}

// Update lock status display
function updateLockStatusDisplay(locked, editorId) {
  if (!lockStatusElement) createLockStatusIndicator();
  
  const icon = document.getElementById('lock-icon');
  const text = document.getElementById('lock-text');
  
  if (locked && editorId === getEditorId()) {
    lockStatusElement.className = 'lock-status editing';
    icon.textContent = '✏️';
    text.textContent = 'Editing';
    isEditing = true;
  } else if (locked) {
    lockStatusElement.className = 'lock-status locked';
    icon.textContent = '🔒';
    text.textContent = 'Someone else is editing';
    isEditing = false;
  } else {
    lockStatusElement.className = 'lock-status unlocked';
    icon.textContent = '👁️';
    text.textContent = 'Read Only';
    isEditing = false;
  }
}

/* =============== ZOOM & DRAG =============== */
let zoom = 1;
const minZoom = 0.2, maxZoom = 2;
function zoomIn() {
  zoom = Math.min(maxZoom, zoom + 0.1);
  canvas.style.transform = `scale(${zoom})`;
}
function zoomOut() {
  zoom = Math.max(minZoom, zoom - 0.1);
  canvas.style.transform = `scale(${zoom})`;
}

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
  // Try remote first (when enabled)
  const s = await remoteLoad();
  if (s) {
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

    // push merged list back to server once so everyone shares it (best-effort)
    await remoteSave({ spots: s.spots || {}, models: modelStore });
    // also mirror locally for fast offline reloads
    safeSet(STORAGE_KEY, s.spots || {});
    return;
  }

  // Fallback: local-only
  try {
    const snapshot = safeGet(STORAGE_KEY);
    if (!snapshot) return;
    layout.forEach((sp) => {
      const saved = snapshot[sp.id];
      if (saved) {
        sp.status = saved.status || "available";
        sp.vehicle = saved.vehicle || null;
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

  const payload = { spots, models: modelStore };

  // Try remote; also mirror local so offline reload shows latest saved state
  const ok = await remoteSave(payload);
  try { safeSet(STORAGE_KEY, spots); } catch (e) { console.warn("local mirror failed:", e); }

  if (!ok) {
    console.warn("Remote save not available; using local only this time.");
  }
}

function updateFromServer(state) {
  // Handle lock status updates
  if (state.type === 'lock_status') {
    updateLockStatusDisplay(state.locked, state.editorId);
    return;
  }

  // Handle state updates
  if (state.type === 'state_update' && state.spots) {
    const spots = state.spots || {};
    layout.forEach((s) => {
      const saved = spots[s.id];
      if (saved) {
        s.status = saved.status || "available";
        s.vehicle = saved.vehicle || null;
      }
    });
    layout.forEach(renderSpotColor);
    refreshRightPanel();
    return;
  }

  // Handle legacy format (no type field)
  if (state.spots) {
    const spots = state.spots || {};
    layout.forEach((s) => {
      const saved = spots[s.id];
      if (saved) {
        s.status = saved.status || "available";
        s.vehicle = saved.vehicle || null;
      }
    });
    layout.forEach(renderSpotColor);
    refreshRightPanel();
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
function keyOf(str) { return (str || "").trim().toLowerCase(); }

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
  try { safeSet(MODELS_KEY, modelStore); }
  catch (e) { console.warn("Failed to save models locally:", e); }
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
let lockHeld = false;

async function releaseLockIfHeld() {
  if (lockHeld) {
    lockHeld = false;
    try { await releaseLock(); } catch {}
  }
}

async function openWidget(spot, isEditMode = false) {
  currentSpot = spot;
  widget.classList.remove("hidden");

  const isOccupied = spot.status === "occupied";
  let editing = isEditMode || !isOccupied;
  if (editing) {
    const locked = await acquireLock();
    if (!locked) {
      editing = false;
      alert("Another editor is currently making changes. Opening in read-only mode.");
    } else {
      lockHeld = true;
    }
  }

  const v = spot.vehicle || {};
  const disabled = isOccupied && !editing;

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
    ? editing ? "Edit Car Info" : "Car Details"
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
    const modelSelect = formFields.querySelector("select[name=\"Car Model\"]");
    const variantSelect = formFields.querySelector("select[name=\"Model Variant\"]");
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
  } else if (!editing) {
    setActions({ showSave: false, showModify: true, cancelLabel: "Modify", cancelHandler: () => enableEdit(), showClear: true });
  } else {
    setActions({ showSave: true, saveLabel: "Save Changes", showCancel: true, cancelLabel: "Cancel", cancelHandler: () => cancelEdit(), showClear: true });
  }
}
function closeWidget() {
  widget.classList.add("hidden");
  currentSpot = null;
  releaseLockIfHeld();
}
function enableEdit() {
  openWidget(currentSpot, true);
}
function cancelEdit() {
  releaseLockIfHeld();
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

  // Learn newly saved model/variant
  if (currentSpot.vehicle.model) addModel(currentSpot.vehicle.model);
  if (currentSpot.vehicle.model && currentSpot.vehicle.variant)
    addVariant(currentSpot.vehicle.model, currentSpot.vehicle.variant);
  onModelsChanged();

  saveState();
  refreshRightPanel();
  applyHighlights();
  releaseLockIfHeld();
  closeWidget();
}

function clearSpotData() {
  if (!currentSpot) return;
  currentSpot.status = "available";
  currentSpot.vehicle = null;
  renderSpotColor(currentSpot);
  saveState();
  refreshRightPanel();
  applyHighlights();
  releaseLockIfHeld();
  closeWidget();
}

/* =============== RIGHT PANEL FILTERS =============== */
let modelFilter, variantFilter, tireFilter;

function refreshRightPanel() {
  const totalSpots = layout.length;
  const occupiedSpots = layout.filter((s) => s.status === "occupied").length;
  const availableSpots = totalSpots - occupiedSpots;

  document.getElementById("stat-total").textContent = totalSpots;
  document.getElementById("stat-occupied").textContent = occupiedSpots;
  document.getElementById("stat-available").textContent = availableSpots;

  // Model counts
  const modelCounts = {};
  layout.forEach((spot) => {
    if (spot.status === "occupied" && spot.vehicle?.model) {
      const model = spot.vehicle.model;
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    }
  });

  const modelCountsDiv = document.getElementById("model-counts");
  modelCountsDiv.innerHTML = Object.entries(modelCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, count]) => `<div class="stat-line"><span>${model}</span><strong>${count}</strong></div>`)
    .join("");

  // Refresh model filter dropdown
  if (modelFilter) {
    const currentVal = modelFilter.value;
    const uniqueModels = [...new Set(layout.filter(s => s.status === "occupied" && s.vehicle?.model).map(s => s.vehicle.model))].sort();
    modelFilter.innerHTML = `<option value="">All Models</option>` + uniqueModels.map(m => `<option value="${m}">${m}</option>`).join("");
    if (uniqueModels.includes(currentVal)) modelFilter.value = currentVal;
  }
}

function onModelsChanged() {
  populateQuickModelSelect();
  refreshRightPanel();
}

/* =============== VIN SEARCH =============== */
function setupVINSearch() {
  const vinInput = document.getElementById("vin-search");
  if (!vinInput) return;

  vinInput.addEventListener("input", () => {
    const query = vinInput.value.trim().toLowerCase();
    if (!query) return;

    const match = layout.find((spot) =>
      spot.status === "occupied" &&
      spot.vehicle?.vin &&
      spot.vehicle.vin.toLowerCase().includes(query)
    );

    if (match) {
      flashVINSpot(match.id);
      // Scroll to the spot
      const el = spotElMap.get(match.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

/* =============== SETUP FILTERS =============== */
function setupFilters() {
  modelFilter = document.getElementById("model-filter");
  if (!modelFilter) return;

  // Create variant and tire filters if they don't exist
  const rightToolbar = document.getElementById("right-toolbar");
  const highlightSection = rightToolbar.querySelector("div.rt-section:nth-child(2)");
  
  if (!document.getElementById("variant-filter")) {
    const variantLabel = document.createElement("h4");
    variantLabel.textContent = "Highlight by Variant";
    const variantSelect = document.createElement("select");
    variantSelect.id = "variant-filter";
    variantSelect.innerHTML = '<option value="">All Variants</option>';
    highlightSection.appendChild(variantLabel);
    highlightSection.appendChild(variantSelect);
    variantFilter = variantSelect;
  }

  if (!document.getElementById("tire-filter")) {
    const tireLabel = document.createElement("h4");
    tireLabel.textContent = "Highlight by Tires";
    const tireSelect = document.createElement("select");
    tireSelect.id = "tire-filter";
    tireSelect.innerHTML = '<option value="">All Tires</option>' + tireTypes.map(t => `<option value="${t}">${t}</option>`).join("");
    highlightSection.appendChild(tireLabel);
    highlightSection.appendChild(tireSelect);
    tireFilter = tireSelect;
  }

  // Event listeners
  modelFilter.addEventListener("change", () => {
    const selectedModel = modelFilter.value;
    if (variantFilter) {
      if (selectedModel) {
        const variants = [...new Set(layout.filter(s => s.status === "occupied" && s.vehicle?.model === selectedModel && s.vehicle?.variant).map(s => s.vehicle.variant))].sort();
        variantFilter.innerHTML = '<option value="">All Variants</option>' + variants.map(v => `<option value="${v}">${v}</option>`).join("");
        variantFilter.disabled = false;
      } else {
        variantFilter.innerHTML = '<option value="">All Variants</option>';
        variantFilter.disabled = true;
      }
    }
    applyHighlights();
  });

  if (variantFilter) {
    variantFilter.addEventListener("change", applyHighlights);
  }

  if (tireFilter) {
    tireFilter.addEventListener("change", applyHighlights);
  }

  const clearHighlightsBtn = document.getElementById("clear-highlights-btn");
  if (clearHighlightsBtn) {
    clearHighlightsBtn.addEventListener("click", () => {
      modelFilter.value = "";
      if (variantFilter) {
        variantFilter.value = "";
        variantFilter.innerHTML = '<option value="">All Variants</option>';
        variantFilter.disabled = true;
      }
      if (tireFilter) tireFilter.value = "";
      applyHighlights();
    });
  }
}

/* =============== INITIALIZATION =============== */
document.addEventListener("DOMContentLoaded", async () => {
  // Create lock status indicator
  createLockStatusIndicator();
  
  // Initialize layout
  initLayout();
  
  // Load models and state
  loadModelStore();
  await loadState();
  
  // Setup UI components
  ensureQuickAddUI();
  populateQuickModelSelect();
  handleQuickAdd();
  setupFilters();
  setupVINSearch();
  
  // Initial render
  layout.forEach(renderSpotColor);
  refreshRightPanel();
  onModelsChanged();

  // Event listeners
  document.getElementById("zoom-in-btn").addEventListener("click", zoomIn);
  document.getElementById("zoom-out-btn").addEventListener("click", zoomOut);
  document.getElementById("widget-close-btn").addEventListener("click", closeWidget);
  document.getElementById("save-btn").addEventListener("click", saveSpotData);

  // Spot click handlers
  layout.forEach((spot) => {
    const el = spotElMap.get(spot.id);
    if (el) {
      el.addEventListener("click", () => openWidget(spot));
    }
  });
});
