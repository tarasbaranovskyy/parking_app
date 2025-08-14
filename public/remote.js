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

const id = crypto.randomUUID();

export async function acquireLock() {
  const r = await fetch('/api/lock', {
    method: 'POST',
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' }
  });
  const { locked } = await r.json();
  return locked;
}

export async function releaseLock() {
  await fetch(`/api/lock/${id}`, { method: 'DELETE' });
}

export function getEditorId() { return id; }

export async function remoteLoad() {
  if (!REMOTE_ENABLED) return null;
  try {
    const r = await fetch(STATE_PATH, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) || {};
  } catch (e) {
    console.warn("Remote load disabled this session:", e);
    return null;
  }
}

export async function remoteSave(payload) {
  if (!REMOTE_ENABLED) return false;
  try {
    const r = await fetch(STATE_PATH, {
      method: "PUT",
      headers: { "Content-Type": "application/json", 'x-editor-id': getEditorId() },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  } catch (e) {
    console.warn("Remote save failed; staying local:", e);
    return false;
  }
}

export function subscribe(onMessage) {
  const es = new EventSource('/api/events');
  es.onmessage = e => onMessage(JSON.parse(e.data));
}
