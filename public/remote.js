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

console.log("Parking App build", "sync-2025-08-14", {
  host,
  REMOTE_ENABLED,
  FORCE_REMOTE,
  ALWAYS_REMOTE,
});

const id = crypto.randomUUID();

export async function acquireLock() {
  if (!REMOTE_ENABLED) return false;
  try {
    const r = await fetch('/api/lock', {
      method: 'POST',
      body: JSON.stringify({ id }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { locked } = await r.json();
    return locked;
  } catch (e) {
    console.warn("Lock acquisition failed:", e);
    return false;
  }
}

export async function releaseLock() {
  if (!REMOTE_ENABLED) return;
  try {
    await fetch(`/api/lock/${id}`, { method: 'DELETE' });
  } catch (e) {
    console.warn("Lock release failed:", e);
  }
}

export function getEditorId() { 
  return id; 
}

export async function remoteLoad() {
  if (!REMOTE_ENABLED) return null;
  try {
    const r = await fetch(STATE_PATH, { 
      cache: "no-store",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
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
      headers: { 
        "Content-Type": "application/json", 
        'x-editor-id': getEditorId() 
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errorText = await r.text();
      throw new Error(`HTTP ${r.status}: ${errorText}`);
    }
    return true;
  } catch (e) {
    console.warn("Remote save failed; staying local:", e);
    return false;
  }
}

// Enhanced subscribe function with better error handling and reconnection
export function subscribe(onMessage) {
  if (!REMOTE_ENABLED) {
    console.log("Remote disabled, skipping event subscription");
    return;
  }

  let eventSource = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  function connect() {
    try {
      eventSource = new EventSource('/api/events');
      
      eventSource.onopen = () => {
        console.log('EventSource connected');
        reconnectAttempts = 0; // Reset on successful connection
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          onMessage(data);
        } catch (parseError) {
          console.warn('Failed to parse server message:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        console.warn('EventSource connection error:', error);
        
        if (eventSource.readyState === EventSource.CLOSED) {
          scheduleReconnect();
        }
      };

    } catch (e) {
      console.error('Failed to create EventSource:', e);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts); // Exponential backoff
    reconnectAttempts++;
    
    console.log(`Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);
    
    reconnectTimer = setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${reconnectAttempts})`);
      connect();
    }, delay);
  }

  function cleanup() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  // Initial connection
  connect();

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  
  // Return cleanup function for manual cleanup if needed
  return cleanup;
}
