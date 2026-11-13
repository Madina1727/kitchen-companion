// Cloud sync with Supabase: one private row per user (RLS: only the owner can read or write it).
// Recipes, kitchen, plans, lists and preferences sync. Uploaded book files, import drafts and the
// device's own Claude key stay on the device.
import { S, save, saveNow, toast, t, hooks, ensureMeals } from "./core.js";

export const SUPABASE_URL = "https://illefcbzekeplwjlrgin.supabase.co";
const SUPABASE_KEY = "sb_publishable_RZxu7ZbTMN4HI1gxkn7lpg__3Y-koLE"; // publishable key, safe in the browser
const LOCAL_ONLY = ["importSession", "books", "files", "chat"];
const MERGE_LISTS = ["recipes", "inventory", "plan", "grocery", "history", "collections"];

let sb = null;
export const sync = { user: null, status: "off", last: null, error: "" };
const listeners = new Set();
export const onSyncChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

async function client() {
  if (!sb) {
    const { createClient } = await import("../vendor/supabase.mjs");
    sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "kc-auth" } });
  }
  return sb;
}
export async function accessToken() {
  if (!sync.user) return null;
  const c = await client();
  const { data } = await c.auth.getSession();
  return data.session?.access_token || null;
}

const meta = () => (S.state.syncMeta ||= { lastSynced: null, dirty: false });

function cloudCopy() {
  const out = {};
  for (const [k, v] of Object.entries(S.state)) if (!LOCAL_ONLY.includes(k) && k !== "syncMeta") out[k] = v;
  out.settings = { ...S.state.settings, apiKey: "" };
  return out;
}
function applyRemote(remote) {
  const keep = { settings: S.state.settings, syncMeta: S.state.syncMeta };
  for (const k of LOCAL_ONLY) keep[k] = S.state[k];
  Object.assign(S.state, remote, keep);
  ensureMeals();
  S.state.settings = { ...remote.settings, apiKey: keep.settings.apiKey, model: keep.settings.model || remote.settings?.model };
}
const stamp = (x) => x?.updatedAt || x?.createdAt || "";
/** Both devices changed things: keep every item, and the newer copy when the same item changed on both. */
function merge(remote) {
  const merged = { ...remote };
  for (const key of MERGE_LISTS) {
    const byId = new Map((remote[key] || []).map((x) => [x.id, x]));
    for (const it of S.state[key] || []) {
      const r = byId.get(it.id);
      if (!r || stamp(it) > stamp(r)) byId.set(it.id, it);
    }
    merged[key] = [...byId.values()];
  }
  merged.prefs = { ...remote.prefs, ...S.state.prefs };
  return merged;
}

export async function initSync() {
  hooks.afterSave = schedulePush;
  hooks.cloudReady = () => !!sync.user && S.state.settings.cloudAI !== false;
  hooks.cloudToken = accessToken;
  try {
    const c = await client();
    const { data } = await c.auth.getSession();
    sync.user = data.session?.user || null;
    c.auth.onAuthStateChange((_e, session) => { sync.user = session?.user || null; emit(); });
    if (sync.user) await pull();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && sync.user) pull(); });
    window.addEventListener("online", () => { if (sync.user) pull(); });
  } catch (e) { sync.status = "error"; sync.error = e.message; }
  emit();
}

export async function pull() {
  if (!sync.user || sync.status === "syncing") return;
  sync.status = "syncing"; emit();
  try {
    const c = await client();
    const { data, error } = await c.from("kitchen_state").select("state, updated_at").eq("user_id", sync.user.id).maybeSingle();
    if (error) throw error;
    const m = meta();
    if (!data) { await push(true); return; }
    const remoteNewer = !m.lastSynced || data.updated_at > m.lastSynced;
    if (remoteNewer && m.dirty) { applyRemote(merge(data.state)); m.lastSynced = data.updated_at; await saveNow(); await push(true); return; }
    if (remoteNewer) { applyRemote(data.state); m.lastSynced = data.updated_at; m.dirty = false; await saveNow(); window.dispatchEvent(new HashChangeEvent("hashchange")); }
    else if (m.dirty) { await push(true); return; }
    sync.status = "ok"; sync.last = new Date().toISOString(); sync.error = "";
  } catch (e) { sync.status = navigator.onLine ? "error" : "offline"; sync.error = e.message || String(e); }
  emit();
}

let pushTimer;
export function schedulePush() {
  if (!sync.user) return;
  meta().dirty = true;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), 2500);
}
export async function push(force = false) {
  if (!sync.user) return;
  sync.status = "syncing"; emit();
  try {
    const c = await client();
    const m = meta();
    if (!force) {
      // Another device saved since our last sync: merge first so nothing is lost.
      const { data } = await c.from("kitchen_state").select("updated_at").eq("user_id", sync.user.id).maybeSingle();
      if (data && m.lastSynced && data.updated_at > m.lastSynced) { sync.status = "ok"; await pull(); return; }
    }
    const { data, error } = await c.from("kitchen_state").upsert({ user_id: sync.user.id, state: cloudCopy(), device: navigator.userAgent.slice(0, 120) }).select("updated_at").single();
    if (error) throw error;
    m.lastSynced = data.updated_at; m.dirty = false;
    await saveNow();
    sync.status = "ok"; sync.last = new Date().toISOString(); sync.error = "";
  } catch (e) { sync.status = navigator.onLine ? "error" : "offline"; sync.error = e.message || String(e); }
  emit();
}

export async function signUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  if (data.session) { sync.user = data.user; await pull(); }
  return !!data.session;
}
export async function signIn(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  sync.user = data.user;
  meta().lastSynced = null; // first sync on this device: take the cloud copy, merging local changes
  meta().dirty = (S.state.recipes.length + S.state.inventory.length) > 0;
  await pull();
}
export async function signOut() {
  const c = await client();
  await c.auth.signOut();
  sync.user = null; sync.status = "off";
  const m = meta(); m.lastSynced = null; m.dirty = false;
  save(); emit();
}
export async function resetPassword(email) {
  const c = await client();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export function syncLabel() {
  if (!sync.user) return t("sync_off");
  if (sync.status === "syncing") return t("sync_syncing");
  if (sync.status === "offline") return t("sync_offline");
  if (sync.status === "error") return t("sync_error");
  return t("sync_ok");
}
export { toast };
