// App shell, router and event delegation.
import { S, t, h, icon, loadState, refreshIcons, openSheet, go, save, toast, applyTheme, isDark } from "./core.js";
import { viewHome, bindHome, homeActions, viewDiscover, bindDiscover, viewSearch } from "./views/home.js";
import { viewRecipes, bindRecipes, recipeActions, viewRecipe, detailActions, viewEditor, bindEditor, resetDraft } from "./views/recipes.js";
import { viewImport, bindImport, importActions } from "./views/importer.js";
import { viewKitchen, bindKitchen, kitchenActions } from "./views/kitchen.js";
import { viewCook, cookActions, undoLog } from "./views/cook.js";
import { viewPlan, planActions, viewGrocery, groceryActions, bindGrocery } from "./views/plan.js";
import { viewBooks, viewBookNew, bindBookNew, viewBook, bindBook, bookActions, onBookUpdate } from "./views/books.js";
import { viewReview, viewReviewEdit } from "./views/importer.js";
import { viewOnboarding, bindOnboarding, onboardActions, viewProfile, bindProfile, profileActions, viewAssistant, bindAssistant, assistantActions, loadSamples } from "./views/profile.js";

const ACTIONS = {
  ...homeActions, ...recipeActions, ...detailActions, ...importActions, ...kitchenActions, ...cookActions,
  ...planActions, ...groceryActions, ...bookActions, ...onboardActions, ...profileActions, ...assistantActions,
  "load-samples": (_, rr) => { const n = loadSamples(); toast(n ? t("samples_loaded", { n }) : t("samples_already")); rr(); },
  "undo-last": () => { const l = S.state.txLog[S.state.txLog.length - 1]; if (l) undoLog(l.id); },
  "fab": () => addMenu(),
  "theme-toggle": (_, rr) => { S.state.prefs.theme = isDark() ? "light" : "dark"; save(); rr(); },
};

const NAV = [
  ["home", "house", "nav_home"], ["recipes", "book-open", "nav_recipes_short"], ["kitchen", "refrigerator", "nav_kitchen_short"],
  ["plan", "calendar-days", "nav_plan_short"], ["grocery", "shopping-cart", "nav_list"],
];
const EXTRA_NAV = [["discover", "chef-hat", "what_can_i_cook"], ["assistant", "sparkle", "ai_chef"], ["books", "library", "recipe_books"], ["import", "download", "import"], ["profile", "user", "nav_profile"]];

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || "home";
  const [path, query] = raw.split("?");
  return { parts: path.split("/"), params: new URLSearchParams(query || "") };
}

function shell(content, active, { bare = false, focus = false } = {}) {
  if (bare) return content;
  const navItem = ([id, ic, key], cls) => `<a class="${cls} ${active === id ? "on" : ""}" href="#/${id}" ${active === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${h(t(key))}</span></a>`;
  return `<div class="app ${focus ? "focus-screen" : ""}">
    <aside class="sidebar" aria-label="${h(t("main_nav"))}">
      <a class="brand" href="#/home"><span class="brand-mark" aria-hidden="true">${icon("cooking-pot")}</span><span>Kitchen<br>Companion</span></a>
      <nav>${NAV.map((n) => navItem(n, "side-link")).join("")}<hr>${EXTRA_NAV.map((n) => navItem(n, "side-link")).join("")}</nav>
      <button class="side-link theme-btn" data-act="theme-toggle">${icon(isDark() ? "sun" : "moon")}<span>${h(isDark() ? t("light_mode") : t("dark_mode"))}</span></button>
      <button class="btn btn-primary btn-block" data-act="fab">${icon("plus")} ${h(t("add"))}</button>
    </aside>
    <main id="main" tabindex="-1">${content}</main>
    <nav class="bottom-nav" aria-label="${h(t("main_nav"))}">${NAV.map((n) => navItem(n, "bn-link")).join("")}</nav>
    ${active === "home" && !focus ? `<button class="fab" data-act="fab" aria-label="${h(t("add_menu"))}">${icon("plus")}<span>${h(t("add"))}</span></button>` : ""}
  </div>`;
}

function addMenu() {
  const item = (href, ic, title, sub, act) => `<${act ? "button" : "a"} class="menu-item" ${act ? `data-menu-act="${act}"` : `href="${href}"`}>${icon(ic, "ic-lg")}<span><strong>${h(title)}</strong><small>${h(sub)}</small></span></${act ? "button" : "a"}>`;
  openSheet(t("add_menu"), `<div class="menu">
    ${item("#/book/new", "library", t("recipe_book"), t("recipe_book_sub"))}
    ${item("#/recipe/new", "pencil", t("manual_entry"), t("manual_entry_sub"))}
    ${item("#/import?m=social", "smartphone", t("social_media"), t("social_media_sub"))}
    ${item("#/import?m=website", "globe", t("website"), t("website_sub"))}
    ${item("#/import?m=file", "file-text", t("pdf_word"), t("pdf_word_sub"))}
    ${item("#/import?m=image", "image", t("photo_screenshot"), t("photo_screenshot_sub"))}
    ${item("", "refrigerator", t("add_kitchen_items"), t("add_kitchen_items_sub"), "inv-quick")}
  </div>`, {
    onMount: (el, close) => {
      el.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
      el.querySelector("[data-menu-act]").onclick = () => { close(); if (!location.hash.startsWith("#/kitchen")) go("#/kitchen"); setTimeout(() => kitchenActions["inv-quick"](null, render), 50); };
    },
  });
}

let lastRouteKey = "";
let rendering = false;
export function render(opts = {}) {
  // A re-render can fire blur/change handlers that ask for another render; run that one afterwards.
  if (rendering) { queueMicrotask(() => render(opts)); return; }
  rendering = true;
  try { renderNow(opts); } finally { rendering = false; }
}
function renderNow(opts) {
  const { parts, params } = parseRoute();
  const [r0, r1, r2] = parts;
  const st = S.state;
  let html, active = r0, bind = null, bare = false;
  if (!st.onboarded && r0 !== "welcome") { location.replace("#/welcome"); return; }
  switch (r0) {
    case "welcome": html = viewOnboarding(); bind = bindOnboarding; bare = true; break;
    case "home": html = viewHome(); bind = bindHome; break;
    case "discover": html = viewDiscover(); bind = bindDiscover; active = "home"; break;
    case "search": html = viewSearch(params.get("q") || ""); active = "home"; break;
    case "recipes": html = viewRecipes(); bind = bindRecipes; break;
    case "recipe":
      active = "recipes";
      if (r2 === "edit" || r1 === "new") { html = viewEditor(r1); bind = (root, rr) => bindEditor(root, rr); }
      else html = viewRecipe(r1);
      break;
    case "cook": html = viewCook(r1); bare = true; break;
    case "import": {
      const m = params.get("m");
      if (m) { importActions["imp-mode"]({ dataset: { v: m } }, () => {}); history.replaceState(null, "", "#/import"); }
      html = viewImport(r1); bind = bindImport; active = "import"; break;
    }
    case "books": html = viewBooks(); break;
    case "book":
      active = "books";
      if (r1 === "new") { html = viewBookNew(); bind = bindBookNew; }
      else if (r2 === "review") { html = viewReview(); bind = bindImport; }
      else if (r2?.startsWith("edit-")) { html = viewReviewEdit(+r2.slice(5)); bind = bindImport; }
      else { html = viewBook(r1); bind = (root, rr) => bindBook(root, rr, r1); }
      break;
    case "kitchen": html = viewKitchen(); bind = bindKitchen; break;
    case "plan": html = viewPlan(); break;
    case "grocery": html = viewGrocery(); bind = bindGrocery; break;
    case "assistant": html = viewAssistant(params); bind = (root, rr) => bindAssistant(root, rr, params); break;
    case "profile": html = viewProfile(); bind = bindProfile; break;
    default: location.replace("#/home"); return;
  }
  const routeKey = parts.join("/");
  if (routeKey !== lastRouteKey && !(r0 === "recipe" && (r2 === "edit" || r1 === "new"))) resetDraft();
  const app = document.getElementById("app");
  const scroll = routeKey === lastRouteKey ? window.scrollY : 0;
  let focusSel = opts.keepFocus, caret = null;
  if (focusSel) { const f = document.querySelector(focusSel); caret = f?.selectionStart ?? null; }
  const focus = (r0 === "recipe" && r1 && r1 !== "new" && r2 !== "edit") || ["assistant", "import", "book"].includes(r0) || r0 === "search";
  app.innerHTML = shell(html, active, { bare, focus });
  document.documentElement.lang = st.prefs.lang;
  applyTheme();
  document.title = "Kitchen Companion";
  refreshIcons(app);
  const rr = (o) => render(o);
  bind?.(app, rr);
  if (focusSel) { const f = document.querySelector(focusSel); if (f) { f.focus(); if (caret != null && f.setSelectionRange) try { f.setSelectionRange(caret, caret); } catch {} } }
  window.scrollTo(0, scroll);
  if (routeKey !== lastRouteKey) document.getElementById("main")?.focus({ preventScroll: true });
  lastRouteKey = routeKey;
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "BUTTON") e.preventDefault();
  fn(el, (o) => render(o));
});

window.addEventListener("hashchange", () => render());
// Live progress while a recipe book is being read (not while the user is editing a recipe).
onBookUpdate(() => {
  const hsh = location.hash;
  if (/^#\/books$/.test(hsh) || /^#\/book\/[^/]+(\/review)?$/.test(hsh) && !/\/new$/.test(hsh)) {
    if (document.activeElement?.matches("input, textarea, select") && document.querySelector("#book-setup")) return;
    render();
  }
});

async function boot() {
  await loadState();
  import("./sync.js").then(({ initSync, onSyncChange }) => {
    onSyncChange(() => { if (/^#\/profile/.test(location.hash) && !document.activeElement?.matches("input")) render(); });
    initSync().then(() => render());
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyTheme(); render(); });
  render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
