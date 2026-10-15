/**
 * Loads the bundled Monaco chunk (monacoRuntime.js) once per page, with
 * retries, and lets components follow its progress.
 *
 * Kept apart from monacoRuntime.js so a page can start the download early --
 * while the student is still on the proctoring gate -- without pulling Monaco
 * into the main bundle.
 */

const ATTEMPTS = 3;

let promise = null;
let state = { status: 'idle', error: null }; // 'idle' | 'loading' | 'ready' | 'failed'
const listeners = new Set();

function setState(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The chunk's URL, as Chrome and Edge name it in a failed import's message:
 * "Failed to fetch dynamically imported module: https://.../monacoRuntime-x.js".
 */
function chunkUrlFrom(error) {
  const match = /(https?:\/\/\S+?\.js)(?=\s|$|\?)/.exec(String(error?.message || ''));
  return match ? match[1] : null;
}

/**
 * A browser remembers a failed module import for the life of the page:
 * importing the same URL again rejects at once without touching the network.
 * So a plain retry can never succeed, and only a reload used to bring the editor
 * back. Retries therefore ask for the chunk under a fresh query string, which
 * the browser treats as a new module. Its own imports resolve to the chunks
 * already loaded, so it configures the same `@monaco-editor/react` loader.
 */
async function importWithRetry() {
  let lastError;
  let url = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try {
      return url
        ? await import(/* @vite-ignore */ `${url}?retry=${Date.now()}`)
        : await import('./monacoRuntime.js');
    } catch (error) {
      lastError = error;
      url = chunkUrlFrom(error) || url;
      if (attempt < ATTEMPTS - 1) await wait(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Start (or join) the download. Resolves with the monaco namespace. A failure
 * is not cached: calling this again after one tries again from scratch.
 */
export function loadMonaco() {
  if (!promise) {
    setState({ status: 'loading', error: null });
    promise = importWithRetry().then(
      (module) => {
        setState({ status: 'ready', error: null });
        return module.default;
      },
      (error) => {
        promise = null;
        setState({ status: 'failed', error });
        throw error;
      }
    );
  }
  return promise;
}

/** Fire-and-forget warm-up for pages that will show the editor soon. */
export function preloadMonaco() {
  loadMonaco().catch(() => {
    // The editor itself reports the failure and offers a retry when it mounts.
  });
}

export function getMonacoState() {
  return state;
}

export function subscribeMonaco(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
