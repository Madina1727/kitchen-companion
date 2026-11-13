// Shared state, helpers, i18n and UI primitives (sheet, toast, confirm).
import { kvGet, kvSet, emptyState, uid, STATE_VERSION } from "./db.js";
import { STR } from "./i18n.js";
import { BY_ID, INGREDIENTS, CATEGORIES } from "./catalog.js";
import { fmtQty, ingName, registerCustomName, guessMeals, mealsOf, MEAL_TYPES, estimateEffort, recipeFacts, guessDish, guessCuisine, cuisineId, DISH_TYPES, CUISINES, resolveIngredient, recogniseTyped, norm, uzLatin, isUzbekCyrillic } from "./engine.js";
import { latinizeRecipe } from "./parser.js";

export const S = { state: emptyState() };
/** Set by sync.js: run after every save, and whether the cloud AI proxy can be used. */
export const hooks = { afterSave: null, cloudReady: () => false, cloudToken: async () => null };
/** Claude features are usable with this device's key, or through the signed-in cloud proxy. */
export const aiAvailable = () => !!S.state.settings.aiConsent && (!!S.state.settings.apiKey || hooks.cloudReady());
export { uid };

export async function loadState() {
  const saved = await kvGet("state").catch(() => null);
  if (saved && saved.v) S.state = migrate(saved);
  for (const r of S.state.recipes) for (const i of r.ingredients) if (i.ingredientId && i.name) registerCustomName(i.name, i.ingredientId);
}
/** Every recipe gets its meal types (breakfast / lunch / dinner / …); recipes that already have them keep theirs. */
export function ensureMeals(st = S.state) {
  for (const r of st.recipes || []) {
    // Uzbek Cyrillic -> Uzbek Latin, then give names the catalogue has learned since a second chance.
    try { latinizeRecipe(r); } catch { /* leave the recipe as it is */ }
    for (const i of r.ingredients || []) if (!i.ingredientId && i.name) { const id = resolveIngredient(i.name); if (id) { i.ingredientId = id; i.uncertain = false; if (i.qty != null && !i.unit) i.unit = "pc"; } }
    if (!Array.isArray(r.meals) || !r.meals.length) { r.meals = guessMeals(r); r.category = r.meals[0]; }
    estimateEffort(r);
    if (!r.dish) r.dish = guessDish(r);
    const cu = guessCuisine(r); if (cu) r.cuisine = cu; // known cuisines are stored by id; anything else stays as the person wrote it
  }
  // The same for what is in the kitchen.
  let names = null;
  for (const it of st.inventory || []) {
    if (it.name && isUzbekCyrillic(it.name + " " + it.name)) it.name = uzLatin(it.name);
    if (!it.ingredientId && it.name) {
      // Items added earlier with a typing slip ("shpinach") are recognised now, the same way the Add form does it.
      names ||= (() => { const m = new Map(); for (const r of st.recipes || []) for (const i of r.ingredients || []) if (!i.ingredientId && i.name) { const k = norm(i.name); if (k && k.length <= 40 && !m.has(k)) m.set(k, i.name); } return m; })();
      const rec = recogniseTyped(it.name, names);
      if (rec.id) { it.ingredientId = rec.id; it.category = BY_ID[rec.id]?.category || it.category; }
      else if (rec.corrected) it.name = rec.name;
    }
  }
}
function migrate(st) {
  ensureMeals(st);
  const base = emptyState();
  const out = { ...base, ...st, prefs: { ...base.prefs, ...st.prefs }, settings: { ...base.settings, ...st.settings } };
  out.v = STATE_VERSION;
  return out;
}
let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet("state", S.state).catch((e) => toast(t("save_failed") + " " + e.message, "error")), 150);
  hooks.afterSave?.();
}
export function saveNow() { clearTimeout(saveTimer); return kvSet("state", S.state); }

/* ---------- theme: "system" follows the device, or force light / dark ---------- */
export function applyTheme() {
  const th = S.state.prefs.theme || "system";
  const root = document.documentElement;
  if (th === "system") delete root.dataset.theme; else root.dataset.theme = th;
  const dark = th === "dark" || (th === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#0F1A13" : "#F5FAF0"));
  root.style.colorScheme = dark ? "dark" : "light";
}
export function isDark() { return document.documentElement.style.colorScheme === "dark"; }

/* ---------- i18n ---------- */
export const lang = () => S.state.prefs.lang || "en";
export function t(key, vars) {
  let s = STR[lang()]?.[key] ?? STR.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll("{" + k + "}", v);
  return s;
}
/** t() with an optional "_one" form for n === 1. */
export function tn(key, n, vars = {}) {
  const one = STR[lang()]?.[key + "_one"] ?? (lang() === "en" ? STR.en[key + "_one"] : undefined);
  return n === 1 && one ? one.replaceAll("{n}", n) : t(key, { n, ...vars });
}
export function plural(n, key) {
  const rules = new Intl.PluralRules(lang());
  const form = rules.select(n);
  return t(key + "_" + form, { n }) !== key + "_" + form ? t(key + "_" + form, { n }) : t(key + "_other", { n });
}

/* ---------- html helpers ---------- */
export function h(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const icon = (name, cls = "") => `<i data-lucide="${name}" class="ic ${cls}" aria-hidden="true"></i>`;
export function refreshIcons(root = document) {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.75 }, nameAttr: "data-lucide", root });
}
export function qty(n, unit) {
  if (n == null) return "";
  return fmtQty(n, lang(), unit) + (unit ? " " + unitLabel(unit) : "");
}
export const unitLabel = (u) => (u ? t("u_" + u) : "");
export const catLabel = (c) => t("cat_" + c);
export const iname = (item) => ingName(item, lang());
export function minutes(n) {
  if (!n) return "";
  if (n < 60) return t("min_short", { n });
  const hh = Math.floor(n / 60), mm = n % 60;
  return mm ? t("hm_short", { h: hh, m: mm }) : t("h_short", { n: hh });
}
export function dateLabel(iso, opts = { month: "short", day: "numeric" }) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(lang(), opts).format(new Date(iso + (iso.length === 10 ? "T00:00:00" : "")));
}
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return todayISO(d); }

/** Datalist with every catalog name in the current language (plus English). */
export function ingredientDatalist() {
  const l = lang();
  const opts = INGREDIENTS.map((i) => `<option value="${h(i.names[l])}">${l !== "en" ? h(i.names.en) : ""}</option>`).join("");
  return `<datalist id="ing-list">${opts}</datalist>`;
}
const CAT_ICON = { vegetables: "carrot", fruits: "apple", herbs: "leaf", meat: "beef", seafood: "fish", dairy: "milk", eggs: "egg", grains: "wheat",
  pasta: "soup", legumes: "bean", nuts: "nut", bakery: "croissant", spices: "flame", sauces: "droplet", oils: "droplet", baking: "cake-slice", drinks: "cup-soda", other: "package" };
export const catIcon = (c) => CAT_ICON[c] || "package";
export const LOCATIONS = ["fridge", "freezer", "pantry"];
export function defaultLocation(ingredientId) {
  const c = BY_ID[ingredientId]?.category;
  if (["meat", "seafood", "dairy", "eggs", "herbs"].includes(c)) return "fridge";
  if (["vegetables", "fruits"].includes(c)) return ["potato", "onion", "garlic", "red_onion", "sweet_potato", "pumpkin", "banana", "apple"].includes(ingredientId) ? "pantry" : "fridge";
  return "pantry";
}
export { CATEGORIES, BY_ID, guessMeals, mealsOf, MEAL_TYPES };
/** The meals of a planned day: three meals, or suhoor and iftar while Ramadan mode is on. */
export { recipeFacts, guessDish, guessCuisine, cuisineId, DISH_TYPES, CUISINES };
/** "Uzbek" for a cuisine id, or the text as written when it is not one of the known cuisines. */
export const cuisineLabel = (c) => (CUISINES.includes(c) ? t("cui_" + c) : c || "");
export const dishLabel = (d) => (DISH_TYPES.includes(d) ? t("dish_" + d) : "");
export const won = (n) => "₩" + (n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10).toLocaleString("en-US");
/** Facts of a recipe for display, with the person's own prices. */
export const factsOf = (r, servings) => recipeFacts(r, servings, S.state.prefs.prices || {});
export const planMeals = () => (S.state.prefs.ramadan ? ["suhoor", "iftar"] : ["breakfast", "lunch", "dinner"]);
/** Which recipe types suit a plan slot. */
export const SLOT_TYPES = { breakfast: ["breakfast"], suhoor: ["breakfast"], lunch: ["lunch"], dinner: ["dinner"], iftar: ["dinner"] };
/** How well a recipe suits a plan slot: 2 = the recipe itself says so (tag "Iftar"), 1 = its type fits, 0 = no. */
export function slotFit(r, meal) {
  if ((r.tags || []).some((x) => x.toLowerCase() === meal)) return 2;
  return mealsOf(r).some((m) => (SLOT_TYPES[meal] || []).includes(m)) ? 1 : 0;
}
/** "Breakfast · Snack" */
export const mealsLabel = (r) => mealsOf(r).map((m) => t("cat_" + m)).join(" · ");

/* ---------- toast ---------- */
export function toast(msg, kind = "info", action) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast toast-" + kind;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.innerHTML = `<span>${h(msg)}</span>${action ? `<button class="btn-link">${h(action.label)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => { action.fn(); el.remove(); };
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), action ? 6500 : 3200);
  setTimeout(() => el.remove(), action ? 7000 : 3700);
}

/* ---------- sheet / dialog ---------- */
let sheetStack = [];
export function openSheet(title, body, { onMount, wide = false, onClose } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <section class="sheet ${wide ? "sheet-wide" : ""}" role="dialog" aria-modal="true" aria-label="${h(title)}">
      <header class="sheet-head"><h2>${h(title)}</h2><button class="icon-btn" data-close aria-label="${h(t("close"))}">${icon("x")}</button></header>
      <div class="sheet-body">${body}</div>
    </section>`;
  document.body.appendChild(wrap);
  const close = () => {
    wrap.classList.add("out");
    setTimeout(() => wrap.remove(), 180);
    sheetStack = sheetStack.filter((s) => s !== api);
    onClose?.();
  };
  const api = { el: wrap.querySelector(".sheet"), close };
  sheetStack.push(api);
  wrap.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  refreshIcons(wrap);
  requestAnimationFrame(() => wrap.classList.add("in"));
  onMount?.(api.el, close);
  const first = api.el.querySelector("input, select, textarea, button:not([data-close])");
  first?.focus({ preventScroll: true });
  return api;
}
export function closeTopSheet() { sheetStack[sheetStack.length - 1]?.close(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopSheet(); });

export function confirmDialog(message, { ok = t("confirm"), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(t("are_you_sure"), `<p class="lead">${h(message)}</p>
      <div class="row-end"><button class="btn" data-close>${h(t("cancel"))}</button>
      <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${h(ok)}</button></div>`, {
      onMount: (el, close) => el.querySelector("[data-ok]").onclick = () => { done = true; resolve(true); close(); },
      onClose: () => { if (!done) resolve(false); },
    });
    return s;
  });
}

/* ---------- misc ---------- */
export function fileToBase64(file) {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = bad;
    r.readAsDataURL(file);
  });
}
export function resizeImage(file, max = 900, quality = 0.82) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = bad;
    img.src = URL.createObjectURL(file);
  });
}
export function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function recipeById(id) { return S.state.recipes.find((r) => r.id === id); }
export function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; }
