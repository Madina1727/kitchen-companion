// Reads PDF / DOCX / DOC / text and finds recipes without AI.
// Values that are not written in the source stay empty; they are never guessed.
import { parseUnit, resolveIngredient } from "./engine.js";

/* ---------- file text extraction ---------- */
let pdfjs;
async function loadPdf() {
  if (!pdfjs) {
    pdfjs = await import("../vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;
  }
  return pdfjs;
}

export async function pdfPageCount(arrayBuffer) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const n = doc.numPages;
  doc.destroy();
  return n;
}

/** Returns { pages: [{page, text}], scanned: boolean } */
export async function extractPdf(arrayBuffer, onProgress) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  let empty = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let lastY = null, line = "", lines = [];
    for (const it of tc.items) {
      const y = it.transform[5];
      if (lastY != null && Math.abs(y - lastY) > 2) { lines.push(line); line = ""; }
      line += (line && !line.endsWith(" ") && !it.str.startsWith(" ") ? (it.hasEOL ? "" : "") : "") + it.str;
      if (it.hasEOL) { lines.push(line); line = ""; lastY = null; continue; }
      lastY = y;
    }
    if (line) lines.push(line);
    const text = lines.map((l) => l.replace(/\s+/g, " ").trim()).join("\n");
    if (text.replace(/\s/g, "").length < 20) empty++;
    pages.push({ page: p, text });
    if (onProgress && (p % 10 === 0 || p === doc.numPages)) onProgress(p, doc.numPages);
  }
  return { pages, pageCount: doc.numPages, scanned: empty > doc.numPages / 2 };
}

export async function extractDocx(arrayBuffer) {
  if (!window.mammoth) await loadScript(new URL("../vendor/mammoth.browser.min.js", import.meta.url).href);
  const res = await window.mammoth.extractRawText({ arrayBuffer });
  return res.value;
}

/** Old binary .doc: pull readable text runs out of the file (best effort). */
export function extractDoc(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  // Word 97+ stores text as UTF-16LE or cp1252 runs. Try UTF-16 first.
  const u16 = new TextDecoder("utf-16le").decode(bytes);
  const runs16 = u16.match(/[\p{L}\p{N}\p{P}\p{Zs}\r\n\t]{20,}/gu) || [];
  const a8 = new TextDecoder("windows-1252").decode(bytes);
  const runs8 = a8.match(/[A-Za-z0-9À-ſ.,;:!?'"()\-\/ \r\n\t½¼¾]{20,}/g) || [];
  const pick = runs16.join("").length > runs8.join("").length ? runs16 : runs8;
  return pick.join("\n").replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function loadScript(src) {
  return new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = bad;
    document.head.appendChild(s);
  });
}

/* ---------- recipe detection ---------- */
const ING_HEAD = /^(ingredients?|you will need|what you need|ингредиенты|продукты|состав|нам понадобится|понадобится|что нужно|(kerakli\s+)?ma(s{1,2})al{1,2}iq(lar)?(imiz)?|(kerakli\s+)?mahsulotlar|kerakli narsalar|재료|준비물|ingredientes|ingredienti|zutaten)$/i;
const STEP_HEAD = /^(instructions?|directions?|method|steps?|preparation|how to make|procedure|приготовление|способ приготовления|как готовить|инструкция|tay?yorla(nishi|sh|sh usuli|sh tartibi|nish tartibi)|pishirish( usuli)?|만드는\s*법|조리\s*방법|조리법|만들기|preparación|preparazione|zubereitung)$/i;
// Emoji, bullets, invisible filler and punctuation that decorate headings in social-media posts.
const DECOR = /[\p{Cc}\p{Extended_Pictographic}\p{So}\uFE0F\u200D\u2800\u200B\u20E3:：.!*•▪◦·●♦\-–—\s]+/gu;
const headText = (t) => t.replace(DECOR, " ").trim().replace(/\s+/g, " ");
const isIngHead = (t) => t.length < 60 && ING_HEAD.test(headText(t));
const isStepHead = (t) => t.length < 60 && STEP_HEAD.test(headText(t));
/** Short label inside an ingredient list, e.g. "Nachinkasiga:" / "Для теста:". */
const isGroupLabel = (t) => /[:：]\s*[\p{Extended_Pictographic}\uFE0F\s]*$/u.test(t) && headText(t).length < 40 && !/\d/.test(t);
const SIGN_OFF = /^(yoqimli\s+ishta[hx]a|приятного\s+аппетита|bon app[ée]tit|enjoy|poleznaya rubrika)/i;
const META = {
  servings: /(serves|servings|yield|portions?|порци[йия]|porsiya|인분)\s*[:：]?\s*(\d+)|(\d+)\s*(servings|portions|порци[йия]|porsiya|인분)/i,
  prep: /(prep(?:aration)?\s*time|подготовка|tayyorgarlik|준비\s*시간)\s*[:：]?\s*(\d+)\s*(min|мин|daq|분|h|hour|час|soat|시간)?/i,
  cook: /(cook(?:ing)?\s*time|время приготовления|pishirish vaqti|조리\s*시간)\s*[:：]?\s*(\d+)\s*(min|мин|daq|분|h|hour|час|soat|시간)?/i,
  total: /(total\s*time|общее время|umumiy vaqt|총\s*시간)\s*[:：]?\s*(\d+)\s*(min|мин|daq|분|h|hour|час|soat|시간)?/i,
};
const OPTIONAL_WORDS = /(?<!\p{L})(optional|to garnish|for garnish|garnish|to serve|for serving|if desired|по желанию|для подачи|ixtiyoriy|bezash uchun|xohishga ko['‘’`]?ra|hohishga ko['‘’`]?ra|xohishga qarab|선택|장식용)(?!\p{L})/iu;
const TO_TASTE = /(?<!\p{L})(to taste|по вкусу|ta['‘’`]?bga\s+(ko['‘’`]?ra|qarab)|did ga qarab|적당량|약간)(?!\p{L})/iu;
const UNICODE_FRAC = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅕": 0.2 };

function toMinutes(n, u) { return u && /^(h|hour|час|soat|시간)/i.test(u) ? n * 60 : n; }

function parseNumber(s) {
  s = s.trim();
  for (const [f, v] of Object.entries(UNICODE_FRAC)) {
    if (s.includes(f)) { const whole = parseFloat(s.replace(f, "")) || 0; return whole + v; }
  }
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return +mixed[1] + mixed[2] / mixed[3];
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return frac[1] / frac[2];
  const range = s.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/);
  if (range) return parseFloat(range[2].replace(",", ".")); // use the upper bound
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

const QTY_RE = /^((?:\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?|\d*[½⅓⅔¼¾⅛⅕]|\d+(?:[.,]\d+)?)\s*/;

/** Parse one ingredient line such as "2 cups rice, rinsed" or "Соль по вкусу". */
export function parseIngredientLine(raw) {
  let line = raw.replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]+/gu, " ").replace(/^[\s•\-–*·●▪◦○□✓✔]+/, "").replace(/^\d+[.)]\s+(?=\D)/, "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  const original = line;
  let optional = OPTIONAL_WORDS.test(line);
  const toTaste = TO_TASTE.test(line);
  line = line.replace(/\((optional|по желанию|ixtiyoriy)\)/i, "").trim();
  let qty = null, unit = "";
  let m = line.match(QTY_RE);
  if (m) {
    qty = parseNumber(m[1]);
    line = line.slice(m[0].length);
    const um = line.match(/^(fl oz|ст\.\s?л\.?|ч\.\s?л\.?|osh qoshiq|choy qoshiq|столов\S* ложк\S*|чайн\S* ложк\S*|[^\s,()]+)\.?\s*/i);
    if (um) {
      const u = parseUnit(um[1].replace(/\s/g, "")) || parseUnit(um[1]);
      if (u) { unit = u; line = line.slice(um[0].length); }
    }
    line = line.replace(/^of\s+/i, "");
  } else {
    // Quantity at the end: "Картофель — 500 г", "Kartoshka 500 gr", "감자 2개"
    const tail = line.match(/[\s—–\-:]+((?:\d+\s+)?\d+\/\d+|\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?|\d*[½⅓⅔¼¾])\s*([^\d,()]{0,24}?)\.?\s*$/);
    const ko = line.match(/^(.+?)\s*(\d+(?:[.,]\d+)?|\d*[½¼¾])\s*(개|큰술|작은술|컵|g|kg|ml|쪽|장|단|줌)\s*$/);
    if (ko) { line = ko[1]; qty = parseNumber(ko[2]); unit = parseUnit(ko[3]) || ""; }
    else if (tail) {
      const ut = (tail[2] || "").trim();
      const u = ut ? parseUnit(ut) || parseUnit(ut.replace(/\s+/g, "")) : null;
      if (u || !ut) { qty = parseNumber(tail[1]); unit = u || ""; line = line.slice(0, tail.index); }
    }
  }
  let note = "";
  const comma = line.search(/[,(;]/);
  if (comma > 0) { note = line.slice(comma).replace(/^[,;(\s]+|\)$/g, "").trim(); line = line.slice(0, comma); }
  line = line.replace(TO_TASTE, "").replace(OPTIONAL_WORDS, "").replace(/[—–\-:]+\s*$/, "").trim();
  if (toTaste && !note) note = original.match(TO_TASTE)[0];
  if (!line) return null;
  const ingredientId = resolveIngredient(line);
  if (toTaste && qty == null) optional = optional || false;
  return {
    name: line, ingredientId, qty, unit: qty != null && !unit && ingredientId ? "pc" : unit,
    note, essential: !optional, uncertain: !ingredientId, original,
  };
}

/** "Tuz va murch" / "соль и перец" -> two ingredients, but only when both halves are known. */
function splitAnd(t) {
  if (/\d/.test(t)) return [t];
  const parts = t.split(/\s+(?:va|и|and|hamda)\s+|,\s*/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1 && parts.length <= 4 && parts.every((x) => resolveIngredient(x.replace(TO_TASTE, "")))) {
    const taste = TO_TASTE.test(t) ? " " + t.match(TO_TASTE)[0] : "";
    return parts.map((x) => (TO_TASTE.test(x) ? x : x + taste));
  }
  return [t];
}

function looksLikeIngredient(line) {
  if (line.length > 90) return false;
  if (/^[\s•\-–*·●▪◦]/.test(line)) return true;
  if (QTY_RE.test(line) && !/^\d+[.)]\s+[A-ZА-Я]/.test(line)) return true;
  return !!resolveIngredient(line) && line.split(" ").length <= 6;
}

/** Strict check used when looking for titles: only bullets or a leading amount count as ingredient lines. */
function isIngLineStrict(line) {
  return /^[\s•\-–*·●▪◦]/.test(line) || (QTY_RE.test(line) && !/^\d+[.)]\s/.test(line)) || /[—–:-]\s*\d/.test(line);
}
const isStepLine = (t) => /^\s*(step\s*)?\d+[.):]\s/i.test(t) || /[.!?。]$/.test(t);
function isTitleCandidate(t) {
  return t.length <= 70 && !isIngLineStrict(t) && !isStepLine(t) && !isStepHead(t) && !isIngHead(t) && !Object.values(META).some((re) => re.test(t));
}

function cleanStep(s) { return s.replace(/^\s*(step\s*)?\d+[.):]\s*|^[\s•\-–*·●]+/i, "").trim(); }


/* ---------- line cleaning ---------- */
const POST_END = /^(telegram post|instagram post|post|source|источник|manba)\s*:\s*(https?:\/\/\S+)/i;
const SYMBOLS_ONLY = /^[\p{Extended_Pictographic}\p{So}\p{Po}\uFE0F\u200D\u2800\u200B\u20E3\s•▪◦·●♦*\-–—_=~]*$/u;
const LEAD_BULLET = /^[\p{Extended_Pictographic}\uFE0F\u200D\u20E3•▪◦·●♦○□✓✔➖➕\-–*]+\s*/u;
/** Trim lines, drop invisible filler and page numbers, and turn bullet-only lines into a flag on the next line. */
function cleanLines(pages) {
  const out = [];
  let bullet = false;
  for (const p of pages) for (let raw of p.text.split(/\n/)) {
    let t = raw.replace(/[\u2800\u200B\u00A0\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
    if (/^\d{1,4}$/.test(t)) continue; // page number
    if (!t) { out.push({ text: "", page: p.page }); continue; }
    if (SYMBOLS_ONLY.test(t) && !/\d/.test(t)) { bullet = true; continue; }
    const lead = t.match(LEAD_BULLET);
    if (lead && !/^\d/.test(t)) { t = t.slice(lead[0].length).trim(); bullet = true; }
    if (!t) continue;
    out.push({ text: t, page: p.page, bullet });
    bullet = false;
  }
  return out;
}
const HASHTAG_LINE = /^(#[\p{L}\p{N}_]+[\s,]*)+$/u;
const keyOfLine = (t) => headText(t).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
const CATEGORY_WORDS = [
  ["breakfast", /nonushta|завтрак|breakfast/i],
  ["dessert", /shirinlik|desert|десерт|tort|торт|pishiriq|выпечк|pirog|пирог|cake|keks|кекс|печенье|pechene/i],
  ["drink", /ichimlik|напит|drink|kokteyl|коктейл|kompot|компот|smoothie|смузи/i],
  ["snack", /gazak|закуск|snack|buterbrod|бутерброд/i],
  ["lunch", /sho['‘’]?rva|суп|soup|salat|салат|salad/i],
  ["dinner", /issiq|горяч|asosiy|main|ovqat|taom/i],
];
function categoryFrom(texts) {
  const joined = texts.join(" ");
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(joined)) return cat;
  return "other";
}

/** Each post runs from just after the previous "Telegram post:" line up to its own. */
function findPosts(lines) {
  const recipes = [];
  let start = 0;
  let chapters = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].text.match(POST_END);
    if (!m) continue;
    const block = lines.slice(start, i).filter((l) => l.text);
    start = i + 1;
    if (!block.length) continue;
    // The compiled heading usually repeats as the first line of the post, with hashtags between.
    let titleIdx = -1;
    for (let a = 0; a < Math.min(block.length, 8) && titleIdx < 0; a++) {
      const k = keyOfLine(block[a].text);
      if (!k || HASHTAG_LINE.test(block[a].text)) continue;
      for (let b = a + 1; b <= a + 3 && b < block.length; b++) if (keyOfLine(block[b].text) === k) { titleIdx = a; break; }
    }
    if (titleIdx < 0) {
      const hashIdx = block.findIndex((l) => HASHTAG_LINE.test(l.text));
      titleIdx = hashIdx > 0 ? hashIdx - 1 : 0;
    }
    const head = block.slice(0, titleIdx).map((l) => l.text);
    if (head.length) chapters = head; // section headings printed before the first recipe of a chapter
    const titleLine = block[titleIdx];
    const tKey = keyOfLine(titleLine.text);
    const tags = [];
    const body = block.slice(titleIdx + 1).filter((l, k) => {
      if (HASHTAG_LINE.test(l.text)) { tags.push(...l.text.match(/#[\p{L}\p{N}_]+/gu)); return false; }
      if (k < 4 && keyOfLine(l.text) === tKey) return false; // repeated title
      return true;
    });
    const r = parseBlock(body, 0, body.length, { text: headText(titleLine.text) || titleLine.text, page: titleLine.page });
    const raw = block.map((l) => l.text).join("\n").slice(0, 8000);
    const base = r || { title: headText(titleLine.text), description: "", ingredients: [], steps: [], servings: null, prepTime: null, cookTime: null, sourcePage: titleLine.page, confidence: "partial" };
    base.url = m[2];
    base.tags = [...new Set(tags.map((x) => x.slice(1)))];
    base.category = categoryFrom([...tags, ...chapters.slice(-1), base.title]);
    base.raw = raw;
    if (!base.ingredients.length || !base.steps.length) base.confidence = "partial";
    // Adverts, announcements and tips: no recipe headings and hardly any known ingredients.
    const known = base.ingredients.filter((x) => x.ingredientId).length;
    const adHits = ["kurs", "dars", "smena", "narxi", "boshlanadi", "курс", "занят", "запис", "o'quv", "òquv"].filter((w) => base.raw.toLowerCase().includes(w)).length;
    if ((!base.heads?.ing && !base.heads?.step && known < 3) || (!base.heads?.step && adHits >= 3)) base.notRecipe = true;
    recipes.push(base);
  }
  return recipes;
}

/**
 * Split text into recipes. `pages` lets us record the source page.
 * Each recipe starts at an "Ingredients" heading; its title is the last short line before it.
 */
export function findRecipes(input) {
  const pages = typeof input === "string" ? [{ page: null, text: input }] : input;
  const lines = cleanLines(pages);
  // Collections of social-media posts (e.g. Telegram exports): every recipe ends with the post link.
  const ends = lines.reduce((n, l) => n + (POST_END.test(l.text) ? 1 : 0), 0);
  if (ends >= 3) return findPosts(lines);
  const heads = [];
  lines.forEach((l, i) => { if (isIngHead(l.text)) heads.push(i); });

  const recipes = [];
  if (!heads.length) {
    const r = parseBlock(lines, 0, lines.length);
    if (r && (r.ingredients.length || r.steps.length)) recipes.push(r);
    return recipes;
  }
  for (let h = 0; h < heads.length; h++) {
    // Title: the nearest short line above the heading, skipping meta lines (servings, times).
    let titleIdx = -1;
    const floor = h ? heads[h - 1] + 1 : 0;
    for (let j = heads[h] - 1, seen = 0; j >= floor && seen < 6; j--) {
      const t = lines[j].text;
      if (!t) continue;
      seen++;
      if (Object.values(META).some((re) => re.test(t))) continue;
      if (isTitleCandidate(t)) { titleIdx = j; break; }
      if (isStepLine(t) || isIngLineStrict(t)) break;
    }
    const start = titleIdx >= 0 ? titleIdx + 1 : heads[h];
    // Lines between the title and the heading are description/meta.
    const end = h + 1 < heads.length ? findTitleStart(lines, heads[h + 1], heads[h]) : lines.length;
    const r = parseBlock(lines, heads[h], end, titleIdx >= 0 ? lines[titleIdx] : null, lines.slice(start, heads[h]));
    if (r) recipes.push(r);
  }
  return recipes;
}

function findTitleStart(lines, headIdx, floor) {
  for (let j = headIdx - 1, seen = 0; j > floor && seen < 6; j--) {
    const t = lines[j].text;
    if (!t) continue;
    seen++;
    if (Object.values(META).some((re) => re.test(t))) continue;
    if (isTitleCandidate(t)) return j;
    if (isStepLine(t) || isIngLineStrict(t)) break;
  }
  return headIdx;
}

function parseBlock(lines, from, to, titleLine = null, preLines = []) {
  const ings = [], steps = [], heads = { ing: false, step: false };
  let mode = null, desc = [];
  const meta = { servings: null, prepTime: null, cookTime: null, totalTime: null };
  const scanMeta = (t) => {
    let m, hit = false;
    if ((m = t.match(META.servings))) { meta.servings = +(m[2] || m[3]); hit = true; }
    if ((m = t.match(META.prep))) { meta.prepTime = toMinutes(+m[2], m[3]); hit = true; }
    if ((m = t.match(META.cook))) { meta.cookTime = toMinutes(+m[2], m[3]); hit = true; }
    if ((m = t.match(META.total))) { meta.totalTime = toMinutes(+m[2], m[3]); hit = true; }
    return hit;
  };
  for (const l of preLines) { if (l.text && !scanMeta(l.text)) desc.push(l.text); }
  let title = titleLine?.text || "";
  const page = titleLine?.page ?? lines[from]?.page ?? null;
  for (let i = from; i < to; i++) {
    const t = lines[i].text;
    if (!t) continue;
    if (SIGN_OFF.test(t) || /^https?:\/\/\S+$/.test(t) || /^(link|ссылка)\s*:/i.test(t)) continue;
    if (isIngHead(t)) { mode = "ing"; heads.ing = true; continue; }
    if (isStepHead(t)) { mode = "step"; heads.step = true; continue; }
    if (scanMeta(t) && t.length < 60) continue;
    if (mode === null) {
      if (looksLikeIngredient(t) || (lines[i].bullet && t.length < 60)) mode = "ing";
      else if (!title && t.length < 70) { title = t; continue; }
      else { desc.push(t); continue; }
    }
    if (mode === "ing") {
      if (isGroupLabel(t)) continue; // "Nachinkasiga:" / "Для теста:"
      const proseLike = t.length > 90 || /^\d+[.)]\s/.test(t) || (t.split(" ").length > 9 && /[.!?]$/.test(t));
      if (!proseLike) {
        for (const part of splitAnd(t)) { const p = parseIngredientLine(part); if (p) ings.push(p); }
        continue;
      }
      mode = "step";
    }
    if (mode === "step" && !steps.length && !ings.length && heads.step && !heads.ing) {
      // Some posts list the ingredients right after "Приготовление:" / "Tayyorlanishi:".
      if (isGroupLabel(t)) continue;
      if (t.length < 60 && (isIngLineStrict(t) || /\d\s*(г|гр|g|gr|кг|kg|мл|ml|л|шт|ст\.?\s?л|ч\.?\s?л|ta|dona)\.?\s*$/i.test(t))) {
        const p = parseIngredientLine(t); if (p) { ings.push(p); continue; }
      }
    }
    if (mode === "step" && ings.length && !steps.length && heads.step && !heads.ing && isGroupLabel(t)) continue;
    if (mode === "step") {
      const prev = steps[steps.length - 1];
      const isNew = /^\s*(step\s*)?\d+[.):]\s*|^[\s•\-–*·●]/i.test(t) || lines[i].bullet || !steps.length || /[.!?)\p{Extended_Pictographic}]$/u.test(prev);
      const c = cleanStep(t).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, "").trim();
      if (!c) continue;
      if (isNew) steps.push(c); else steps[steps.length - 1] = (prev.endsWith("-") ? prev.slice(0, -1) : prev + " ") + c;
    }
  }
  if (!ings.length && !steps.length) return null;
  if (meta.totalTime && !meta.prepTime && !meta.cookTime) meta.cookTime = meta.totalTime;
  return {
    title: title || "", description: desc.join(" ").slice(0, 400), ingredients: ings,
    steps: steps.map((s) => ({ text: s, timer: detectTimer(s) })),
    servings: meta.servings, prepTime: meta.prepTime, cookTime: meta.cookTime, sourcePage: page,
    confidence: ings.length && steps.length && title ? "high" : "partial", heads,
  };
}

/** "simmer for 20 minutes" -> 1200 seconds (only when the step says it). */
export function detectTimer(text) {
  const m = text.match(/(\d+)(?:\s*(?:-|–|to|до)\s*(\d+))?\s*(minutes?|mins?|минут[ы]?|мин|daqiqa|분|hours?|час(?:а|ов)?|soat|시간)/i);
  if (!m) return 0;
  const n = +(m[2] || m[1]);
  return /^(h|час|soat|시간)/i.test(m[3]) ? n * 3600 : n * 60;
}

/** Find the language of a text (for keeping the original version). */
export function detectLang(text) {
  if (/[가-힣]/.test(text)) return "ko";
  if (/[а-яё]/i.test(text)) return /[ўқғҳ]/i.test(text) ? "uz" : "ru";
  if (/\b(va|uchun|qo'shing|tuz|piyoz|go'sht|bilan)\b|o['‘ʻ]|g['‘ʻ]/i.test(text)) return "uz";
  return "en";
}

/** Recognise TikTok / Instagram / web links. */
export function classifyUrl(url) {
  try {
    const u = new URL(url.trim());
    if (/tiktok\.com$/.test(u.hostname) || u.hostname.endsWith(".tiktok.com")) return "tiktok";
    if (/instagram\.com$/.test(u.hostname) || u.hostname.endsWith(".instagram.com")) return "instagram";
    if (/youtube\.com|youtu\.be/.test(u.hostname)) return "youtube";
    return "website";
  } catch { return null; }
}

/** Try to read schema.org Recipe JSON-LD from a fetched web page. */
export function recipeFromHtml(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const t = o["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) found.push(o);
    if (o["@graph"]) walk(o["@graph"]);
  };
  for (const b of blocks) { try { walk(JSON.parse(b.textContent)); } catch {} }
  if (!found.length) {
    const text = doc.body?.innerText || doc.body?.textContent || "";
    return findRecipes(text).slice(0, 1).map((r) => ({ ...r, image: doc.querySelector('meta[property="og:image"]')?.content || "" }));
  }
  const iso = (d) => { if (!d) return null; const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return m ? (+(m[1] || 0)) * 60 + (+(m[2] || 0)) : null; };
  return found.map((r) => {
    const steps = [];
    const addSteps = (x) => {
      if (!x) return;
      if (typeof x === "string") x.split(/\n+/).forEach((s) => s.trim() && steps.push(s.trim()));
      else if (Array.isArray(x)) x.forEach(addSteps);
      else if (x.itemListElement) addSteps(x.itemListElement);
      else if (x.text) steps.push(x.text.trim());
    };
    addSteps(r.recipeInstructions);
    const img = Array.isArray(r.image) ? r.image[0] : r.image;
    return {
      title: r.name || "", description: (r.description || "").slice(0, 400),
      ingredients: (r.recipeIngredient || []).map(parseIngredientLine).filter(Boolean),
      steps: steps.map((s) => ({ text: s.replace(/<[^>]+>/g, ""), timer: detectTimer(s) })),
      servings: parseInt(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield) || null,
      prepTime: iso(r.prepTime), cookTime: iso(r.cookTime), image: typeof img === "string" ? img : img?.url || "",
      cuisine: Array.isArray(r.recipeCuisine) ? r.recipeCuisine[0] : r.recipeCuisine || "",
      confidence: "high", sourcePage: null,
    };
  });
}
