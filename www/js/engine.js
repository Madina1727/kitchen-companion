// Deterministic core: ingredient normalisation, unit conversion, recipe matching,
// grocery lists and inventory deduction. No AI is used here.
import { INGREDIENTS, BY_ID, ALLERGENS, DIETS, RESTRICTIONS, SUBSTITUTES } from "./catalog.js";
import { FACTS, DENSITY, BUNCH } from "./nutri.js";

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
  return (s || "").toLowerCase().normalize("NFC").replace(/[‘’`ʻʼ]/g, "'").replace(/[ģğ]/g, "g'").replace(/[òóö]/g, "o'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
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
export function resolveIngredient(text, _noLatin = false) {
  const n = norm(text);
  if (!n) return null;
  if (NAME_INDEX.has(n)) return NAME_INDEX.get(n);
  // "Pyure" on its own is mashed potato, so it is potato; "olma pyuresi" is whatever was mashed (apple).
  const PUREE = /(^|\s)(pyure[a-z']*|puree|mashed|пюре|퓌레)(?=\s|$)/g;
  if (PUREE.test(n)) {
    const rest = n.replace(PUREE, " ").split(" ").filter((w) => w && !/^\d/.test(w) && !parseUnit(w) && !/^(kartoshka\w*|картоф\w*|potato(es)?|감자)$/.test(w)).join(" ");
    return rest ? resolveIngredient(rest, _noLatin) : "potato";
  }
  const toks = n.split(" ");
  const st = toks.map(singular);
  for (let len = Math.min(4, toks.length); len >= 1; len--) {
    for (let i = 0; i + len <= toks.length; i++) {
      const a = toks.slice(i, i + len).join(" "), b = st.slice(i, i + len).join(" ");
      if (NAME_INDEX.has(a)) return NAME_INDEX.get(a);
      if (NAME_INDEX.has(b)) return NAME_INDEX.get(b);
    }
  }
  // Uzbek endings: "sutni", "tuxumlar", "piyozdan", "go'shti" -> sut, tuxum, piyoz, go'sht.
  for (let len = Math.min(3, toks.length); len >= 1; len--) {
    for (let i = 0; i + len <= toks.length; i++) {
      const head = toks.slice(i, i + len - 1), last = toks[i + len - 1];
      if (!/^[a-z']+$/.test(last)) continue;
      let w = last;
      for (let round = 0; round < 2; round++) {
        const m = w.match(/^(.{3,}?)(larni|lari|lar|ning|ini|ni|dan|ga|ka|qa|da|li|si|i)$/);
        if (!m) break;
        w = m[1];
        const cand = [...head, w].join(" ");
        if (NAME_INDEX.has(cand)) return NAME_INDEX.get(cand);
      }
    }
  }

  for (const t of toks) {
    if (t.length < 5 || /[a-z]/.test(t)) continue;
    for (const [name, id] of NAME_INDEX) if (!name.includes(" ") && name.length >= 5 && name.slice(0, 5) === t.slice(0, 5)) return id;
  }
  for (const [name, id] of KO_NAMES) if (n.includes(name)) return id;
  // Uzbek written in Cyrillic ("сут", "тухум", "пиёз"): read it as Latin Uzbek ("sut", "tuxum", "piyoz").
  if (!_noLatin && /[а-яёўқғҳ]/i.test(n)) return resolveIngredient(uzLatin(text), true);
  return null;
}

/* ---------- typing mistakes: "shpinach" -> shpinat / spinach ---------- */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1); // swapped letters
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
/** Closest entry of `names` (normalised strings) to `word`, allowing 1 slip for short words and 2 for long ones. */
function closest(word, names) {
  const max = word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0;
  if (!max) return null;
  const minLen = word.length === 4 ? 5 : 0; // a 4-letter word only matches a longer name it lost a letter from ("tuxm" -> tuxum)
  let best = max + 1, hit = null, tie = false;
  for (const name of names) {
    if (name[0] !== word[0] || name.length < minLen || name.includes(" ") !== word.includes(" ")) continue;
    const d = editDistance(word, name, Math.min(max, best));
    if (d < best) { best = d; hit = name; tie = false; } else if (d === best && hit && d <= max) tie = name;
  }
  return hit && best <= max ? { name: hit, other: tie || null } : null;
}
/**
 * For things a person types by hand (adding to the kitchen): the usual match first, then the nearest
 * spelling in the ingredient list, then the nearest ingredient name that recipes use (`recipeNames`: normalised -> as written).
 * Returns { id, name, corrected } — id is null for an ingredient that only recipes know.
 */
export function recogniseTyped(text, recipeNames = new Map()) {
  const exact = resolveIngredient(text);
  if (exact) return { id: exact, name: text, corrected: false };
  const n = norm(text);
  if (!n) return { id: null, name: text, corrected: false };
  if (recipeNames.has(n)) return { id: null, name: recipeNames.get(n), corrected: false };
  const tries = [n, ...(n.includes(" ") ? n.split(" ").filter((w) => w.length >= 5) : [])];
  for (const w of tries) {
    const c = closest(w, NAME_INDEX.keys());
    if (c) {
      const id = NAME_INDEX.get(c.name);
      if (!c.other || NAME_INDEX.get(c.other) === id) return { id, name: text, corrected: true };
    }
  }
  const c = closest(n, recipeNames.keys());
  if (c && !c.other) return { id: null, name: recipeNames.get(c.name), corrected: true };
  return { id: null, name: text, corrected: false };
}

/* ---------- Uzbek: Cyrillic -> Latin ---------- */
const UZ_MAP = { а: "a", б: "b", в: "v", г: "g", д: "d", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ч: "ch", ш: "sh", щ: "sh", ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ё: "yo", ў: "o'", қ: "q", ғ: "g'", ҳ: "h" };
const UZ_VOWELS = "аеёиоуэюяўыАЕЁИОУЭЮЯЎЫ";
const isCyr = (ch) => !!ch && /[а-яёўқғҳ]/i.test(ch);
/** Uzbek Cyrillic text in the Latin alphabet (ў -> o', қ -> q, ғ -> g', ҳ -> h, ш -> sh, ч -> ch …). */
export function uzLatin(text) {
  if (!text || !/[а-яёўқғҳ]/i.test(text)) return text || "";
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], low = ch.toLowerCase(), prev = text[i - 1], next = text[i + 1];
    let lat;
    if (low === "е") lat = !isCyr(prev) || UZ_VOWELS.includes(prev) || "ъьЪЬ".includes(prev) ? "ye" : "e";
    else if (low === "ц") lat = isCyr(prev) && UZ_VOWELS.includes(prev) ? "ts" : "s";
    else if (low in UZ_MAP) lat = UZ_MAP[low];
    else { out += ch; continue; }
    if (ch !== low && lat) { // keep capitals: "Ч" -> "Ch", but "ЧУЧВАРА" -> "CHUCHVARA"
      const allCaps = (isCyr(next) && next === next.toUpperCase() && next !== next.toLowerCase()) || (!isCyr(next) && isCyr(prev) && prev === prev.toUpperCase() && prev !== prev.toLowerCase());
      lat = allCaps ? lat.toUpperCase() : lat.charAt(0).toUpperCase() + lat.slice(1);
    }
    out += lat;
  }
  return out;
}
// Words that exist only in Uzbek (nothing that is also a Russian word, such as "минут", "томат", "грамм").
const UZ_WORDS = new Set("ва билан учун дона қошиқ кошик солиб қилиб килиб оламиз тайёр керак пиёз туз сут тухум ёғ гўшт гушт сабзи шакар сув мурч хамири хамирига ёки икки ярим пиёла кейин устига ичига солинади аралаштирамиз пишириб дақиқа дакика масаллиқлар масалликлар сариёғ сариёг қаймоқ каймок товуқ товук гуруч гурунч бодринг саримсоқ саримсок қалампир калампир тайёрланиши керакли ёрдамида қўшиб кушиб оловда қайнатиб кайнатиб таъбга кўра бўлади булади қиймаси киймаси пишлоқ пишлок қатиқ катик ёғи қизил кизил яшил ичида майда тўғраб тўғралган қовуриб ковуриб дамлаб кўкат ёғда сувда қиламиз соламиз бўлгач учун".split(" "));
const RU_WORDS = new Set("и в на с для по до из не или соль соли мука муки молоко молока яйцо яйца яиц масло масла сахар сахара вода воды лук перец добавить добавьте перемешать перемешайте минут грамм ложка ложки ложек стакан вкусу тесто затем смешать смешайте нарезать нарежьте варить жарить мясо курица картофель морковь чеснок сливки сметана сыр что как это если при после чтобы через сверху готово подавать приготовления ингредиенты к у о от за же то так его их мы вы они она он".split(" "));
/**
 * True only when a text is Uzbek written in Cyrillic. Russian text is never touched:
 * it needs clear Uzbek evidence (ў қ ғ ҳ or Uzbek-only words) that outweighs any Russian in it.
 */
export function isUzbekCyrillic(text) {
  if (!text || !/[а-яёўқғҳ]/i.test(text)) return false;
  const words = text.toLowerCase().match(/[а-яёўқғҳ]+/g) || [];
  let uz = 0, ru = 0;
  for (const w of words) {
    if (/[ўқғҳ]/.test(w)) uz += 2;            // letters Russian does not have
    else if (UZ_WORDS.has(w)) uz++;
    else if (RU_WORDS.has(w) || /[ыщ]/.test(w) || /(ться|ете|ить|ать|ого|ому|ыми|ами|ний|ная|ное|ные|ый|ую)$/.test(w)) ru++; // Russian words and endings
  }
  return uz >= 2 && uz >= 2 * ru;
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

/* ---------- meal types: a recipe can belong to one, two or three ---------- */
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "dessert", "snack", "drink", "other"];
// Words are matched as whole words or word beginnings (W…), so "средиземноморская" is not a "морс".
const W = (words) => new RegExp("(?:^|\\s)(?:" + words + ")", "i");
const WW = (words) => new RegExp("(?:^|\\s)(?:" + words + ")(?:\\s|$)", "i");
const DRINK_RULES = [
  [["drink", "breakfast", "snack"], W("смузи|smoothie|smuzi|шейк|shake|sheyk|milksheyk|milk sheyk|milkshake|милкшейк|мммилкшейк|스무디")],
  [["drink"], W("напит|ichimlik|drink|коктейл|kokteyl|компот|kompot|juice|sharbat|лимонад|limonad|кисель|음료|주스")],
  [["drink"], WW("сок|соки|чай|choy|морс|квас|айран|ayron|кефир")],
  [["drink"], /^(кофе|coffee|латте|latte|капучино|kofe)(\s|$)/i],
];
const MEAL_RULES = [
  // [types, words] — checked against the title, tags and book chapter.
  ...DRINK_RULES,
  [["breakfast", "snack"], W("гранол|granola|мюсли|muesli|бейгл|bagel|сэндвич|sandwich|sendvich|бутерброд|buterbrod|тост|toast|토스트|샌드위치")],
  [["breakfast"], W("завтрак|nonushta|breakfast|омлет|omlet|omelet|яичниц|quymoq|шакшук|shakshuka|каша|каши|bo'tqa|porridge|овсян|oat|сырник|sirnik|оладь|oladi|aladushki|блин|blin|панкейк|pankeyk|panki|pancake|запеканк|запеченная овсянка|아침")],
  [["lunch", "dinner"], W("суп|sho'rva|shorva|sho rva|soup|борщ|солянк|лагман|lag'mon|lagmon|плов|palov|plov|pilaf|сомса|чучвара|манти|шўрва|шурпа|крылышк|tabaka|табака|qurtoba|grenki|гренки|xasip|хасип|kotlet|манты|manti|пельмен|chuchvara|котлет|kotlet|мясо|мясн|go'sht|gosht|куриц|курин|tovuq|jo'ja|joja|bedana|chicken|рыб|baliq|fish|лосос|говядин|телятин|beef|свинин|индейк|баран|паста |pasta|спагетти|spaghetti|макарон|лапш|noodle|rice|гречк|пицц|pizza|pitsa|quiche|бургер|burger|шашлык|kabob|kabab|kebab|жарко|рагу|stew|dimlama|димлам|голубц|dolma|тефтел|гуляш|стейк|steak|карри|curry|салат|salat|salad|somsa|самса|хачапури|шаурм|лазань|lasagn|ризотто|risotto|фрикадел|qovurma|qovurdoq|norin|нарын|xonim|ханум|찌개|볶음|국수|덮밥|비빔|불고기|김치")],
  [["lunch", "dinner"], WW("рис|киш|osh|паста|taom|taomi|taomlar|ovqat|garnir|гарнир")],
  [["dessert"], W("десерт|desert|shirinlik|dessert|trayfl|trifle|pirojn|cheescake|эклер|ekler|бўғирсоқ|торт |торты|торта|tort |tortlar|cake|кекс|keks|пирожн|печень|cookie|pechene|морожен|muzqaymoq|ice cream|тарт|чизкейк|cheesecake|chizkeyk|cheezka|chizkeik|брауни|brownie|маффин|muffin|пудинг|pudding|мусс|желе|jelly|зефир|конфет|шоколадн|chocolate|shokoladli|топпинг|топинг|варень|джем|murabbo|халв|holva|пахлав|paxlava|медовик|наполеон|эклер|безе|меренг|суфле|панна|тирамису|штрудел|цукат|магкейк|кейк|крамбл|парфе|карамел|крем|пончик|donut|вафл|пряник|мармелад|батончик|케이크|디저트|쿠키")],
  [["dessert"], WW("торт|tort")],
  [["snack"], W("закуск|gazak|snack|перекус|батончик|чипс|крекер|хлебц|канапе|хумус|hummus|паштет|намазк|간식")],
  [["breakfast", "snack"], W("хлеб|булочк|лепешк|лепёшк|багет|чиабатт|bread")],
  [["breakfast", "snack"], WW("non|nonlar")],
];
// A dough or a base is a building block, not a meal.
const BASE_ONLY = /(^|\s)(тесто|основа|dough|crust|xamir)(\s|$)/i;
const SAVOURY = /мяс|куриц|курин|овощ|томат|сыр|капуст|рыб|лосос|гриб|картоф|индейк|шпинат|фет|бекон|ветчин|свекл|свёкл|козь|тунец|тунц|go'sht|tovuq|kartoshka|sabzavot|pishloq/i;
const MAIN_CATS = new Set(["meat", "seafood", "pasta", "grains", "legumes"]);

/** The meal types of a recipe, most fitting first (1 to 3). Uses what the recipe says, never changes a choice the user made. */
export function mealsOf(r) {
  if (Array.isArray(r?.meals) && r.meals.length) return r.meals;
  return [MEAL_TYPES.includes(r?.category) ? r.category : "other"];
}
export function guessMeals(r, hints = []) {
  const text = norm([r.title, ...(r.tags || [])].join(" "));
  if (BASE_ONLY.test(norm(r.title || ""))) return ["other"];
  // A whole book of drinks ("10 смузи"): every recipe in it is a drink, whatever its name.
  for (const hint of hints) for (const [types, re] of DRINK_RULES) if (re.test(norm(hint))) return types.slice();
  const found = [];
  const add = (list) => { for (const m of list) if (!found.includes(m)) found.push(m); };
  const pie = W("пирог|pirog|pie |тарт|tart").test(text + " ") && SAVOURY.test(text);
  for (const [types, re] of MEAL_RULES) {
    if (!re.test(text + " ")) continue;
    if (pie && types[0] === "dessert") continue;
    add(types);
  }
  if (pie) add(["lunch", "dinner"]);
  else if (W("пирог|pirog").test(text)) add(["dessert"]);
  // The saved category leads when it agrees with the words, or when it is a deliberate one ("dinner" is only the old default).
  const cat = MEAL_TYPES.includes(r.category) && r.category !== "other" ? r.category : "";
  if (cat && found.length && (found.includes(cat) || cat !== "dinner")) { if (found.includes(cat)) found.splice(found.indexOf(cat), 1); found.unshift(cat); }
  if (!found.length && !cat) {
    // No meal word in the name: the kind of dish still tells a lot ("xachapuri" is a savoury pastry, so lunch or dinner).
    const kind = dishByRules(r);
    const byKind = { soup: ["lunch", "dinner"], salad: ["lunch", "dinner"], pastry: ["lunch", "dinner"], side: ["lunch", "dinner"], dessert: ["dessert"], drink: ["drink"], bread: ["breakfast", "snack"], breakfast: ["breakfast"], snack: ["snack"], sauce: ["other"], preserve: ["other"] }[kind];
    if (byKind) add(byKind);
  }
  if (!found.length) {
    if (cat) add([cat]);
    // Then the book or file name ("13 рецептов пиццы"), then what the recipe is made of.
    if (!cat) for (const hint of hints) { for (const [types, re] of MEAL_RULES) if (re.test(norm(hint) + " ")) add(types); if (found.length) break; }
    const cats = (r.ingredients || []).map((i) => BY_ID[i.ingredientId]?.category).filter(Boolean);
    const sweet = (r.ingredients || []).some((i) => ["sugar", "honey", "cocoa", "chocolate", "vanilla", "sweetener"].includes(i.ingredientId));
    if (cat === "dinner" || cat === "lunch") { if (cats.some((c) => MAIN_CATS.has(c)) || cats.includes("vegetables")) add(["lunch", "dinner"]); }
    else if (!found.length) {
      if (sweet) add(["dessert"]);
      else if (cats.some((c) => MAIN_CATS.has(c)) || cats.includes("vegetables")) add(["lunch", "dinner"]);
      else add(["other"]);
    }
  }
  return found.slice(0, 3);
}


/* ---------- how long and how hard, when the recipe does not say ---------- */
const HARD_WORDS = /xamir|хамир|тесто|dough|droj|дрожж|yeast|oshirma|qatlam|слоен|laminat|karamel|карамел|caramel|meringue|безе|меренг|temper|бисквит|biskvit|frityur|фритюр|deep.fry|marinad|маринов|tandir|тандыр|fermented|закваск/i;
/**
 * Fills in what is missing, marked as an estimate: time from the minutes written in the steps,
 * difficulty from the number of ingredients and steps, the time and the techniques used.
 */
export function estimateEffort(r) {
  const steps = r.steps || [], ings = (r.ingredients || []).filter((i) => i.essential !== false);
  if (r.prepTime == null && r.cookTime == null) {
    const secs = steps.reduce((n, s) => n + (s.timer || 0), 0);
    if (secs >= 60) { r.cookTime = Math.round(secs / 60 + steps.length * 3); r.timeEst = true; } // the stated waits plus a few minutes of handling per step
  }
  if (!r.difficulty) {
    const time = (r.prepTime || 0) + (r.cookTime || 0);
    const text = [r.title, ...steps.map((s) => s.text)].join(" ");
    let score = 0;
    if (ings.length >= 14) score += 2; else if (ings.length >= 9) score += 1;
    if (steps.length >= 9) score += 2; else if (steps.length >= 6) score += 1;
    if (time >= 120) score += 2; else if (time >= 50) score += 1;
    if (HARD_WORDS.test(text)) score += 1;
    if (text.length > 1400) score += 1;
    if (ings.length || steps.length) { r.difficulty = score >= 4 ? "hard" : score >= 2 ? "medium" : "easy"; r.difficultyEst = true; }
  }
  return r;
}


/* ---------- calories, protein and cost ---------- */
/** Weight of one ingredient line in grams, or null when it cannot be worked out (no amount, unknown ingredient, "1 pack"). */
export function gramsOf(i) {
  const ing = BY_ID[i.ingredientId];
  if (!ing || i.qty == null) return null;
  const u = i.unit || ing.unit || "pc", d = UNITS[u];
  if (!d) return null;
  if (d.dim === "mass") return i.qty * d.f;
  if (d.dim === "vol") return i.qty * d.f * (u === "pinch" ? 1 : DENSITY[ing.category] ?? 1);
  if (u === "clove") return i.qty * (ing.id === "garlic" ? 5 : ing.gpp || 5);
  if (u === "bunch") return i.qty * (BUNCH[ing.id] || 40);
  if (u === "slice") return i.qty * 25;
  if (u === "can") return i.qty * 400;
  if (u === "pc") return ing.id === "garlic" ? i.qty * (/bosh|head|головк/i.test(i.note || "") ? 40 : 5) : ing.gpp ? i.qty * ing.gpp : null;
  return null;
}
/**
 * Calories, protein and cost of a recipe for `servings` portions (default: as written).
 * Uses the figures the recipe states when it has them; otherwise adds up the ingredients (marked `est`).
 * `prices`: the person's own prices in won per kg, by ingredient id. Returns null fields when too little is known.
 */
export function recipeFacts(r, servings, prices = {}) {
  const base = r.servings || null;
  const n = servings || base || 1;
  const scale = base ? n / base : 1;
  let kcal = 0, protein = 0, cost = 0, known = 0, counted = 0, priced = 0;
  for (const i of r.ingredients || []) {
    if (i.qty == null) continue;              // "to taste"
    counted++;
    const g = gramsOf(i), f = FACTS[i.ingredientId];
    if (g == null || !f) continue;
    known++;
    kcal += (g / 100) * f[0]; protein += (g / 100) * f[1];
    const price = prices[i.ingredientId] ?? f[2];
    if (price != null) { cost += (g / 1000) * price; priced++; }
  }
  const enough = counted >= 2 && known / counted >= 0.6;
  const out = { servings: n, hasServings: !!base, perServing: {}, total: {}, est: true, coverage: counted ? known / counted : 0 };
  if (r.kcal != null) { out.perServing.kcal = r.kcal; out.perServing.protein = r.protein ?? null; out.total.kcal = r.kcal * n; out.total.protein = r.protein != null ? r.protein * n : null; out.est = !!r.nutritionEst; }
  else if (enough) {
    out.total.kcal = kcal * scale; out.total.protein = protein * scale;
    if (base) { out.perServing.kcal = kcal / base; out.perServing.protein = protein / base; }
  }
  if (enough && priced) { out.total.cost = cost * scale; if (base) out.perServing.cost = cost / base; }
  return out;
}

/* ---------- kind of dish and cuisine ---------- */
export const DISH_TYPES = ["soup", "salad", "main", "side", "pastry", "bread", "breakfast", "dessert", "drink", "snack", "sauce", "preserve"];
const DISH_RULES = [
  ["preserve", W("qish uchun|qishga|konserva|tuzlama|tuzlangan|marinovka|на зиму|консерв|маринован|варень|murabbo|джем|jem |povidlo|kompot qish")],
  ["sauce", W("sous|соус|sauce|zapravka|заправк|marinad|маринад|adjika|аджик|ziravor|приправ|dressing|ketchup|mayonez|pesto")],
  ["drink", W("ichimlik|напит|drink|smuzi|смузи|smoothie|kokteyl|коктейл|kompot|компот|sharbat|limonad|лимонад|sheyk|шейк|shake|morс|морс|kvas|квас|ayron|айран|kisel|кисель|latte|латте|lassi|음료|주스|스무디")],
  ["drink", WW("choy|чай|сок|kofe|кофе|kakao")],
  ["soup", W("sho'rva|shorva|shurva|sho rva|шурпа|шўрва|суп|soup|борщ|borsh|mastava|мастава|xarcho|харчо|ramen|рамен|chorba|чорба|bulyon|бульон|moshxo'rda|okroshka|окрошк|solyanka|солянк|ugra osh|мохора|moxora|shi |щи |uxa|уха|lag'mon|lagmon|лагман|찌개|탕|국수|미역국")],
  ["soup", WW("sup|supchik|щи|уха|국")],
  ["salad", W("salat|салат|salad|vinegret|винегрет|achchiq chuchuk|achchiq-chuchuk|olivye|оливье|샐러드|무침")],
  ["dessert", W("десерт|desert|shirinlik|dessert|торт |торты|tort |cake|кекс|keks|пирожн|pirojn|печень|pechenye|pechenka|cookie|морожен|muzqaymoq|чизкейк|chizkeyk|cheesecake|cheescake|брауни|brauni|brownie|маффин|maffin|muffin|пудинг|puding|мусс|желе|jele|зефир|zefir|конфет|konfet|шоколадн|shokoladli|варень|халв|holva|пахлав|paxlava|baklava|медовик|medovik|наполеон|napoleon|эклер|ekler|безе|меренг|суфле|панна|тирамису|tiramisu|штрудел|цукат|кейк|крамбл|парфе|карамел|karamel|крем|krem|пончик|ponchik|donut|вафл|vafli|пряник|мармелад|батончик|trayfl|rulet shirin|chak chak|чак-чак|бўғирсоқ|bo'g'irsoq|케이크|디저트|쿠키")],
  ["dessert", WW("торт|tort")],
  ["pastry", W("somsa|сомса|самса|pirog|пирог|pitsa|пицц|pizza|xachapuri|хачапури|borek|бурек|lahmajun|лахмаджун|pide|пиде|cheburek|чебурек|belyash|беляш|pirojki|пирожк|kish |киш |quiche|tart|тарт|gumma|гумма|xonim|ханум|qatlama|катлама|blinchik|блинчик|манты|manti|чучвара|chuchvara|пельмен|pelmen|xinkali|хинкали|vareniki|вареник|단팥|만두")],
  ["bread", W("xleb|хлеб|bread|bulochka|булочк|lepeshka|лепешк|лепёшк|lavash|лаваш|baget|багет|patir|патир|bagel|бейгл")],
  ["bread", WW("non|nonlar")],
  ["breakfast", W("omlet|омлет|omelet|quymoq|яичниц|shakshuka|шакшук|kasha|каша|каши|bo'tqa|porridge|ovsyanka|овсян|sirnik|сырник|pankeyk|панкейк|pancake|oladi|оладь|granola|гранол|menemen|toast|тост|nonushta|завтрак")],
  ["snack", W("gazak|закуск|zakuska|snack|перекус|sendvich|сэндвич|sandwich|buterbrod|бутерброд|chips|чипс|kanape|канапе|xumus|хумус|hummus|rulet|рулет|naggets|наггетс|간식")],
  ["side", W("garnir|гарнир|pyure|пюре|side dish")],
];
/** One kind of dish for a recipe ("soup", "salad", …), from its title, tags and meal types. */
function dishByRules(r) {
  const text = norm([r.title, ...(r.tags || [])].join(" ")) + " ";
  const title = norm(r.title || "") + " ";
  for (const [type, re] of DISH_RULES) if (re.test(title)) return type;
  for (const [type, re] of DISH_RULES) if (re.test(text)) return type;
  return null;
}
export function guessDish(r) {
  const byRule = dishByRules(r);
  if (byRule) return byRule;
  const m = mealsOf(r);
  if (m.includes("lunch") || m.includes("dinner")) return "main";
  return m.includes("dessert") ? "dessert" : m.includes("drink") ? "drink" : m.includes("snack") ? "snack" : m.includes("breakfast") ? "breakfast" : "main";
}
export const CUISINES = ["uzbek", "russian", "korean", "italian", "turkish", "caucasian", "asian", "european", "american", "japanese", "chinese", "french", "mexican", "indian", "arabic"];
// How a cuisine is written by people and by books -> its id.
const CUISINE_NAMES = [
  ["uzbek", /o'zbek|ozbek|uzbek|узбек|우즈벡|우즈베크/i], ["russian", /^rus|russian|русск|росси|러시아/i], ["korean", /kore|корей|한식|한국/i], ["italian", /ital|итал|이탈리아/i],
  ["turkish", /turk|турец|турк|터키/i], ["caucasian", /kavkaz|кавказ|코카서스|gruzin|грузин|georgian|caucas|armyan|армян|ozarbayjon|azerbaijan|азербайдж/i], ["asian", /osiyo|^asia|азиат|아시아/i],
  ["european", /yevropa|europe|европ|유럽/i], ["american", /amerika|american|америк|미국/i], ["japanese", /yapon|japan|япон|일본|일식/i], ["chinese", /xitoy|chin|китай|중국|중식/i],
  ["french", /fransuz|french|франц|프랑스/i], ["mexican", /meksika|mexic|мексик|멕시코/i], ["indian", /hind|india|инди|인도/i], ["arabic", /arab|араб|아랍/i],
];
export function cuisineId(text) {
  const t = norm(text || "");
  if (!t) return "";
  if (CUISINES.includes(t)) return t;
  for (const [id, re] of CUISINE_NAMES) if (re.test(t)) return id;
  return "";
}
const CUISINE_DISHES = [
  ["uzbek", W("palov|плов|plov|osh |somsa|сомса|самса|manti|манты|lag'mon|lagmon|лагман|norin|нарын|sho'rva|shurva|шурпа|dimlama|димлам|tandir|тандыр|chuchvara|чучвара|mastava|мастава|qozon kabob|казан кебаб|xonim|ханум|moshxo'rda|qatlama|patir|achchiq chuchuk|naryn|shivit oshi|moxora|bo'g'irsoq|holvaytar|nisholda|sumalak|qazi|hasip|xasip|uzbekcha|o'zbekcha|по-узбекски|jiz|tuxum barak")],
  ["korean", W("kimchi|кимчи|koreyscha|koreyskiy|по-корейски|bulgogi|пулькоги|bibimbap|пибимпап|kimbap|кимпап|tteok|ток-покки|tokpokki|ramyon|рамён|chapche|чапче|japchae|kuksi|кукси|morkovcha|김치|불고기|비빔밥|떡볶이|된장")],
  ["italian", W("pasta|паста |spagetti|спагетти|pitsa|пицц|pizza|lazanya|лазань|rizotto|ризотто|tiramisu|тирамису|panna kotta|панна|bolonez|болоньез|karbonara|карбонара|pesto|песто|fettuchine|ravioli|равиоли|bruschetta|брускетт|focaccia|фокачч|italyancha")],
  ["turkish", W("turkcha|turkiya|по-турецки|турецк|lahmajun|лахмаджун|pide|пиде|baklava|пахлава|iskandar|искандер|menemen|менемен|chorba|чорба|borek|бурек|kunafa|кюнефе|sudjuk|merjimek|mercimek|simit|gozleme|гёзлеме|doner|донер|sach tava|kofte")],
  ["russian", W("borsh|борщ|pelmen|пельмен|blini|блины|blinchik|olivye|оливье|sirnik|сырник|vinegret|винегрет|solyanka|солянк|okroshka|окрошк|shi |щи |golubtsi|голубц|kotlet po|бефстроганов|befstroganov|vareniki|вареник|kulebyaka|kasha|pirojki|пирожк|селедка под шубой|shuba|medovik|медовик|syrniki|zapekanka|запеканк")],
  ["caucasian", W("xachapuri|хачапури|xinkali|хинкали|lobio|лобио|chaxoxbili|чахохбили|xarcho|харчо|gruzincha|по-грузински|achma|ачма|adjika|аджик|satsivi|сациви|ajapsandali|аджапсандал|lyulya|люля|dolma|долма|shashlik|шашлык|chanaxi|чанахи|tkemali|ткемали|pxali|пхали|kutab|кутаб|dushbara")],
  ["japanese", W("sushi|суши|roll |роллы|teriyaki|терияки|miso|мисо|tempura|темпур|udon|удон|onigiri|онигири|ramen|рамен|мочи|mochi|doreyaki|dorayaki")],
  ["chinese", W("xitoycha|по-китайски|kung pao|гунбао|doubanjiang|wok|вок|chow mein|dim sum|mapo|baozi|баоцзы")],
  ["american", W("burger|бургер|chizkeyk|чизкейк|cheesecake|brauni|брауни|brownie|pankeyk|панкейк|pancake|donut|пончик|hot dog|хот-дог|naggets|наггетс|maffin|маффин|muffin|sinnabon|синнабон|cinnabon|mac and cheese|klab sendvich")],
  ["french", W("ekler|эклер|kruassan|круассан|croissant|kish |киш |quiche|ratatuy|рататуй|krem bryule|крем-брюле|sufle|суфле|beshamel|бешамель|fondan|фондан|makaron |макарон |tart taten|крок-месье|луковый суп")],
  ["mexican", W("tako|тако|taco|burrito|буррито|kesadilya|кесадиль|quesadilla|guakamole|гуакамоле|nachos|начос|fahitas|фахитас")],
  ["indian", W("karri|карри|curry|masala|масала|biryani|бирьяни|tandoori|тандури|dal |дал |naan|наан|samosa")],
  ["arabic", W("xumus|хумус|hummus|falafel|фалафель|shaverma|шаурма|shaurma|tabule|табуле|kuskus|кускус|baba ganush|mandi|kabsa")],
];
/** A cuisine id for a recipe: what it says, else what the dish is known as; "" when there is no clue. */
export function guessCuisine(r) {
  const own = cuisineId(r.cuisine);
  if (own) return own;
  const text = norm([r.title, ...(r.tags || [])].join(" ")) + " ";
  for (const [id, re] of CUISINE_DISHES) if (re.test(text)) return id;
  return "";
}
