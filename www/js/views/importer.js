// Recipe import center: social links, websites, PDF/DOC/DOCX, images, pasted text.
// Every extracted recipe goes through a review step before it is saved.
import { S, t, h, icon, save, toast, go, uid, fileToBase64, openSheet, iname, refreshIcons, confirmDialog, aiAvailable, hooks } from "../core.js";
import { extractPdf, extractDocx, extractDoc, findRecipes, classifyUrl, recipeFromHtml, detectLang, pdfPageCount } from "../parser.js";
import { createBook } from "./books.js";
import { extractWithAI, aiErrorKey } from "../ai.js";
import { fileSet } from "../db.js";
import { norm } from "../engine.js";
import { blankRecipe, editorForm, bindEditor, readEditor, validRecipe, finalizeRecipe } from "./recipes.js";

const MAX_FILE_MB = 30;
const ui = { mode: null, busy: false, status: "", error: "" };

const aiReady = () => aiAvailable();

export function viewImport(sub) {
  if (sub === "review") return viewReview();
  if (sub?.startsWith("edit-")) return viewReviewEdit(+sub.slice(5));
  if (!ui.mode) ui.mode = "social";
  const chip = (mode, ic, label) => `<button class="chip ${ui.mode === mode ? "on" : ""}" data-act="imp-mode" data-v="${mode}">${icon(ic)} ${h(label)}</button>`;
  return `<div class="page page-narrow">
    <div class="back-row"><a class="circle-btn sm" href="#/recipes" aria-label="${h(t("back"))}">${icon("chevron-left")}</a><h1>${h(t("import_a_recipe"))}</h1></div>
    <div class="seg seg-full seg-lg" role="tablist" style="margin-bottom:12px">
      <button class="${ui.mode === "social" ? "on" : ""}" data-act="imp-mode" data-v="social">${h(t("video_link_tab"))}</button>
      <button class="${ui.mode === "file" ? "on" : ""}" data-act="imp-mode" data-v="file">${h(t("pdf_or_word"))}</button>
    </div>
    <div class="chips" style="margin-bottom:16px">
      ${chip("website", "globe", t("website"))}
      ${chip("image", "camera", t("photo_screenshot"))}
      ${chip("text", "clipboard", t("paste_text"))}
      <a class="chip" href="#/recipe/new">${icon("pencil")} ${h(t("write"))}</a>
    </div>
    <div id="imp-panel">${panel()}</div>
    <a class="imp-book" href="#/book/new" style="margin-top:16px">${icon("library", "ic-lg")}<span><strong>${h(t("recipe_book"))}</strong><small>${h(t("recipe_book_sub"))}</small></span>${icon("arrow-right")}</a>
    ${S.state.importSession?.items?.length ? `<p class="meta"><a href="#/import/review">${icon("history")} ${h(t("resume_review", { n: S.state.importSession.items.length }))}</a></p>` : ""}
  </div>`;
}

function aiToggle() {
  if (!S.state.settings.apiKey && !hooks.cloudReady()) return `<p class="meta">${icon("info")} ${h(t("ai_optional_note"))} <a href="#/profile">${h(t("open_settings"))}</a></p>`;
  if (!S.state.settings.aiConsent) return `<p class="meta">${icon("info")} ${h(t("ai_consent_needed"))} <a href="#/profile">${h(t("open_settings"))}</a></p>`;
  return `<label class="opt"><input type="checkbox" id="use-ai" checked><span>${h(t("use_claude"))}<small>${h(t("use_claude_sub"))}</small></span></label>`;
}

function panel() {
  if (ui.busy) return `<section class="panel processing" aria-live="polite"><div class="spinner" aria-hidden="true"></div><p><strong>${h(ui.status || t("processing"))}</strong></p><p class="meta">${h(t("processing_note"))}</p></section>`;
  const err = ui.error ? `<p class="form-error" role="alert">${icon("circle-alert")} ${h(ui.error)}</p>` : "";
  switch (ui.mode) {
    case "social": return `<section>
      <form class="form" id="imp-form">
        <label class="url-field">${icon("link")}<span class="sr-only">${h(t("video_link"))}</span><input name="url" type="url" required placeholder="tiktok.com/@… · instagram.com/reel/…"><button class="btn btn-primary">${h(t("import"))}</button></label>
        <label class="field"><span>${h(t("caption_text"))}</span><textarea name="text" rows="6" placeholder="${h(t("caption_ph"))}"></textarea></label>
        <p class="meta">${h(t("social_note"))}</p>
        ${aiToggle()}${err}
      </form></section>`;
    case "website": return `<section class="panel"><h2>${h(t("website"))}</h2>
      <form class="form" id="imp-form">
        <label class="field"><span>${h(t("recipe_url"))}</span><input name="url" type="url" required placeholder="https://"></label>
        <label class="field"><span>${h(t("page_text_optional"))}</span><textarea name="text" rows="4" placeholder="${h(t("page_text_ph"))}"></textarea></label>
        ${aiToggle()}${err}
        <div class="row-end"><button class="btn btn-primary">${icon("arrow-right")} ${h(t("extract"))}</button></div>
      </form></section>`;
    case "file": return `<section class="panel">
      <form class="form" id="imp-form">
        <label class="drop" id="drop">
          ${icon("upload", "ic-xl")}
          <strong>${h(t("drop_title"))}</strong>
          <small>${h(t("drop_sub", { mb: MAX_FILE_MB }))}</small>
          <input type="file" name="files" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple required>
          <span id="file-names" class="meta"></span>
        </label>
        ${aiToggle()}
        <p class="meta">${h(t("file_note"))}</p>${err}
        <div class="row-end"><button class="btn btn-primary">${icon("arrow-right")} ${h(t("read_file"))}</button></div>
      </form></section>`;
    case "image": return `<section class="panel"><h2>${h(t("photo_screenshot"))}</h2>
      <form class="form" id="imp-form">
        <label class="drop" id="drop">
          ${icon("image", "ic-xl")}<strong>${h(t("drop_images"))}</strong><small>JPG · PNG · WEBP</small>
          <input type="file" name="files" accept="image/*" multiple required><span id="file-names" class="meta"></span>
        </label>
        ${aiReady() ? `<p class="meta">${h(t("image_ai_note"))}</p>` : `<p class="form-error">${icon("info")} ${h(t("image_needs_ai"))} <a href="#/profile">${h(t("open_settings"))}</a></p>`}${err}
        <div class="row-end"><button class="btn btn-primary" ${aiReady() ? "" : "disabled"}>${icon("arrow-right")} ${h(t("extract"))}</button></div>
      </form></section>`;
    case "text": return `<section class="panel"><h2>${h(t("paste_text"))}</h2>
      <form class="form" id="imp-form">
        <label class="field"><span>${h(t("recipe_text"))}</span><textarea name="text" rows="12" required placeholder="${h(t("paste_text_ph"))}"></textarea></label>
        ${aiToggle()}${err}
        <div class="row-end"><button class="btn btn-primary">${icon("arrow-right")} ${h(t("extract"))}</button></div>
      </form></section>`;
    default: return "";
  }
}

export const importActions = {
  "imp-mode": (el, rr) => { ui.mode = el.dataset.v; ui.error = ""; rr(); },
  "rv-all": (el, rr) => { for (const it of reviewCtx().sess.items) it.include = el.dataset.v === "1"; save(); rr(); },
  "rv-toggle": (el, rr) => { const it = reviewCtx().sess.items[+el.dataset.k]; it.include = !it.include; save(); rr(); },
  "rv-filter": (el, rr) => { rvState.filter = el.dataset.v; rvState.page = 0; rr(); },
  "rv-page": (el, rr) => { rvState.page = Math.max(0, +el.dataset.v); rr(); window.scrollTo(0, 0); },
  "rv-save": () => saveSelected(),
  "rv-discard": async () => {
    const { sess, base, book } = reviewCtx();
    if (sess.items.length > 3 && !(await confirmDialog(t("discard_q", { n: sess.items.length }), { danger: true, ok: t("discard_all") }))) return;
    if (book) sess.items = []; else S.state.importSession = null;
    save(); go(base);
  },
  "rv-manual": () => {
    const { sess: s, base, book } = reviewCtx();
    const source = book ? { type: "book", fileId: book.fileIds?.[0], fileName: book.title, page: null } : s.source;
    s.items.push({ id: uid(), draft: { ...blankRecipe(), source, ingredients: [], steps: [] }, include: true });
    save(); go(base + "/edit-" + (s.items.length - 1));
  },
};

export function bindImport(root, rr) {
  const rq = root.querySelector("#rv-q");
  rq?.addEventListener("input", () => { rvState.q = rq.value; rvState.page = 0; rr({ keepFocus: "#rv-q" }); });
  const form = root.querySelector("#imp-form");
  if (form) {
    const fileInput = form.querySelector('input[type=file]');
    if (fileInput) {
      const drop = root.querySelector("#drop");
      const show = () => root.querySelector("#file-names").textContent = [...fileInput.files].map((f) => f.name).join(", ");
      fileInput.addEventListener("change", show);
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); fileInput.files = e.dataTransfer.files; show(); });
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); runImport(form, rr); });
  }
  const ed = root.querySelector("#editor");
  if (ed && root.querySelector("[data-review-edit]")) {
    const k = +root.querySelector("[data-review-edit]").dataset.reviewEdit;
    const { sess, base } = reviewCtx();
    const it = sess.items[k];
    bindEditor(root, rr, {
      getDraft: () => it.draft,
      onSave: (d) => { it.draft = d; it.include = true; it.reviewed = true; save(); go(base + "/review"); },
    });
    root.querySelectorAll("[data-back-review]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); readEditor(ed, it.draft); save(); go(base + "/review"); }));
  }
}

/* ---------- running an import ---------- */
async function runImport(form, rr) {
  const useAI = !!form.querySelector("#use-ai")?.checked || (ui.mode === "image" && aiReady());
  const setStatus = (s) => { ui.status = s; const p = document.querySelector("#imp-panel"); if (p) { p.innerHTML = panel(); refreshIcons(p); } };
  ui.error = ""; ui.busy = true; setStatus(t("processing"));
  try {
    let recipes = [], source = {}, problems = "";
    const url = form.url?.value.trim();
    const text = form.text?.value.trim();
    if (ui.mode === "social") {
      const kind = classifyUrl(url);
      if (!kind) throw new Error(t("bad_url"));
      source = { type: kind === "website" ? "website" : kind, url };
      if (useAI) {
        setStatus(t("reading_link"));
        ({ recipes, problems } = await extractWithAI(S.state.settings, { kind: "url", url, text }));
      } else if (text) recipes = findRecipes(text);
      if (!recipes.length) {
        problems = problems || (text ? t("no_recipe_in_text") : t("social_no_text"));
        recipes = [{ ...blankRecipe(), title: "", description: text ? text.slice(0, 400) : "", ingredients: [], steps: [], confidence: "empty" }];
      }
    } else if (ui.mode === "website") {
      if (!classifyUrl(url)) throw new Error(t("bad_url"));
      source = { type: "website", url };
      setStatus(t("reading_link"));
      let html = null;
      try {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) html = await res.text();
      } catch { /* blocked by the site (CORS) */ }
      if (html) recipes = recipeFromHtml(html, url);
      if (!recipes.length && useAI) ({ recipes, problems } = await extractWithAI(S.state.settings, { kind: "url", url, text }));
      if (!recipes.length && text) recipes = findRecipes(text);
      if (!recipes.length) throw new Error(useAI ? (problems || t("site_failed")) : t("site_blocked"));
    } else if (ui.mode === "text") {
      source = { type: "text" };
      if (useAI) { setStatus(t("extracting")); ({ recipes, problems } = await extractWithAI(S.state.settings, { kind: "text", text })); }
      else recipes = findRecipes(text);
      if (!recipes.length) throw new Error(t("no_recipe_in_text"));
    } else if (ui.mode === "file" || ui.mode === "image") {
      const files = [...form.files.files];
      if (!files.length) throw new Error(t("choose_file"));
      // A whole cookbook is read page by page in the recipe book reader instead.
      if (files.length === 1 && /\.pdf$/i.test(files[0].name)) {
        const n = await pdfPageCount(await files[0].arrayBuffer()).catch(() => 0);
        if (n > 40) {
          setStatus(t("big_pdf_to_book", { n }));
          const book = await createBook({ files, title: files[0].name.replace(/\.pdf$/i, "") });
          ui.busy = false; ui.mode = null;
          toast(t("big_pdf_to_book", { n }));
          return go("#/book/" + book.id);
        }
      }
      const all = [];
      const notes = [];
      const images = [];
      for (const file of files) {
        if (file.size > MAX_FILE_MB * 1024 * 1024) { notes.push(t("file_too_big", { f: file.name, mb: MAX_FILE_MB })); continue; }
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        const type = file.type.startsWith("image/") ? "image" : ext;
        if (!["pdf", "doc", "docx", "image"].includes(type)) { notes.push(t("unsupported_file", { f: file.name })); continue; }
        const fileId = uid();
        await fileSet(fileId, { name: file.name, type: file.type, blob: file, added: new Date().toISOString() });
        const meta = { id: fileId, name: file.name, type, size: file.size, added: new Date().toISOString(), status: "processing" };
        S.state.files.push(meta);
        const src = { type, fileId, fileName: file.name };
        setStatus(t("reading_file", { f: file.name }));
        let found = [];
        if (type === "pdf") {
          const buf = await file.arrayBuffer();
          let parsed = null;
          try { parsed = await extractPdf(buf.slice(0)); meta.pages = parsed.pageCount; } catch { notes.push(t("pdf_unreadable", { f: file.name })); }
          if (useAI) {
            setStatus(t("extracting_file", { f: file.name }));
            const r = await extractWithAI(S.state.settings, { kind: "pdf", base64: await fileToBase64(file) });
            found = r.recipes; if (r.problems) notes.push(file.name + ": " + r.problems);
          } else if (parsed) {
            if (parsed.scanned) notes.push(t("pdf_scanned", { f: file.name }));
            found = findRecipes(parsed.pages);
          }
        } else if (type === "docx" || type === "doc") {
          const buf = await file.arrayBuffer();
          let txt = "";
          try { txt = type === "docx" ? await extractDocx(buf) : extractDoc(buf); } catch { notes.push(t("doc_unreadable", { f: file.name })); }
          if (type === "doc") notes.push(t("doc_best_effort", { f: file.name }));
          if (txt && useAI) {
            setStatus(t("extracting_file", { f: file.name }));
            const r = await extractWithAI(S.state.settings, { kind: "text", text: txt });
            found = r.recipes; if (r.problems) notes.push(file.name + ": " + r.problems);
          } else if (txt) found = findRecipes(txt);
        } else if (type === "image") {
          images.push({ file, src });
          meta.status = "done";
          continue;
        }
        meta.status = found.length ? "done" : "empty";
        meta.recipes = found.length;
        if (!found.length) notes.push(t("no_recipes_in_file", { f: file.name }));
        all.push(...found.map((r) => ({ ...r, _src: src })));
      }
      if (images.length) {
        setStatus(t("extracting"));
        const imgs = [];
        for (const { file } of images) imgs.push({ mediaType: file.type || "image/jpeg", base64: await fileToBase64(file) });
        const r = await extractWithAI(S.state.settings, { kind: "images", images: imgs });
        if (r.problems) notes.push(r.problems);
        all.push(...r.recipes.map((x) => ({ ...x, _src: images[0].src })));
      }
      recipes = all; problems = notes.join("\n");
      source = { type: ui.mode === "image" ? "image" : "file" };
      if (!recipes.length) throw new Error(problems || t("no_recipe_in_text"));
    }
    startReview(recipes, source, problems);
    ui.busy = false; ui.mode = null;
    save(); go("#/import/review");
  } catch (e) {
    ui.busy = false;
    ui.error = e?.status || ["NO_KEY", "REFUSED", "TOO_LONG"].includes(e?.message) ? t(aiErrorKey(e)) : (e?.message || t("import_failed"));
    console.error(e);
    save(); rr();
  }
}

/** Turn an extracted recipe into a review item (draft + flags). */
export function makeItem(r, source) {
  const src = r._src ? { ...r._src, page: r.sourcePage ?? null } : { ...source, page: r.sourcePage ?? null };
  const d = {
    ...blankRecipe(), title: r.title || "", description: r.description || "", servings: r.servings ?? null,
    prepTime: r.prepTime ?? null, cookTime: r.cookTime ?? null, cuisine: r.cuisine || "", category: r.category || "dinner",
    difficulty: "", image: r.image && r.image.startsWith("data:") ? r.image : "", imageUrl: r.image && !r.image.startsWith("data:") ? r.image : "",
    ingredients: r.ingredients || [], steps: r.steps || [], source: src,
    language: r.language || detectLang([r.title, ...(r.ingredients || []).map((i) => i.name), ...(r.steps || []).map((s) => s.text)].join(" ")),
  };
  if (r.url && !src.url) d.source.url = r.url;
  if (r.tags?.length) d.tags = r.tags;
  const dupOf = findDuplicate(d);
  const item = { id: uid(), draft: d, include: !!(d.title && d.ingredients.length) && !dupOf && !r.notRecipe, confidence: r.confidence, dupOf };
  if (r.notRecipe) item.notRecipe = true;
  if (r.raw) item.raw = r.raw;
  return item;
}

function startReview(recipes, source, problems) {
  const items = recipes.map((r) => makeItem(r, source));
  S.state.importSession = { items, source, problems, at: new Date().toISOString() };
}

let dupIndex = null, dupKey = "";
export function findDuplicate(d) {
  const key = S.state.recipes.length + ":" + (S.state.recipes[0]?.id || "");
  if (key !== dupKey) {
    dupIndex = new Map();
    for (const r of S.state.recipes) { dupIndex.set("t:" + norm(r.title), r.id); if (r.source?.url) dupIndex.set("u:" + r.source.url, r.id); }
    dupKey = key;
  }
  return (d.source?.url && dupIndex.get("u:" + d.source.url)) || (d.title && dupIndex.get("t:" + norm(d.title))) || null;
}

/* ---------- review (shared by normal imports and recipe books) ---------- */
/** The review session for the current screen: a recipe book's, or the last import's. */
export function reviewCtx() {
  const m = location.hash.match(/^#\/book\/([^/?]+)/);
  if (m) {
    const book = S.state.books?.find((b) => b.id === m[1]);
    return { sess: book?.session, base: "#/book/" + m[1], book };
  }
  return { sess: S.state.importSession, base: "#/import", book: null };
}
const rvState = { filter: "all", q: "", page: 0 };
const RV_PAGE = 50;
function needsAttention(it) {
  const d = it.draft;
  return !it.notRecipe && !it.repeat && (!d.title || !d.ingredients.length || !d.steps.length || it.dupOf);
}

export function viewReview() {
  const { sess: s, base, book } = reviewCtx();
  if (!s?.items?.length) return `<div class="page"><a class="back" href="${base}">${icon("chevron-left")} ${h(t("back"))}</a><div class="empty"><p>${h(t("nothing_to_review"))}</p></div></div>`;
  const sel = s.items.filter((i) => i.include).length;
  const att = s.items.filter(needsAttention).length;
  let shown = s.items.map((it, k) => ({ it, k }));
  if (rvState.filter === "attention") shown = shown.filter(({ it }) => needsAttention(it));
  if (rvState.filter === "skipped") shown = shown.filter(({ it }) => it.notRecipe || it.repeat || it.dupOf);
  if (rvState.filter === "selected") shown = shown.filter(({ it }) => it.include);
  const q = norm(rvState.q);
  if (q) shown = shown.filter(({ it }) => norm(it.draft.title).includes(q) || it.draft.ingredients.some((i) => norm(i.name).includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / RV_PAGE));
  if (rvState.page >= pages) rvState.page = pages - 1;
  const total = shown.length;
  shown = shown.slice(rvState.page * RV_PAGE, (rvState.page + 1) * RV_PAGE);
  const skipped = s.items.filter((it) => it.notRecipe || it.repeat || it.dupOf).length;
  const pager = pages > 1 ? `<div class="pager"><button class="btn btn-sm" data-act="rv-page" data-v="${rvState.page - 1}" ${rvState.page ? "" : "disabled"}>${icon("chevron-left")}</button>
    <span class="meta">${h(t("showing_x_y_of_n", { x: rvState.page * RV_PAGE + 1, y: Math.min(total, (rvState.page + 1) * RV_PAGE), n: total }))}</span>
    <button class="btn btn-sm" data-act="rv-page" data-v="${rvState.page + 1}" ${rvState.page < pages - 1 ? "" : "disabled"}>${icon("chevron-right")}</button></div>` : "";
  if (book) shown.sort((a, b) => (a.it.draft.source?.page ?? 1e9) - (b.it.draft.source?.page ?? 1e9));
  return `<div class="page">
    <a class="back" href="${base}">${icon("chevron-left")} ${h(book ? book.title : t("import"))}</a>
    <header class="page-head"><div><p class="eyebrow">${h(t("review"))}</p><h1>${h(s.items.length === 1 ? t("one_recipe_found") : t("n_recipes_found", { n: s.items.length }))}</h1>
      <p class="lead">${h(book ? t("book_review_sub") : t("review_sub"))}</p></div></header>
    ${book && book.status === "running" ? `<div class="notice">${icon("loader")}<div><p>${h(t("book_still_reading"))}</p></div></div>` : ""}
    ${s.problems ? `<div class="notice notice-amber">${icon("triangle-alert")}<div>${s.problems.split("\n").map((p) => `<p>${h(p)}</p>`).join("")}</div></div>` : ""}
    <div class="row wrap">
      <button class="btn btn-sm" data-act="rv-all" data-v="1">${h(t("select_all"))}</button><button class="btn btn-sm" data-act="rv-all" data-v="0">${h(t("select_none"))}</button>
      <button class="btn btn-sm" data-act="rv-manual">${icon("plus")} ${h(t("add_missed_recipe"))}</button>
      ${s.items.length > 4 ? `<div class="seg" role="group"><button class="${rvState.filter === "all" ? "on" : ""}" data-act="rv-filter" data-v="all">${h(t("all"))} (${s.items.length})</button><button class="${rvState.filter === "selected" ? "on" : ""}" data-act="rv-filter" data-v="selected">${h(t("selected"))} (${sel})</button><button class="${rvState.filter === "attention" ? "on" : ""}" data-act="rv-filter" data-v="attention">${h(t("needs_check"))} (${att})</button>${skipped ? `<button class="${rvState.filter === "skipped" ? "on" : ""}" data-act="rv-filter" data-v="skipped">${h(t("skipped"))} (${skipped})</button>` : ""}</div>` : ""}
    </div>
    ${s.items.length > 20 ? `<label class="search rv-search">${icon("search")}<input type="search" id="rv-q" value="${h(rvState.q)}" placeholder="${h(t("search_recipes_ph"))}" aria-label="${h(t("search"))}"></label>` : ""}
    ${pager}
    <ul class="review-list">
      ${shown.map(({ it, k }) => {
        const d = it.draft;
        const unc = d.ingredients.filter((i) => i.uncertain || !i.ingredientId).length;
        const noQty = d.ingredients.filter((i) => i.qty == null && i.essential !== false).length;
        const dup = it.dupOf && S.state.recipes.find((r) => r.id === it.dupOf);
        return `<li class="review-item ${it.include ? "on" : ""} ${d.image ? "has-img" : ""}">
          <label class="check check-lg"><input type="checkbox" data-act="rv-toggle" data-k="${k}" ${it.include ? "checked" : ""} aria-label="${h(t("include_recipe"))}"><span></span></label>
          <div class="ri-body">
            ${d.image ? `<img class="ri-thumb" src="${h(d.image)}" alt="" loading="lazy">` : ""}
            <h3>${h(d.title || t("untitled"))}</h3>
            <p class="meta">${[d.source?.page ? t("page_n", { n: d.source.page }) : "", t("n_ingredients", { n: d.ingredients.length }), t("n_steps", { n: d.steps.length }), d.servings ? t("n_servings", { n: d.servings }) : "", book ? "" : d.source?.fileName || ""].filter(Boolean).map(h).join(" · ")}</p>
            <div class="flags">
              ${it.repeat ? `<span class="status st-muted">${icon("copy")} ${h(t("repeat_in_book"))}</span>` : ""}
              ${it.notRecipe ? `<span class="status st-muted">${icon("ban")} ${h(t("not_a_recipe"))}</span>` : ""}
              ${it.aiFixed ? `<span class="status st-green">${icon("sparkle")} ${h(t("fixed_by_claude"))}</span>` : ""}
              ${it.reviewed ? `<span class="status st-green">${icon("circle-check")} ${h(t("reviewed"))}</span>` : ""}
              ${!d.title ? `<span class="status st-red">${icon("circle-alert")} ${h(t("needs_title"))}</span>` : ""}
              ${!d.ingredients.length ? `<span class="status st-red">${icon("circle-alert")} ${h(t("no_ingredients_found"))}</span>` : ""}
              ${unc ? `<span class="status st-amber">${icon("circle-help")} ${h(t("n_uncertain", { n: unc }))}</span>` : ""}
              ${noQty ? `<span class="status st-muted">${icon("scale")} ${h(t("n_no_qty", { n: noQty }))}</span>` : ""}
              ${dup ? `<span class="status st-amber">${icon("copy")} ${h(t("possible_duplicate", { x: dup.title }))}</span>` : ""}
            </div>
          </div>
          <a class="btn btn-sm" href="${base}/edit-${k}">${icon("pencil")} ${h(t("review_edit"))}</a>
        </li>`;
      }).join("")}
    </ul>
    ${pager}
    <div class="row-between sticky-actions">
      <button class="btn btn-danger-ghost" data-act="rv-discard">${h(book ? t("discard_unsaved") : t("discard_all"))}</button>
      <button class="btn btn-primary" data-act="rv-save" ${sel ? "" : "disabled"}>${icon("check")} ${h(t("save_selected", { n: sel }))}</button>
    </div>
  </div>`;
}

export function viewReviewEdit(k) {
  const { sess, base, book } = reviewCtx();
  const it = sess?.items?.[k];
  if (!it) return viewReview();
  const d = it.draft;
  if (!d.ingredients.length) d.ingredients.push({ name: "", ingredientId: null, qty: null, unit: "", note: "", essential: true });
  if (!d.steps.length) d.steps.push({ text: "", timer: 0 });
  return `<div class="page" data-review-edit="${k}">
    <a class="back" href="${base}/review" data-back-review>${icon("chevron-left")} ${h(t("back_to_review"))}</a>
    <h1>${h(t("review_recipe"))}</h1>
    <div class="notice">${icon("info")}<div><p>${h(t("review_edit_note"))}</p>
      ${d.source?.url ? `<p><a href="${h(d.source.url)}" target="_blank" rel="noopener noreferrer">${icon("external-link")} ${h(t("open_original"))}</a></p>` : ""}
      ${d.source?.fileId ? `<p><button class="btn-link" data-act="open-file" data-id="${h(d.source.fileId)}" data-page="${d.source.page || ""}">${icon("file-text")} ${h(book ? book.title : d.source.fileName || "")}${d.source.page ? " · " + h(t("page_n", { n: d.source.page })) : ""}</button></p>` : ""}
      ${d.imageUrl ? `<p class="meta">${h(t("web_image_note"))}</p>` : ""}</div></div>
    ${editorForm(d, "", base + "/review", { inSheet: true })}
    <div class="row-end sticky-actions"><button class="btn" data-back-review>${h(t("back"))}</button><button class="btn btn-primary" form="editor">${icon("check")} ${h(t("confirm_recipe"))}</button></div>
  </div>`;
}

function saveSelected() {
  const { sess: s, base, book } = reviewCtx();
  const chosen = s.items.filter((i) => i.include);
  const bad = chosen.find((i) => validRecipe(i.draft));
  if (bad) {
    toast(t("fix_before_save", { x: bad.draft.title || t("untitled") }), "error");
    return go(base + "/edit-" + s.items.indexOf(bad));
  }
  for (const it of chosen) {
    const d = finalizeRecipe(structuredClone(it.draft));
    d.id = uid(); d.createdAt = new Date().toISOString();
    if (book) {
      d.collections = [...new Set([...(d.collections || []), book.collectionId])];
      d.source = { ...d.source, type: "book", bookId: book.id, bookTitle: book.title };
    }
    S.state.recipes.unshift(d);
  }
  if (book) {
    s.items = s.items.filter((i) => !i.include);
    book.saved = (book.saved || 0) + chosen.length;
  } else S.state.importSession = null;
  save();
  toast(t("saved_n_recipes", { n: chosen.length }));
  go(book ? base : "#/recipes");
}
