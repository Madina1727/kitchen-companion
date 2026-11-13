// Recipe books: upload a whole cookbook (PDF or photos of pages) and read every recipe in it.
// The book is read in small page batches so any size works, with progress, pause/resume and retry.
import { S, t, h, icon, save, toast, go, uid, confirmDialog, openSheet, dateLabel, refreshIcons, aiAvailable } from "../core.js";
import { fileSet, fileGet, fileDel } from "../db.js";
import { extractBookPart, fixPosts, aiErrorKey, costOf, PRICES } from "../ai.js";
import { extractPdf, findRecipes, attachPdfPhotos } from "../parser.js";
import { norm } from "../engine.js";
import { makeItem } from "./importer.js";

const MAX_BOOK_MB = 400;
const MAX_PART_BYTES = 18 * 1024 * 1024; // keeps each request well under the 32 MB limit
const CONCURRENCY = 3;
const PDF_PAGES_PER_PART = 8;
const IMG_PAGES_PER_PART = 4;

/* ---------- updates ---------- */
const listeners = new Set();
export function onBookUpdate(fn) { listeners.add(fn); }
let notifyTimer;
function notify() { clearTimeout(notifyTimer); notifyTimer = setTimeout(() => listeners.forEach((fn) => fn()), 250); }
const jobs = new Map(); // bookId -> { stop, controllers }
export const isRunning = (id) => jobs.has(id);
export const anyRunning = () => jobs.size > 0;
const books = () => (S.state.books ||= []);
const bookById = (id) => books().find((b) => b.id === id);

/* ---------- file helpers ---------- */
let pdfjs, PDFLib;
const pdfCache = new Map(); // bookId -> { bytes, pdfjsDoc, libDoc }
async function libs() {
  if (!pdfjs) {
    pdfjs = await import("../../vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).href;
  }
  if (!PDFLib) PDFLib = await import("../../vendor/pdf-lib.esm.min.mjs");
}
async function pdfFor(book) {
  if (pdfCache.has(book.id)) return pdfCache.get(book.id);
  await libs();
  const f = await fileGet(book.fileIds[0]);
  if (!f) throw new Error(t("file_missing"));
  const bytes = new Uint8Array(await f.blob.arrayBuffer());
  const entry = { bytes, pdfjsDoc: null, libDoc: null };
  pdfCache.set(book.id, entry);
  return entry;
}
async function pdfjsDoc(book) {
  const e = await pdfFor(book);
  if (!e.pdfjsDoc) e.pdfjsDoc = await pdfjs.getDocument({ data: e.bytes.slice() }).promise;
  return e.pdfjsDoc;
}
async function libDoc(book) {
  const e = await pdfFor(book);
  if (!e.libDoc) e.libDoc = await PDFLib.PDFDocument.load(e.bytes, { ignoreEncryption: true });
  return e.libDoc;
}
function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function canvasToJpeg(canvas, q = 0.85) {
  return canvas.toDataURL("image/jpeg", q);
}
async function imageCanvas(blob, maxSide = 1568) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}
/** Render one book page (1-based) to a canvas. */
async function pageCanvas(book, page, width = 1400) {
  if (book.kind === "images") {
    const f = await fileGet(book.fileIds[page - 1]);
    return imageCanvas(f.blob, width);
  }
  const doc = await pdfjsDoc(book);
  const p = await doc.getPage(page);
  const vp0 = p.getViewport({ scale: 1 });
  const vp = p.getViewport({ scale: width / vp0.width });
  const c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await p.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c;
}
async function cropPhoto(book, page, box) {
  let [l, tp, r, b] = box.map(Number);
  if ([l, tp, r, b].some((v) => isNaN(v))) return "";
  if (l > 1 || r > 1 || tp > 1 || b > 1) return ""; // not fractions
  l = Math.max(0, l - 0.01); tp = Math.max(0, tp - 0.01); r = Math.min(1, r + 0.01); b = Math.min(1, b + 0.01);
  if (r - l < 0.12 || b - tp < 0.08) return "";
  const src = await pageCanvas(book, page, 1400);
  const sx = l * src.width, sy = tp * src.height, sw = (r - l) * src.width, sh = (b - tp) * src.height;
  const k = Math.min(1, 800 / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return canvasToJpeg(c, 0.78);
}

/* ---------- creating a book ---------- */
export async function createBook({ files, title, author }) {
  const isPdf = files.length === 1 && (files[0].type === "application/pdf" || /\.pdf$/i.test(files[0].name));
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (!isPdf && !images.length) throw new Error(t("book_bad_file"));
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_BOOK_MB * 1024 * 1024) throw new Error(t("book_too_big", { mb: MAX_BOOK_MB }));
  const id = uid();
  const book = {
    id, title: title || (isPdf ? files[0].name.replace(/\.pdf$/i, "") : t("untitled")), author: author || "",
    kind: isPdf ? "pdf" : "images", fileIds: [], fileName: isPdf ? files[0].name : "", pages: 0, from: 1, to: 1,
    mode: aiAvailable() ? "ai" : "local", model: S.state.settings.model || "claude-opus-5-5",
    usePhotos: true, status: "setup", chunks: [], session: { items: [], problems: "" }, saved: 0,
    usage: { input: 0, output: 0, cost: 0 }, cover: "", collectionId: null, createdAt: new Date().toISOString(),
  };
  if (isPdf) {
    const fid = uid();
    await fileSet(fid, { name: files[0].name, type: "application/pdf", blob: files[0], added: book.createdAt });
    book.fileIds = [fid];
    await libs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await files[0].arrayBuffer()) }).promise;
    book.pages = doc.numPages;
    // Sample pages to see whether the PDF has real text (cheaper and more reliable than reading page images).
    let chars = 0, sampled = 0;
    const step = Math.max(1, Math.floor(doc.numPages / 12));
    for (let p = 1; p <= doc.numPages && sampled < 12; p += step, sampled++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      chars += tc.items.reduce((n, it) => n + it.str.length, 0);
    }
    book.avgChars = Math.round(chars / Math.max(1, sampled));
    book.hasText = book.avgChars > 300;
    if (book.hasText) book.mode = "local";
    S.state.files.push({ id: fid, name: files[0].name, type: "pdf", size: files[0].size, added: book.createdAt, pages: book.pages, bookId: id });
  } else {
    // Keep the photo order the user chose (sorted by file name, which matches camera order).
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of images) {
      const fid = uid();
      await fileSet(fid, { name: f.name, type: f.type, blob: f, added: book.createdAt });
      book.fileIds.push(fid);
    }
    book.pages = images.length;
  }
  book.to = book.pages;
  try { book.cover = canvasToJpeg(await pageCanvas(book, 1, 320), 0.7); } catch { /* cover is optional */ }
  const coll = { id: uid(), name: book.title, bookId: id };
  S.state.collections.push(coll);
  book.collectionId = coll.id;
  books().unshift(book);
  save();
  return book;
}

function planChunks(book) {
  const size = book.kind === "pdf" ? PDF_PAGES_PER_PART : IMG_PAGES_PER_PART;
  book.chunks = [];
  for (let p = book.from; p <= book.to; p += size) book.chunks.push({ from: p, to: Math.min(book.to, p + size - 1), status: "pending", found: 0 });
}

/* ---------- running ---------- */
export async function startBook(id) {
  const book = bookById(id);
  if (!book || jobs.has(id)) return;
  if (!book.chunks.length) planChunks(book);
  for (const c of book.chunks) if (c.status === "error" || c.status === "running") { c.status = "pending"; c.error = ""; }
  const job = { stop: false, controllers: new Set() };
  jobs.set(id, job);
  book.status = "running"; book.startedAt ||= new Date().toISOString();
  save(); notify();
  try {
    if (book.mode === "local") await runLocal(book, job);
    else {
      const worker = async () => {
        while (!job.stop) {
          const c = book.chunks.find((x) => x.status === "pending");
          if (!c) return;
          c.status = "running"; notify();
          await processChunk(book, c, job);
          save(); notify();
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }
  } finally {
    jobs.delete(id);
    for (const c of book.chunks) if (c.status === "running") c.status = "pending";
    const left = book.chunks.filter((c) => c.status === "pending").length;
    book.status = job.stop && left ? "paused" : "done";
    if (book.status === "done") {
      book.finishedAt = new Date().toISOString();
      const errs = book.chunks.filter((c) => c.status === "error").length;
      toast(errs ? t("book_done_errors", { x: book.title, n: book.session.items.length, e: errs }) : t("book_done", { x: book.title, n: book.session.items.length }), errs ? "error" : "info",
        { label: t("review"), fn: () => go(`#/book/${book.id}/review`) });
    }
    save(); notify();
  }
}
export function pauseBook(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.stop = true;
  job.controllers.forEach((c) => c.abort());
}

const textCache = new Map(); // bookId -> [{ page, text }]
async function bookText(book, onProgress) {
  if (textCache.has(book.id)) return textCache.get(book.id);
  const f = await fileGet(book.fileIds[0]);
  const parsed = await extractPdf(await f.blob.arrayBuffer(), onProgress);
  textCache.set(book.id, parsed.pages);
  return parsed.pages;
}
async function buildPart(book, pages) {
  if (book.kind === "pdf" && book.hasText) {
    const all = await bookText(book);
    const text = pages.map((p) => `=== Page ${p} ===\n${all[p - 1]?.text || ""}`).join("\n\n");
    return { part: { kind: "text", text }, size: text.length * 2 };
  }
  if (book.kind === "pdf") {
    const src = await libDoc(book);
    const out = await PDFLib.PDFDocument.create();
    const copied = await out.copyPages(src, pages.map((p) => p - 1));
    copied.forEach((pg) => out.addPage(pg));
    const bytes = await out.save();
    return { part: { kind: "pdf", base64: bytesToBase64(bytes) }, size: bytes.length };
  }
  const images = [];
  let size = 0;
  for (const p of pages) {
    const c = await pageCanvas(book, p, 1568);
    const data = canvasToJpeg(c, 0.85).split(",")[1];
    size += data.length * 0.75;
    images.push({ mediaType: "image/jpeg", base64: data });
  }
  return { part: { kind: "images", images }, size };
}

function splitChunk(book, c) {
  const mid = Math.floor((c.from + c.to) / 2);
  const i = book.chunks.indexOf(c);
  book.chunks.splice(i, 1, { from: c.from, to: mid, status: "pending", found: 0 }, { from: mid + 1, to: c.to, status: "pending", found: 0 });
}

async function processChunk(book, c, job) {
  const pages = [];
  for (let p = c.from; p <= c.to; p++) pages.push(p);
  if (c.to < book.pages) pages.push(c.to + 1); // next page as context for recipes that continue
  const ctrl = new AbortController();
  job.controllers.add(ctrl);
  try {
    const { part, size } = await buildPart(book, pages);
    if (size > MAX_PART_BYTES && c.to > c.from) { splitChunk(book, c); return; }
    const res = await extractBookPart(S.state.settings, { part, pages, ownFrom: c.from, ownTo: c.to, bookTitle: book.title, model: book.model, signal: ctrl.signal });
    const cost = costOf(res.usage, book.model);
    book.usage.input += res.usage?.input_tokens || 0;
    book.usage.output += res.usage?.output_tokens || 0;
    book.usage.cost += cost;
    let found = 0;
    for (const r of res.recipes) {
      const page = r.sourcePage;
      if (page != null && (page < c.from || page > c.to)) continue; // belongs to another batch
      if (!r.title && !r.ingredients.length) continue;
      const pg = page ?? c.from;
      const n = norm(r.title);
      if (n && book.session.items.some((it) => norm(it.draft.title) === n && Math.abs((it.draft.source?.page ?? -9) - pg) <= 1)) continue;
      if (book.usePhotos && r.photoBox) {
        try { r.image = await cropPhoto(book, pg, r.photoBox); } catch { /* keep going without a photo */ }
      }
      r._src = { type: "book", bookId: book.id, fileId: book.kind === "pdf" ? book.fileIds[0] : book.fileIds[pg - 1], fileName: book.title, page: pg };
      r.sourcePage = pg;
      book.session.items.push(makeItem(r, r._src));
      found++;
    }
    c.found = found;
    c.status = "done";
    if (res.problems) c.note = res.problems.slice(0, 300);
  } catch (e) {
    const key = aiErrorKey(e);
    if (key === "ai_aborted" || job.stop) { c.status = "pending"; return; }
    if (key === "ai_too_long" && c.to > c.from) { splitChunk(book, c); return; }
    c.status = "error"; c.error = key === "ai_failed" && !e?.status ? (e?.message || key) : t(key);
    console.error(e);
    if (key === "ai_bad_key" || key === "ai_no_key") { job.stop = true; job.controllers.forEach((x) => x.abort()); }
  } finally {
    job.controllers.delete(ctrl);
  }
}

/* ---------- Claude for the posts the built-in reader could not finish ---------- */
export function fixableItems(book) {
  return book.session.items.filter((it) => !it.notRecipe && !it.repeat && !it.aiFixed && it.raw && (!it.draft.ingredients.length || !it.draft.steps.length));
}
function fixEstimate(book) {
  const items = fixableItems(book);
  const chars = items.reduce((n, it) => n + it.raw.length, 0);
  const [pin, pout] = PRICES[book.model] || PRICES["claude-opus-5-5"];
  return { n: items.length, cost: (chars / 3) * pin / 1e6 + items.length * 700 * pout / 1e6 };
}
export async function fixBook(id) {
  const book = bookById(id);
  if (!book || jobs.has(id)) return;
  const items = fixableItems(book);
  if (!items.length) return;
  const batches = [];
  let cur = [], size = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= 8 || size + it.raw.length > 10000)) { batches.push(cur); cur = []; size = 0; }
    cur.push(it); size += it.raw.length;
  }
  if (cur.length) batches.push(cur);
  const job = { stop: false, controllers: new Set() };
  jobs.set(id, job);
  book.fix = { total: items.length, done: 0, failed: 0 };
  book.status = "fixing";
  save(); notify();
  let next = 0;
  const worker = async () => {
    while (!job.stop && next < batches.length) {
      const batch = batches[next++];
      const ctrl = new AbortController();
      job.controllers.add(ctrl);
      try {
        const res = await fixPosts(S.state.settings, batch.map((it, k) => ({ n: k + 1, text: it.raw })), { model: book.model, signal: ctrl.signal });
        book.usage.cost += costOf(res.usage, book.model);
        book.usage.input += res.usage?.input_tokens || 0;
        book.usage.output += res.usage?.output_tokens || 0;
        batch.forEach((it, k) => {
          const got = res.recipes.filter((r) => r.postNumber === k + 1);
          if (!got.length) { it.notRecipe = true; it.include = false; it.aiFixed = true; return; }
          got.forEach((r, j) => {
            r._src = it.draft.source;
            r.sourcePage = it.draft.source?.page ?? null;
            const fresh = makeItem(r, r._src);
            fresh.draft.source = { ...it.draft.source };
            fresh.draft.tags = it.draft.tags;
            fresh.aiFixed = true;
            if (j === 0) Object.assign(it, { draft: fresh.draft, include: fresh.include, aiFixed: true, notRecipe: false });
            else book.session.items.splice(book.session.items.indexOf(it) + j, 0, fresh);
          });
        });
        book.fix.done += batch.length;
      } catch (e) {
        if (aiErrorKey(e) === "ai_aborted" || job.stop) break;
        book.fix.failed += batch.length; book.fix.done += batch.length;
        book.fix.error = t(aiErrorKey(e));
        if (["ai_bad_key", "ai_no_key"].includes(aiErrorKey(e))) { job.stop = true; job.controllers.forEach((x) => x.abort()); }
      } finally { job.controllers.delete(ctrl); }
      save(); notify();
    }
  };
  try { await Promise.all([worker(), worker(), worker()]); }
  finally {
    jobs.delete(id);
    book.status = "done";
    save(); notify();
    toast(t("fix_done", { n: book.fix.done - book.fix.failed }), book.fix.failed ? "error" : "info", { label: t("review"), fn: () => go(`#/book/${book.id}/review`) });
  }
}

/** Built-in reader (no AI): text PDFs only. Reads the whole range at once. */
async function runLocal(book, job) {
  if (book.kind !== "pdf") throw new Error(t("book_local_pdf_only"));
  book.localDone = 0;
  const all = await bookText(book, (done) => { book.localDone = done; notify(); });
  if (job.stop) return;
  const pages = all.filter((p) => p.page >= book.from && p.page <= book.to);
  const found = findRecipes(pages, { title: book.title });
  if (book.usePhotos !== false && found.some((r) => r.photoBox)) {
    // Cut each dish photo out of its page.
    const f = await fileGet(book.fileIds[0]);
    book.photoDone = 0; book.photoTotal = found.filter((r) => r.photoBox).length;
    await attachPdfPhotos(await f.blob.arrayBuffer(), found, (done) => { book.photoDone = done; notify(); });
    if (job.stop) return;
  }
  const seen = new Set();
  for (const r of found) {
    r._src = { type: "book", bookId: book.id, fileId: book.fileIds[0], fileName: book.title, page: r.sourcePage };
    const item = makeItem(r, r._src);
    // The same post can appear twice in an exported collection.
    const key = norm(r.title) + "|" + r.ingredients.map((i) => norm(i.name)).join(",") + "|" + (r.steps[0]?.text || "").slice(0, 60);
    if (seen.has(key)) { item.include = false; item.repeat = true; }
    seen.add(key);
    book.session.items.push(item);
  }
  for (const c of book.chunks) { c.status = "done"; c.found = found.filter((r) => r.sourcePage >= c.from && r.sourcePage <= c.to).length; }
  const empty = pages.filter((p) => p.text.replace(/\s/g, "").length < 20).length;
  if (empty > pages.length / 2) book.session.problems = t("pdf_scanned", { f: book.title });
}

/* ---------- views ---------- */
export function viewBooks() {
  const list = books();
  return `<div class="page">
    <header class="page-head"><div><p class="eyebrow">${h(t("nav_recipes"))}</p><h1>${h(t("recipe_books"))}</h1><p class="lead">${h(t("recipe_books_sub"))}</p></div>
      <a class="btn btn-primary" href="#/book/new">${icon("plus")} ${h(t("add_book"))}</a></header>
    ${list.length ? `<div class="book-grid">${list.map(bookCard).join("")}</div>` :
      `<div class="empty">${icon("library", "ic-xl")}<h2>${h(t("no_books"))}</h2><p>${h(t("no_books_text"))}</p><a class="btn btn-primary" href="#/book/new">${icon("upload")} ${h(t("add_book"))}</a></div>`}
  </div>`;
}
function bookProgress(b) {
  const total = b.chunks.reduce((s, c) => s + (c.to - c.from + 1), 0) || (b.to - b.from + 1);
  let done = b.chunks.filter((c) => c.status === "done").reduce((s, c) => s + (c.to - c.from + 1), 0);
  if (b.mode === "local" && isRunning(b.id)) done = Math.max(0, Math.min(total, (b.localDone || 0) - b.from + 1));
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function statusText(b) {
  const st = b.status === "running" && !isRunning(b.id) ? "paused" : b.status;
  const pr = bookProgress(b);
  const errs = b.chunks.filter((c) => c.status === "error").length;
  if (st === "setup") return `<span class="status st-muted">${icon("settings-2")} ${h(t("book_not_started"))}</span>`;
  if (st === "fixing" && isRunning(b.id)) return `<span class="status st-amber">${icon("loader", "spin")} ${h(t("fixing_n", { a: b.fix?.done || 0, b: b.fix?.total || 0 }))}</span>`;
  if (st === "running") return `<span class="status st-amber">${icon("loader", "spin")} ${h(t("book_reading_pct", { p: pr.pct }))}</span>`;
  if (st === "paused") return `<span class="status st-amber">${icon("pause")} ${h(t("book_paused_pct", { p: pr.pct }))}</span>`;
  if (errs) return `<span class="status st-red">${icon("circle-alert")} ${h(t("book_n_failed", { n: errs }))}</span>`;
  return `<span class="status st-green">${icon("circle-check")} ${h(t("book_read_all"))}</span>`;
}
function bookCard(b) {
  return `<a class="book-card" href="#/book/${b.id}">
    <div class="book-cover">${b.cover ? `<img src="${h(b.cover)}" alt="">` : icon("book", "ic-xl")}</div>
    <div class="book-body"><h3>${h(b.title)}</h3>${b.author ? `<p class="meta">${h(b.author)}</p>` : ""}
      <p class="meta">${h(t("n_pages", { n: b.pages }))} · ${h(t("book_found_saved", { f: b.session.items.length + (b.saved || 0), s: b.saved || 0 }))}</p>
      ${statusText(b)}</div>
  </a>`;
}

export function viewBookNew() {
  return `<div class="page page-narrow">
    <a class="back" href="#/books">${icon("chevron-left")} ${h(t("recipe_books"))}</a>
    <h1>${h(t("add_book"))}</h1>
    <p class="lead">${h(t("add_book_lead"))}</p>
    <form class="form" id="book-form">
      <label class="drop" id="drop">
        ${icon("library", "ic-xl")}
        <strong>${h(t("book_drop"))}</strong>
        <small>${h(t("book_drop_sub", { mb: MAX_BOOK_MB }))}</small>
        <input type="file" name="files" accept="application/pdf,.pdf,image/*" multiple required>
        <span id="file-names" class="meta"></span>
      </label>
      <div class="grid-2">
        <label class="field"><span>${h(t("book_title"))}</span><input name="title" placeholder="${h(t("book_title_ph"))}"></label>
        <label class="field"><span>${h(t("book_author"))}</span><input name="author" placeholder="${h(t("optional"))}"></label>
      </div>
      <p class="form-error" id="book-err" role="alert"></p>
      <div class="row-end"><button class="btn btn-primary">${icon("arrow-right")} ${h(t("continue"))}</button></div>
    </form>
  </div>`;
}
export function bindBookNew(root) {
  const form = root.querySelector("#book-form");
  if (!form) return;
  const input = form.files;
  const drop = root.querySelector("#drop");
  const show = () => {
    const fs = [...input.files];
    root.querySelector("#file-names").textContent = fs.length > 3 ? t("n_files", { n: fs.length }) : fs.map((f) => f.name).join(", ");
    if (fs.length === 1 && !form.title.value) form.title.value = fs[0].name.replace(/\.[^.]+$/, "");
  };
  input.addEventListener("change", show);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); input.files = e.dataTransfer.files; show(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button.btn-primary");
    btn.disabled = true; btn.innerHTML = `<span class="spinner spinner-sm"></span> ${h(t("processing"))}`;
    try {
      const book = await createBook({ files: [...input.files], title: form.title.value.trim(), author: form.author.value.trim() });
      go("#/book/" + book.id);
    } catch (err) {
      root.querySelector("#book-err").textContent = err.message || t("import_failed");
      btn.disabled = false; btn.innerHTML = `${icon("arrow-right")} ${h(t("continue"))}`; refreshIcons(btn);
    }
  });
}

function estimate(b) {
  const pages = Math.max(0, b.to - b.from + 1);
  const [pin, pout] = PRICES[b.model] || PRICES["claude-opus-5-5"];
  // Rough: a PDF page is about 1,500–3,000 input tokens; output is about 300–900 tokens per page.
  const inLo = b.hasText ? b.avgChars / 4 : 1500, inHi = b.hasText ? b.avgChars / 2 : 3000;
  const lo = pages * (inLo * pin + 300 * pout) / 1e6, hi = pages * (inHi * pin + 900 * pout) / 1e6;
  const parts = Math.ceil(pages / (b.kind === "pdf" ? PDF_PAGES_PER_PART : IMG_PAGES_PER_PART));
  const minutes = Math.max(1, Math.round((parts / CONCURRENCY) * 0.75));
  return { pages, lo, hi, minutes };
}
function estimateHtml(b) {
  const est = estimate(b);
  if (b.mode !== "ai") return "";
  return `<div class="estimate">
    <div><span class="meta">${h(t("pages_to_read"))}</span><strong>${est.pages}</strong></div>
    <div><span class="meta">${h(t("est_cost"))}</span><strong>${money(est.lo)} – ${money(est.hi)}</strong></div>
    <div><span class="meta">${h(t("est_time"))}</span><strong>${h(t("about_min", { n: est.minutes }))}</strong></div>
  </div><p class="meta">${h(t("est_note"))}</p>`;
}
const money = (n) => (n < 0.01 ? "<$0.01" : "$" + (n < 10 ? n.toFixed(2) : n.toFixed(0)));

export function viewBook(id) {
  const b = bookById(id);
  if (!b) return `<div class="page"><div class="empty"><p>${h(t("book_not_found"))}</p><a class="btn" href="#/books">${h(t("recipe_books"))}</a></div></div>`;
  if (b.status === "running" && !isRunning(b.id)) b.status = "paused";
  if (b.status === "fixing" && !isRunning(b.id)) b.status = "done";
  const aiOk = aiAvailable();
  const pr = bookProgress(b);
  const pending = b.session.items.length;
  const head = `<a class="back" href="#/books">${icon("chevron-left")} ${h(t("recipe_books"))}</a>
    <header class="book-head">
      <div class="book-cover book-cover-lg">${b.cover ? `<img src="${h(b.cover)}" alt="">` : icon("book", "ic-xl")}</div>
      <div><p class="eyebrow">${h(t("recipe_book"))}</p><h1>${h(b.title)}</h1>
        <p class="lead">${[b.author, t("n_pages", { n: b.pages }), b.kind === "images" ? t("book_photos") : "PDF"].filter(Boolean).map(h).join(" · ")}</p>
        ${statusText(b)}</div>
    </header>`;

  if (b.status === "setup") {
    const est = estimate(b);
    return `<div class="page">${head}
      <form class="form panel" id="book-setup">
        <h2>${icon("settings-2")} ${h(t("book_how_read"))}</h2>
        ${!aiOk ? `<div class="notice notice-amber">${icon("info")}<div><p>${h(t("book_needs_key"))}</p><p><a href="#/profile">${h(t("open_settings"))}</a></p></div></div>` : ""}
        <fieldset class="field"><legend>${h(t("book_reader"))}</legend><div class="opt-list">
          <label class="opt"><input type="radio" name="mode" value="ai" ${b.mode === "ai" ? "checked" : ""} ${aiOk ? "" : "disabled"}><span>${h(t("book_mode_ai"))}<small>${h(b.hasText ? t("book_mode_ai_text") : t("book_mode_ai_sub"))}</small></span></label>
          <label class="opt"><input type="radio" name="mode" value="local" ${b.mode === "local" ? "checked" : ""} ${b.kind === "pdf" ? "" : "disabled"}><span>${h(t("book_mode_local"))}${b.hasText ? ` <em class="tag-opt">${h(t("recommended"))}</em>` : ""}<small>${h(b.hasText ? t("book_mode_local_text") : t("book_mode_local_sub"))}</small></span></label>
        </div></fieldset>
        <div class="grid-3">
          <label class="field"><span>${h(t("from_page"))}</span><input name="from" inputmode="numeric" value="${b.from}"></label>
          <label class="field"><span>${h(t("to_page"))}</span><input name="to" inputmode="numeric" value="${b.to}"></label>
          <label class="field"><span>${h(t("model"))}</span><select name="model" ${b.mode === "ai" ? "" : "disabled"}>
            ${[["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5"]].map(([v, l]) => `<option value="${v}" ${b.model === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        </div>
        <p class="meta">${h(t("page_range_help"))}</p>
        <label class="opt"><input type="checkbox" name="usePhotos" ${b.usePhotos ? "checked" : ""}><span>${h(t("book_use_photos"))}<small>${h(t("book_use_photos_sub"))}</small></span></label>
        <div id="book-est">${estimateHtml(b)}</div>
        <div class="row-between">
          <button type="button" class="btn btn-danger-ghost" data-act="book-delete" data-id="${b.id}">${icon("trash-2")} ${h(t("delete_book"))}</button>
          <button class="btn btn-primary btn-lg" id="book-start">${icon("book-open-check")} <span>${h(t("book_start", { n: est.pages }))}</span></button>
        </div>
      </form></div>`;
  }

  const running = isRunning(b.id) && b.status !== "fixing";
  const errs = b.chunks.filter((c) => c.status === "error");
  const coll = b.collectionId && S.state.collections.find((c) => c.id === b.collectionId);
  return `<div class="page">${head}
    <section class="panel">
      <div class="progress-head"><h2>${h(running ? t("book_reading") : b.status === "paused" ? t("book_paused") : t("book_finished"))}</h2>
        <span class="meta">${h(t("pages_x_of_y", { x: pr.done, y: pr.total }))}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct}"><span style="width:${pr.pct}%"></span></div>
      <dl class="estimate">
        <div><dt class="meta">${h(t("recipes_found"))}</dt><dd><strong>${b.session.items.filter((it) => !it.notRecipe && !it.repeat).length + (b.saved || 0)}</strong></dd></div>
        <div><dt class="meta">${h(t("waiting_review"))}</dt><dd><strong>${pending}</strong></dd></div>
        <div><dt class="meta">${h(t("saved_to_cookbook"))}</dt><dd><strong>${b.saved || 0}</strong></dd></div>
        ${b.mode === "ai" ? `<div><dt class="meta">${h(t("cost_so_far"))}</dt><dd><strong>${money(b.usage.cost)}</strong></dd></div>` : ""}
      </dl>
      ${running ? `<p class="meta">${icon("info")} ${h(t("book_keep_open"))}</p>` : ""}
      <div class="row wrap">
        ${running ? `<button class="btn" data-act="book-pause" data-id="${b.id}">${icon("pause")} ${h(t("pause"))}</button>` : ""}
        ${!running && b.status === "paused" ? `<button class="btn btn-primary" data-act="book-run" data-id="${b.id}">${icon("play")} ${h(t("resume"))}</button>` : ""}
        ${!running && b.status === "done" && errs.length ? `<button class="btn btn-primary" data-act="book-run" data-id="${b.id}">${icon("rotate-ccw")} ${h(t("retry_failed", { n: errs.length }))}</button>` : ""}
        ${pending ? `<a class="btn ${running || errs.length ? "" : "btn-primary"}" href="#/book/${b.id}/review">${icon("list-checks")} ${h(t("review_n", { n: pending }))}</a>` : ""}
        ${coll && b.saved ? `<a class="btn" href="#/recipes" data-act="lib-open-coll" data-v="${coll.id}">${icon("book-open")} ${h(t("open_in_cookbook"))}</a>` : ""}
      </div>
    </section>

    ${fixPanel(b, aiOk, running)}
    <details class="panel parts-panel" ${running || errs.length || b.chunks.length <= 12 ? "open" : ""}>
      <summary><h2>${icon("layers")} ${h(t("book_parts"))} <span class="n">${b.chunks.length}</span></h2></summary>
      <ol class="parts">${b.chunks.map((c) => `<li class="part part-${c.status}">
        <span class="part-pages">${h(c.from === c.to ? t("page_n", { n: c.from }) : t("pages_range", { a: c.from, b: c.to }))}</span>
        <span class="status ${{ done: "st-green", running: "st-amber", pending: "st-muted", error: "st-red" }[c.status]}">
          ${icon({ done: "circle-check", running: "loader", pending: "circle-dashed", error: "circle-alert" }[c.status], c.status === "running" ? "spin" : "")}
          ${h(c.status === "done" ? t("n_recipes_short", { n: c.found }) : c.status === "error" ? c.error || t("ai_failed") : t("part_" + c.status))}</span>
        ${c.note ? `<small class="meta">${h(c.note)}</small>` : ""}
      </li>`).join("")}</ol>
    </details>

    <div class="row-between">
      <button class="btn btn-danger-ghost" data-act="book-delete" data-id="${b.id}" ${running ? "disabled" : ""}>${icon("trash-2")} ${h(t("delete_book"))}</button>
      ${!running && b.status === "done" ? `<button class="btn" data-act="book-reread" data-id="${b.id}">${icon("refresh-cw")} ${h(t("book_reread"))}</button>` : ""}
    </div>
  </div>`;
}

function fixPanel(b, aiOk, running) {
  if (b.status === "fixing" && isRunning(b.id)) {
    const pct = b.fix.total ? Math.round((b.fix.done / b.fix.total) * 100) : 0;
    return `<section class="panel"><h2>${icon("wand")} ${h(t("fixing_title"))}</h2>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <p class="meta">${h(t("fixing_n", { a: b.fix.done, b: b.fix.total }))} · ${h(t("cost_so_far"))}: ${money(b.usage.cost)}</p>
      <button class="btn" data-act="book-pause" data-id="${b.id}">${icon("pause")} ${h(t("pause"))}</button></section>`;
  }
  if (running || b.status !== "done") return "";
  const est = fixEstimate(b);
  const notR = b.session.items.filter((it) => it.notRecipe).length;
  const rep = b.session.items.filter((it) => it.repeat).length;
  if (!est.n && !notR && !rep && !b.fix?.failed) return "";
  return `<section class="panel">
    <h2>${icon("list-checks")} ${h(t("what_reader_found"))}</h2>
    <ul class="found-list">
      <li>${icon("circle-check", "st-green")} ${h(t("found_complete", { n: b.session.items.filter((it) => !it.notRecipe && !it.repeat && it.draft.ingredients.length && it.draft.steps.length).length }))}</li>
      ${est.n ? `<li>${icon("circle-alert", "st-amber")} ${h(t("found_incomplete", { n: est.n }))}</li>` : ""}
      ${notR ? `<li>${icon("ban", "st-muted")} ${h(t("found_not_recipes", { n: notR }))}</li>` : ""}
      ${rep ? `<li>${icon("copy", "st-muted")} ${h(t("found_repeats", { n: rep }))}</li>` : ""}
      ${b.fix?.failed ? `<li>${icon("circle-x", "st-red")} ${h(t("fix_failed_n", { n: b.fix.failed }))}${b.fix.error ? " · " + h(b.fix.error) : ""}</li>` : ""}
    </ul>
    ${est.n ? (aiOk ? `<div class="row wrap"><button class="btn btn-primary" data-act="book-fix" data-id="${b.id}">${icon("wand")} ${h(t("fix_with_claude", { n: est.n }))}</button><span class="meta">${h(t("fix_cost", { c: money(est.cost) }))}</span></div>`
      : `<p class="meta">${h(t("fix_needs_key"))} <a href="#/profile">${h(t("open_settings"))}</a></p>`) : ""}
  </section>`;
}

export function bindBook(root, rr, id) {
  const form = root.querySelector("#book-setup");
  if (!form) return;
  const b = bookById(id);
  const sync = () => {
    const f = form.elements;
    b.mode = form.querySelector("input[name=mode]:checked")?.value || b.mode;
    b.from = Math.max(1, Math.min(b.pages, parseInt(f.from.value) || 1));
    b.to = Math.max(b.from, Math.min(b.pages, parseInt(f.to.value) || b.pages));
    if (f.model) b.model = f.model.value;
    b.usePhotos = !!f.usePhotos?.checked;
  };
  // Text fields update the estimate in place; re-rendering here would swallow a click on Start.
  form.addEventListener("input", (e) => {
    if (!e.target.matches("input[name=from], input[name=to]")) return;
    sync(); save();
    form.querySelector("#book-est").innerHTML = estimateHtml(b);
    form.querySelector("#book-start span").textContent = t("book_start", { n: estimate(b).pages });
  });
  form.addEventListener("change", (e) => {
    sync(); save();
    if (e.target.matches("input[type=radio], input[type=checkbox], select")) rr();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault(); sync();
    planChunks(b);
    save();
    startBook(b.id);
    rr();
  });
}

export const bookActions = {
  "book-run": (el, rr) => { startBook(el.dataset.id); rr(); },
  "book-pause": (el, rr) => { pauseBook(el.dataset.id); rr(); },
  "book-fix": (el, rr) => { fixBook(el.dataset.id); rr(); },
  "book-reread": async (el, rr) => {
    const b = bookById(el.dataset.id);
    if (!(await confirmDialog(t("book_reread_q")))) return;
    b.chunks = []; b.status = "setup"; b.session.items = []; b.session.problems = "";
    save(); rr();
  },
  "book-delete": async (el) => {
    const b = bookById(el.dataset.id);
    if (!(await confirmDialog(t("delete_book_q", { x: b.title }), { danger: true, ok: t("delete_book") }))) return;
    pauseBook(b.id);
    for (const fid of b.fileIds) { await fileDel(fid).catch(() => {}); }
    S.state.files = S.state.files.filter((f) => !b.fileIds.includes(f.id));
    S.state.books = books().filter((x) => x.id !== b.id);
    pdfCache.delete(b.id);
    save(); go("#/books");
  },
};

window.addEventListener("beforeunload", (e) => { if (anyRunning()) { e.preventDefault(); e.returnValue = ""; } });
