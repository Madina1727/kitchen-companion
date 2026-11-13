// My Recipes: library, detail, editor, collections.
import {
  S, t, h, icon, save, toast, openSheet, confirmDialog, qty, minutes, recipeById, go, uid, lang,
  ingredientDatalist, resizeImage, unitLabel, catLabel, iname, dateLabel, todayISO, refreshIcons,
} from "../core.js";
import { matchRecipe, resolveIngredient, UNIT_LIST, norm, registerCustomName } from "../engine.js";
import { BY_ID } from "../catalog.js";
import { translateRecipe, aiErrorKey } from "../ai.js";
import { fileGet } from "../db.js";

export const RECIPE_CATS = ["breakfast", "lunch", "dinner", "dessert", "snack", "drink", "other"];
const SOURCE_ICON = { book: "library", manual: "pencil", tiktok: "link", instagram: "link", youtube: "link", website: "globe", pdf: "file-text", docx: "file-text", doc: "file-text", image: "image", text: "clipboard", sample: "book-open" };

export function ctx(servings) {
  const st = S.state;
  return { inventory: st.inventory, prefs: st.prefs, staples: st.prefs.staples, servings };
}

/* ---------- card ---------- */
export function recipeCover(r, cls = "") {
  if (r.image) return `<div class="cover ${cls}"><img src="${h(r.image)}" alt="" loading="lazy"></div>`;
  const tint = ["breakfast", "lunch", "dinner", "dessert", "snack", "drink"].indexOf(r.category);
  return `<div class="cover cover-type tint-${tint < 0 ? 6 : tint} ${cls}" aria-hidden="true"><span>${h((r.title || "?").trim().charAt(0).toUpperCase())}</span></div>`;
}
export function availabilityLine(m) {
  if (!m) return "";
  if (m.bucket === "blocked") {
    const b = m.blocked[0];
    return `<span class="status st-red">${icon("ban")} ${h(t("not_suitable"))}: ${h(iname(b.ri))}</span>`;
  }
  if (m.bucket === "ready") return `<span class="status st-green">${icon("circle-check")} ${h(t("all_available"))}</span>`;
  if (m.bucket === "subs") return `<span class="status st-green">${icon("repeat")} ${h(t("available_with_subs"))}</span>`;
  if (m.bucket === "short") return `<span class="status st-amber">${icon("scale")} ${h(t("not_enough_of", { x: m.short.map((r) => iname(r.ri)).join(", ") }))}</span>`;
  const n = m.missingNoSub.length;
  return `<span class="status st-amber">${icon("circle-alert")} ${h(n === 1 ? t("missing_one") : t("missing_n", { n }))}</span>`;
}
/** "100% match" / "1 missing" label used on cards. */
export function matchLabel(m) {
  if (!m || m.bucket === "blocked") return null;
  if (m.bucket === "ready") return { text: t("pct_match", { n: 100 }), cls: "" };
  if (m.bucket === "subs" || m.bucket === "short") return { text: t("pct_match", { n: Math.min(99, m.score) }), cls: "partial" };
  return { text: t("pct_match", { n: Math.min(99, m.score) }), cls: m.missingNoSub.length > 2 ? "miss" : "partial" };
}
/** One-line verdict under a recipe: what you have or what is missing. */
export function verdict(m) {
  if (!m) return "";
  if (m.bucket === "blocked") return `<p class="verdict warn">${h(t("not_suitable"))}: ${h(iname(m.blocked[0].ri))}</p>`;
  if (m.bucket === "ready") return `<p class="verdict ok">${h(m.usesExpiring ? t("uses_x_before_spoils", { x: iname(m.rows.find((r) => r.expiring).ri) }) : t("you_have_everything"))}</p>`;
  if (m.bucket === "subs") return `<p class="verdict ok">${h(t("swap_x_with_y", { x: iname(m.subs[0].ri), y: iname({ ingredientId: m.subs[0].sub.id }) }))}</p>`;
  if (m.bucket === "short") return `<p class="verdict warn">${h(t("not_enough_of", { x: m.short.map((r) => iname(r.ri)).join(", ") }))}</p>`;
  const miss = m.missingNoSub.slice(0, 2).map((x) => iname(x.ri)).join(", ") + (m.missingNoSub.length > 2 ? " +" + (m.missingNoSub.length - 2) : "");
  const sub = m.subs[0] ? " · " + t("swap_x_with_y", { x: iname(m.subs[0].ri), y: iname({ ingredientId: m.subs[0].sub.id }) }) : "";
  return `<p class="verdict warn">${h(t("missing"))}: ${h(miss)}${h(sub)}</p>`;
}
const recipeTime = (r) => (r.prepTime || 0) + (r.cookTime || 0);

export function recipeCard(r, { match, compact = false } = {}) {
  if (compact) return recipeRow(r, { match });
  const m = match ?? matchRecipe(r, ctx());
  const ml = matchLabel(m);
  const time = recipeTime(r);
  const sub = r.source?.type && !["manual", "sample"].includes(r.source.type) ? t("from_src", { x: t("src_" + r.source.type) }) : r.difficulty ? t("diff_" + r.difficulty) : r.category ? catLabel(r.category) : "";
  return `<div class="rcard-wrap"><a class="rcard" href="#/recipe/${r.id}">
    <div class="badge-wrap">${recipeCover(r)}${ml ? `<span class="match-badge ${ml.cls}">${h(ml.text)}</span>` : ""}</div>
    <div class="rcard-body">
      <h3>${h(r.title)}</h3>
      <p class="meta">${time ? icon("clock") + " " + h(minutes(time)) : ""}${time && sub ? " · " : ""}${h(sub)}</p>
      ${m.bucket !== "ready" ? verdict(m) : ""}
    </div>
    <span class="fav-mark" aria-hidden="true">${icon("heart", r.favorite ? "filled" : "")}</span>
  </a><a class="card-edit" href="#/recipe/${r.id}/edit" aria-label="${h(t("edit_recipe"))}: ${h(r.title)}" title="${h(t("edit_recipe"))}">${icon("pencil")}</a></div>`;
}
export function recipeRow(r, { match, extra = "" } = {}) {
  const m = match ?? matchRecipe(r, ctx());
  const time = recipeTime(r);
  const pct = m.bucket === "blocked" ? 0 : m.bucket === "ready" ? 100 : Math.min(99, m.score);
  return `<a class="rrow" href="#/recipe/${r.id}">
    ${recipeCover(r)}
    <div class="rrow-body">
      <h3>${h(r.title)}</h3>
      <p class="meta">${[time ? minutes(time) : "", m.bucket !== "blocked" ? t("pct_match", { n: pct }) : "", extra].filter(Boolean).map(h).join(" · ")}</p>
      ${m.bucket !== "blocked" ? `<div class="bar ${pct === 100 ? "" : "partial"}"><span style="width:${pct}%"></span></div>` : ""}
      ${verdict(m)}
    </div>
  </a>`;
}

/* ---------- library ---------- */
const lib = { q: "", cat: "all", coll: "all", sort: "recent", view: "grid", time: 0, diff: "", limit: 60 };
export function viewRecipes() {
  const st = S.state;
  let list = st.recipes.slice();
  const q = norm(lib.q);
  if (q) list = list.filter((r) => norm(r.title).includes(q) || r.ingredients.some((i) => norm(i.name).includes(q) || norm(iname(i)).includes(q) || (i.ingredientId && i.ingredientId === resolveIngredient(lib.q))) || (r.tags || []).some((tg) => norm(tg).includes(q)) || norm(r.cuisine).includes(q));
  if (lib.cat !== "all") list = list.filter((r) => r.category === lib.cat);
  if (lib.coll === "fav") list = list.filter((r) => r.favorite);
  else if (lib.coll === "imported") list = list.filter((r) => r.source?.type && !["manual", "sample"].includes(r.source.type));
  else if (lib.coll !== "all" && lib.coll !== "imported") list = list.filter((r) => (r.collections || []).includes(lib.coll));
  if (lib.time) list = list.filter((r) => ((r.prepTime || 0) + (r.cookTime || 0)) <= lib.time && (r.prepTime || r.cookTime));
  if (lib.diff) list = list.filter((r) => r.difficulty === lib.diff);
  const sorters = {
    recent: (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    az: (a, b) => a.title.localeCompare(b.title, lang()),
    time: (a, b) => ((a.prepTime || 0) + (a.cookTime || 0) || 999) - ((b.prepTime || 0) + (b.cookTime || 0) || 999),
    match: null,
  };
  let matches = new Map();
  const m = (r) => { if (!matches.has(r.id)) matches.set(r.id, matchRecipe(r, ctx())); return matches.get(r.id); };
  if (lib.sort === "match") list.sort((a, b) => m(b).score - m(a).score);
  else list.sort(sorters[lib.sort]);
  const totalCount = list.length;
  list = list.slice(0, lib.limit);
  list.forEach(m);

  const collTabs = [["all", t("all_recipes")], ["fav", t("favorites")], ...st.collections.map((c) => [c.id, c.name])];
  const imported = st.recipes.filter((r) => r.source?.type && !["manual", "sample"].includes(r.source.type)).length;
  return `<div class="page">
    <header class="page-head">
      <h1>${h(t("my_recipes"))}</h1>
      <a class="circle-btn dark" href="#/recipe/new" aria-label="${h(t("new_recipe"))}">${icon("plus")}</a>
    </header>
    <div class="seg seg-full seg-lg" role="tablist" style="margin-bottom:18px">
      <a class="on" href="#/recipes" role="tab" aria-selected="true">${h(t("nav_recipes_short"))}</a>
      <a href="#/grocery" role="tab" aria-selected="false">${h(t("grocery_list"))}</a>
    </div>
    <section class="add-card">
      <h2>${h(t("add_a_recipe"))}</h2>
      <p class="meta">${h(t("add_recipe_card_sub"))}</p>
      <div class="add-tiles">
        <a class="add-tile t-red" href="#/import?m=social">${icon("link")}<span>${h(t("paste_link"))}</span></a>
        <a class="add-tile t-amber" href="#/import?m=file">${icon("file")}<span>${h(t("pdf_word"))}</span></a>
        <a class="add-tile t-green" href="#/recipe/new">${icon("pencil")}<span>${h(t("write"))}</span></a>
        <a class="add-tile t-dark" href="#/books">${icon("library")}<span>${h(t("recipe_book"))}</span></a>
      </div>
    </section>
    <div class="chips" role="tablist" style="margin-bottom:14px">
      <button role="tab" class="chip ${lib.coll === "all" ? "on" : ""}" data-act="lib-coll" data-v="all">${h(t("all"))} ${st.recipes.length}</button>
      <button role="tab" class="chip ${lib.coll === "fav" ? "on" : ""}" data-act="lib-coll" data-v="fav">${h(t("favorites"))}</button>
      ${imported ? `<button role="tab" class="chip ${lib.coll === "imported" ? "on" : ""}" data-act="lib-coll" data-v="imported">${h(t("imported"))}</button>` : ""}
      ${st.collections.map((c) => `<button role="tab" class="chip ${lib.coll === c.id ? "on" : ""}" data-act="lib-coll" data-v="${h(c.id)}">${c.bookId ? icon("library") : ""}${h(c.name)}</button>`).join("")}
      <button class="chip" data-act="coll-new">${icon("folder-plus")} ${h(t("new_collection"))}</button>
    </div>
    <div class="search-wrap" style="margin-bottom:12px">
      <label class="search">${icon("search")}<input type="search" id="lib-q" placeholder="${h(t("search_recipes_ph"))}" value="${h(lib.q)}" aria-label="${h(t("search"))}"></label>
      <button class="filter-btn" data-act="lib-filters" aria-expanded="${lib.showFilters}" aria-label="${h(t("filter"))}">${icon("sliders-horizontal")}</button>
    </div>
    <div class="toolbar" ${lib.showFilters || lib.cat !== "all" || lib.time || lib.diff ? "" : "hidden"}>
      <select id="lib-cat" aria-label="${h(t("category"))}"><option value="all">${h(t("all_categories"))}</option>${RECIPE_CATS.map((c) => `<option value="${c}" ${lib.cat === c ? "selected" : ""}>${h(catLabel(c))}</option>`).join("")}</select>
      <select id="lib-time" aria-label="${h(t("cooking_time"))}"><option value="0">${h(t("any_time"))}</option>${[15, 30, 60].map((n) => `<option value="${n}" ${lib.time == n ? "selected" : ""}>${h(t("under_min", { n }))}</option>`).join("")}</select>
      <select id="lib-diff" aria-label="${h(t("difficulty"))}"><option value="">${h(t("any_difficulty"))}</option>${["easy", "medium", "hard"].map((d) => `<option value="${d}" ${lib.diff === d ? "selected" : ""}>${h(t("diff_" + d))}</option>`).join("")}</select>
      <select id="lib-sort" aria-label="${h(t("sort"))}">${["recent", "az", "time", "match"].map((s) => `<option value="${s}" ${lib.sort === s ? "selected" : ""}>${h(t("sort_" + s))}</option>`).join("")}</select>
      <div class="seg" role="group" aria-label="${h(t("layout"))}">
        <button class="${lib.view === "grid" ? "on" : ""}" data-act="lib-view" data-v="grid" aria-label="${h(t("grid"))}">${icon("layout-grid")}</button>
        <button class="${lib.view === "list" ? "on" : ""}" data-act="lib-view" data-v="list" aria-label="${h(t("list"))}">${icon("list")}</button>
      </div>
    </div>
    ${st.recipes.length === 0 ? emptyLibrary() : list.length === 0 ? `<div class="empty"><p>${h(t("no_results"))}</p></div>` :
      `<p class="count">${h(t("n_recipes", { n: totalCount }))}</p><div class="${lib.view === "grid" ? "grid-cards" : "list-cards"}">${list.map((r) => recipeCard(r, { match: matches.get(r.id), compact: lib.view === "list" })).join("")}</div>
      ${totalCount > list.length ? `<div class="row center more-row"><button class="btn" data-act="lib-more">${h(t("show_more_n", { n: Math.min(60, totalCount - list.length), t: totalCount - list.length }))}</button></div>` : ""}`}
    ${!["all", "fav", "imported"].includes(lib.coll) ? `<div class="row-end"><button class="btn-link danger" data-act="coll-del" data-id="${h(lib.coll)}">${icon("trash-2")} ${h(t("delete_collection"))}</button></div>` : ""}
  </div>`;
}
export function emptyLibrary() {
  return `<div class="empty">
    ${icon("book-open", "ic-xl")}
    <h2>${h(t("empty_lib_title"))}</h2>
    <p>${h(t("empty_lib_text"))}</p>
    <div class="row center">
      <a class="btn btn-primary" href="#/import">${icon("download")} ${h(t("import_recipe"))}</a>
      <a class="btn" href="#/recipe/new">${icon("pencil")} ${h(t("write_recipe"))}</a>
      <button class="btn" data-act="load-samples">${icon("book-open")} ${h(t("load_samples"))}</button>
    </div>
  </div>`;
}
export function bindRecipes(root, rerender) {
  const q = root.querySelector("#lib-q");
  if (q) q.addEventListener("input", () => { lib.q = q.value; lib.limit = 60; rerender({ keepFocus: "#lib-q" }); });
  for (const [id, key] of [["#lib-cat", "cat"], ["#lib-time", "time"], ["#lib-diff", "diff"], ["#lib-sort", "sort"]]) {
    root.querySelector(id)?.addEventListener("change", (e) => { lib[key] = key === "time" ? +e.target.value : e.target.value; rerender(); });
  }
}
export const recipeActions = {
  "lib-coll": (el, rr) => { lib.coll = el.dataset.v; lib.limit = 60; rr(); },
  "lib-more": (_, rr) => { lib.limit += 60; rr(); },
  "lib-filters": (_, rr) => { lib.showFilters = !lib.showFilters; rr(); },
  "lib-view": (el, rr) => { lib.view = el.dataset.v; rr(); },
  "lib-open-coll": (el) => { lib.coll = el.dataset.v; lib.cat = "all"; lib.q = ""; },
  "coll-new": (_, rr) => newCollection(rr),
  "coll-del": async (el, rr) => {
    const c = S.state.collections.find((x) => x.id === el.dataset.id);
    if (!c || !(await confirmDialog(t("delete_collection_q", { x: c.name }), { danger: true, ok: t("delete") }))) return;
    S.state.collections = S.state.collections.filter((x) => x.id !== c.id);
    for (const r of S.state.recipes) r.collections = (r.collections || []).filter((x) => x !== c.id);
    lib.coll = "all"; save(); rr();
  },
};
function newCollection(rr, then) {
  openSheet(t("new_collection"), `<form class="form" id="coll-form">
    <label class="field"><span>${h(t("collection_name"))}</span><input name="name" required maxlength="60" placeholder="${h(t("collection_ph"))}"></label>
    <div class="row-end"><button class="btn btn-primary">${h(t("create"))}</button></div></form>`, {
    onMount: (el, close) => el.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      const c = { id: uid(), name };
      S.state.collections.push(c); save(); close();
      then ? then(c) : (lib.coll = c.id, rr());
    },
  });
}

/* ---------- detail ---------- */
const detailState = { servings: {}, langView: {} };
export function viewRecipe(id) {
  const r = recipeById(id);
  if (!r) return `<div class="page"><div class="empty"><p>${h(t("recipe_not_found"))}</p><a class="btn" href="#/recipes">${h(t("back"))}</a></div></div>`;
  const servings = detailState.servings[id] || r.servings || null;
  const m = matchRecipe(r, ctx(servings));
  const scale = servings && r.servings ? servings / r.servings : 1;
  const view = detailState.langView[id] || "original";
  const tr = view !== "original" ? r.translations?.[view] : null;
  const title = tr?.title || r.title;
  const st = S.state;
  const rowFor = (row, idx) => {
    const ri = row.ri;
    const label = tr?.ingredients?.[idx] || [ri.name || iname(ri), ri.note].filter(Boolean).join(", ");
    const statusIcon = { have: ["circle-check", "st-green", t("in_kitchen")], staple: ["circle-check", "st-green", t("staple")], short: ["scale", "st-amber", t("not_enough")], unknown: ["circle-help", "st-muted", t("qty_unknown")], missing: row.sub ? ["repeat", "st-amber", t("use_sub", { x: iname({ ingredientId: row.sub.id }) })] : ["circle", "st-red", t("missing")] }[row.status];
    const blocked = m.blocked.some((b) => b.ri === ri);
    return `<li class="ing-row ${blocked ? "blocked" : ""} ${row.status === "missing" && row.essential ? "missing-row" : ""}">
      <label class="check"><input type="checkbox"><span></span></label>
      <span class="ing-qty">${h(qty(row.need, ri.unit))}</span>
      <span class="ing-name">${h(label)}${ri.essential === false ? ` <em class="tag-opt">${h(t("optional"))}</em>` : ""}${ri.uncertain ? ` <em class="tag-warn" title="${h(t("uncertain_hint"))}">${h(t("check"))}</em>` : ""}</span>
      <span class="status ${statusIcon[1]}" title="${h(statusIcon[2])}">${icon(statusIcon[0])}<span class="st-text">${h(statusIcon[2])}${row.status === "short" && row.have != null ? " (" + h(qty(row.have, row.unit)) + ")" : ""}</span></span>
      ${blocked ? `<span class="status st-red">${icon("ban")} ${h(t("conflicts_prefs"))}</span>` : ""}
    </li>`;
  };
  const src = r.source || { type: "manual" };
  const steps = tr?.steps ? r.steps.map((s, i) => ({ ...s, text: tr.steps[i] ?? s.text })) : r.steps;
  const coll = st.collections.filter((c) => (r.collections || []).includes(c.id));
  const srcLabel = src.type && src.type !== "manual" ? (src.type === "sample" ? t("src_sample") : t("imported_from", { x: src.bookTitle || t("src_" + src.type) })) : "";
  return `<div class="page page-recipe">
    <article class="recipe">
      <div class="detail-hero">
        ${recipeCover(r, "cover-hero")}
        <div class="hero-btns">
          <a class="circle-btn sm" href="#/recipes" aria-label="${h(t("back"))}">${icon("chevron-left")}</a>
          <span class="spacer"></span>
          <a class="circle-btn sm" href="#/recipe/${r.id}/edit" aria-label="${h(t("edit_recipe"))}" title="${h(t("edit_recipe"))}">${icon("pencil")}</a>
          <button class="circle-btn sm" data-act="fav" data-id="${r.id}" aria-pressed="${!!r.favorite}" aria-label="${h(t("favorite"))}">${icon("heart", r.favorite ? "filled fav-on" : "")}</button>
          ${navigator.share ? `<button class="circle-btn sm" data-act="share" data-id="${r.id}" aria-label="${h(t("share"))}">${icon("share-2")}</button>` : ""}
        </div>
      </div>
      ${(r.photos || []).length > 1 ? `<div class="gallery">${r.photos.map((src) => `<button class="gal-th ${src === r.image ? "on" : ""}" data-act="gal-show" data-id="${r.id}" data-src="${h(src)}"><img src="${h(src)}" alt=""></button>`).join("")}</div>` : ""}
      <div class="detail-sheet">
        <p class="eyebrow accent">${[r.category ? catLabel(r.category) : "", r.cuisine].filter(Boolean).map(h).join(" · ")}</p>
        <div class="detail-title"><h1>${h(title)}</h1>${r.cookedCount ? `<span class="pill pill-amber">${icon("chef-hat")} ${h(t("cooked_n", { n: r.cookedCount }))}</span>` : ""}</div>
        ${srcLabel ? `<p class="src-line">${icon(SOURCE_ICON[src.type] || "pencil")} ${src.url ? `<a href="${h(src.url)}" target="_blank" rel="noopener noreferrer">${h(srcLabel)}</a>` : h(srcLabel)}${src.page ? " · " + h(t("page_n", { n: src.page })) : ""}</p>` : ""}
        ${(tr?.description || r.description) ? `<p class="lead">${h(tr?.description || r.description)}</p>` : ""}
        <div class="meta-pills">
          ${r.prepTime || r.cookTime ? `<span class="meta-pill">${icon("clock")} ${h(minutes((r.prepTime || 0) + (r.cookTime || 0)))}</span>` : ""}
          ${r.difficulty ? `<span class="meta-pill">${icon("flame")} ${h(t("diff_" + r.difficulty))}</span>` : ""}
          ${r.servings ? `<span class="meta-pill stepper-pill"><button data-act="serv" data-id="${r.id}" data-d="-1" aria-label="${h(t("fewer"))}">${icon("minus")}</button>${icon("user")} ${h(t("n_servings", { n: servings }))}<button data-act="serv" data-id="${r.id}" data-d="1" aria-label="${h(t("more"))}">${icon("plus")}</button></span>` : ""}
        </div>
        ${r.nutrition ? `<p class="eyebrow">${h(t("nutrition"))}</p><p>${h(r.nutrition)}</p>` : ""}
        <div class="row wrap detail-more">
          <button class="chip" data-act="coll-pick" data-id="${r.id}">${icon("folder")} ${h(t("collections"))}</button>
          <a class="chip" href="#/assistant?recipe=${r.id}">${icon("sparkle")} ${h(t("ask_ai_chef"))}</a>
          <button class="chip" data-act="translate" data-id="${r.id}">${icon("languages")} ${h(t("translate"))}</button>
          <a class="chip" href="#/recipe/${r.id}/edit">${icon("pencil")} ${h(t("edit"))}</a>
        </div>
        ${coll.length ? `<p class="meta">${icon("folder")} ${coll.map((c) => h(c.name)).join(", ")}</p>` : ""}

      <div class="recipe-cols">
        <section class="panel">
          <div class="panel-head">
            <h2>${h(t("ingredients"))}</h2>
            <span class="meta">${r.servings ? h(t("n_servings", { n: servings })) : h(t("servings_unknown"))}</span>
          </div>
          <div class="match-box">
            ${availabilityLine(m)}
            ${m.essTotal ? `<p class="meta">${h(t("ess_of", { a: m.essAvail, b: m.essTotal }))}${m.unknownQty.length ? " · " + h(t("some_qty_unknown")) : ""}</p>` : ""}
            ${m.bucket === "blocked" ? `<p class="meta">${m.blocked.map((b) => h(t("block_" + b.reason, { x: iname(b.ri), tag: t("tag_" + b.tag) !== "tag_" + b.tag ? t("tag_" + b.tag) : b.tag }))).join("<br>")}</p>` : ""}
          </div>
          <ul class="ing-list">${m.rows.map(rowFor).join("")}</ul>
          ${m.missingNoSub.length || m.short.length ? `<button class="btn btn-block" data-act="missing-to-list" data-id="${r.id}">${icon("shopping-basket")} ${h(t("add_missing_to_list"))}</button>` : ""}
          ${m.subs.length ? `<div class="subs"><h3>${h(t("substitutions"))}</h3>${m.subs.map((s) => `<p><strong>${h(iname(s.ri))}</strong> → ${h(iname({ ingredientId: s.sub.id }))}${s.need != null ? ` (${h(qty(s.need * s.sub.ratio, s.ri.unit))})` : ""}. <span class="meta">${h(t(s.sub.note))}</span></p>`).join("")}</div>` : ""}
          ${scale !== 1 ? `<p class="meta">${h(t("scaled_note", { n: r.servings }))}</p>` : ""}
        </section>

        <section class="panel">
          <h2>${h(t("instructions"))}</h2>
          ${steps.length ? `<ol class="steps">${steps.map((s) => `<li><p>${h(s.text)}</p>${s.photo ? `<img class="step-img" src="${h(s.photo)}" alt="" loading="lazy">` : ""}${s.timer ? `<span class="meta">${icon("timer")} ${h(minutes(Math.round(s.timer / 60)) || s.timer + " s")}</span>` : ""}</li>`).join("")}</ol>` : `<p class="meta">${h(t("no_steps"))}</p>`}
          ${r.notes ? `<h3>${h(t("notes"))}</h3><p class="notes">${h(r.notes)}</p>` : ""}
          ${r.nutrition ? `<h3>${h(t("nutrition"))}</h3><p class="notes">${h(r.nutrition)}</p>` : ""}
        </section>
      </div>

      <section class="panel source">
        <h2>${h(t("source"))}</h2>
        <p>${icon(SOURCE_ICON[src.type] || "pencil")} ${h(t("src_" + src.type))}${src.bookId && st.books?.some((b) => b.id === src.bookId) ? ` · <a href="#/book/${h(src.bookId)}">${h(src.bookTitle || src.fileName)}</a>` : src.fileName ? " · " + h(src.fileName) : ""}${src.page ? " · " + h(t("page_n", { n: src.page })) : ""}</p>
        ${src.url ? `<p><a href="${h(src.url)}" target="_blank" rel="noopener noreferrer">${icon("external-link")} ${h(t("open_original"))}</a></p>` : ""}
        ${src.fileId ? `<p><button class="btn-link" data-act="open-file" data-id="${h(src.fileId)}" data-page="${src.page || ""}">${icon("file")} ${h(t("view_original_file"))}</button></p>` : ""}
        <p class="meta">${h(t("added_on", { d: dateLabel(r.createdAt?.slice(0, 10)) }))}${r.cookedCount ? " · " + h(t("cooked_n", { n: r.cookedCount })) : ""}${r.language ? " · " + h(t("orig_lang")) + ": " + h(t("lang_" + r.language)) : ""}</p>
        <div class="row wrap">
          <div class="seg" role="group" aria-label="${h(t("language"))}">
            <button class="${view === "original" ? "on" : ""}" data-act="lang-view" data-id="${r.id}" data-v="original">${h(t("original"))}</button>
            ${Object.keys(r.translations || {}).map((l) => `<button class="${view === l ? "on" : ""}" data-act="lang-view" data-id="${r.id}" data-v="${l}">${h(t("lang_" + l))}</button>`).join("")}
          </div>
          <button class="btn" data-act="dup" data-id="${r.id}">${icon("copy")} ${h(t("duplicate"))}</button>
          <button class="btn btn-danger-ghost" data-act="del-recipe" data-id="${r.id}">${icon("trash-2")} ${h(t("delete"))}</button>
        </div>
      </section>
      <div class="detail-bar">
        <button class="circle-btn" data-act="plan-add" data-id="${r.id}" aria-label="${h(t("add_to_plan"))}">${icon("calendar-days")}</button>
        <a class="btn btn-primary btn-lg" href="#/cook/${r.id}">${icon("play")} ${h(t("start_cooking"))}</a>
      </div>
      </div>
    </article>
  </div>`;
}

export const detailActions = {
  fav: (el, rr) => { const r = recipeById(el.dataset.id); r.favorite = !r.favorite; save(); rr(); },
  "gal-show": (el, rr) => { const r = recipeById(el.dataset.id); r.image = el.dataset.src; save(); rr(); },
  share: (el) => {
    const r = recipeById(el.dataset.id);
    const text = [r.title, "", ...r.ingredients.map((i) => "• " + [i.qty != null ? qty(i.qty, i.unit) : "", i.name, i.note].filter(Boolean).join(" ")), "", ...r.steps.map((s2, k) => `${k + 1}. ${s2.text}`)].join("\n");
    navigator.share?.({ title: r.title, text }).catch(() => {});
  },
  serv: (el, rr) => {
    const r = recipeById(el.dataset.id);
    const cur = detailState.servings[r.id] || r.servings;
    detailState.servings[r.id] = Math.max(1, Math.min(50, cur + +el.dataset.d));
    rr();
  },
  "lang-view": (el, rr) => { detailState.langView[el.dataset.id] = el.dataset.v; rr(); },
  "del-recipe": async (el) => {
    const r = recipeById(el.dataset.id);
    if (!(await confirmDialog(t("delete_recipe_q", { x: r.title }), { danger: true, ok: t("delete") }))) return;
    const idx = S.state.recipes.indexOf(r);
    S.state.recipes.splice(idx, 1);
    S.state.plan = S.state.plan.filter((p) => p.recipeId !== r.id);
    save(); go("#/recipes");
    toast(t("recipe_deleted"), "info", { label: t("undo"), fn: () => { S.state.recipes.splice(idx, 0, r); save(); go("#/recipe/" + r.id); } });
  },
  dup: (el) => {
    const r = recipeById(el.dataset.id);
    const c = structuredClone(r);
    c.id = uid(); c.title = r.title + " " + t("copy_suffix"); c.createdAt = new Date().toISOString(); c.cookedCount = 0;
    S.state.recipes.unshift(c); save(); go("#/recipe/" + c.id + "/edit");
  },
  "coll-pick": (el, rr) => pickCollections(recipeById(el.dataset.id), rr),
  "missing-to-list": (el) => {
    const r = recipeById(el.dataset.id);
    const m = matchRecipe(r, ctx(detailState.servings[r.id] || r.servings));
    let n = 0;
    for (const row of [...m.missingNoSub, ...m.short]) {
      const need = row.status === "short" && row.need != null && row.have != null ? row.need - row.have : row.need;
      S.state.grocery.push({ id: uid(), name: row.ri.name || iname(row.ri), ingredientId: row.ri.ingredientId || null, qty: need, unit: row.ri.unit, checked: false, source: "recipe", note: r.title });
      n++;
    }
    save(); toast(t("added_to_list_n", { n }), "info", { label: t("view"), fn: () => go("#/grocery") });
  },
  translate: (el, rr) => translateSheet(recipeById(el.dataset.id), rr),
  "open-file": async (el) => {
    const f = await fileGet(el.dataset.id);
    if (!f) return toast(t("file_missing"), "error");
    openBlob(f, el.dataset.page);
  },
};
export function openBlob(f, page) {
  const url = URL.createObjectURL(f.blob) + (page && /pdf/.test(f.type || f.blob.type) ? "#page=" + page : "");
  window.open(url, "_blank");
}

function pickCollections(r, rr) {
  const render = () => S.state.collections.map((c) => `<label class="opt"><input type="checkbox" value="${h(c.id)}" ${(r.collections || []).includes(c.id) ? "checked" : ""}><span>${h(c.name)}</span></label>`).join("") || `<p class="meta">${h(t("no_collections"))}</p>`;
  openSheet(t("collections"), `<div class="opt-list" id="coll-opts">${render()}</div>
    <div class="row-between"><button class="btn" data-new>${icon("folder-plus")} ${h(t("new_collection"))}</button><button class="btn btn-primary" data-done>${h(t("done"))}</button></div>`, {
    onMount: (el, close) => {
      el.querySelector("[data-new]").onclick = () => newCollection(rr, (c) => { r.collections = [...(r.collections || []), c.id]; save(); el.querySelector("#coll-opts").innerHTML = render(); });
      el.querySelector("[data-done]").onclick = () => {
        r.collections = [...el.querySelectorAll("#coll-opts input:checked")].map((i) => i.value);
        save(); close(); rr();
      };
    },
  });
}

function translateSheet(r, rr) {
  const langs = ["en", "uz", "ko", "ru"].filter((l) => l !== r.language);
  openSheet(t("translate"), `<p class="meta">${h(t("translate_note"))}</p>
    <div class="opt-list">${langs.map((l) => `<button class="btn btn-block" data-l="${l}">${h(t("lang_" + l))}${r.translations?.[l] ? " · " + h(t("update")) : ""}</button>`).join("")}</div>
    <p class="meta" id="tr-status" role="status"></p>`, {
    onMount: (el, close) => el.querySelectorAll("[data-l]").forEach((b) => b.onclick = async () => {
      const l = b.dataset.l;
      el.querySelectorAll("button").forEach((x) => x.disabled = true);
      el.querySelector("#tr-status").textContent = t("translating");
      try {
        const res = await translateRecipe(S.state.settings, r, l);
        r.translations = { ...(r.translations || {}), [l]: res };
        detailState.langView[r.id] = l;
        save(); close(); rr();
      } catch (e) {
        el.querySelector("#tr-status").textContent = t(aiErrorKey(e));
        el.querySelectorAll("button").forEach((x) => x.disabled = false);
        if (aiErrorKey(e) === "ai_no_key") el.querySelector("#tr-status").insertAdjacentHTML("beforeend", ` <a href="#/profile">${h(t("open_settings"))}</a>`);
      }
    }),
  });
}

/* ---------- editor ---------- */
export function blankRecipe() {
  return { id: uid(), title: "", description: "", image: "", category: "dinner", cuisine: "", difficulty: "easy", prepTime: null, cookTime: null, servings: 2, tags: [], notes: "", ingredients: [], steps: [], source: { type: "manual" }, favorite: false, collections: [], createdAt: new Date().toISOString(), translations: {} };
}
let draft = null;
export function viewEditor(id) {
  const existing = id === "new" ? null : recipeById(id);
  if (!draft || draft._for !== id) draft = existing ? { ...structuredClone(existing), _for: id } : { ...blankRecipe(), _for: id, ingredients: [ing()], steps: [{ text: "", timer: 0 }] };
  return editorForm(draft, existing ? t("edit_recipe") : t("new_recipe"), existing ? `#/recipe/${id}` : "#/recipes");
}
function ing() { return { name: "", ingredientId: null, qty: null, unit: "", note: "", essential: true }; }

export function editorForm(d, heading, backHref, { inSheet = false } = {}) {
  const ingRows = d.ingredients.map((i, k) => `<div class="ed-ing" data-k="${k}">
      <input class="w-qty" name="iq" inputmode="decimal" value="${i.qty ?? ""}" placeholder="${h(t("qty"))}" aria-label="${h(t("qty"))}">
      <select class="w-unit" name="iu" aria-label="${h(t("unit"))}"><option value="">—</option>${UNIT_LIST.map((u) => `<option value="${u}" ${i.unit === u ? "selected" : ""}>${h(unitLabel(u))}</option>`).join("")}</select>
      <input class="w-name" name="in" list="ing-list" value="${h(i.name || (i.ingredientId ? iname(i) : ""))}" placeholder="${h(t("ingredient"))}" aria-label="${h(t("ingredient"))}" required>
      <input class="w-note" name="io" value="${h(i.note || "")}" placeholder="${h(t("note_ph"))}" aria-label="${h(t("note"))}">
      <label class="mini-check" title="${h(t("optional_hint"))}"><input type="checkbox" name="iopt" ${i.essential === false ? "checked" : ""}> ${h(t("optional"))}</label>
      <span class="ed-flag">${i.name && !i.ingredientId && !resolveIngredient(i.name) ? `<span class="status st-amber" title="${h(t("unknown_ing_hint"))}">${icon("circle-help")}<span class="st-text">${h(t("not_in_catalog"))}</span></span>` : ""}</span>
      <span class="ed-tools">
        <button type="button" class="icon-btn" data-act="ed-ing-move" data-k="${k}" data-d="-1" ${k === 0 ? "disabled" : ""} aria-label="${h(t("move_up"))}">${icon("chevron-up")}</button>
        <button type="button" class="icon-btn" data-act="ed-ing-move" data-k="${k}" data-d="1" ${k === d.ingredients.length - 1 ? "disabled" : ""} aria-label="${h(t("move_down"))}">${icon("chevron-down")}</button>
        <button type="button" class="icon-btn" data-act="ed-del-ing" data-k="${k}" aria-label="${h(t("remove"))}">${icon("trash-2")}</button>
      </span>
    </div>`).join("");
  const stepRows = d.steps.map((s, k) => `<div class="ed-step" data-k="${k}">
      <span class="step-n">${k + 1}</span>
      <div class="ed-step-main">
        <textarea name="st" rows="3" placeholder="${h(t("step_ph"))}" aria-label="${h(t("step_n", { n: k + 1 }))}">${h(s.text)}</textarea>
        <div class="ed-step-bar">
          <label class="w-timer">${icon("timer")}<input name="stt" inputmode="numeric" value="${s.timer ? Math.round(s.timer / 60) : ""}" placeholder="${h(t("min"))}" aria-label="${h(t("timer_min"))}"><span class="meta">${h(t("min"))}</span></label>
          ${s.photo ? `<span class="step-photo"><img src="${h(s.photo)}" alt=""><button type="button" class="icon-btn" data-act="ed-step-photo-del" data-k="${k}" aria-label="${h(t("remove_photo"))}">${icon("x")}</button></span>`
            : `<label class="btn btn-sm btn-soft">${icon("camera")} ${h(t("step_photo"))}<input type="file" accept="image/*" class="ed-step-file" data-k="${k}" hidden></label>`}
          <span class="ed-tools">
            <button type="button" class="icon-btn" data-act="ed-step-move" data-k="${k}" data-d="-1" ${k === 0 ? "disabled" : ""} aria-label="${h(t("move_up"))}">${icon("chevron-up")}</button>
            <button type="button" class="icon-btn" data-act="ed-step-move" data-k="${k}" data-d="1" ${k === d.steps.length - 1 ? "disabled" : ""} aria-label="${h(t("move_down"))}">${icon("chevron-down")}</button>
            <button type="button" class="icon-btn" data-act="ed-step-insert" data-k="${k}" aria-label="${h(t("insert_step_after"))}" title="${h(t("insert_step_after"))}">${icon("list-plus")}</button>
            <button type="button" class="icon-btn" data-act="ed-del-step" data-k="${k}" aria-label="${h(t("remove"))}">${icon("trash-2")}</button>
          </span>
        </div>
      </div>
    </div>`).join("");
  const photos = d.photos?.length ? d.photos : d.image ? [d.image] : [];
  return `<div class="${inSheet ? "" : "page"}">
    ${inSheet ? "" : `<div class="back-row"><a class="circle-btn sm" href="${backHref}" aria-label="${h(t("back"))}">${icon("chevron-left")}</a><h1 style="flex:1">${h(heading)}</h1><button class="btn btn-primary" form="editor">${icon("check")} ${h(t("save"))}</button></div>`}
    ${ingredientDatalist()}
    <form class="form editor" id="editor" novalidate>
      <div class="ed-top">
        <div class="ed-photos">
          <p class="ed-label">${h(t("photos"))}</p>
          <div class="ed-photo-grid">
            ${photos.map((src, k) => `<figure class="ed-ph ${src === d.image ? "is-cover" : ""}">
              <img src="${h(src)}" alt="">
              ${src === d.image ? `<span class="pill pill-solid cover-tag">${h(t("cover"))}</span>` : `<button type="button" class="ph-btn ph-cover" data-act="ed-photo-cover" data-k="${k}">${icon("star")} ${h(t("make_cover"))}</button>`}
              <button type="button" class="ph-btn ph-del" data-act="ed-photo-del" data-k="${k}" aria-label="${h(t("remove_photo"))}">${icon("x")}</button>
            </figure>`).join("")}
            <label class="ed-ph ed-ph-add">${icon("image-plus")}<span>${h(t("add_photos"))}</span><input type="file" accept="image/*" multiple id="ed-img" hidden></label>
            <label class="ed-ph ed-ph-add cam-only">${icon("camera")}<span>${h(t("take_photo"))}</span><input type="file" accept="image/*" capture="environment" id="ed-cam" hidden></label>
          </div>
        </div>
        <div class="ed-fields">
          <label class="field"><span>${h(t("recipe_name"))} *</span><input name="title" value="${h(d.title)}" required maxlength="140"></label>
          <label class="field"><span>${h(t("description"))}</span><textarea name="description" rows="2" maxlength="600">${h(d.description || "")}</textarea></label>
          <div class="grid-4">
            <label class="field"><span>${h(t("prep_min"))}</span><input name="prepTime" inputmode="numeric" value="${d.prepTime ?? ""}"></label>
            <label class="field"><span>${h(t("cook_min"))}</span><input name="cookTime" inputmode="numeric" value="${d.cookTime ?? ""}"></label>
            <label class="field"><span>${h(t("servings"))}</span><input name="servings" inputmode="numeric" value="${d.servings ?? ""}"></label>
            <label class="field"><span>${h(t("difficulty"))}</span><select name="difficulty"><option value="">—</option>${["easy", "medium", "hard"].map((x) => `<option value="${x}" ${d.difficulty === x ? "selected" : ""}>${h(t("diff_" + x))}</option>`).join("")}</select></label>
          </div>
          <div class="grid-3">
            <label class="field"><span>${h(t("category"))}</span><select name="category">${RECIPE_CATS.map((c) => `<option value="${c}" ${d.category === c ? "selected" : ""}>${h(catLabel(c))}</option>`).join("")}</select></label>
            <label class="field"><span>${h(t("cuisine"))}</span><input name="cuisine" value="${h(d.cuisine || "")}" placeholder="${h(t("cuisine_ph"))}"></label>
            <label class="field"><span>${h(t("tags"))}</span><input name="tags" value="${h((d.tags || []).join(", "))}" placeholder="${h(t("tags_ph"))}"></label>
          </div>
        </div>
      </div>

      <fieldset class="ed-sec">
        <legend>${h(t("ingredients"))}</legend>
        <p class="meta">${h(t("ing_help"))}</p>
        <div id="ed-ings">${ingRows}</div>
        <div class="row wrap">
          <button type="button" class="btn btn-sm" data-act="ed-add-ing">${icon("plus")} ${h(t("add_ingredient"))}</button>
          <button type="button" class="btn btn-sm" data-act="ed-paste-ings">${icon("clipboard")} ${h(t("paste_list"))}</button>
        </div>
      </fieldset>

      <fieldset class="ed-sec">
        <legend>${h(t("instructions"))}</legend>
        <div id="ed-steps">${stepRows}</div>
        <button type="button" class="btn btn-sm" data-act="ed-add-step">${icon("plus")} ${h(t("add_step"))}</button>
      </fieldset>

      <fieldset class="ed-sec">
        <legend>${h(t("more"))}</legend>
        <label class="field"><span>${h(t("notes"))}</span><textarea name="notes" rows="3">${h(d.notes || "")}</textarea></label>
        <label class="field"><span>${h(t("nutrition"))}</span><input name="nutrition" value="${h(d.nutrition || "")}" placeholder="${h(t("nutrition_ph"))}"></label>
        <label class="field"><span>${h(t("source_link"))}</span><input name="url" type="url" value="${h(d.source?.url || "")}" placeholder="https://"></label>
      </fieldset>
      <p class="form-error" id="ed-err" role="alert"></p>
      ${inSheet ? "" : `<div class="row-end sticky-actions"><a class="btn" href="${backHref}">${h(t("cancel"))}</a><button class="btn btn-primary">${icon("check")} ${h(t("save_recipe"))}</button></div>`}
    </form>
  </div>`;
}

/** Copy form values into the draft object (keeps edits when rows are added). */
export function readEditor(form, d) {
  const f = form.elements;
  d.title = f.title.value.trim();
  d.description = f.description.value.trim();
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
  d.prepTime = num(f.prepTime.value); d.cookTime = num(f.cookTime.value);
  d.servings = num(f.servings.value); d.difficulty = f.difficulty.value;
  d.category = f.category.value; d.cuisine = f.cuisine.value.trim();
  d.tags = f.tags.value.split(",").map((x) => x.trim()).filter(Boolean);
  d.notes = f.notes.value.trim(); d.nutrition = f.nutrition.value.trim();
  const url = f.url.value.trim();
  d.source = { ...(d.source || { type: "manual" }), url: url || d.source?.url || "" };
  if (!url) delete d.source.url;
  d.ingredients = [...form.querySelectorAll(".ed-ing")].map((row, k) => {
    const name = row.querySelector("[name=in]").value.trim();
    const prev = d.ingredients[k] || {};
    const id = name ? resolveIngredient(name) || (prev.name === name ? prev.ingredientId : null) : null;
    return {
      ...prev, name, ingredientId: id, qty: num(row.querySelector("[name=iq]").value), unit: row.querySelector("[name=iu]").value,
      note: row.querySelector("[name=io]").value.trim(), essential: !row.querySelector("[name=iopt]").checked, uncertain: false,
    };
  });
  d.steps = [...form.querySelectorAll(".ed-step")].map((row, k) => ({
    ...(d.steps[k] || {}),
    text: row.querySelector("[name=st]").value.trim(), timer: (num(row.querySelector("[name=stt]").value) || 0) * 60,
  }));
}
export function validRecipe(d) {
  if (!d.title) return t("err_title");
  if (!d.ingredients.some((i) => i.name)) return t("err_ings");
  return "";
}
export function finalizeRecipe(d) {
  d.ingredients = d.ingredients.filter((i) => i.name);
  d.steps = d.steps.filter((s) => s.text);
  for (const i of d.ingredients) if (i.ingredientId) registerCustomName(i.name, i.ingredientId);
  delete d._for;
  return d;
}

export function bindEditor(root, rr, { getDraft = () => draft, onSave } = {}) {
  const form = root.querySelector("#editor");
  if (!form) return;
  const d = getDraft();
  const addPhotos = async (files) => {
    if (!files.length) return;
    readEditor(form, d);
    d.photos = d.photos?.length ? d.photos : d.image ? [d.image] : [];
    for (const file of files) {
      try { d.photos.push(await resizeImage(file, 1200, 0.8)); } catch { toast(t("image_failed"), "error"); }
    }
    if (!d.image && d.photos.length) d.image = d.photos[0];
    rr();
  };
  root.querySelector("#ed-img")?.addEventListener("change", (e) => addPhotos([...e.target.files]));
  root.querySelector("#ed-cam")?.addEventListener("change", (e) => addPhotos([...e.target.files]));
  root.querySelectorAll(".ed-step-file").forEach((inp) => inp.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readEditor(form, d);
    try { d.steps[+inp.dataset.k].photo = await resizeImage(file, 1000, 0.8); } catch { toast(t("image_failed"), "error"); }
    rr();
  }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    readEditor(form, d);
    const err = validRecipe(d);
    if (err) { root.querySelector("#ed-err").textContent = err; return; }
    finalizeRecipe(d);
    if (onSave) return onSave(d);
    const idx = S.state.recipes.findIndex((r) => r.id === d.id);
    d.updatedAt = new Date().toISOString();
    if (idx >= 0) S.state.recipes[idx] = d; else S.state.recipes.unshift(d);
    draft = null; save(); toast(t("recipe_saved"));
    go("#/recipe/" + d.id);
  });
  const act = (name, fn) => root.querySelectorAll(`[data-act="${name}"]`).forEach((b) => b.onclick = (e) => { e.preventDefault(); readEditor(form, d); fn(b); rr(); });
  act("ed-add-ing", () => d.ingredients.push(ing()));
  act("ed-del-ing", (b) => d.ingredients.splice(+b.dataset.k, 1));
  act("ed-add-step", () => d.steps.push({ text: "", timer: 0 }));
  act("ed-del-step", (b) => d.steps.splice(+b.dataset.k, 1));
  act("ed-rm-img", () => { d.image = ""; });
  const move = (arr, k, dir) => { const j = k + dir; if (j < 0 || j >= arr.length) return; [arr[k], arr[j]] = [arr[j], arr[k]]; };
  act("ed-ing-move", (b) => move(d.ingredients, +b.dataset.k, +b.dataset.d));
  act("ed-step-move", (b) => move(d.steps, +b.dataset.k, +b.dataset.d));
  act("ed-step-insert", (b) => d.steps.splice(+b.dataset.k + 1, 0, { text: "", timer: 0 }));
  act("ed-step-photo-del", (b) => { delete d.steps[+b.dataset.k].photo; });
  act("ed-photo-cover", (b) => { const ph = d.photos?.length ? d.photos : [d.image]; d.image = ph[+b.dataset.k]; });
  act("ed-photo-del", (b) => {
    d.photos = d.photos?.length ? d.photos : d.image ? [d.image] : [];
    const [gone] = d.photos.splice(+b.dataset.k, 1);
    if (gone === d.image) d.image = d.photos[0] || "";
  });
  root.querySelector('[data-act="ed-paste-ings"]')?.addEventListener("click", (e) => {
    e.preventDefault(); readEditor(form, d);
    pasteIngredients((items) => { d.ingredients = d.ingredients.filter((i) => i.name).concat(items); rr(); });
  });
}
export function resetDraft() { draft = null; }

import { parseIngredientLine } from "../parser.js";
function pasteIngredients(done) {
  openSheet(t("paste_list"), `<p class="meta">${h(t("paste_list_help"))}</p>
    <textarea id="paste-ings" rows="8" placeholder="${h(t("paste_list_ph"))}"></textarea>
    <div class="row-end"><button class="btn btn-primary" data-ok>${h(t("add"))}</button></div>`, {
    onMount: (el, close) => el.querySelector("[data-ok]").onclick = () => {
      const items = el.querySelector("#paste-ings").value.split("\n").map(parseIngredientLine).filter(Boolean)
        .map(({ name, ingredientId, qty, unit, note, essential }) => ({ name, ingredientId, qty, unit, note, essential }));
      close(); done(items);
    },
  });
}

/* ---------- add to meal plan (used from several places) ---------- */
export function addToPlanSheet(recipe, after) {
  const today = todayISO();
  openSheet(t("add_to_plan"), `<form class="form" id="plan-form">
    <p class="lead">${h(recipe.title)}</p>
    <div class="grid-3">
      <label class="field"><span>${h(t("date"))}</span><input type="date" name="date" value="${today}" required></label>
      <label class="field"><span>${h(t("meal"))}</span><select name="meal">${["breakfast", "lunch", "dinner"].map((m) => `<option value="${m}" ${m === (recipe.category === "breakfast" ? "breakfast" : recipe.category === "lunch" ? "lunch" : "dinner") ? "selected" : ""}>${h(t("meal_" + m))}</option>`).join("")}</select></label>
      <label class="field"><span>${h(t("servings"))}</span><input name="servings" inputmode="numeric" value="${recipe.servings || 2}"></label>
    </div>
    <div class="row-end"><button class="btn btn-primary">${h(t("add"))}</button></div></form>`, {
    onMount: (el, close) => el.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      S.state.plan.push({ id: uid(), date: f.date.value, meal: f.meal.value, recipeId: recipe.id, servings: +f.servings.value || recipe.servings || 2, done: false });
      save(); close(); toast(t("added_to_plan"), "info", { label: t("view"), fn: () => go("#/plan") });
      after?.();
    },
  });
}
detailActions["plan-add"] = (el) => addToPlanSheet(recipeById(el.dataset.id));
