// Home ("What can I cook today?") and the full recommendations screen.
import { S, t, h, icon, iname, minutes, go, todayISO, recipeById, catLabel, catIcon, qty, save, toast, uid, aiAvailable, hooks, mealsOf, guessMeals, openSheet, refreshIcons, planMeals, slotFit, addDays, dateLabel } from "../core.js";
import { matchAll, matchRecipe, expiryStatus, ingCategory, exclusionsFor } from "../engine.js";
import { suggestFromKitchen, aiErrorKey } from "../ai.js";
import { recipeCard, recipeRow, ctx, emptyLibrary, RECIPE_CATS, recipeCover, mealChips, availabilityLine } from "./recipes.js";
import { expiryBadge, expiryPill, setKitchenFilter } from "./kitchen.js";

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 5 ? "night" : hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";
  const name = S.state.profile.name;
  return name ? t("greet_" + part + "_name", { name }) : t("greet_" + part);
}

const homeState = { chip: "all" };
const HOME_CHIPS = [["all", "all"], ["quick", "quick_meals_chip"], ["dinner", "cat_dinner"], ["breakfast", "cat_breakfast"], ["lunch", "cat_lunch"], ["dessert", "cat_dessert"]];

export function viewHome() {
  const st = S.state;
  const matches = matchAll(st.recipes, ctx());
  const ok = matches.filter((m) => m.bucket !== "blocked" && !m.recipe.noSuggest); // "Don't suggest" recipes stay in the library only
  const ready = ok.filter((m) => m.bucket === "ready" || m.bucket === "subs");
  const near = ok.filter((m) => m.bucket === "one" || m.bucket === "short");
  const chipOk = (m) => homeState.chip === "all" ? true : homeState.chip === "quick" ? m.totalTime && m.totalTime <= 30 : mealsOf(m.recipe).includes(homeState.chip);
  const expiring = st.inventory.filter((it) => ["expired", "soon", "week"].includes(expiryStatus(it))).sort((a, b) => (a.expires || "").localeCompare(b.expires || ""));
  const soonCount = st.inventory.filter((it) => ["expired", "soon"].includes(expiryStatus(it))).length;
  const useExp = ok.filter((m) => m.usesExpiring && ["ready", "subs", "short", "one"].includes(m.bucket)).slice(0, 3);
  const today = todayISO();
  const planned = st.plan.filter((p) => p.date === today).map((p) => ({ ...p, r: recipeById(p.recipeId) })).filter((p) => p.r);
  const recent = [...new Map(st.history.slice(-6).reverse().map((x) => recipeById(x.recipeId)).filter(Boolean).map((r) => [r.id, r])).values()].slice(0, 4);
  const shelf = (ready.length ? ready : near).filter(chipOk).slice(0, 10);
  const heroImg = (ready.find((m) => m.recipe.image) || near.find((m) => m.recipe.image))?.recipe.image;
  const name = st.profile.name;
  const heroTitle = st.recipes.length === 0 ? t("hero_no_recipes") : st.inventory.length === 0 ? t("hero_no_kitchen") : ready.length ? t("hero_ready_n", { n: ready.length }) : near.length ? t("hero_one_n", { n: near.length }) : t("hero_none");
  return `<div class="page page-home">
    <header class="home-top">
      <a class="avatar" href="#/profile" aria-label="${h(t("nav_profile"))}">${name ? h(name.trim().charAt(0).toUpperCase()) : icon("user")}</a>
      <div class="greet"><small>${h(greeting())}</small><strong>${h(t("whats_cooking"))}</strong></div>
      <button class="circle-btn" data-act="theme-toggle" aria-label="${h(t("switch_theme"))}" title="${h(t("switch_theme"))}">${icon(document.documentElement.style.colorScheme === "dark" ? "sun" : "moon")}</button>
      <a class="circle-btn bell" href="#/kitchen" data-act="show-expiring" aria-label="${h(t("use_soon"))}">${icon("bell")}${soonCount ? `<span class="dot"></span>` : ""}</a>
    </header>
    <form class="search-wrap" id="home-search" role="search">
      <label class="search">${icon("search")}<input type="search" name="q" placeholder="${h(t("home_search_ph"))}" aria-label="${h(t("search"))}"></label>
      <a class="filter-btn" href="#/discover" aria-label="${h(t("recommendations"))}">${icon("sliders-horizontal")}</a>
    </form>

    ${hooks.signedIn && !hooks.signedIn() ? `<a class="sync-cta" href="#/profile">${icon("cloud-off")}<span><strong>${h(t("sync_cta"))}</strong><small>${h(t("sync_cta_sub"))}</small></span>${icon("chevron-right")}</a>` : ""}
    <section class="hero-dark">
      <div class="hero-text">
        <p class="eyebrow">${h(t("ready_tonight_eyebrow"))}</p>
        <h2>${h(heroTitle)}</h2>
        <div class="row wrap">
          ${st.recipes.length && st.inventory.length ? `<a class="btn btn-primary" href="#/discover">${icon("arrow-right")} ${h(t("see_matches"))}</a>` : ""}
          ${!st.inventory.length ? `<button class="btn btn-primary" data-act="inv-quick">${icon("list-plus")} ${h(t("add_your_ingredients"))}</button>` : ""}
          ${!st.recipes.length ? `<a class="btn ${st.inventory.length ? "btn-primary" : ""}" href="#/import">${icon("download")} ${h(t("import_recipe"))}</a>` : ""}
        </div>
      </div>
      ${heroImg ? `<div class="hero-img"><img src="${h(heroImg)}" alt=""></div>` : ""}
    </section>

    ${st.recipes.length ? `<button class="idea-cta" data-act="home-deck">${icon("shuffle")}<span><strong>${h(t("no_idea"))}</strong><small>${h(t("no_idea_sub"))}</small></span>${icon("chevron-right")}</button>` : ""}
    ${st.recipes.length ? `<div class="chips" role="group" aria-label="${h(t("category"))}">${HOME_CHIPS.map(([v, k]) => `<button class="chip ${homeState.chip === v ? "on" : ""}" data-act="home-chip" data-v="${v}">${h(t(k))}</button>`).join("")}</div>` : ""}

    ${planned.length ? `<section class="sec"><div class="sec-head"><h2>${h(t("planned_today"))}</h2><a href="#/plan">${h(t("open_planner"))}</a></div>
      <div class="rrows two">${planned.map((p) => recipeRow(p.r, { extra: t("meal_" + p.meal) })).join("")}</div></section>` : ""}

    ${st.recipes.length && st.inventory.length ? `<section class="sec"><div class="sec-head"><h2>${h(ready.length ? t("ready_tonight") : t("almost_there"))}</h2><a href="#/discover">${h(t("see_all"))}</a></div>
      ${shelf.length ? `<div class="hscroll">${shelf.map((m) => recipeCard(m.recipe, { match: m })).join("")}</div>` : `<p class="meta">${h(t("no_matches_filters"))}</p>`}</section>` : ""}

    ${expiring.length ? `<section class="sec"><div class="sec-head"><h2>${h(t("use_soon"))}</h2><a href="#/kitchen" data-act="show-expiring">${h(t("nav_kitchen"))}</a></div>
      <div class="ing-tiles">${expiring.slice(0, 10).map(ingTile).join("")}</div>
      ${useExp.length ? `<p class="meta" style="margin-top:14px">${h(t("recipes_using_these"))}</p><div class="rrows two">${useExp.map((m) => recipeRow(m.recipe, { match: m })).join("")}</div>` : ""}
    </section>` : ""}

    ${st.inventory.length ? `<section class="sec"><div class="sec-head"><h2>${h(t("my_ingredients"))}</h2><a href="#/kitchen">${h(t("nav_kitchen"))}</a></div>
      <div class="ing-tiles">${st.inventory.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 12).map(ingTile).join("")}</div></section>` : ""}

    ${recent.length ? `<section class="sec"><div class="sec-head"><h2>${h(t("recently_cooked"))}</h2></div><div class="rrows two">${recent.map((r) => recipeRow(r)).join("")}</div></section>` : ""}

    <section class="sec tiles">
      <a class="tile" href="#/assistant">${icon("sparkle", "ic-lg")}<span><strong>${h(t("ai_chef"))}</strong><small>${h(t("assistant_sub"))}</small></span></a>
      <a class="tile" href="#/books">${icon("library", "ic-lg")}<span><strong>${h(t("recipe_books"))}</strong><small>${h(t("recipe_books_sub"))}</small></span></a>
      <a class="tile" href="#/plan">${icon("calendar-days", "ic-lg")}<span><strong>${h(t("nav_plan"))}</strong><small>${h(t("plan_sub"))}</small></span></a>
    </section>
  </div>`;
}
function ingTile(it) {
  return `<a class="ing-tile" href="#/kitchen"><div class="ing-icon">${icon(catIcon(ingCategory(it)))}</div><strong>${h(iname(it))}</strong><small>${it.qty != null ? h(qty(it.qty, it.unit)) : h(t("loc_" + it.location))}</small>${["expired", "soon", "week"].includes(expiryStatus(it)) ? `<div>${expiryPill(it)}</div>` : ""}</a>`;
}

export function bindHome(root) {
  root.querySelector("#home-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) go("#/search?q=" + encodeURIComponent(q));
  });
}

/* ---------- "No idea": one dish at a time; right = plan it, left = next ---------- */
function ideaDeck(rr) {
  const all = matchAll(S.state.recipes.filter((r) => !r.noSuggest), ctx()).filter((m) => m.bucket !== "blocked");
  const mix = (list) => list.map((m) => [m, Math.random()]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const pools = {
    any: () => mix(all),
    quick: () => mix(all.filter((m) => m.totalTime && m.totalTime <= 30)),
    kitchen: () => all.filter((m) => ["ready", "subs", "one", "short"].includes(m.bucket)).sort((a, b) => b.score - a.score),
    sweet: () => mix(all.filter((m) => mealsOf(m.recipe).includes("dessert"))),
  };
  let mode = "any", deck = pools.any(), i = 0, planned = 0;
  openSheet(t("no_idea"), `<div class="seg seg-full" id="deck-modes">${Object.keys(pools).map((k) => `<button data-mode="${k}" class="${k === mode ? "on" : ""}">${h(t("deck_" + k))}</button>`).join("")}</div>
    <div id="deck-card"></div>
    <div class="deck-actions"><button class="btn btn-lg" data-skip>${icon("x")} ${h(t("deck_next"))}</button><button class="btn btn-primary btn-lg" data-plan>${icon("check")} ${h(t("deck_plan"))}</button></div>
    <p class="meta center">${h(t("deck_hint"))}</p>`, {
    onClose: () => { if (planned) rr(); },
    onMount: (el) => {
      const box = el.querySelector("#deck-card");
      const draw = () => {
        const m = deck[i];
        el.querySelector("[data-plan]").disabled = el.querySelector("[data-skip]").disabled = !m;
        box.innerHTML = m ? `<article class="deck-card">${recipeCover(m.recipe)}<div class="deck-body">${mealChips(m.recipe)}<h3>${h(m.recipe.title)}</h3>
          <p class="meta">${m.totalTime ? icon("clock") + " " + h(minutes(m.totalTime)) : ""}</p>${availabilityLine(m)}
          <a class="btn-link" href="#/recipe/${m.recipe.id}" data-open>${h(t("open_recipe"))}</a></div></article>`
          : `<div class="empty"><p>${h(t(deck.length ? "deck_end" : "no_results"))}</p>${deck.length ? `<button class="btn" data-again>${h(t("deck_again"))}</button>` : ""}</div>`;
        refreshIcons(box);
        box.querySelector("[data-again]")?.addEventListener("click", () => { deck = pools[mode](); i = 0; draw(); });
        const card = box.querySelector(".deck-card");
        if (!card) return;
        // Drag the card: right to plan, left for the next one.
        let x0 = null, dx = 0;
        card.onpointerdown = (e) => { if (e.target.closest("a")) return; x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); };
        card.onpointermove = (e) => { if (x0 == null) return; dx = e.clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`; card.dataset.dir = dx > 60 ? "yes" : dx < -60 ? "no" : ""; };
        card.onpointerup = card.onpointercancel = () => { if (x0 == null) return; x0 = null; if (dx > 90) plan(); else if (dx < -90) next(); else { card.style.transform = ""; card.dataset.dir = ""; } };
      };
      const next = () => { i++; draw(); };
      const plan = () => {
        const r = deck[i].recipe;
        // The first free meal of the right kind, from today on.
        let slot = null;
        for (let d = 0; d < 14 && !slot; d++) for (const meal of planMeals()) {
          const date = addDays(todayISO(), d);
          if (slotFit(r, meal) && !S.state.plan.some((p) => p.date === date && p.meal === meal)) { slot = { date, meal }; break; }
        }
        slot ||= { date: todayISO(), meal: planMeals().at(-1) };
        S.state.plan.push({ id: uid(), date: slot.date, meal: slot.meal, recipeId: r.id, servings: r.servings || 2, done: false });
        save(); planned++;
        toast(t("deck_planned", { x: r.title, d: dateLabel(slot.date, { weekday: "long" }), m: t("meal_" + slot.meal).toLowerCase() }));
        next();
      };
      el.querySelector("[data-skip]").onclick = next;
      el.querySelector("[data-plan]").onclick = plan;
      el.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { mode = b.dataset.mode; deck = pools[mode](); i = 0; el.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
      draw();
    },
  });
}

export const homeActions = {
  "home-deck": (_, rr) => ideaDeck(rr),
  surprise: () => {
    const ok = matchAll(S.state.recipes, ctx()).filter((m) => m.bucket === "ready" || m.bucket === "subs");
    const pool = ok.length ? ok : matchAll(S.state.recipes, ctx()).filter((m) => m.bucket !== "blocked" && m.bucket !== "far");
    if (!pool.length) return import("../core.js").then((c) => c.toast(t("nothing_to_surprise")));
    go("#/recipe/" + pool[Math.floor(Math.random() * pool.length)].recipe.id);
  },
  "show-expiring": () => { setKitchenFilter("expiring"); },
  "home-chip": (el, rr) => { homeState.chip = el.dataset.v; rr(); },
  "disc-avail": (el, rr) => { f.avail = f.avail === el.dataset.v ? "all" : el.dataset.v; rr(); },
  "disc-time": (el, rr) => { f.time = f.time === +el.dataset.v ? 0 : +el.dataset.v; rr(); },
  "disc-exp": (_, rr) => { f.exp = !f.exp; rr(); },
  "disc-fav": (_, rr) => { f.fav = !f.fav; rr(); },
  "disc-more": (el, rr) => { f.more[el.dataset.v] = (f.more[el.dataset.v] || 12) + 24; rr(); },
};

/* ---------- recommendations ---------- */
const f = { avail: "all", time: 0, cat: "all", exp: false, fav: false, servings: null, more: {} };
export function viewDiscover() {
  const st = S.state;
  if (!st.recipes.length) return `<div class="page"><h1>${h(t("for_you_tonight"))}</h1>${emptyLibrary()}</div>`;
  const people = st.prefs.people || 2;
  let all = matchAll(st.recipes, ctx(people));
  const blocked = all.filter((m) => m.bucket === "blocked");
  let list = all.filter((m) => m.bucket !== "blocked");
  if (f.time) list = list.filter((m) => m.totalTime && m.totalTime <= f.time);
  if (f.cat !== "all") list = list.filter((m) => mealsOf(m.recipe).includes(f.cat));
  if (f.exp) list = list.filter((m) => m.usesExpiring);
  if (f.fav) list = list.filter((m) => m.recipe.favorite);
  if (f.avail === "ready") list = list.filter((m) => m.bucket === "ready" || m.bucket === "subs");
  if (f.avail === "one") list = list.filter((m) => ["ready", "subs", "short", "one"].includes(m.bucket));
  if (f.avail === "two") list = list.filter((m) => m.bucket !== "far");
  const sections = [
    ["ready", t("sec_ready"), list.filter((m) => m.bucket === "ready")],
    ["subs", t("sec_subs"), list.filter((m) => m.bucket === "subs")],
    ["short", t("sec_short"), list.filter((m) => m.bucket === "short")],
    ["one", t("sec_one"), list.filter((m) => m.bucket === "one")],
    ["two", t("sec_two"), list.filter((m) => m.bucket === "two")],
    ["far", t("sec_far"), list.filter((m) => m.bucket === "far")],
  ];
  const soon = st.inventory.filter((it) => ["expired", "soon", "week"].includes(expiryStatus(it))).length;
  const chip = (act, v, label, on) => `<button class="chip ${on ? "on" : ""}" data-act="${act}" data-v="${v}">${h(label)}</button>`;
  return `<div class="page">
    <header class="page-head"><div><h1>${h(t("for_you_tonight"))}</h1>
      <p class="lead">${h(t("based_on_n", { n: st.inventory.length }))}${soon ? " " + h(t("n_use_soon", { n: soon })) : ""}</p></div>
      <button class="circle-btn" data-act="surprise" aria-label="${h(t("surprise_me"))}" title="${h(t("surprise_me"))}">${icon("shuffle")}</button></header>
    ${peoplePicker(people)}
    ${ideasPanel(people)}
    <div class="chips" role="group" aria-label="${h(t("availability"))}" style="margin-top:18px">
      ${chip("disc-avail", "ready", t("ready_now"), f.avail === "ready")}
      ${chip("disc-avail", "one", t("one_missing_chip"), f.avail === "one")}
      ${chip("disc-avail", "two", t("two_missing_chip"), f.avail === "two")}
      ${chip("disc-time", "30", t("under_min", { n: 30 }), f.time === 30)}
      ${chip("disc-time", "15", t("under_min", { n: 15 }), f.time === 15)}
      ${chip("disc-exp", "1", t("uses_expiring"), f.exp)}
      ${chip("disc-fav", "1", t("favorites"), f.fav)}
    </div>
    <details class="more-filters"><summary>${icon("sliders-horizontal")} ${h(t("more_filters"))}</summary><div class="toolbar">
      <select id="f-cat" aria-label="${h(t("category"))}"><option value="all">${h(t("all_categories"))}</option>${RECIPE_CATS.map((c) => `<option value="${c}" ${f.cat === c ? "selected" : ""}>${h(catLabel(c))}</option>`).join("")}</select>
      <span class="meta">${h(t("staples_note", { x: st.prefs.staples.map((id) => iname({ ingredientId: id })).join(", ") || "—" }))} <a href="#/profile">${h(t("change"))}</a></span>
    </div></details>
    ${!st.inventory.length ? `<div class="notice notice-amber">${icon("info")}<div><p>${h(t("discover_no_kitchen"))}</p><p><a href="#/kitchen">${h(t("go_to_kitchen"))}</a></p></div></div>` : ""}
    <h2 class="sub-title">${h(t("from_your_recipes_for", { n: people }))}</h2>
    ${sections.filter(([, , l]) => l.length).map(([k, title, l]) => `<section class="sec"><div class="sec-head"><h2>${h(title)} <span class="n">${l.length}</span></h2></div>
      <div class="rrows two">${l.slice(0, f.more[k] || 12).map((m) => recipeRow(m.recipe, { match: m, extra: t("for_n_people", { n: people }) })).join("")}</div>
      ${l.length > (f.more[k] || 12) ? `<div class="row center more-row"><button class="btn" data-act="disc-more" data-v="${k}">${h(t("show_more_n", { n: Math.min(24, l.length - (f.more[k] || 12)), t: l.length - (f.more[k] || 12) }))}</button></div>` : ""}</section>`).join("") || `<div class="empty"><p>${h(t("no_matches_filters"))}</p></div>`}
    ${blocked.length ? `<details class="sec blocked-sec"><summary>${icon("ban")} ${h(t("not_suitable_n", { n: blocked.length }))}</summary>
      <ul>${blocked.map((m) => `<li><a href="#/recipe/${m.recipe.id}">${h(m.recipe.title)}</a> <span class="meta">${[...new Set(m.blocked.map((b) => iname(b.ri)))].map(h).join(", ")}</span></li>`).join("")}</ul></details>` : ""}
  </div>`;
}
export function bindDiscover(root, rr) {
  const on = (id, fn) => root.querySelector(id)?.addEventListener("change", (e) => { fn(e.target); rr(); });
  on("#f-cat", (el) => f.cat = el.value);
  root.querySelector("#people-custom")?.addEventListener("change", (e) => { const n = Math.max(1, Math.min(50, parseInt(e.target.value) || 2)); S.state.prefs.people = n; save(); rr(); });
}

/* ---------- global search ---------- */
export function viewSearch(q) {
  const st = S.state;
  const n = (q || "").toLowerCase();
  const recipes = st.recipes.filter((r) => r.title.toLowerCase().includes(n) || r.ingredients.some((i) => (i.name || "").toLowerCase().includes(n) || iname(i).toLowerCase().includes(n)));
  const items = st.inventory.filter((i) => iname(i).toLowerCase().includes(n) || (i.name || "").toLowerCase().includes(n));
  return `<div class="page"><a class="back" href="#/home">${icon("chevron-left")} ${h(t("nav_home"))}</a>
    <h1>${h(t("results_for", { q }))}</h1>
    <section class="sec"><h2>${h(t("nav_recipes"))} <span class="n">${recipes.length}</span></h2>${recipes.length ? `<div class="grid-cards">${recipes.map((r) => recipeCard(r)).join("")}</div>` : `<p class="meta">${h(t("no_results"))}</p>`}</section>
    <section class="sec"><h2>${h(t("nav_kitchen"))} <span class="n">${items.length}</span></h2>${items.length ? `<ul class="exp-list">${items.map((it) => `<li><strong>${h(iname(it))}</strong> <span class="meta">${h(t("loc_" + it.location))}</span> ${expiryBadge(it)}</li>`).join("")}</ul>` : `<p class="meta">${h(t("no_results"))}</p>`}</section>
  </div>`;
}

/* ---------- cooking for N people + AI Chef ideas ---------- */
const PEOPLE = [1, 2, 4, 6, 8];
function peoplePicker(people) {
  return `<section class="people">
    <p class="ed-label">${h(t("cooking_for"))}</p>
    <div class="seg seg-full" role="radiogroup" aria-label="${h(t("cooking_for"))}">
      ${PEOPLE.map((n) => `<button role="radio" aria-checked="${people === n}" class="${people === n ? "on" : ""}" data-act="people" data-v="${n}">${icon(n === 1 ? "user" : "users")} ${n}${n === 8 ? "+" : ""}</button>`).join("")}
    </div>
    ${!PEOPLE.includes(people) ? `<p class="meta">${h(t("for_n_people", { n: people }))}</p>` : ""}
    <label class="field-inline" style="margin-top:8px">${h(t("other_number"))} <input id="people-custom" inputmode="numeric" size="4" value="${PEOPLE.includes(people) ? "" : people}" placeholder="10"></label>
  </section>`;
}
const io = { meal: "any", time: 0, mode: "strict", count: 3, busy: false, error: "" };
function ideasPanel(people) {
  const st = S.state;
  const ready = aiAvailable();
  const ideas = st.ideas?.items || [];
  const opt = (act, v, label, cur) => `<button class="chip ${cur === v ? "on" : ""}" data-act="${act}" data-v="${v}">${h(label)}</button>`;
  return `<section class="ideas-panel">
    <div class="ideas-head">
      <div><h2>${icon("sparkle")} ${h(t("ai_ideas_title"))}</h2><p class="meta">${h(t("ai_ideas_sub", { n: people }))}</p></div>
    </div>
    <div class="ideas-opts">
      <div class="chips">${[["any", t("any_meal")], ["breakfast", t("meal_breakfast")], ["lunch", t("meal_lunch")], ["dinner", t("meal_dinner")], ["snack", t("cat_snack")], ["dessert", t("cat_dessert")]].map(([v, l]) => opt("idea-meal", v, l, io.meal)).join("")}</div>
      <div class="chips">${[[0, t("any_time")], [15, t("under_min", { n: 15 })], [30, t("under_min", { n: 30 })], [60, t("under_min", { n: 60 })]].map(([v, l]) => opt("idea-time", v, l, io.time)).join("")}</div>
      <div class="seg" role="radiogroup">
        <button class="${io.mode === "strict" ? "on" : ""}" data-act="idea-mode" data-v="strict">${h(t("only_what_i_have"))}</button>
        <button class="${io.mode === "flex" ? "on" : ""}" data-act="idea-mode" data-v="flex">${h(t("can_buy_1_2"))}</button>
      </div>
    </div>
    ${io.error ? `<p class="form-error" role="alert">${icon("circle-alert")} ${h(io.error)}</p>` : ""}
    ${!st.inventory.length ? `<p class="meta">${h(t("ideas_need_kitchen"))} <a href="#/kitchen">${h(t("go_to_kitchen"))}</a></p>`
      : ready ? `<div class="row wrap"><button class="btn btn-primary" data-act="idea-go" ${io.busy ? "disabled" : ""}>${io.busy ? `<span class="spinner spinner-sm"></span> ${h(t("ai_thinking_ideas"))}` : `${icon("sparkle")} ${h(t("suggest_n_dishes", { n: io.count }))}`}</button>
        <select id="idea-count" aria-label="${h(t("how_many"))}">${[3, 5].map((n) => `<option value="${n}" ${io.count === n ? "selected" : ""}>${h(t("n_ideas", { n }))}</option>`).join("")}</select></div>`
      : `<p class="meta">${h(t("ideas_need_key"))} <a href="#/profile">${h(t("open_settings"))}</a></p>`}
    ${ideas.length ? `<p class="meta ideas-for">${h(t("ideas_made_for", { n: st.ideas.people }))}</p><div class="ideas">${ideas.map((idea, k) => ideaCard(idea, k)).join("")}</div>` : ""}
  </section>`;
}
function ideaAsRecipe(idea) {
  return { id: "idea", title: idea.title, servings: idea.servings, ingredients: idea.ingredients, steps: idea.steps, prepTime: idea.prepTime, cookTime: idea.cookTime, category: idea.category };
}
function ideaCard(idea, k) {
  const m = matchRecipe(ideaAsRecipe(idea), ctx(idea.servings));
  const missing = idea.ingredients.filter((i) => i.essential !== false && (i.fromKitchen === false || m.rows.find((r) => r.ri === i)?.status === "missing"));
  return `<article class="idea">
    <div class="idea-top">
      <div class="ing-icon">${icon(catIcon({ breakfast: "eggs", dessert: "baking", drink: "drinks", snack: "fruits" }[idea.category] || "vegetables"))}</div>
      <div style="flex:1;min-width:0"><h3>${h(idea.title)}</h3>
        <p class="meta">${[minutes((idea.prepTime || 0) + (idea.cookTime || 0)), idea.difficulty ? t("diff_" + idea.difficulty) : "", t("for_n_people", { n: idea.servings })].filter(Boolean).map(h).join(" · ")}</p></div>
    </div>
    ${idea.why ? `<p class="verdict ok">${h(idea.why)}</p>` : ""}
    ${missing.length ? `<p class="verdict warn">${h(t("to_buy"))}: ${missing.map((i) => h(i.name)).join(", ")}</p>` : `<p class="verdict ok">${icon("circle-check")} ${h(t("you_have_everything"))}</p>`}
    <details><summary>${h(t("show_recipe"))}</summary>
      <ul class="idea-ings">${idea.ingredients.map((i) => `<li><span>${h(i.name)}${i.note ? ", " + h(i.note) : ""}</span><span class="meta">${h(qty(i.qty, i.unit))}</span></li>`).join("")}</ul>
      <ol class="idea-steps">${idea.steps.map((st) => `<li>${h(st.text)}</li>`).join("")}</ol>
    </details>
    <div class="row wrap">
      <button class="btn btn-primary btn-sm" data-act="idea-cook" data-k="${k}">${icon("play")} ${h(t("cook_this"))}</button>
      <button class="btn btn-sm" data-act="idea-save" data-k="${k}">${icon("bookmark")} ${h(t("save_to_recipes"))}</button>
      ${missing.length ? `<button class="btn btn-sm" data-act="idea-list" data-k="${k}">${icon("shopping-cart")} ${h(t("add_missing_to_list"))}</button>` : ""}
    </div>
  </article>`;
}
function kitchenText() {
  const st = S.state;
  const inv = st.inventory.map((i) => {
    const days = i.expires ? Math.round((new Date(i.expires + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000) : null;
    return `- ${iname(i)}${i.qty != null ? ": " + i.qty + " " + (i.unit || "") : ""}${days != null ? (days < 0 ? " (expired, do not use)" : days <= 3 ? ` (expires in ${days} days)` : "") : ""}`;
  }).filter((x) => !x.includes("do not use"));
  return inv.join("\n") + "\nStaples always available: " + st.prefs.staples.map((id) => iname({ ingredientId: id })).join(", ");
}
function prefsText() {
  const p = S.state.prefs;
  return [`Diet: ${p.diet}`, `Restrictions: ${p.restrictions.join(", ") || "none"}`, `Allergies (never use): ${p.allergies.join(", ") || "none"}`,
    `Never use: ${p.exclusions.join(", ") || "nothing"}`, `Favourite cuisines: ${p.cuisines.join(", ") || "any"}`, `Cooking level: ${p.level || "any"}`].join("\n");
}
function saveIdea(k) {
  const idea = S.state.ideas.items[k];
  if (idea.savedId && recipeById(idea.savedId)) return idea.savedId;
  const r = {
    id: uid(), title: idea.title, description: idea.description || "", image: "", category: idea.category, meals: guessMeals(idea), cuisine: idea.cuisine || "", difficulty: idea.difficulty || "",
    prepTime: idea.prepTime, cookTime: idea.cookTime, servings: idea.servings, tags: [], notes: "",
    ingredients: idea.ingredients.map(({ fromKitchen, ...i }) => i), steps: idea.steps,
    source: { type: "ai" }, language: S.state.prefs.lang, favorite: false, collections: [], createdAt: new Date().toISOString(), translations: {},
  };
  S.state.recipes.unshift(r);
  idea.savedId = r.id;
  save();
  return r.id;
}
Object.assign(homeActions, {
  people: (el, rr) => { S.state.prefs.people = +el.dataset.v; save(); rr(); },
  "idea-meal": (el, rr) => { io.meal = el.dataset.v; rr(); },
  "idea-time": (el, rr) => { io.time = +el.dataset.v; rr(); },
  "idea-mode": (el, rr) => { io.mode = el.dataset.v; rr(); },
  "idea-go": async (_, rr) => {
    const sel = document.getElementById("idea-count"); if (sel) io.count = +sel.value;
    io.busy = true; io.error = ""; rr();
    const people = S.state.prefs.people || 2;
    try {
      const ideas = await suggestFromKitchen(S.state.settings, { kitchen: kitchenText(), prefs: prefsText(), people, meal: io.meal, maxTime: io.time || null, mode: io.mode, count: io.count, lang: S.state.prefs.lang });
      // Hard safety check: drop anything that conflicts with allergies, diet or exclusions.
      const safe = ideas.filter((idea) => !exclusionsFor(ideaAsRecipe(idea), S.state.prefs).length);
      if (safe.length < ideas.length) toast(t("ideas_removed_n", { n: ideas.length - safe.length }));
      S.state.ideas = { items: safe, people, at: new Date().toISOString() };
      save();
    } catch (e) { io.error = t(aiErrorKey(e)); console.error(e); }
    io.busy = false; rr();
  },
  "idea-save": (el, rr) => { saveIdea(+el.dataset.k); toast(t("recipe_saved")); rr(); },
  "idea-cook": (el) => { const id = saveIdea(+el.dataset.k); go("#/cook/" + id); },
  "idea-list": (el) => {
    const idea = S.state.ideas.items[+el.dataset.k];
    const m = matchRecipe(ideaAsRecipe(idea), ctx(idea.servings));
    let n = 0;
    for (const i of idea.ingredients) {
      if (i.essential === false) continue;
      if (i.fromKitchen === false || m.rows.find((r) => r.ri === i)?.status === "missing") { S.state.grocery.push({ id: uid(), name: i.name, ingredientId: i.ingredientId, qty: i.qty, unit: i.unit, checked: false, source: "recipe", note: idea.title }); n++; }
    }
    save(); toast(t("added_to_list_n", { n }), "info", { label: t("view"), fn: () => go("#/grocery") });
  },
});
