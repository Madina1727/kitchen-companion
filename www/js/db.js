// Local storage in IndexedDB: one state document plus original uploaded files.
const DB = "kitchen-companion", VER = 1;
let dbp;
function open() {
  if (!dbp) dbp = new Promise((ok, bad) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await open();
  return new Promise((ok, bad) => {
    const t = d.transaction(store, mode);
    const res = fn(t.objectStore(store));
    t.oncomplete = () => ok(res?.result ?? res);
    t.onerror = () => bad(t.error);
  });
}
export const kvGet = (k) => tx("kv", "readonly", (s) => s.get(k));
export const kvSet = (k, v) => tx("kv", "readwrite", (s) => s.put(v, k));
export const fileGet = (k) => tx("files", "readonly", (s) => s.get(k));
export const fileSet = (k, v) => tx("files", "readwrite", (s) => s.put(v, k));
export const fileDel = (k) => tx("files", "readwrite", (s) => s.delete(k));

export function uid() {
  return (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
}

export const STATE_VERSION = 1;
export function emptyState() {
  return {
    v: STATE_VERSION,
    onboarded: false,
    profile: { name: "" },
    prefs: {
      lang: (navigator.language || "en").slice(0, 2).replace(/^(?!en|uz|ko|ru).*$/, "en"),
      diet: "none", restrictions: [], allergies: [], exclusions: [], cuisines: [], level: "", maxTime: null,
      units: "metric", staples: ["salt", "water", "black_pepper", "oil"], expiryDays: 2, theme: "system", people: 2,
    },
    settings: { apiKey: "", model: "claude-opus-5-5", aiConsent: false },
    recipes: [], collections: [], inventory: [], files: [], books: [],
    plan: [], grocery: [], history: [], txLog: [], chat: [],
  };
}
