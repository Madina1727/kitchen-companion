// Weekly meal planner and grocery list.
import { S, t, tn, h, icon, save, toast, openSheet, qty, recipeById, go, uid, iname, catLabel, unitLabel, todayISO, addDays, dateLabel, defaultLocation, CATEGORIES, BY_ID } from "../core.js";
import { buildGrocery, matchRecipe, resolveIngredient, ingCategory, UNIT_LIST, keyOf } from "../engine.js";
import { ctx, availabilityLine, recipeRow } from "./recipes.js";
import { addToInventory } from "./kitchen.js";
import { parseIngredientLine } from "../parser.js";

const MEALS = ["breakfast", "lunch", "dinner"];
const ps = { weekStart: null, day: null };
function mondayOf(iso) { const d = new Date(iso + "T00:00:00"); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return todayISO(d); }

export function viewPlan() {
  if (!ps.weekStart) ps.weekStart = mondayOf(todayISO());
  const days = [...Array(7)].map((_, i) => addDays(ps.weekStart, i));
  const today = todayISO();
  if (!ps.day || !days.includes(ps.day)) ps.day = days.includes(today) ? today : days[0];
  const st = S.state;
  const weekEntries = st.plan.filter((p) => days.includes(p.date));
  const dayEntries = weekEntries.filter((p) => p.date === ps.day);
  const mealSec = (meal) => {
    const es = dayEntries.filter((p) => p.meal === meal);
    return `<section class="meal-sec"><h2>${h(t("meal_" + meal))}</h2>
      <div class="rrows">${es.map((p) => {
        const r = recipeById(p.recipeId);
        if (!r) return "";
        return `<div class="planned-row ${p.done ? "done" : ""}">${recipeRow(r, { match: matchRecipe(r, ctx(p.servings)), extra: t("n_servings", { n: p.servings }) + (p.done ? " · " + t("cooked") : "") })}
          <div class="row-actions">
            <button class="icon-btn" data-act="plan-serv" data-id="${p.id}" data-d="-1" aria-label="${h(t("fewer"))}">${icon("minus")}</button>
            <button class="icon-btn" data-act="plan-serv" data-id="${p.id}" data-d="1" aria-label="${h(t("more"))}">${icon("plus")}</button>
            <button class="icon-btn" data-act="plan-del" data-id="${p.id}" aria-label="${h(t("remove"))}">${icon("trash-2")}</button>
          </div></div>`;
      }).join("")}
      <button class="add-slot" data-act="plan-pick" data-date="${ps.day}" data-meal="${meal}">${icon("plus")} ${h(t("add_meal_suggest", { m: t("meal_" + meal).toLowerCase() }))}</button></div>
    </section>`;
  };
  return `<div class="page page-narrow">
    <header class="page-head">
      <div><h1>${h(t("this_week"))}</h1><p class="meta">${h(dateLabel(days[0], { month: "long", day: "numeric" }))} – ${h(dateLabel(days[6], { month: "long", day: "numeric" }))}</p></div>
      <button class="btn btn-dark" data-act="plan-suggest">${icon("sparkle")} ${h(t("auto_plan"))}</button>
    </header>
    ${!st.recipes.length ? `<div class="notice">${icon("info")}<div><p>${h(t("plan_needs_recipes"))}</p><p><a href="#/import">${h(t("import_recipe"))}</a></p></div></div>` : ""}
    <div class="row-between" style="margin-top:0">
      <button class="icon-btn" data-act="week" data-d="-7" aria-label="${h(t("prev_week"))}">${icon("chevron-left")}</button>
      <button class="btn btn-sm btn-soft" data-act="week" data-d="0">${h(t("today"))}</button>
      <button class="icon-btn" data-act="week" data-d="7" aria-label="${h(t("next_week"))}">${icon("chevron-right")}</button>
    </div>
    <div class="days" role="tablist">
      ${days.map((d) => {
        const n = weekEntries.filter((p) => p.date === d).length;
        return `<button role="tab" class="day-btn ${d === ps.day ? "on" : ""} ${d === today ? "today" : ""}" data-act="plan-day" data-v="${d}" aria-selected="${d === ps.day}">
          <small>${h(dateLabel(d, { weekday: "short" }))}</small><strong>${h(dateLabel(d, { day: "numeric" }))}</strong><span class="dots">${"<i></i>".repeat(Math.min(3, n))}</span></button>`;
      }).join("")}
    </div>
    <p class="eyebrow accent">${h(dateLabel(ps.day, { weekday: "long" }))} ${h(dateLabel(ps.day, { day: "numeric" }))}</p>
    ${MEALS.map(mealSec).join("")}
    <div class="row-end"><button class="btn btn-primary" data-act="plan-grocery" ${weekEntries.filter((e) => !e.done).length ? "" : "disabled"}>${icon("shopping-cart")} ${h(t("make_grocery_list"))}</button></div>
  </div>`;
}

export const planActions = {
  week: (el, rr) => { const d = +el.dataset.d; ps.weekStart = d === 0 ? mondayOf(todayISO()) : addDays(ps.weekStart, d); ps.day = d === 0 ? todayISO() : null; rr(); },
  "plan-day": (el, rr) => { ps.day = el.dataset.v; rr(); },
  "plan-del": (el, rr) => { S.state.plan = S.state.plan.filter((p) => p.id !== el.dataset.id); save(); rr(); },
  "plan-serv": (el, rr) => { const p = S.state.plan.find((x) => x.id === el.dataset.id); p.servings = Math.max(1, p.servings + +el.dataset.d); save(); rr(); },
  "plan-pick": (el, rr) => pickRecipe(el.dataset.date, el.dataset.meal, rr),
  "plan-grocery": (_, rr) => {
    const days = [...Array(7)].map((_, i) => addDays(ps.weekStart, i));
    const entries = S.state.plan.filter((p) => days.includes(p.date) && !p.done);
    const byId = Object.fromEntries(S.state.recipes.map((r) => [r.id, r]));
    const rows = buildGrocery(entries, byId, S.state.inventory, S.state.prefs.staples);
    // Replace earlier plan-generated items that are not yet bought.
    S.state.grocery = S.state.grocery.filter((g) => g.source !== "plan" || g.checked);
    for (const r of rows) {
      S.state.grocery.push({ id: uid(), name: r.name || iname(r), ingredientId: r.ingredientId || null, qty: r.qty, unit: r.qty != null ? r.unit : "", extra: r.extra, checked: false, source: "plan", note: r.recipes.join(", ") });
    }
    save(); toast(t("grocery_made_n", { n: rows.length })); go("#/grocery");
  },
  "plan-suggest": (_, rr) => {
    // Fill empty dinner slots this week with the best kitchen matches not already planned.
    const days = [...Array(7)].map((_, i) => addDays(ps.weekStart, i)).filter((d) => d >= todayISO());
    const used = new Set(S.state.plan.filter((p) => days.includes(p.date)).map((p) => p.recipeId));
    const pool = S.state.recipes.map((r) => matchRecipe(r, ctx())).filter((m) => ["ready", "subs", "short", "one"].includes(m.bucket) && !used.has(m.recipe.id) && m.recipe.category !== "breakfast" && m.recipe.category !== "dessert" && m.recipe.category !== "drink")
      .sort((a, b) => b.score - a.score);
    let n = 0;
    for (const d of days) {
      if (S.state.plan.some((p) => p.date === d && p.meal === "dinner")) continue;
      const m = pool.shift();
      if (!m) break;
      S.state.plan.push({ id: uid(), date: d, meal: "dinner", recipeId: m.recipe.id, servings: m.recipe.servings || 2, done: false });
      n++;
    }
    save(); rr(); toast(n ? t("planned_n", { n }) : t("nothing_to_plan"));
  },
};

function pickRecipe(date, meal, rr) {
  const list = S.state.recipes.map((r) => ({ r, m: matchRecipe(r, ctx()) })).filter((x) => x.m.bucket !== "blocked").sort((a, b) => b.m.score - a.m.score);
  const render = (q) => list.filter((x) => !q || x.r.title.toLowerCase().includes(q.toLowerCase())).slice(0, 60).map((x) => `<button class="pick-row" data-id="${x.r.id}">
    <strong>${h(x.r.title)}</strong>${availabilityLine(x.m)}</button>`).join("") || `<p class="meta">${h(t("no_results"))}</p>`;
  openSheet(t("add_meal_to", { m: t("meal_" + meal), d: dateLabel(date, { weekday: "long", day: "numeric", month: "short" }) }), `
    <label class="search">${icon("search")}<input type="search" id="pick-q" placeholder="${h(t("search_recipes_ph"))}"></label>
    <label class="field-inline">${h(t("servings"))} <input id="pick-serv" inputmode="numeric" size="4" placeholder="${h(t("as_written"))}"></label>
    <div class="pick-list" id="pick-list">${render("")}</div>`, {
    onMount: (el, close) => {
      const listEl = el.querySelector("#pick-list");
      const bind = () => listEl.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => {
        const r = recipeById(b.dataset.id);
        S.state.plan.push({ id: uid(), date, meal, recipeId: r.id, servings: parseInt(el.querySelector("#pick-serv").value) || r.servings || 2, done: false });
        save(); close(); rr();
      });
      el.querySelector("#pick-q").addEventListener("input", (e) => { listEl.innerHTML = render(e.target.value); import("../core.js").then((c) => c.refreshIcons(listEl)); bind(); });
      bind();
    },
  });
}

/* ---------- grocery list ---------- */
const gs = { by: "aisle" };
export function viewGrocery() {
  const g = S.state.grocery;
  const checked = g.filter((x) => x.checked).length;
  const groups = {};
  const keyFor = (it) => gs.by === "recipe" ? (it.note || t("added_by_you")) : ingCategory(it);
  for (const it of g) (groups[keyFor(it)] ||= []).push(it);
  const order = gs.by === "recipe" ? Object.keys(groups).sort() : CATEGORIES.filter((c) => groups[c]);
  const recipesCount = new Set(g.filter((x) => x.source === "plan" || x.source === "recipe").flatMap((x) => (x.note || "").split(", ")).filter(Boolean)).size;
  const item = (it) => `<li class="${it.checked ? "checked" : ""}">
      <span class="g-name"><strong>${h(it.ingredientId ? iname(it) : it.name)}</strong>
      <small class="meta">${[it.qty != null ? qty(it.qty, it.unit) : "", ...(it.extra || []).map((e) => qty(e.qty, e.unit)), gs.by === "aisle" && it.note ? t("for_x", { x: it.note }) : ""].filter(Boolean).map(h).join(" · ")}</small></span>
      <button class="icon-btn" data-act="g-del" data-id="${it.id}" aria-label="${h(t("remove"))}">${icon("x")}</button>
      <label class="round-check"><input type="checkbox" data-act="g-check" data-id="${it.id}" ${it.checked ? "checked" : ""} aria-label="${h(t("in_basket"))}"><span></span></label>
    </li>`;
  return `<div class="page page-narrow">
    <header class="page-head"><h1>${h(t("grocery_list"))}</h1><a class="circle-btn" href="#/plan" aria-label="${h(t("open_planner"))}">${icon("calendar-days")}</a></header>
    <section class="list-summary">
      <p class="eyebrow">${h(t("to_buy"))}</p>
      <div class="big">${h(tn("n_items_short", g.length - checked))}</div>
      <div class="bar"><span style="width:${g.length ? Math.round((checked / g.length) * 100) : 0}%"></span></div>
      <p>${h(t("in_basket_n", { n: checked, t: g.length }))}${recipesCount ? " · " + h(t("for_n_recipes", { n: recipesCount })) : ""}</p>
    </section>
    <div class="seg seg-full seg-lg" role="tablist" style="margin-bottom:14px">
      <button class="${gs.by === "aisle" ? "on" : ""}" data-act="g-by" data-v="aisle">${h(t("by_aisle"))}</button>
      <button class="${gs.by === "recipe" ? "on" : ""}" data-act="g-by" data-v="recipe">${h(t("by_recipe"))}</button>
    </div>
    <form class="add-row" id="g-add">
      <input name="text" placeholder="${h(t("grocery_add_ph"))}" aria-label="${h(t("add_item"))}" list="ing-list-g">
      <button class="circle-btn accent" aria-label="${h(t("add"))}">${icon("plus")}</button>
    </form>
    ${g.length === 0 ? `<div class="empty">${icon("shopping-cart", "ic-xl")}<h2>${h(t("grocery_empty"))}</h2><p>${h(t("grocery_empty_text"))}</p></div>` :
      order.map((c) => `<section><div class="g-head"><h2>${h(gs.by === "recipe" ? c : catLabel(c))}</h2><span>${h(tn("n_items_short", groups[c].length))}</span></div>
        <ul class="g-list">${groups[c].map(item).join("")}</ul></section>`).join("")}
    ${checked ? `<div class="row-between sticky-actions"><button class="btn" data-act="g-clear">${icon("trash-2")} ${h(t("clear_checked"))}</button>
      <button class="btn btn-primary" data-act="g-stock">${icon("refrigerator")} ${h(t("move_to_kitchen_n", { n: checked }))}</button></div>` : ""}
  </div>`;
}
export const groceryActions = {
  "g-by": (el, rr) => { gs.by = el.dataset.v; rr(); },
  "g-check": (el, rr) => { const it = S.state.grocery.find((x) => x.id === el.dataset.id); it.checked = !it.checked; save(); rr(); },
  "g-del": (el, rr) => { S.state.grocery = S.state.grocery.filter((x) => x.id !== el.dataset.id); save(); rr(); },
  "g-clear": (_, rr) => { S.state.grocery = S.state.grocery.filter((x) => !x.checked); save(); rr(); },
  "g-stock": (_, rr) => {
    const items = S.state.grocery.filter((x) => x.checked);
    openSheet(t("move_to_kitchen"), `<p class="meta">${h(t("move_help"))}</p>
      <form id="stock-form" class="deduct-list">${items.map((it, k) => `<div class="deduct-row">
        <span class="d-name">${h(it.ingredientId ? iname(it) : it.name)}</span>
        <label class="d-qty"><input name="q${k}" inputmode="decimal" value="${it.qty != null ? Math.round(it.qty * 100) / 100 : ""}" placeholder="${h(t("amount"))}"><select name="u${k}"><option value="">—</option>${UNIT_LIST.map((u) => `<option value="${u}" ${it.unit === u ? "selected" : ""}>${h(unitLabel(u))}</option>`).join("")}</select></label>
        <select name="l${k}" aria-label="${h(t("storage"))}">${["fridge", "freezer", "pantry"].map((l) => `<option value="${l}" ${defaultLocation(it.ingredientId) === l ? "selected" : ""}>${h(t("loc_" + l))}</option>`).join("")}</select>
        <input type="date" name="e${k}" aria-label="${h(t("expiry_date"))}" title="${h(t("expiry_date"))}">
      </div>`).join("")}</form>
      <div class="row-end"><button class="btn btn-primary" data-ok>${icon("check")} ${h(t("add_to_kitchen"))}</button></div>`, {
      wide: true,
      onMount: (el, close) => el.querySelector("[data-ok]").onclick = () => {
        const f = el.querySelector("form");
        items.forEach((it, k) => {
          const q = parseFloat(String(f["q" + k].value).replace(",", "."));
          addToInventory({ name: it.name, ingredientId: it.ingredientId, qty: isNaN(q) ? null : q, unit: f["u" + k].value, location: f["l" + k].value, expires: f["e" + k].value, category: ingCategory(it) });
        });
        S.state.grocery = S.state.grocery.filter((x) => !x.checked);
        save(); close(); rr(); toast(t("added_n_items", { n: items.length }));
      },
    });
  },
};
export function bindGrocery(root, rr) {
  const f = root.querySelector("#g-add");
  if (!f) return;
  if (!document.getElementById("ing-list-g")) {
    const dl = document.createElement("datalist");
    dl.id = "ing-list-g";
    dl.innerHTML = Object.values(BY_ID).map((i) => `<option value="${h(i.names[S.state.prefs.lang] || i.names.en)}">`).join("");
    root.appendChild(dl);
  }
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = parseIngredientLine(f.text.value);
    if (!p) return;
    S.state.grocery.push({ id: uid(), name: p.name, ingredientId: p.ingredientId, qty: p.qty, unit: p.unit, checked: false, source: "manual", note: p.note });
    save(); rr({ keepFocus: "#g-add input" });
  });
}
