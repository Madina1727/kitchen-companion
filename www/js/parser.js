// Reads PDF / DOCX / DOC / text and finds recipes without AI.
// Values that are not written in the source stay empty; they are never guessed.
import { parseUnit, resolveIngredient, uzLatin, isUzbekCyrillic } from "./engine.js";

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

/** Returns { pages: [{page, text, rows, width, height, images}], scanned: boolean }.
 *  `rows` are text lines rebuilt from their position on the page, so designed pages
 *  (recipe cards with text boxes in any order) can still be read. */
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
    const vp = page.getViewport({ scale: 1 });
    const rows = layoutRows(tc.items, vp.height);
    const entry = { page: p, text, rows, width: vp.width, height: vp.height, images: [] };
    // Picture positions are only needed on pages that look like a recipe card.
    if (rows.filter((r) => STEP_START.test(r.text)).length >= 2) {
      try { entry.images = await pageImages(lib, page, vp); } catch { /* photos are optional */ }
    }
    pages.push(entry);
    if (onProgress && (p % 10 === 0 || p === doc.numPages)) onProgress(p, doc.numPages);
  }
  return { pages, pageCount: doc.numPages, scanned: empty > doc.numPages / 2 };
}

const STEP_START = /^(\d{1,2})\s*(?:[.)]\s+|[.)](?=[^\d\s])|[.)]$)(\S.*)?$/; // "1. Text" / "1.Text", but not "1.2 / 8.0"

/** Rebuild text lines from positioned PDF text items: same baseline and size, close together. */
function layoutRows(items, pageH) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const tr = it.transform;
    if (Math.abs(tr[1]) > Math.abs(tr[0])) continue; // text turned on its side (decoration)
    const h = Math.hypot(tr[2], tr[3]) || it.height || 10;
    const x = tr[4], y = pageH - tr[5], w = it.width || 0;
    let row = null;
    for (let k = rows.length - 1; k >= 0 && k >= rows.length - 12; k--) {
      const r = rows[k];
      if (Math.abs(r.y - y) <= 0.35 * h && Math.abs(r.h - h) <= 0.25 * h && x - r.x2 >= -0.6 * h && x - r.x2 <= 1.0 * h) { row = r; break; }
    }
    if (row) {
      row.text += (x - row.x2 > 0.15 * h && !row.text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
      row.x2 = Math.max(row.x2, x + w);
    } else rows.push({ x, y, h, x2: x + w, text: it.str });
  }
  for (const r of rows) r.text = r.text.replace(/\s+/g, " ").trim();
  return rows.filter((r) => r.text).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Where pictures sit on a page, as fractions of the page: [{ l, t, r, b }]. */
async function pageImages(lib, page, vp) {
  const ops = await page.getOperatorList();
  const O = lib.OPS;
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [], out = [];
  ops.fnArray.forEach((fn, k) => {
    const a = ops.argsArray[k];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(a?.[0]) || a?.[0]?.length === 6) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      const cl = (v) => Math.max(0, Math.min(1, v));
      const box = { l: cl(Math.min(...xs) / vp.width), r: cl(Math.max(...xs) / vp.width), t: cl(1 - Math.max(...ys) / vp.height), b: cl(1 - Math.min(...ys) / vp.height) };
      if (box.r > box.l && box.b > box.t) out.push({ ...box, name: typeof a?.[0] === "string" ? a[0] : "" });
    }
  });
  return out;
}

/** The picture itself, as stored in the PDF (no page text printed over it). Returns a canvas or null. */
async function pdfImageCanvas(lib, page, name, maxSide) {
  if (!name) return null;
  await page.getOperatorList(); // makes sure the page's pictures are loaded
  const store = name.startsWith("g_") ? page.commonObjs : page.objs;
  if (!store.has(name)) return null;
  const img = store.get(name);
  if (!img || !img.width || !img.height) return null;
  let src = img.bitmap || null;
  if (!src && img.data) {
    const n = img.width * img.height;
    const rgba = new Uint8ClampedArray(n * 4);
    if (img.data.length === n * 4) rgba.set(img.data);
    else if (img.data.length === n * 3) for (let i = 0, j = 0; i < n; i++, j += 3) { rgba[i * 4] = img.data[j]; rgba[i * 4 + 1] = img.data[j + 1]; rgba[i * 4 + 2] = img.data[j + 2]; rgba[i * 4 + 3] = 255; }
    else return null;
    src = document.createElement("canvas");
    src.width = img.width; src.height = img.height;
    src.getContext("2d").putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  }
  if (!src) return null;
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext("2d");
  g.fillStyle = "#F4F1EA"; g.fillRect(0, 0, c.width, c.height); // cut-out photos have a see-through background
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** How much is going on in a picture: spread of brightness on a tiny copy (0 = one flat colour). */
function imageDetail(canvas) {
  const s = document.createElement("canvas");
  s.width = s.height = 24;
  const g = s.getContext("2d", { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += y; sq += y * y; }
  const n = d.length / 4, mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

/** Add the dish photo to every recipe that has a `photoBox` ([l, t, r, b] fractions of its page). */
export async function attachPdfPhotos(arrayBuffer, recipes, onProgress) {
  const todo = recipes.filter((r) => r.photoBox && !r.image && r.sourcePage);
  if (!todo.length) return;
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let done = 0;
  for (const r of todo) {
    try {
      const page = await doc.getPage(r.sourcePage);
      let c = null, best = -1;
      // Take the first candidate that is a real photo; flat colour shapes and soft gradients are decoration.
      for (const name of r.photoNames || []) {
        let cand = null;
        try { cand = await pdfImageCanvas(lib, page, name, 480); } catch { cand = null; }
        if (!cand) continue;
        const d = imageDetail(cand);
        if (d > best) { best = d; c = cand; }
        if (d >= 24) break;
      }
      if (c && best < 8) c = null;
      if (!c) { // fall back to cutting the area out of the drawn page
        const vp0 = page.getViewport({ scale: 1 });
        const [l, t, rt, b] = r.photoBox;
        const sw = (rt - l) * vp0.width, sh = (b - t) * vp0.height;
        const scale = Math.min(2, 480 / Math.max(sw, sh));
        const vp = page.getViewport({ scale });
        const full = document.createElement("canvas");
        full.width = Math.round(vp.width); full.height = Math.round(vp.height);
        await page.render({ canvasContext: full.getContext("2d"), viewport: vp }).promise;
        c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
        c.getContext("2d").drawImage(full, l * full.width, t * full.height, c.width, c.height, 0, 0, c.width, c.height);
      }
      r.image = c.toDataURL("image/jpeg", 0.72);
      page.cleanup?.();
    } catch { /* keep the recipe without a photo */ }
    done++;
    if (onProgress && (done % 5 === 0 || done === todo.length)) onProgress(done, todo.length);
  }
  doc.destroy?.();
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
const STEP_HEAD = /^(instructions?|directions?|method|steps?|preparation|how to make|how to prepare|how to cook|procedure|приготовление|способ приготовления|как готовить|инструкция|tay?yorla(nishi|sh|sh usuli|sh tartibi|nish tartibi)|pishirish( usuli)?|만드는\s*법|조리\s*방법|조리법|만들기|preparación|preparazione|zubereitung)$/i;
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
  ["breakfast", /nonushta|завтрак|breakfast|гранол|granola|сырник|оладь|блин|панкейк|каша/i],
  ["dinner", /пицц|pizza|киш(?!м)|quiche/i],
  ["dessert", /shirinlik|desert|десерт|tort|торт|pishiriq|выпечк|pirog|пирог|cake|keks|кекс|печенье|pechene|морожен|топ{1,2}инг|крем|тарт|чизкейк|маффин|брауни|пирожн|конфет|шоколад|вафл|пудинг|мусс|желе|зефир|эклер|круассан|штрудель/i],
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

/* ---------- books with a facts line: time, calories and protein per portion, cost ---------- */
const FACTS_LINE = /(kkal|ккал|kcal)\s*\/\s*(pors|порц|serving)/i;
const NUM_TITLE = /^(\d{1,3})\.\s+(\S.*)$/;
/** "40 daq + 4 soat marinad" -> 280 minutes. */
function durationMinutes(text) {
  let n = 0, hit = false;
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(soat|час\p{L}*|hours?|h|daq\p{L}*|мин\p{L}*|min\p{L}*)/giu)) {
    hit = true; n += parseFloat(m[1].replace(",", ".")) * (/^(soat|час|h)/i.test(m[2]) ? 60 : 1);
  }
  return hit ? Math.round(n) : null;
}
const BOOK_UNITS = [[/^(g|gr|г|гр)\.?$/i, "g"], [/^(kg|кг)\.?$/i, "kg"], [/^(ml|мл)\.?$/i, "ml"], [/^(l|л|litr)\.?$/i, "l"], [/^(dona|ta|шт|pcs?)\.?$/i, "pc"],
  [/^(osh\.?\s?q\.?|osh qoshiq|ст\.?\s?л\.?|tbsp)$/i, "tbsp"], [/^(ch\.?\s?q\.?|choy qoshiq|ч\.?\s?л\.?|tsp)$/i, "tsp"], [/^(stakan|стакан\p{L}*|cups?)$/iu, "cup"], [/^(bo['‘’ʻ]?lak|зубчик\p{L}*|cloves?)$/iu, "clove"], [/^(bog['‘’ʻ]?|пучок|bunch)$/iu, "bunch"], [/^(chimdim|щепотк\p{L}*|pinch)$/iu, "pinch"]];
/** "Bug‘doy uni (oliy nav): 250 g" / "Kashnich (bog‘): 0,3 dona" / "Tuz, qora murch: ta’bga ko‘ra" -> ingredient objects. */
function factIngredient(piece) {
  const raw = piece.replace(/\s+/g, " ").trim();
  const cut = raw.lastIndexOf(":");
  if (cut <= 0) return [];
  let name = raw.slice(0, cut).trim(), amount = raw.slice(cut + 1).trim();
  const notes = [];
  let optional = false, unitHint = "";
  name = name.replace(/\(([^)]*)\)/g, (_, x) => {
    const v = x.trim();
    if (TO_TASTE.test(v) || /xohish|по желанию|optional/i.test(v)) optional = true;
    else if (/^bog['‘’ʻ]?$/i.test(v)) unitHint = "bunch";
    else if (/^bosh$/i.test(v)) notes.push("bosh"); // a whole head of garlic, counted in pieces
    else notes.push(v);
    return " ";
  }).replace(/\s+/g, " ").trim();
  let qty = null, unit = "";
  const taste = TO_TASTE.test(amount);
  const m = amount.match(QTY_RE);
  if (m && !taste) {
    qty = parseNumber(m[1]);
    let tail = amount.slice(m[0].length).trim();
    const um = tail.match(/^(osh\.?\s?q\.?|ch\.?\s?q\.?|osh qoshiq|choy qoshiq|[^\s,(]+)\s*/i);
    if (um) {
      const u = (BOOK_UNITS.find(([re]) => re.test(um[1])) || [])[1] || parseUnit(um[1].replace(/\.$/, ""));
      if (u) { unit = u; tail = tail.slice(um[0].length).trim(); }
    }
    if (unit === "pc" && unitHint) unit = unitHint;           // "Kashnich (bog‘): 0,3 dona" = 0.3 bunch
    tail = tail.replace(/^\((.*)\)$/, "$1").trim();
    if (tail) notes.push(tail);
  } else if (taste) notes.push(amount);
  else if (amount) notes.push(amount);
  // "Tuz, qora murch, zira: ta’bga ko‘ra" lists several things at once.
  const names = qty == null && /,/.test(name) ? name.split(/\s*,\s*/).filter(Boolean) : [name];
  return names.map((n) => {
    const id = resolveIngredient(n);
    return { name: n.charAt(0).toUpperCase() + n.slice(1), ingredientId: id, qty, unit: qty != null && !unit ? (id ? "pc" : "") : unit, note: notes.join("; "), essential: !optional, uncertain: !id, original: raw };
  });
}
function findFactBlocks(all) {
  // Running headers and footers: "Page 3 of 148", and a line repeated on most pages (the book's name).
  const pages = new Set(all.map((l) => l.page)).size || 1;
  const seen = {};
  for (const l of all) if (l.text) seen[l.text] = (seen[l.text] || 0) + 1;
  const lines = all.filter((l) => l.text && !/^(page|стр\.?|bet)\s*\d+(\s*(of|из|\/)\s*\d+)?$/i.test(l.text) && !(seen[l.text] >= Math.max(3, pages / 3) && l.text.length < 60));
  const isFacts = (t) => FACTS_LINE.test(t);
  const isIng = (t) => /^[^:]{2,80}:\s*\S/.test(t) && !/^(teglar|kerak|vaqt|теги|время|tags|time)\b/i.test(t) && !isFacts(t) && !NUM_TITLE.test(t);
  const titleAt = (i) => i >= 0 && i + 1 < lines.length && !isFacts(lines[i].text) && isFacts(lines[i + 1].text);
  const titles = [];
  lines.forEach((_, i) => { if (titleAt(i)) titles.push(i); });
  const defaultServings = (() => { const m = lines.map((l) => l.text).join("\n").match(/(\d+)\s*(porsiya|порци\p{L}*|servings?)/iu); return m ? +m[1] : null; })();
  const recipes = [];
  let chapter = "", part = "", partNote = "";
  titles.forEach((ti, k) => {
    // Lines between the end of the recipe before and this title: part and chapter headings with their notes.
    const prevEnd = k ? titles[k - 1] : -1;
    const between = [];
    let stepEnd = false;
    for (let j = ti - 1; j > prevEnd; j--) {
      // Stop at the last numbered step of the recipe before, or at its ingredients / facts when it has no steps.
      if (k && (NUM_TITLE.test(lines[j].text) || isIng(lines[j].text) || isFacts(lines[j].text) || /^(teglar|kerak)\b/i.test(lines[j].text) || /so['‘’ʻ]?m$/i.test(lines[j].text))) { stepEnd = NUM_TITLE.test(lines[j].text); break; }
      between.unshift(lines[j].text);
    }
    // The last step may wrap: it ends at the first line that closes a sentence.
    let skip = 0;
    if (k && stepEnd) { const lastStep = lines[ti - 1 - between.length]?.text || ""; if (!/[.!?…]$/.test(lastStep)) { while (skip < between.length && !/[.!?…]$/.test(between[skip])) skip++; skip = Math.min(between.length, skip + 1); } }
    const heads = between.slice(skip);
    const tail = { n: skip }; // lines of the recipe before that belong to its last step
    const partIdx = heads.findIndex((t) => /^\d+\s*-\s*(qism|часть)|^(part|часть)\s*\d+/i.test(t));
    if (partIdx >= 0) { part = heads.slice(partIdx).join(" ").split(/(?<=[)])\s|(?<=\.)\s(?=[A-ZА-Я])/)[0]; partNote = heads.slice(partIdx + 1).filter((t) => /[.!?]$/.test(t)).join(" "); }
    const chap = heads.filter((t) => !/[.!?…]$/.test(t) && t.length < 50 && !/qism|часть|\d|:/i.test(t) && !/^[a-zа-я]/.test(t)).pop();
    if (chap) chapter = chap.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+(taomlari|oshxonasi|кухня|cuisine)$/i, "").trim();
    recipes.push({ ti, chapter, part, partNote, tailOfPrev: tail.n, headCount: between.length });
  });
  return recipes.map((info, k) => {
    const ti = info.ti;
    const next = recipes[k + 1];
    const end = next ? next.ti - next.headCount + next.tailOfPrev : lines.length;
    const title = lines[ti].text.replace(NUM_TITLE, "$2").trim();
    // Facts: everything up to the first ingredient line ("Name: amount") or the first step.
    let i = ti + 1, facts = "";
    while (i < end && !isIng(lines[i].text) && !NUM_TITLE.test(lines[i].text)) { facts += (facts ? " " : "") + lines[i].text; i++; }
    const ingredients = [];
    while (i < end && !NUM_TITLE.test(lines[i].text)) { for (const piece of lines[i].text.split(/\s*;\s*/)) ingredients.push(...factIngredient(piece)); i++; }
    const steps = [];
    for (; i < end; i++) {
      const m = lines[i].text.match(NUM_TITLE);
      if (m) steps.push(m[2]); else if (steps.length) steps[steps.length - 1] += " " + lines[i].text;
    }
    const num = (re) => { const m = facts.match(re); return m ? parseFloat(m[1].replace(/\s/g, "").replace(",", ".")) : null; };
    const timeText = (facts.match(/(?:vaqt|время|time)\s*[:：]\s*([^·]+)/i) || [])[1] || "";
    const servings = num(/(\d+)\s*(?:porsiya|порци|servings?)/i) || defaultServings;
    const total = num(/(?:masalliqlari|продукты|ingredients)\s*≈\s*([\d\s]+?)\s*so['‘’ʻ]?m/i);
    const perK = num(/([\d.,]+)\s*ming\s*so['‘’ʻ]?m\s*\/\s*pors/i);
    const tags = ((facts.match(/(?:teglar|теги|tags)\s*[:：]\s*([^·]+)/i) || [])[1] || "").split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    const need = (facts.match(/kerak bo['‘’ʻ]?ladi\s*[:：]\s*([^·]+)/i) || [])[1] || (facts.match(/([\p{L}'‘’ʻ]+)\s+kerak(?=\s*(·|$))/iu) || [])[1] || "";
    const r = {
      title, description: [timeText && /[+(]/.test(timeText) ? "Vaqt: " + timeText.trim() : "", need ? "Kerak bo‘ladi: " + need.trim() : ""].filter(Boolean).join(" · "),
      ingredients, steps: steps.map((x) => ({ text: x.trim(), timer: detectTimer(x) })),
      servings, prepTime: null, cookTime: durationMinutes(timeText), sourcePage: lines[ti].page,
      confidence: title && ingredients.length && steps.length ? "high" : "partial", heads: { ing: true, step: true },
      raw: lines.slice(ti, end).map((l) => l.text).join("\n").slice(0, 8000),
      category: "", cuisine: info.chapter, tags,
      kcal: num(/≈?\s*(\d+)\s*(?:kkal|ккал|kcal)\s*\/\s*(?:pors|порц|serving)/i), protein: num(/≈?\s*(\d+)\s*(?:g|г)\s*(?:oqsil|белк\p{L}*|protein)/iu),
      nutritionEst: /≈\s*\d+\s*(kkal|ккал|kcal)/i.test(facts),
      notes: [/ilovasidan/i.test(facts) ? (facts.match(/^[^·]*ilovasidan/i) || [""])[0].trim() : info.partNote, (facts.match(/[^.·]*(skrinshot|ko['‘’ʻ]rinmadi)[^.·]*\./i) || [""])[0].trim()].filter(Boolean).join(" "),
    };
    return r;
  });
}

const SOURCE_END = /^(source|источник|manba)\s*[:：]\s*\S/i;
const BLOCK_META = /^(also posted|link|ссылка|note|примечание|izoh)\s*[:：]\s*(.*)$/i;
const MEAL_LINE = /^(meal|meals|meal time|приём пищи|прием пищи|ovqat vaqti)\s*[:：]\s*(.+)$/i;
// What the book calls the meal -> the app's meal types. Iftar is the evening meal, suhoor the one before dawn.
const MEAL_WORDS = [
  ["breakfast", /breakfast|завтрак|nonushta|suhoor|suhur|sahar|saharlik|сухур|아침/i],
  ["lunch", /lunch|обед|tushlik|점심/i],
  ["dinner", /dinner|supper|ужин|kechki|iftar|iftor|ифтар|저녁/i],
  ["snack", /snack|tea time|teatime|перекус|к чаю|choy|gazak|간식/i],
  ["dessert", /dessert|десерт|shirinlik|디저트/i],
  ["drink", /drink|напит|ichimlik|음료/i],
];
function mealsFromLabel(text) {
  const out = [];
  for (const part of text.split(/[,/;]|\s+and\s+|\s+и\s+|\s+va\s+/i)) for (const [m, re] of MEAL_WORDS) if (re.test(part) && !out.includes(m)) out.push(m);
  return out.slice(0, 3);
}

/**
 * Compiled recipe books: [chapter headings] Title, optional "Meal: …", optional intro, INGREDIENTS, HOW TO PREPARE,
 * optional "Note: …", then "Source: …" closes the recipe ("Also posted: …" / "Link: …" may follow).
 */
function findSourceBlocks(all, pages = []) {
  // The table of contents ("Name ........ 29") tells chapter headings and recipe names apart from intro text.
  const TOC = /^(.+?)\s*\.{4,}\s*\d+$/;
  const toc = new Set();
  let start = 0;
  const firstIng = all.findIndex((l) => isIngHead(l.text));
  all.slice(0, firstIng < 0 ? 0 : firstIng).forEach((l, i) => { const m = l.text.match(TOC); if (m) { toc.add(keyOfLine(m[1])); start = i + 1; } });
  const lines = all.slice(start).filter((l) => l.text);
  const inToc = (t) => toc.has(keyOfLine(t));
  // On the contents pages a heading is an entry whose next entry is indented further (it has recipes under it).
  const headings = new Set();
  const firstIngPage = firstIng < 0 ? 0 : all[firstIng].page;
  const entries = pages.filter((p) => p.rows && p.page < firstIngPage).flatMap((p) => p.rows).map((r) => ({ x: r.x, m: r.text.match(TOC) })).filter((e) => e.m);
  entries.forEach((e, i) => { if (entries[i + 1] && entries[i + 1].x > e.x + 4) headings.add(keyOfLine(e.m[1])); });
  const isHeading = (t) => headings.has(keyOfLine(t));
  const recipes = [];
  let block = [], chapter = "";
  for (const line of lines) {
    if (!SOURCE_END.test(line.text)) { block.push(line); continue; }
    const b = block; block = [];
    // "Also posted:" and "Link:" of the recipe before sit at the top of this block.
    let url = "";
    while (b.length && BLOCK_META.test(b[0].text) && !/^(note|примечание|izoh)/i.test(b[0].text)) {
      const m = b.shift().text.match(BLOCK_META);
      if (/^(link|ссылка)/i.test(m[1]) && recipes.length && !recipes[recipes.length - 1].url) recipes[recipes.length - 1].url = /^https?:/i.test(m[2]) ? m[2] : "https://" + m[2];
    }
    if (!b.length) continue;
    let iIng = b.findIndex((l) => isIngHead(l.text)), iStep = b.findIndex((l) => isStepHead(l.text));
    const headEnd = Math.min(iIng < 0 ? b.length : iIng, iStep < 0 ? b.length : iStep);
    if (headEnd === b.length) continue; // no recipe headings at all
    const head = b.slice(0, headEnd);
    if (!recipes.length && head.length > 1 && /^recipes$/i.test(head[0].text)) head.shift();
    // Title: the line right before "Meal:", otherwise the last of the leading lines that the contents page lists.
    const iMeal = head.findIndex((l) => MEAL_LINE.test(l.text));
    let iTitle = 0;
    if (iMeal > 0) iTitle = iMeal - 1;
    else if (iMeal < 0 && headings.size) { let k = 0; while (k < head.length - 1 && isHeading(head[k].text)) k++; iTitle = k; }
    else if (iMeal < 0) { let k = 0; while (k < head.length && inToc(head[k].text)) k++; iTitle = Math.max(0, k - 1); }
    if (!head.length) continue;
    const titleLine = head[iTitle];
    const chapters = head.slice(0, iTitle).map((l) => l.text).filter((t) => keyOfLine(t) !== keyOfLine(titleLine.text));
    if (chapters.length) chapter = chapters[chapters.length - 1];
    const meals = iMeal >= 0 ? mealsFromLabel(head[iMeal].text.match(MEAL_LINE)[2]) : [];
    const mealLabel = iMeal >= 0 ? head[iMeal].text.match(MEAL_LINE)[2].trim() : "";
    const intro = head.slice(iTitle + 1).filter((l, k) => !MEAL_LINE.test(l.text) && !(k < 2 && keyOfLine(l.text) === keyOfLine(titleLine.text))).map((l) => l.text);
    // Body
    const notes = [], ingLines = [], steps = [];
    const body = b.slice(headEnd);
    let mode = null;
    const bulleted = body.some((l) => l.bullet);
    for (const l of body) {
      const t = l.text;
      const meta = t.match(BLOCK_META);
      if (meta) { if (/^(note|примечание|izoh)/i.test(meta[1]) && !/could not be split cleanly/i.test(meta[2])) notes.push(meta[2]); mode = mode === "ing" ? "ing-done" : mode; continue; }
      if (isIngHead(t)) { mode = "ing"; continue; }
      if (isStepHead(t)) { mode = "step"; continue; }
      if (mode === "ing") {
        if (bulleted && !l.bullet) {
          // Without a bullet: the rest of a long line above, or a label such as "Nachinkasiga" / "Сверху".
          const prev = ingLines[ingLines.length - 1];
          if (prev && prev.length >= 80) ingLines[ingLines.length - 1] = prev + " " + t;
          continue;
        }
        if (isGroupLabel(t)) continue;
        ingLines.push(t);
      } else if (mode === "step") {
        const c = cleanStep(t).replace(/[\p{Extended_Pictographic}️‍]+/gu, "").trim();
        if (!c) continue;
        if (/^\s*\d+[.)]\s/.test(t) || !steps.length) steps.push(c); else steps[steps.length - 1] += " " + c;
      } else if (mode === "ing-done" && notes.length) notes[notes.length - 1] += " " + t;
    }
    const ingredients = [];
    for (const t of ingLines) for (const part of splitAnd(t)) { const p = parseIngredientLine(part); if (p) ingredients.push(p); }
    const title = headText(titleLine.text) || titleLine.text;
    const r = {
      title, description: intro.join(" ").slice(0, 400), ingredients,
      steps: steps.map((x) => ({ text: x, timer: detectTimer(x) })),
      servings: null, prepTime: null, cookTime: null, sourcePage: titleLine.page,
      confidence: ingredients.length && steps.length && title ? "high" : "partial",
      heads: { ing: iIng >= 0, step: iStep >= 0 }, raw: b.map((l) => l.text).join("\n").slice(0, 8000),
      category: "", tags: [/^(other recipes|recipes|другие рецепты|boshqa retseptlar)$/i.test(chapter) ? "" : chapter, ...(mealLabel && !/^(breakfast|lunch|dinner)(,\s*(breakfast|lunch|dinner))*$/i.test(mealLabel) ? mealLabel.split(/\s*,\s*/) : [])].filter(Boolean),
      notes: notes.join(" "),
    };
    const sm = intro.join(" ").match(META.servings);
    if (sm) r.servings = +(sm[2] || sm[3]);
    if (meals.length) r.meals = meals;
    if (url) r.url = url;
    recipes.push(r);
  }
  return recipes;
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
export function findRecipes(input, opts = {}) {
  const pages = typeof input === "string" ? [{ page: null, text: input }] : input;
  const classic = findRecipesByHeadings(pages);
  if (typeof input === "string" || !pages.some((p) => p.rows?.length)) return classic;
  // Designed books (one recipe card per page): use the page layout when it finds more complete recipes.
  const cards = findCards(pages, opts);
  const complete = (list) => list.filter((r) => r.title && r.ingredients.length && r.steps.length && !r.notRecipe).length;
  return cards.length >= 1 && complete(cards) >= complete(classic) ? cards : classic;
}

function findRecipesByHeadings(pages) {
  const lines = cleanLines(pages);
  // Collections of social-media posts (e.g. Telegram exports): every recipe ends with the post link.
  // Books where each recipe has a facts line under its title: "Vaqt: 90 daq · 1181 kkal/pors · 50 g oqsil".
  if (lines.filter((l) => FACTS_LINE.test(l.text)).length >= 3) return findFactBlocks(lines);
  const ends = lines.reduce((n, l) => n + (POST_END.test(l.text) ? 1 : 0), 0);
  if (ends >= 3) return findPosts(lines);
  // Compiled books where every recipe ends with a "Source: …" line and has its own INGREDIENTS heading.
  if (lines.filter((l) => SOURCE_END.test(l.text)).length >= 3 && lines.filter((l) => isIngHead(l.text)).length >= 3) return findSourceBlocks(lines, pages);
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

/* ---------- recipe cards: one designed page per recipe ---------- */
const CARD_META = /ккал|калорийност|kcal|calories|бжу|б\s*\/\s*ж\s*\/\s*у|на 100\s*г|per 100\s*g|порци[яи]\s*\d|^выход|^yield|^время\s|^\s*[\d.,]+\s*\/\s*[\d.,]+\s*\/\s*[\d.,]+\s*$|^[≈~]?\s*\d+([.,]\d+)?$|^(мин|минут|час|часа|часов|ч|min|mins|h|hours?)\.?$|^[→>-]+$/i;
const CARD_DASH = /\s[–—-]\s*\S|[–—]\s*\d/;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const openParen = (t) => (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length;
function sentenceCase(t) {
  t = t.replace(/\s+/g, " ").replace(/\s+([,.:;!?])/g, "$1").replace(/[:：]\s*$/, "").trim();
  if (t && t === t.toUpperCase() && /\p{L}/u.test(t)) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}

/** "Сливки 10% – 30 мл" / "Основа для пиццы (выпеченная) — 170 г (1 шт.)" / "Соль – по вкусу". */
function cardIngredient(raw) {
  const original = raw.replace(/^[\s•\-–*·●▪◦]+/, "").replace(/\s+/g, " ").trim();
  if (!original) return [];
  let name = original, rest = "";
  const cut = original.search(/\s[–—-]\s|[–—](?=\s*\d)/);
  if (cut > 0) { name = original.slice(0, cut).trim(); rest = original.slice(cut).replace(/^\s*[–—-]\s*/, "").trim(); }
  const notes = [];
  let optional = OPTIONAL_WORDS.test(original);
  const taste = (rest.match(TO_TASTE) || name.match(TO_TASTE) || [])[0] || "";
  name = name.replace(/\(([^)]*)\)/g, (_, x) => { notes.push(x.trim()); return " "; }).replace(TO_TASTE, " ").replace(/\s+/g, " ").replace(/[,;:\s]+$/, "").trim();
  let qty = null, unit = "";
  if (rest) {
    const m = rest.match(QTY_RE);
    if (m) {
      qty = parseNumber(m[1]);
      let tail = rest.slice(m[0].length);
      const um = tail.match(/^(ст\.\s?л\.?|ч\.\s?л\.?|столов\S* ложк\S*|чайн\S* ложк\S*|[^\s,()]+)\.?\s*/i);
      if (um) { const u = parseUnit(um[1].replace(/\s/g, "")) || parseUnit(um[1]); if (u) { unit = u; tail = tail.slice(um[0].length); } }
      tail = tail.replace(/^[\s,;]+/, "").replace(/^\((.*)\)\.?$/, "$1").trim();
      if (tail) notes.push(tail);
    } else if (!taste || rest.replace(TO_TASTE, "").trim()) notes.push(rest);
  }
  if (taste && !notes.some((n) => TO_TASTE.test(n))) notes.push(taste);
  if (!name) return [];
  const forMatch = (t) => t.replace(/\d+([.,]\d+)?\s*%/g, " ").replace(/\s+/g, " ").trim();
  // "Соль, перец – по вкусу": two ingredients when both are known and there is no amount.
  const parts = qty == null ? name.split(/\s*,\s*|\s+и\s+/).filter(Boolean) : [name];
  const names = parts.length > 1 && parts.length <= 4 && parts.every((x) => resolveIngredient(forMatch(x))) ? parts : [name];
  return names.map((n) => {
    const ingredientId = resolveIngredient(forMatch(n));
    const nm = n.charAt(0).toUpperCase() + n.slice(1);
    return { name: nm, ingredientId, qty, unit: qty != null && !unit && ingredientId ? "pc" : unit, note: notes.join("; ").replace(/\((optional|по желанию)\)/i, "$1"), essential: !optional, uncertain: !ingredientId, original };
  });
}

/** Card whose method is not numbered: every line under the "method" heading, one step per sentence-ending line. */
function readCardPlainSteps(pg) {
  const rows = pg.rows || [];
  if (rows.filter((r) => isIngHead(r.text)).length !== 1) return null;
  const head = rows.filter((r) => isStepHead(r.text));
  if (head.length !== 1) return null;
  const below = rows.filter((r) => r.y > head[0].y + 1 && !CARD_META.test(r.text));
  if (below.length < 2) return null;
  const hs = median(below.map((r) => r.h));
  const body = below.filter((r) => Math.abs(r.h - hs) <= 0.1 * hs);
  const steps = [];
  let open = false, lastY = body[0].y;
  for (const r of body) {
    if (r.y - lastY > 2.8 * hs) break;
    lastY = r.y;
    if (open) steps[steps.length - 1] += " " + r.text; else steps.push(r.text);
    open = !/[.!?…]$/.test(r.text);
  }
  if (steps.length < 2) return null;
  return readCard(pg, { steps, used: new Set(body), first: body[0], hs });
}

function readCard(pg, plain = null) {
  const rows = pg.rows || [];
  const W = pg.width || 1000;
  const timeRows = new Set();
  const DUR_ONLY = /^[≈~]?\s*\d+\s*(ч|час|мин)\.?(\s*\d+\s*(мин)\.?)?$/i;
  // ----- steps: "1. …" rows and the lines that continue them
  let steps = [], used, first, hs;
  if (plain) ({ steps, used, first, hs } = plain);
  else {
    const starts = rows.filter((r) => STEP_START.test(r.text));
    first = starts.find((r) => +r.text.match(STEP_START)[1] === 1);
    if (!first || starts.length < 2) return readCardPlainSteps(pg);
    // More than one "1." or more than one ingredients heading: several recipes share the page, so it is not a card.
    if (starts.filter((r) => +r.text.match(STEP_START)[1] === 1).length > 1 || rows.filter((r) => isIngHead(r.text)).length > 1) return null;
    hs = median(starts.map((r) => r.h));
    const x0 = Math.min(...starts.filter((r) => Math.abs(r.h - hs) <= 0.2 * hs).map((r) => r.x));
    const stepRows = rows.filter((r) => r.y >= first.y - 1 && Math.abs(r.h - hs) <= 0.2 * hs && r.x >= x0 - 2 * hs && r.x <= x0 + 4 * hs);
    let lastY = first.y, stepsEnd = first.y, lastNum = 0;
    for (const r of stepRows) {
      if (r.y - lastY > 2.8 * hs) break;
      lastY = r.y; stepsEnd = r.y;
      const m = r.text.match(STEP_START);
      // Numbers only go up (some books skip a number); anything else continues the step before.
      if (m && +m[1] > lastNum && +m[1] <= lastNum + 5) { lastNum = +m[1]; steps.push((m[2] || "").trim()); }
      else if (steps.length) steps[steps.length - 1] = (steps[steps.length - 1] + " " + r.text).trim();
    }
    used = new Set(stepRows.filter((r) => r.y <= stepsEnd));
  }
  // ----- headings
  const headIng = rows.find((r) => !used.has(r) && isIngHead(r.text));
  const headStep = rows.find((r) => !used.has(r) && isStepHead(r.text) && r.y < first.y);
  const bottom = (headStep ? headStep.y : first.y) - 0.3 * hs;
  // ----- ingredients: rows between the heading and the steps, in the list's own text size
  const isMeta = (r) => CARD_META.test(r.text) || DUR_ONLY.test(r.text);
  let zone = rows.filter((r) => !used.has(r) && r !== headIng && r !== headStep && !isMeta(r) && r.y < bottom && (!headIng || r.y > headIng.y - 0.5 * headIng.h));
  const strong = zone.filter((r) => CARD_DASH.test(r.text) || TO_TASTE.test(r.text));
  if (strong.length < 2) return null;
  const hi = median(strong.map((r) => r.h));
  let sizeNote = "";
  zone = zone.filter((r) => {
    if (/^\(.{1,40}\)\s*[:：]?$/.test(r.text) && headIng && r.y - headIng.y < 2.2 * headIng.h) { sizeNote = r.text.replace(/^\(|\)\s*[:：]?$/g, ""); return false; }
    if (/[–—-]\s*[≈~]?\d+\s*(ч|час|мин)\.?$/i.test(r.text)) return false; // "Замачивание – 7 ч." is a time, not an ingredient
    return Math.abs(r.h - hi) <= 0.05 * hi;
  });
  if (!headIng) { const top = Math.min(...strong.map((r) => r.y)); zone = zone.filter((r) => r.y >= top - 1.7 * hi); }
  const minX = Math.min(...zone.map((r) => r.x));
  const col = (r) => (r.x > minX + 0.25 * W ? 1 : 0);
  zone.sort((a, b) => col(a) - col(b) || a.y - b.y || a.x - b.x);
  const texts = [];
  let pending = "", orNext = false;
  zone.forEach((r, i) => {
    const t = r.text, next = zone[i + 1];
    const nextNear = next && col(next) === col(r) && next.y - r.y < 1.8 * hi;
    if (!pending && isGroupLabel(t)) return;
    if (!pending && texts.length && /^(или|or)$/i.test(t) && next) { orNext = true; return; }
    if (orNext && !pending) { orNext = false; texts[texts.length - 1] += ` (или ${t})`; return; }
    if (!pending && texts.length && (t.startsWith("(") || openParen(texts[texts.length - 1]))) { texts[texts.length - 1] += " " + t; return; }
    pending = pending ? pending + " " + t : t;
    const complete = (CARD_DASH.test(pending) || TO_TASTE.test(pending)) && !openParen(pending);
    const standsAlone = !CARD_DASH.test(pending) && !openParen(pending) && !/([,;]|\sили|\sи)$/i.test(pending) && next && /^[\p{Lu}]/u.test(next.text) && !!resolveIngredient(pending);
    if (complete || standsAlone || !nextNear) { texts.push(pending); pending = ""; }
  });
  if (pending) texts.push(pending);
  const ingredients = [];
  for (const line of texts) {
    // several ingredients on one line: "Сливки 10% – 30 мл, Моцарелла 20 % – 60 г" / "… по вкусу укроп – 3 г"
    const pieces = line.replace(new RegExp("(" + TO_TASTE.source + ")\\s+(?=\\S.*\\s[–—-]\\s)", "iu"), "$1\u0001").split("\u0001")
      .flatMap((x) => { const parts = x.split(/,\s+(?=[^,()]*\s[–—-]\s)/); return parts.every((q) => CARD_DASH.test(q)) ? parts : [x]; });
    for (const piece of pieces) {
      // A line with no amount only counts when it is a known ingredient ("Соль"), not a note or a tip.
      if (!CARD_DASH.test(piece) && !TO_TASTE.test(piece) && !(piece.split(" ").length <= 4 && resolveIngredient(piece))) continue;
      ingredients.push(...cardIngredient(piece));
    }
  }
  if (!ingredients.length || !steps.length) return null;
  // ----- title: the biggest text above the ingredients
  const top = headIng ? headIng.y : Math.min(...zone.map((r) => r.y));
  const titleZone = rows.filter((r) => !used.has(r) && r !== headIng && !isMeta(r) && r.y < top && (r.text.match(/\p{L}/gu) || []).length >= 2 && !zone.includes(r));
  const maxH = Math.max(0, ...titleZone.map((r) => r.h));
  const title = maxH >= 1.3 * hi ? sentenceCase(titleZone.filter((r) => r.h >= 0.8 * maxH).sort((a, b) => a.y - b.y || a.x - b.x).map((r) => r.text).join(" ").replace(/(\p{L})-\s+(?=\p{L})/gu, "$1-")) : "";
  // ----- times and nutrition, exactly as printed
  const all = rows.map((r) => r.text);
  const dur = (t) => { // "37 мин." / "6 час." / "5 ч 20 мин"
    let n = 0, hit = false;
    for (const m of t.matchAll(/[≈~]?\s*(\d+(?:[.,]\d+)?)\s*(мин|час|ч)(?![\p{L}])|[≈~]?\s*(\d+(?:[.,]\d+)?)\s*(минут|часа|часов)/giu)) {
      hit = true; n += parseFloat((m[1] || m[3]).replace(",", ".")) * (/^ч/i.test(m[2] || m[4]) ? 60 : 1);
    }
    return hit ? Math.round(n) : null;
  };
  let prepTime = null, otherTime = 0;
  const extra = [];
  rows.forEach((r) => {
    const m = r.text.match(/^время\s+([\p{L}]+)\s*[:：]\s*(.*)$/iu);
    if (!m) return;
    let val = m[2];
    if (!val) { // the amount is printed on the next line
      const below = rows.filter((q) => q !== r && q.y > r.y && q.y - r.y < 1.6 * r.h && Math.abs(q.x - r.x) < 2 * r.h)[0];
      if (below && dur(below.text) != null) { val = below.text; timeRows.add(below); }
    }
    const d = dur(val);
    if (d == null) return;
    if (/^подготов/i.test(m[1])) prepTime = d;
    else { otherTime += d; if (/охлажд|заморажив|настаив|расстой|отдых|стабилиз/i.test(m[1])) extra.push(`${m[0].replace(/\s*[:：].*$/, "")}: ${val}`.replace(/\.$/, "")); }
  });
  const near = (a, b, d) => Math.abs(a.x - b.x) < d && Math.abs(a.y - b.y) < d;
  const numRows = rows.filter((r) => /^[≈~]?\s*\d+([.,]\d+)?$/.test(r.text));
  const num = (r) => parseFloat(r.text.replace(/[≈~\s]/g, "").replace(",", "."));
  // Round badge with the total time: "27 МИН", "≈3 час", or "5 час 35 мин".
  let total = null;
  const badges = new Set();
  for (const u of rows.filter((r) => /^(мин|минут|час|часа|часов|ч)\.?$/i.test(r.text))) {
    const n = numRows.filter((r) => !badges.has(r) && near(r, u, 4 * u.h)).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    if (!n) continue;
    badges.add(n);
    total = (total || 0) + Math.round(num(n) * (/^ч/i.test(u.text) ? 60 : 1));
  }
  let cookTime = otherTime || null;
  if (total != null) { if (prepTime != null && total > prepTime) cookTime = total - prepTime; else if (prepTime == null) cookTime = total; }
  const facts = [];
  const kcalRow = rows.find((r) => /^ккал$/i.test(r.text));
  const kcalNum = kcalRow && numRows.filter((r) => !badges.has(r) && near(r, kcalRow, 3 * kcalRow.h))[0];
  const per100 = all.some((t) => /^на 100\s*г/i.test(t));
  if (kcalNum) facts.push(`${kcalNum.text} ккал${per100 ? " на 100 г" : ""}`);
  const cal = all.find((t) => /^калорийность\s*[:：]/i.test(t));
  if (cal) facts.push(sentenceCase(cal));
  const bzhuIdx = rows.findIndex((r) => /^(бжу|б\s*\/\s*ж\s*\/\s*у)/i.test(r.text));
  if (bzhuIdx >= 0) {
    const b = rows[bzhuIdx];
    const own = b.text.match(/[\d.,]+\s*\/\s*[\d.,]+\s*\/\s*[\d.,]+/);
    const val = own ? own[0] : rows.filter((r) => /^[\d.,]+\s*\/\s*[\d.,]+\s*\/\s*[\d.,]+$/.test(r.text)).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]?.text;
    if (val) facts.push(`БЖУ${/100/.test(b.text) ? " на 100 г" : ""}: ${val}`);
  }
  const yieldRow = all.find((t) => /^выход\s*[:：]/i.test(t));
  if (yieldRow) facts.push(yieldRow);
  const portion = rows.find((r) => /^порция\s*\d/i.test(r.text));
  if (portion) {
    const k = rows.filter((r) => /^\d+\s*ккал$/i.test(r.text) && near(r, portion, 6 * portion.h))[0];
    facts.push(portion.text.replace(/\s*→\s*$/, "") + (k ? " → " + k.text : ""));
  }
  if (sizeNote) facts.push(sizeNote);
  facts.push(...extra);
  // ----- dish photo candidates: big pictures first, whole-page backgrounds last (the photo itself is chosen when it is drawn)
  const cands = (pg.images || []).map((b) => ({ ...b, area: (b.r - b.l) * (b.b - b.t) }))
    .filter((b) => b.area >= 0.04 && b.r - b.l >= 0.15 && b.b - b.t >= 0.08)
    .sort((a, b) => (a.area > 0.8) - (b.area > 0.8) || b.area - a.area).slice(0, 4);
  const photo = cands[0];
  return {
    title, description: facts.join(" · ").slice(0, 400), ingredients,
    steps: steps.filter(Boolean).map((s) => ({ text: s, timer: detectTimer(s) })),
    servings: null, prepTime, cookTime, sourcePage: pg.page, confidence: title ? "high" : "partial",
    heads: { ing: !!headIng, step: !!headStep }, raw: (pg.text || "").slice(0, 8000),
    photoBox: photo ? [photo.l, photo.t, photo.r, photo.b] : null, photoNames: cands.map((c) => c.name).filter(Boolean),
  };
}

function findCards(pages, opts = {}) {
  const out = [];
  let chapter = "";
  for (const pg of pages) {
    const r = readCard(pg);
    if (!r) {
      // A page with only a few big words is a chapter divider ("ГРАНОЛА", "ТОПИНГИ И КРЕМА").
      const rows = pg.rows || [];
      const chars = rows.reduce((n, x) => n + x.text.length, 0);
      if (rows.length && rows.length <= 4 && chars <= 60 && pg.page > 1) chapter = sentenceCase(rows.map((x) => x.text).join(" "));
      continue;
    }
    // Meal types are worked out from the title, the chapter and the book name when the recipe is saved.
    r.category = "";
    if (chapter) r.tags = [chapter];
    r.hints = [opts.title || ""].filter(Boolean);
    out.push(r);
  }
  return out;
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


/* ---------- Uzbek Cyrillic recipes are kept in the Latin alphabet ---------- */
/** Rewrites a recipe (draft or saved) from Uzbek Cyrillic to Uzbek Latin and re-reads its ingredients. Returns true if it changed. */
export function latinizeRecipe(r) {
  const sample = [r.title, r.description, ...(r.ingredients || []).map((i) => i.original || i.name), ...(r.steps || []).map((x) => x.text)].join("\n");
  if (!isUzbekCyrillic(sample)) return false;
  for (const k of ["title", "description", "notes", "cuisine"]) if (r[k]) r[k] = uzLatin(r[k]);
  if (r.tags) r.tags = r.tags.map(uzLatin);
  for (const st of r.steps || []) st.text = uzLatin(st.text);
  r.ingredients = (r.ingredients || []).flatMap((i) => {
    // Read the line again in Latin: "2 та тухум" was not understood, "2 ta tuxum" is.
    const again = i.original && !i.ingredientId ? parseIngredientLine(uzLatin(i.original)) : null;
    if (again && again.ingredientId) return [{ ...i, ...again, essential: i.essential !== false && again.essential }];
    const name = uzLatin(i.name || "");
    const id = i.ingredientId || resolveIngredient(name);
    return [{ ...i, name, note: uzLatin(i.note || ""), original: i.original ? uzLatin(i.original) : i.original, ingredientId: id, uncertain: id ? false : i.uncertain, unit: i.qty != null && !i.unit && id && !i.ingredientId ? "pc" : i.unit }];
  });
  r.language = "uz";
  return true;
}
