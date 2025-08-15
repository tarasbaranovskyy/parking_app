const host = location.host;
const FORCE_REMOTE = /(?:^|[?&])remote=1\b/.test(location.search);
const onCSB = /(?:csb\.app|codesandbox\.io)$/i.test(host);
const onVercel = /\.vercel\.app$/i.test(host);
const isLocalHost = /(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host);
const onPublicHost = !isLocalHost && !/^(\[::1\])(?::\d+)?$/.test(host);

const ALWAYS_REMOTE =
  (typeof process !== "undefined" && process.env.ALWAYS_REMOTE === "1") ||
  (typeof window !== "undefined" && window.ALWAYS_REMOTE);

const REMOTE_ENABLED =
  FORCE_REMOTE ||
  ALWAYS_REMOTE ||
  onCSB ||
  onVercel ||
  onPublicHost ||
  isLocalHost;

const STATE_PATH = "/api/state";

console.log("Parking App build", "sync-2025-08-13", {
  host,
  REMOTE_ENABLED,
  FORCE_REMOTE,
  ALWAYS_REMOTE,
});

const LOCAL_KEY = 'parking_state_backup';
let cachedVersion = null;
let saveTimer;
let retryTimer;

const banner = document.getElementById('offline-banner');
function showBanner() { if (banner) banner.style.display = 'block'; }
function hideBanner() { if (banner) banner.style.display = 'none'; }

export async function remoteLoad() {
  if (!REMOTE_ENABLED) return null;
  try {
    const r = await fetch(STATE_PATH, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { data, version } = await r.json();
    cachedVersion = version;
    hideBanner();
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch {}
    return data || {};
  } catch (e) {
    showBanner();
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

function scheduleRetry(data) {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    attemptSave(data);
  }, 5000);
}

async function attemptSave(data, retry = false) {
  try {
    const r = await fetch(STATE_PATH, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match-Version': cachedVersion ?? ''
      },
      body: JSON.stringify({ data })
    });
    if (r.status === 409 && !retry) {
      await remoteLoad();
      return attemptSave(data, true);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { version } = await r.json();
    cachedVersion = version;
    hideBanner();
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch {}
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    return true;
  } catch (e) {
    showBanner();
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch {}
    scheduleRetry(data);
    return false;
  }
}

export function remoteSave(data) {
  if (!REMOTE_ENABLED) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    attemptSave(data);
  }, 300);
}

export function subscribe(onMessage) {
  if (!REMOTE_ENABLED) return;
  try {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => onMessage(JSON.parse(e.data));
    es.onerror = () => {
      es.close();
      startPolling(onMessage);
    };
  } catch {
    startPolling(onMessage);
  }
}

function startPolling(onMessage) {
  let last;
  async function poll() {
    try {
      const state = await remoteLoad();
      const serialized = state && JSON.stringify(state);
      if (serialized && serialized !== last) {
        last = serialized;
        onMessage(state);
      }
    } catch {
      /* ignore */
    }
  }
  poll();
  setInterval(poll, 5000);
}
