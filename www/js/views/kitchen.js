// My Kitchen: fridge, freezer and pantry inventory with expiry tracking.
import {
  S, t, h, icon, save, toast, openSheet, confirmDialog, qty, uid, ingredientDatalist, iname, catLabel,
  unitLabel, dateLabel, todayISO, addDays, LOCATIONS, defaultLocation, CATEGORIES, BY_ID, go, catIcon,
} from "../core.js";
import { resolveIngredient, recogniseTyped, norm, expiryStatus, daysUntil, isLow, UNIT_LIST, ingCategory, keyOf } from "../engine.js";
import { parseIngredientLine } from "../parser.js";

/** Ingredient names that only recipes know (not in the ingredient list): normalised -> as the recipes write them. */
function recipeNames() {
  const m = new Map();
  for (const r of S.state.recipes) for (const i of r.ingredients || []) if (!i.ingredientId && i.name) { const k = norm(i.name); if (k && k.length <= 40 && !m.has(k)) m.set(k, i.name); }
  return m;
}
/** What a typed ingredient is: also forgives typing slips ("shpinach" -> spinach) and adopts the spelling recipes use. */
const recognise = (text) => recogniseTyped(text, recipeNames());

const kv = { loc: "all", cat: "all", q: "", filter: "" };
const LOC_ICON = { fridge: "refrigerator", freezer: "snowflake", pantry: "package" };

export function expiryText(it) {
  const d = daysUntil(it.expires);
  if (d == null) return "";
  if (d < 0) return t("expired_ago", { n: -d });
  if (d === 0) return t("expires_today");
  if (d === 1) return t("expires_tomorrow");
  return t("expires_in", { n: d });
}
export function expiryPill(it) {
  const s = expiryStatus(it);
  if (s === "none") return "";
  const d = daysUntil(it.expires);
  const cls = { expired: "pill-red", soon: "pill-red", week: "pill-amber", ok: "pill-green" }[s];
  const text = s === "ok" ? t("fresh") : d < 0 ? t("expired_ago", { n: -d }) : d === 0 ? t("use_today") : d === 1 ? t("use_tomorrow") : t("use_in_days", { n: d });
  return `<span class="pill ${cls}">${h(text)}</span>`;
}
export function expiryBadge(it) {
  const s = expiryStatus(it);
  if (s === "none") return "";
  const map = { expired: ["st-red", "circle-x"], soon: ["st-red", "clock-alert"], week: ["st-amber", "clock"], ok: ["st-muted", "calendar"] };
  return `<span class="status ${map[s][0]}">${icon(map[s][1])} ${h(expiryText(it))}</span>`;
}

export function viewKitchen() {
  const inv = S.state.inventory;
  const q = kv.q.trim().toLowerCase();
  let list = inv.filter((it) => (kv.loc === "all" || it.location === kv.loc) && (kv.cat === "all" || ingCategory(it) === kv.cat));
  if (q) list = list.filter((it) => iname(it).toLowerCase().includes(q) || (it.name || "").toLowerCase().includes(q));
  if (kv.filter === "expiring") list = list.filter((it) => ["expired", "soon", "week"].includes(expiryStatus(it)));
  if (kv.filter === "low") list = list.filter(isLow);
  list.sort((a, b) => {
    const order = { expired: 0, soon: 1, week: 2, ok: 3, none: 4 };
    return order[expiryStatus(a)] - order[expiryStatus(b)] || iname(a).localeCompare(iname(b));
  });
  const counts = Object.fromEntries(LOCATIONS.map((l) => [l, inv.filter((i) => i.location === l).length]));
  const expiring = inv.filter((it) => ["expired", "soon", "week"].includes(expiryStatus(it))).length;
  const low = inv.filter(isLow).length;
  const groups = {};
  for (const it of list) (groups[ingCategory(it)] ||= []).push(it);
  const usedCats = CATEGORIES.filter((c) => inv.some((i) => ingCategory(i) === c));

  const soon = inv.filter((it) => ["expired", "soon"].includes(expiryStatus(it))).length;
  const byLoc = LOCATIONS.map((l) => [l, list.filter((it) => it.location === l)]).filter(([, items]) => items.length);
  const hasVoice = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return `<div class="page">
    <header class="page-head">
      <div><h1>${h(t("my_kitchen"))}</h1><p class="meta">${h(t("n_items", { n: inv.length }))}${soon ? " · " + h(t("n_use_soon_short", { n: soon })) : ""}</p></div>
      <div class="head-actions">
        <button class="circle-btn" data-act="inv-quick" aria-label="${h(t("quick_add"))}">${icon(hasVoice ? "mic" : "list-plus")}</button>
        <button class="circle-btn dark" data-act="inv-add" aria-label="${h(t("add_ingredient"))}">${icon("plus")}</button>
      </div>
    </header>
    <div class="search-wrap" style="margin-bottom:14px">
      <label class="search">${icon("search")}<input type="search" id="inv-q" placeholder="${h(t("search_kitchen_ph"))}" value="${h(kv.q)}" aria-label="${h(t("search"))}"></label>
      <button class="filter-btn" data-act="inv-filter-cycle" aria-label="${h(t("filter"))}">${icon("sliders-horizontal")}</button>
    </div>
    <div class="chips" role="tablist" style="margin-bottom:16px">
      <button role="tab" class="chip ${kv.loc === "all" && !kv.filter ? "on" : ""}" data-act="inv-loc" data-v="all">${h(t("all"))} ${inv.length}</button>
      ${LOCATIONS.map((l) => `<button role="tab" class="chip ${kv.loc === l ? "on" : ""}" data-act="inv-loc" data-v="${l}">${h(t("loc_" + l))} ${counts[l]}</button>`).join("")}
      <button class="chip ${kv.filter === "expiring" ? "on" : ""}" data-act="inv-filter" data-v="${kv.filter === "expiring" ? "" : "expiring"}">${h(t("expiring"))}${expiring ? " " + expiring : ""}</button>
      ${low ? `<button class="chip ${kv.filter === "low" ? "on" : ""}" data-act="inv-filter" data-v="${kv.filter === "low" ? "" : "low"}">${h(t("low_stock"))} ${low}</button>` : ""}
    </div>
    ${kv.cat !== "all" ? `<div class="toolbar"><select id="inv-cat" aria-label="${h(t("category"))}"><option value="all">${h(t("all_categories"))}</option>${usedCats.map((c) => `<option value="${c}" ${kv.cat === c ? "selected" : ""}>${h(catLabel(c))}</option>`).join("")}</select></div>` : ""}
    <section class="kit-banner">
      <div><strong>${h(t("add_many_title"))}</strong><small>${h(hasVoice ? t("add_many_sub_voice") : t("add_many_sub"))}</small></div>
      <button class="btn btn-primary" data-act="inv-quick">${icon(hasVoice ? "mic" : "list-plus")} ${h(t("quick_add"))}</button>
    </section>
    ${inv.length === 0 ? `<div class="empty">${icon("refrigerator", "ic-xl")}<h2>${h(t("empty_kitchen_title"))}</h2><p>${h(t("empty_kitchen_text"))}</p></div>`
      : list.length === 0 ? `<div class="empty"><p>${h(t("no_results"))}</p></div>`
      : byLoc.map(([loc, items]) => `<section><div class="group-head">${icon(LOC_ICON[loc])}<h2>${h(t("loc_" + loc))}</h2><span class="count-badge">${items.length}</span></div>
        <div class="pantry-grid">${items.map(invCard).join("")}</div></section>`).join("")}
    ${inv.length ? `<p class="meta center" style="margin-top:20px"><a href="#/discover">${icon("chef-hat")} ${h(t("see_what_to_cook"))}</a></p>` : ""}
  </div>`;
}

function invCard(it) {
  const s = expiryStatus(it);
  const cat = ingCategory(it);
  return `<article class="pantry-card ${s === "expired" ? "is-expired" : ""}">
    <div class="pc-top">
      <div class="ing-icon">${icon(catIcon(cat))}</div>
      <div class="pc-name"><small>${icon(LOC_ICON[it.location] === "refrigerator" ? "thermometer" : LOC_ICON[it.location] || "package")} ${h(t("loc_" + it.location))}</small><h3>${h(iname(it))}</h3></div>
      ${expiryPill(it) || (isLow(it) ? `<span class="pill pill-amber">${h(t("low_stock"))}</span>` : "")}
    </div>
    <div class="pc-meta">
      <span>${icon("tag")} ${it.qty != null ? h(qty(it.qty, it.unit)) : h(t("qty_not_set"))}</span>
      ${it.purchased ? `<span>${icon("calendar")} ${h(t("added_date", { d: dateLabel(it.purchased, { day: "numeric", month: "numeric", year: "numeric" }) }))}</span>` : ""}
      <span>${icon("leaf")} ${h(catLabel(cat))}</span>
    </div>
    <div class="pc-actions">
      <button class="btn btn-sm" data-act="inv-edit" data-id="${it.id}">${icon("pencil")} ${h(t("edit"))}</button>
      <button class="btn btn-sm del" data-act="inv-del" data-id="${it.id}">${icon("trash-2")} ${h(t("delete"))}</button>
      <button class="btn btn-sm btn-success" data-act="inv-consume" data-id="${it.id}">${icon("check")} ${h(t("consume"))}</button>
      <span class="qty-step">
        <button class="icon-btn" data-act="inv-dec" data-id="${it.id}" aria-label="${h(t("use_some"))}">${icon("minus")}</button>
        <button class="icon-btn" data-act="inv-inc" data-id="${it.id}" aria-label="${h(t("add_more"))}">${icon("plus")}</button>
      </span>
    </div>
  </article>`;
}

const STEP = { g: 100, kg: 0.5, ml: 100, l: 0.5, tsp: 1, tbsp: 1, cup: 0.5, oz: 1, lb: 0.5, pinch: 1 };
export const kitchenActions = {
  "inv-loc": (el, rr) => { kv.loc = el.dataset.v; kv.filter = ""; rr(); },
  "inv-filter-cycle": (_, rr) => { kv.filter = kv.filter === "" ? "expiring" : kv.filter === "expiring" ? "low" : ""; rr(); },
  "inv-del": (el, rr) => removeItem(el.dataset.id, rr, "removed_x"),
  "inv-consume": (el, rr) => removeItem(el.dataset.id, rr, "used_up_x"),
  "inv-filter": (el, rr) => { kv.filter = el.dataset.v; rr(); },
  "inv-add": (_, rr) => itemSheet(null, rr),
  "inv-edit": (el, rr) => itemSheet(S.state.inventory.find((i) => i.id === el.dataset.id), rr),
  "inv-quick": (_, rr) => quickAddSheet(rr),
  "inv-inc": (el, rr) => adjust(el.dataset.id, 1, rr),
  "inv-dec": (el, rr) => adjust(el.dataset.id, -1, rr),
};
function removeItem(id, rr, msg) {
  const idx = S.state.inventory.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [item] = S.state.inventory.splice(idx, 1);
  save(); rr();
  toast(t(msg, { x: iname(item) }), "info", { label: t("undo"), fn: () => { S.state.inventory.splice(idx, 0, item); save(); rr(); } });
}
export function setKitchenFilter(f) { kv.filter = f; kv.loc = "all"; }

function adjust(id, dir, rr) {
  const it = S.state.inventory.find((i) => i.id === id);
  if (!it) return;
  const step = STEP[it.unit] || 1;
  if (it.qty == null) it.qty = dir > 0 ? step : 0;
  else it.qty = Math.max(0, Math.round((it.qty + dir * step) * 100) / 100);
  it.updatedAt = new Date().toISOString();
  save(); rr();
  if (it.qty === 0) toast(t("item_empty", { x: iname(it) }), "info", {
    label: t("remove"), fn: () => { S.state.inventory = S.state.inventory.filter((i) => i.id !== id); save(); rr(); },
  });
}

/** Add or merge an item into the inventory. */
export function addToInventory(item) {
  const key = keyOf(item);
  const same = S.state.inventory.find((i) => keyOf(i) === key && i.location === item.location && i.unit === item.unit && (i.expires || "") === (item.expires || ""));
  if (same && item.qty != null && same.qty != null) { same.qty = Math.round((same.qty + item.qty) * 100) / 100; same.updatedAt = new Date().toISOString(); return same; }
  const it = { id: uid(), purchased: todayISO(), updatedAt: new Date().toISOString(), notes: "", lowAt: null, ...item };
  S.state.inventory.push(it);
  return it;
}

function itemSheet(item, rr) {
  const it = item || { name: "", ingredientId: null, qty: null, unit: "", location: "fridge", expires: "", purchased: todayISO(), notes: "", lowAt: null };
  const body = `${ingredientDatalist()}<form class="form" id="inv-form">
    <label class="field"><span>${h(t("ingredient"))} *</span><input name="name" list="ing-list" required value="${h(item ? iname(it) : "")}" autocomplete="off"></label>
    <p class="meta" id="inv-match" aria-live="polite"></p>
    <div class="grid-2">
      <label class="field"><span>${h(t("quantity"))}</span><input name="qty" inputmode="decimal" value="${it.qty ?? ""}"></label>
      <label class="field"><span>${h(t("unit"))}</span><select name="unit"><option value="">—</option>${UNIT_LIST.map((u) => `<option value="${u}" ${it.unit === u ? "selected" : ""}>${h(unitLabel(u))}</option>`).join("")}</select></label>
    </div>
    <fieldset class="field"><legend>${h(t("storage"))}</legend><div class="seg seg-full">
      ${LOCATIONS.map((l) => `<label><input type="radio" name="location" value="${l}" ${it.location === l ? "checked" : ""}><span>${icon(LOC_ICON[l])} ${h(t("loc_" + l))}</span></label>`).join("")}</div></fieldset>
    <div class="grid-2">
      <label class="field"><span>${h(t("purchase_date"))}</span><input type="date" name="purchased" value="${h(it.purchased || "")}"></label>
      <label class="field"><span>${h(t("expiry_date"))}</span><input type="date" name="expires" value="${h(it.expires || "")}"></label>
    </div>
    <div class="row wrap quick-dates">${[3, 7, 14, 30].map((n) => `<button type="button" class="btn btn-xs" data-days="${n}">+${h(t("n_days", { n }))}</button>`).join("")}</div>
    <label class="field"><span>${h(t("low_stock_at"))}</span><input name="lowAt" inputmode="decimal" value="${it.lowAt ?? ""}" placeholder="${h(t("optional"))}"></label>
    <label class="field"><span>${h(t("notes"))}</span><input name="notes" value="${h(it.notes || "")}"></label>
    <div class="row-between">
      ${item ? `<button type="button" class="btn btn-danger-ghost" data-del>${icon("trash-2")} ${h(t("remove"))}</button>` : "<span></span>"}
      <button class="btn btn-primary">${icon("check")} ${h(item ? t("save") : t("add"))}</button>
    </div></form>`;
  openSheet(item ? t("edit_ingredient") : t("add_ingredient"), body, {
    onMount: (el, close) => {
      const f = el.querySelector("form");
      const showMatch = () => {
        const rec = recognise(f.name.value);
        const id = rec.id;
        el.querySelector("#inv-match").textContent = f.name.value ? (id ? t("matched_as", { x: BY_ID[id].names[S.state.prefs.lang] || BY_ID[id].names.en, c: catLabel(BY_ID[id].category) }) : rec.corrected ? t("matched_recipe_name", { x: rec.name }) : t("not_in_catalog_note")) : "";
        if (id && !item) {
          if (!f.unit.value) f.unit.value = BY_ID[id].unit;
          const loc = defaultLocation(id);
          f.querySelector(`input[name=location][value=${loc}]`).checked = true;
        }
      };
      f.name.addEventListener("change", showMatch);
      f.name.addEventListener("blur", showMatch);
      if (item) showMatch();
      el.querySelectorAll("[data-days]").forEach((b) => b.onclick = () => { f.expires.value = addDays(todayISO(), +b.dataset.days); });
      el.querySelector("[data-del]")?.addEventListener("click", () => {
        const idx = S.state.inventory.indexOf(item);
        S.state.inventory.splice(idx, 1); save(); close(); rr();
        toast(t("removed_x", { x: iname(item) }), "info", { label: t("undo"), fn: () => { S.state.inventory.splice(idx, 0, item); save(); rr(); } });
      });
      f.onsubmit = (e) => {
        e.preventDefault();
        let name = f.name.value.trim();
        if (!name) return;
        const rec = recognise(name);
        const id = rec.id;
        if (!id && rec.corrected) name = rec.name; // spell it the way the recipes do, so it matches them
        const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
        const data = {
          name, ingredientId: id, qty: num(f.qty.value), unit: f.unit.value || (id ? BY_ID[id].unit : ""),
          location: f.location.value, purchased: f.purchased.value, expires: f.expires.value, lowAt: num(f.lowAt.value), notes: f.notes.value.trim(),
          category: id ? BY_ID[id].category : "other",
        };
        if (item) Object.assign(item, data, { updatedAt: new Date().toISOString() });
        else addToInventory(data);
        save(); close(); rr();
        toast(item ? t("saved") : t("added_x", { x: iname(data) }));
      };
    },
  });
}

function quickAddSheet(rr) {
  const hasVoice = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  openSheet(t("quick_add"), `<p class="meta">${h(t("quick_add_help"))}</p>
    <div class="voice-row"><textarea id="qa-text" rows="6" placeholder="${h(t("quick_add_ph"))}"></textarea>
    ${hasVoice ? `<button class="btn" id="qa-voice" type="button">${icon("mic")} ${h(t("speak"))}</button>` : ""}</div>
    <fieldset class="field"><legend>${h(t("storage"))}</legend><div class="seg seg-full">
      <label><input type="radio" name="qa-loc" value="auto" checked><span>${h(t("auto_location"))}</span></label>
      ${LOCATIONS.map((l) => `<label><input type="radio" name="qa-loc" value="${l}"><span>${icon(LOC_ICON[l])} ${h(t("loc_" + l))}</span></label>`).join("")}</div></fieldset>
    <div id="qa-preview" class="qa-preview" aria-live="polite"></div>
    <div class="row-end"><button class="btn btn-primary" id="qa-add" disabled>${icon("check")} ${h(t("add_all"))}</button></div>`, {
    onMount: (el, close) => {
      const ta = el.querySelector("#qa-text");
      let items = [];
      const parse = () => {
        items = ta.value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).map(parseIngredientLine).filter(Boolean).map((i) => {
          if (i.ingredientId) return i;
          const rec = recognise(i.name);
          return rec.id ? { ...i, ingredientId: rec.id, uncertain: false, unit: i.unit || (i.qty != null ? "pc" : "") } : rec.corrected ? { ...i, name: rec.name } : i;
        });
        el.querySelector("#qa-preview").innerHTML = items.length ? `<ul>${items.map((i) => `<li>${i.ingredientId ? icon("circle-check", "st-green") : icon("circle-help", "st-amber")} <strong>${h(i.ingredientId ? iname(i) : i.name)}</strong> ${h(qty(i.qty, i.unit))}${i.ingredientId ? "" : ` <span class="meta">(${h(t("not_in_catalog"))})</span>`}</li>`).join("")}</ul>` : "";
        el.querySelector("#qa-add").disabled = !items.length;
        import("../core.js").then((c) => c.refreshIcons(el));
      };
      ta.addEventListener("input", parse);
      el.querySelector("#qa-voice")?.addEventListener("click", (e) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SR();
        rec.lang = { en: "en-US", uz: "uz-UZ", ko: "ko-KR", ru: "ru-RU" }[S.state.prefs.lang] || "en-US";
        rec.interimResults = false;
        e.currentTarget.disabled = true;
        rec.onresult = (ev) => { ta.value += (ta.value ? "\n" : "") + ev.results[0][0].transcript.replace(/ and | и | va | 그리고 /g, ", "); parse(); };
        rec.onend = () => { el.querySelector("#qa-voice").disabled = false; };
        rec.onerror = () => toast(t("voice_failed"), "error");
        rec.start();
      });
      el.querySelector("#qa-add").onclick = () => {
        const locChoice = el.querySelector("input[name=qa-loc]:checked").value;
        for (const i of items) addToInventory({
          name: i.name, ingredientId: i.ingredientId, qty: i.qty, unit: i.unit || (i.ingredientId ? BY_ID[i.ingredientId].unit : ""),
          location: locChoice === "auto" ? defaultLocation(i.ingredientId) : locChoice, expires: "", category: i.ingredientId ? BY_ID[i.ingredientId].category : "other",
        });
        save(); close(); rr(); toast(t("added_n_items", { n: items.length }));
      };
    },
  });
}

export function bindKitchen(root, rr) {
  const q = root.querySelector("#inv-q");
  q?.addEventListener("input", () => { kv.q = q.value; rr({ keepFocus: "#inv-q" }); });
  root.querySelector("#inv-cat")?.addEventListener("change", (e) => { kv.cat = e.target.value; rr(); });
}
