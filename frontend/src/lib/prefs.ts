/**
 * Per-browser UI conveniences (sidebar state, open groups). Never used for
 * anything that must persist reliably; storage can be unavailable or cleared.
 */
const PREFIX = "lrs.";

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in-memory state only */
  }
}
