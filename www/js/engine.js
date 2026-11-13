// Deterministic core: ingredient normalisation, unit conversion, recipe matching,
// grocery lists and inventory deduction. No AI is used here.
import { INGREDIENTS, BY_ID, ALLERGENS, DIETS, RESTRICTIONS, SUBSTITUTES } from "./catalog.js";

/* ---------- units ---------- */
export const UNITS = {
  g: { dim: "mass", f: 1 }, kg: { dim: "mass", f: 1000 }, mg: { dim: "mass", f: 0.001 },
  oz: { dim: "mass", f: 28.35 }, lb: { dim: "mass", f: 453.6 },
  ml: { dim: "vol", f: 1 }, l: { dim: "vol", f: 1000 }, tsp: { dim: "vol", f: 5 }, tbsp: { dim: "vol", f: 15 },
  cup: { dim: "vol", f: 240 }, floz: { dim: "vol", f: 29.57 }, pinch: { dim: "vol", f: 0.3 },
  pc: { dim: "count", f: 1 }, clove: { dim: "count", f: 1 }, bunch: { dim: "count", f: 1 },
  slice: { dim: "count", f: 1 }, can: { dim: "count", f: 1 }, pack: { dim: "count", f: 1 },
};
export const UNIT_LIST = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "pc", "clove", "bunch", "slice", "can", "pack", "oz", "lb", "pinch"];

const UNIT_ALIASES = {
  g: ["g", "gr", "gram", "grams", "gramm", "г", "гр", "грамм", "граммов", "грамма", "그램"], kg: ["kg", "kilo", "kilogram", "kilograms", "кг", "킬로"],
  mg: ["mg"], oz: ["oz", "ounce", "ounces"], lb: ["lb", "lbs", "pound", "pounds"],
  ml: ["ml", "milliliter", "milliliters", "millilitre", "мл", "밀리리터"], l: ["l", "liter", "liters", "litre", "litres", "litr", "л", "литр", "литра", "리터"],
  tsp: ["tsp", "teaspoon", "teaspoons", "t", "ч.л", "ч.л.", "чл", "чайная ложка", "чайной ложки", "чайные ложки", "чайных ложки", "чайных ложек", "ч.ложки", "ч.ложка", "choy qoshiq", "choy qoshig'i", "choy qoshiqda", "작은술", "티스푼"],
  tbsp: ["tbsp", "tablespoon", "tablespoons", "tbs", "tbl", "T", "ст.л", "ст.л.", "стл", "столовая ложка", "столовой ложки", "столовые ложки", "столовых ложки", "столовых ложек", "ст.ложки", "ст.ложка", "osh qoshiq", "osh qoshig'i", "qoshiq", "ложка", "ложки", "큰술", "스푼", "숟가락"],
  cup: ["cup", "cups", "c", "стакан", "стакана", "стаканов", "stakan", "piyola", "kosa", "chashka", "чашка", "чашки", "컵"], floz: ["fl oz", "floz"], pinch: ["pinch", "щепотка", "щепотки", "щепотку", "chimdim", "꼬집"],
  pc: ["pc", "pcs", "piece", "pieces", "whole", "шт", "шт.", "штука", "штуки", "штук", "dona", "ta", "bosh", "개"],
  clove: ["clove", "cloves", "зубчик", "зубчика", "зубчиков", "bo'lak", "zubchik", "tishi", "쪽"], bunch: ["bunch", "bunches", "пучок", "пучка", "bog'", "dasta", "단", "줌"],
  slice: ["slice", "slices", "ломтик", "ломтика", "tilim", "장"], can: ["can", "cans", "tin", "банка", "банки", "банка", "캔"],
  pack: ["pack", "packs", "package", "packet", "пачка", "упаковка", "paket", "봉지"],
};
const UNIT_INDEX = {};
for (const [u, list] of Object.entries(UNIT_ALIASES)) for (const a of list) UNIT_INDEX[a === "T" ? a : a.toLowerCase()] = u;
export function parseUnit(word) {
  if (!word) return null;
  if (word === "T") return "tbsp";
  if (word === "t") return "tsp";
  const w = word.toLowerCase().replace(/[‘’`ʻʼ]/g, "'").trim();
  return UNIT_INDEX[w.replace(/\.$/, "")] || UNIT_INDEX[w] || null;
}

// Liquids where 1 ml is close to 1 g (approximate, used only when units differ).
const LIQUID_CATS = new Set(["drinks", "dairy", "oils", "sauces"]);

/** Convert qty between units for an ingredient. Returns null if not convertible. */
export function convert(qty, from, to, ingId) {
  if (qty == null) return null;
  from = from || "pc"; to = to || "pc";
  if (from === to) return qty;
  const a = UNITS[from], b = UNITS[to];
  if (!a || !b) return null;
  if (a.dim === b.dim) return (qty * a.f) / b.f;
  const ing = BY_ID[ingId];
  const toGrams = (q, u) => {
    const d = UNITS[u];
    if (d.dim === "mass") return q * d.f;
    if (d.dim === "count") return ing?.gpp ? q * ing.gpp : null;
    if (d.dim === "vol") return ing && LIQUID_CATS.has(ing.category) ? q * d.f : null;
    return null;
  };
  const fromGrams = (gr, u) => {
    const d = UNITS[u];
    if (d.dim === "mass") return gr / d.f;
    if (d.dim === "count") return ing?.gpp ? gr / ing.gpp : null;
    if (d.dim === "vol") return ing && LIQUID_CATS.has(ing.category) ? gr / d.f : null;
    return null;
  };
  const gr = toGrams(qty, from);
  return gr == null ? null : fromGrams(gr, to);
}

/* ---------- ingredient normalisation ---------- */
export function norm(s) {
  return (s || "").toLowerCase().normalize("NFC").replace(/[‘’`ʻʼ]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
}
function singular(w) {
  if (/[^a-z]/.test(w) || w.length < 4) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(oes|shes|ches|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
const NAME_INDEX = new Map();
const KO_NAMES = [];
function addName(name, id) {
  const n = norm(name);
  if (!n) return;
  if (!NAME_INDEX.has(n)) NAME_INDEX.set(n, id);
  const s = n.split(" ").map(singular).join(" ");
  if (!NAME_INDEX.has(s)) NAME_INDEX.set(s, id);
  if (/[가-힣]/.test(n)) KO_NAMES.push([n, id]);
}
for (const ing of INGREDIENTS) {
  for (const n of Object.values(ing.names)) addName(n, ing.id);
  for (const a of ing.aliases) addName(a, ing.id);
}
KO_NAMES.sort((a, b) => b[0].length - a[0].length);
export function registerCustomName(name, id) { addName(name, id); }

/** Map free text ("2 large brown onions") to a canonical id, or null. */
export function resolveIngredient(text) {
  const n = norm(text);
  if (!n) return null;
  if (NAME_INDEX.has(n)) return NAME_INDEX.get(n);
  const toks = n.split(" ");
  const st = toks.map(singular);
  for (let len = Math.min(4, toks.length); len >= 1; len--) {
    for (let i = 0; i + len <= toks.length; i++) {
      const a = toks.slice(i, i + len).join(" "), b = st.slice(i, i + len).join(" ");
      if (NAME_INDEX.has(a)) return NAME_INDEX.get(a);
      if (NAME_INDEX.has(b)) return NAME_INDEX.get(b);
    }
  }
  // Russian/Uzbek inflection: try matching word stems (first 5 letters).
  for (const t of toks) {
    if (t.length < 5 || /[a-z]/.test(t)) continue;
    for (const [name, id] of NAME_INDEX) if (!name.includes(" ") && name.length >= 5 && name.slice(0, 5) === t.slice(0, 5)) return id;
  }
  for (const [name, id] of KO_NAMES) if (n.includes(name)) return id;
  return null;
}

/** Stable key used to compare recipe and inventory items. */
export function keyOf(item) { return item.ingredientId || "custom:" + norm(item.name).split(" ").map(singular).join(" "); }

export function ingName(item, lang) {
  if (item.ingredientId && BY_ID[item.ingredientId]) return BY_ID[item.ingredientId].names[lang] || BY_ID[item.ingredientId].names.en;
  return item.name || "";
}
export function ingCategory(item) { return BY_ID[item.ingredientId]?.category || item.category || "other"; }

/* ---------- dietary exclusions (hard rules) ---------- */
const ALLERGEN_WORDS = {
  nuts: ["nut", "орех", "yong'oq", "견과", "호두", "아몬드", "땅콩", "pistachio", "hazelnut", "cashew", "pecan"],
  peanuts: ["peanut", "арахис", "땅콩"],
  eggs: ["egg", "яйц", "tuxum", "달걀", "계란"],
  milk: ["milk", "cream", "cheese", "butter", "молок", "сливк", "сыр", "масло сливоч", "sut", "pishloq", "우유", "치즈", "버터", "whey", "ghee"],
  seafood: ["fish", "shrimp", "prawn", "crab", "lobster", "squid", "mussel", "oyster", "рыб", "кревет", "baliq", "생선", "새우", "오징어", "anchov"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "mussel", "oyster", "clam", "кревет", "새우", "게"],
  gluten: ["flour", "wheat", "bread", "pasta", "noodle", "мук", "хлеб", "un ", "밀가루", "barley", "rye"],
  soy: ["soy", "tofu", "соев", "간장", "두부"],
  sesame: ["sesame", "кунжут", "kunjut", "참깨", "참기름", "tahini"],
};

/** Returns a list of {ingredient, reason} that block this recipe for the user. */
export function exclusionsFor(recipe, prefs) {
  const blocked = [];
  const allergies = prefs.allergies || [];
  const diet = DIETS[prefs.diet] || {};
  const restr = prefs.restrictions || [];
  const extra = (prefs.exclusions || []).map(norm).filter(Boolean);
  for (const ri of recipe.ingredients) {
    const id = ri.ingredientId, cat = ingCategory(ri), nm = norm(ri.name || ingName(ri, "en"));
    for (const a of allergies) {
      if ((id && ALLERGENS[a]?.includes(id)) || (!id && (ALLERGEN_WORDS[a] || []).some((w) => nm.includes(w))))
        blocked.push({ ri, reason: "allergy", tag: a });
    }
    if (diet.excludeCategories?.includes(cat) || (id && diet.exclude?.includes(id))) blocked.push({ ri, reason: "diet", tag: prefs.diet });
    for (const r of restr) if (id && RESTRICTIONS[r]?.includes(id)) blocked.push({ ri, reason: "restriction", tag: r });
    for (const x of extra) if (nm.includes(x) || (id && norm(BY_ID[id]?.names.en) === x)) blocked.push({ ri, reason: "exclusion", tag: x });
  }
  return blocked;
}

/* ---------- inventory helpers ---------- */
export function daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}
export function expiryStatus(item) {
  const d = daysUntil(item.expires);
  if (d == null) return "none";
  if (d < 0) return "expired";
  if (d <= 2) return "soon";
  if (d <= 7) return "week";
  return "ok";
}
export function isLow(item) {
  if (item.lowAt != null && item.qty != null) return item.qty <= item.lowAt;
  return item.qty === 0;
}

/** Total quantity of `key` in the inventory, expressed in `unit`. */
function stockFor(key, unit, ingId, inventory) {
  const items = inventory.filter((it) => keyOf(it) === key && expiryStatus(it) !== "expired");
  if (!items.length) return { present: false, qty: null, comparable: false, items };
  let total = 0, comparable = true, anyQty = false;
  for (const it of items) {
    if (it.qty == null) { comparable = false; continue; }
    anyQty = true;
    const c = convert(it.qty, it.unit, unit, ingId);
    if (c == null) comparable = false; else total += c;
  }
  return { present: true, qty: anyQty ? total : null, comparable: comparable && anyQty, items };
}

/* ---------- matching ---------- */
/**
 * Score one recipe against the kitchen.
 * S = 0.55E + 0.15O + 0.15Q + 0.10P + 0.05F, each 0..100. Exclusions are hard.
 */
export function matchRecipe(recipe, ctx) {
  const { inventory, prefs, staples = [], servings } = ctx;
  const scale = servings && recipe.servings ? servings / recipe.servings : 1;
  const blocked = exclusionsFor(recipe, prefs);
  const rows = recipe.ingredients.map((ri) => {
    const key = keyOf(ri);
    const need = ri.qty != null ? ri.qty * scale : null;
    const unit = ri.unit || BY_ID[ri.ingredientId]?.unit || "pc";
    const stock = stockFor(key, unit, ri.ingredientId, inventory);
    let status;
    if (stock.present) {
      if (need == null || !stock.comparable) status = stock.comparable || need == null ? "have" : "unknown";
      else status = stock.qty + 1e-9 >= need ? "have" : "short";
    } else if (ri.ingredientId && staples.includes(ri.ingredientId)) status = "staple";
    else status = "missing";
    let sub = null;
    if (status === "missing" && ri.ingredientId) {
      for (const s of SUBSTITUTES[ri.ingredientId] || []) {
        const st = stockFor(s.id, BY_ID[s.id]?.unit, s.id, inventory);
        if (st.present || staples.includes(s.id)) { sub = s; break; }
      }
    }
    const expiring = stock.items.some((it) => ["soon", "week"].includes(expiryStatus(it)));
    const soon = stock.items.some((it) => expiryStatus(it) === "soon");
    return { ri, key, need, unit, have: stock.qty, status, sub, expiring, soon, essential: ri.essential !== false };
  });
  const ess = rows.filter((r) => r.essential), opt = rows.filter((r) => !r.essential);
  const avail = (r) => ["have", "short", "unknown", "staple"].includes(r.status);
  const missing = ess.filter((r) => r.status === "missing");
  const missingNoSub = missing.filter((r) => !r.sub);
  const subs = missing.filter((r) => r.sub);
  const short = ess.filter((r) => r.status === "short");
  const unknownQty = ess.filter((r) => r.status === "unknown");

  const E = ess.length ? ((ess.filter(avail).length + subs.length * 0.6) / ess.length) * 100 : 100;
  const O = opt.length ? (opt.filter(avail).length / opt.length) * 100 : 100;
  const comparable = ess.filter((r) => r.status === "have" || r.status === "short").filter((r) => r.need != null && r.have != null);
  const Q = comparable.length ? (comparable.reduce((s, r) => s + Math.min(r.have / r.need, 1), 0) / comparable.length) * 100 : 100;
  let P = 50;
  const total = (recipe.prepTime || 0) + (recipe.cookTime || 0);
  if (prefs.maxTime && total) P += total <= prefs.maxTime ? 20 : -25;
  if (prefs.cuisines?.length && recipe.cuisine) P += prefs.cuisines.some((c) => norm(c) === norm(recipe.cuisine)) ? 20 : 0;
  if (prefs.level === "beginner" && recipe.difficulty === "hard") P -= 20;
  if (recipe.favorite) P += 10;
  P = Math.max(0, Math.min(100, P));
  const F = rows.some((r) => r.soon) ? 100 : rows.some((r) => r.expiring) ? 60 : 0;
  const score = 0.55 * E + 0.15 * O + 0.15 * Q + 0.1 * P + 0.05 * F;

  let bucket;
  if (blocked.length) bucket = "blocked";
  else if (missingNoSub.length === 0 && subs.length === 0 && short.length === 0) bucket = "ready";
  else if (missingNoSub.length === 0 && short.length === 0) bucket = "subs";
  else if (missingNoSub.length === 0) bucket = "short";
  else if (missingNoSub.length === 1) bucket = "one";
  else if (missingNoSub.length === 2) bucket = "two";
  else bucket = "far";

  return {
    recipe, rows, bucket, blocked, score: Math.round(score), E: Math.round(E),
    essTotal: ess.length, essAvail: ess.filter(avail).length, missing, missingNoSub, subs, short, unknownQty,
    usesExpiring: rows.some((r) => r.expiring), totalTime: total,
  };
}

export function matchAll(recipes, ctx) {
  return recipes.map((r) => matchRecipe(r, ctx)).sort((a, b) => b.score - a.score);
}

/* ---------- grocery list ---------- */
/** Combine ingredients from planned meals, subtract stock, group by category. */
export function buildGrocery(entries, recipesById, inventory, staples = []) {
  const need = new Map();
  for (const e of entries) {
    const r = recipesById[e.recipeId];
    if (!r) continue;
    const scale = e.servings && r.servings ? e.servings / r.servings : 1;
    for (const ri of r.ingredients) {
      if (ri.essential === false) continue;
      const key = keyOf(ri);
      const unit = ri.unit || BY_ID[ri.ingredientId]?.unit || "pc";
      const q = ri.qty != null ? ri.qty * scale : null;
      let row = need.get(key);
      if (!row) { row = { key, ingredientId: ri.ingredientId, name: ri.name, unit, qty: 0, unknown: false, recipes: new Set(), extra: [] }; need.set(key, row); }
      row.recipes.add(r.title);
      if (q == null) { row.unknown = true; continue; }
      const c = convert(q, unit, row.unit, ri.ingredientId);
      if (c == null) row.extra.push({ qty: q, unit }); else row.qty += c;
    }
  }
  const out = [];
  for (const row of need.values()) {
    const stock = stockFor(row.key, row.unit, row.ingredientId, inventory);
    let toBuy = row.qty;
    if (stock.present) {
      if (stock.comparable) toBuy = Math.max(0, row.qty - stock.qty);
      else toBuy = 0; // present but not comparable: assume enough, user can add manually
    } else if (row.ingredientId && staples.includes(row.ingredientId)) toBuy = 0;
    if (toBuy <= 1e-9 && !row.extra.length && !(row.unknown && !stock.present && !(row.ingredientId && staples.includes(row.ingredientId)))) continue;
    out.push({ ...row, qty: toBuy > 1e-9 ? toBuy : null, recipes: [...row.recipes], category: ingCategory(row) });
  }
  return out;
}

/* ---------- deduction after cooking ---------- */
/** Suggest how much to take from each inventory item (earliest expiry first). */
export function planDeduction(recipe, servings, inventory) {
  const scale = servings && recipe.servings ? servings / recipe.servings : 1;
  const lines = [];
  for (const ri of recipe.ingredients) {
    const key = keyOf(ri);
    const items = inventory.filter((it) => keyOf(it) === key)
      .sort((a, b) => (a.expires || "9999").localeCompare(b.expires || "9999"));
    if (!items.length) continue;
    let remaining = ri.qty != null ? ri.qty * scale : null;
    for (const it of items) {
      let take = null;
      if (remaining != null && it.qty != null) {
        const inItemUnit = convert(remaining, ri.unit || "pc", it.unit, ri.ingredientId);
        if (inItemUnit != null) {
          take = Math.min(it.qty, inItemUnit);
          remaining = convert(inItemUnit - take, it.unit, ri.unit || "pc", ri.ingredientId);
        }
      }
      lines.push({ itemId: it.id, ri, item: it, take: take != null ? round(take) : null });
      if (remaining != null && remaining <= 1e-9) break;
    }
  }
  return lines;
}

/* ---------- formatting ---------- */
export function round(n) {
  if (n == null) return n;
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}
const FRACTIONS = [[0.25, "¼"], [0.333, "⅓"], [0.5, "½"], [0.667, "⅔"], [0.75, "¾"]];
export function fmtQty(n, locale = "en", unit) {
  if (n == null) return "";
  const useFrac = ["tsp", "tbsp", "cup", "pc", "clove", "bunch", "can", "slice", "pack"].includes(unit);
  if (useFrac) {
    const whole = Math.floor(n), rest = n - whole;
    const f = FRACTIONS.find(([v]) => Math.abs(rest - v) < 0.04);
    if (f) return (whole ? whole : "") + f[1];
    if (rest < 0.04) return String(whole);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }).format(n);
}
