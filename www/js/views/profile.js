// Onboarding, profile & settings, and the cooking assistant.
import { FACTS } from "../nutri.js";
import { S, t, h, icon, save, saveNow, toast, confirmDialog, go, uid, iname, recipeById, download, dateLabel, refreshIcons, qty, minutes , aiAvailable, ensureMeals, guessMeals, openSheet } from "../core.js";
import { ALLERGENS, DEFAULT_STAPLES, INGREDIENTS, BY_ID, SAMPLE_RECIPES } from "../catalog.js";
import { resolveIngredient, expiryStatus } from "../engine.js";
import { askAssistant, aiErrorKey } from "../ai.js";
import { emptyState, fileGet } from "../db.js";
import { openBlob } from "./recipes.js";
import { sync, signIn, signUp, signOut, resetPassword, push, pull, syncLabel } from "../sync.js";

export const LANGS = [["en", "English"], ["uz", "O‘zbekcha"], ["ko", "한국어"], ["ru", "Русский"]];
const DIET_LIST = ["none", "vegetarian", "pescatarian", "vegan"];
const RESTR_LIST = ["halal", "gluten-free", "dairy-free"];
const ALLERGY_LIST = Object.keys(ALLERGENS);
const CUISINES = ["Uzbek", "Korean", "Italian", "Japanese", "Chinese", "Russian", "Turkish", "Indian", "Mexican", "French", "Middle Eastern", "American"];
const LEVELS = ["beginner", "intermediate", "advanced"];

const choice = (name, value, label, checked, type = "radio") =>
  `<label class="choice"><input type="${type}" name="${name}" value="${h(value)}" ${checked ? "checked" : ""}><span>${h(label)}</span></label>`;

/* ---------- onboarding ---------- */
const ob = { step: 0 };
export function viewOnboarding() {
  const p = S.state.prefs;
  const steps = [
    () => `<p class="eyebrow">${h(t("welcome_eyebrow"))}</p><h1 class="display">${h(t("ob_welcome"))}</h1><p class="lead">${h(t("choose_language_sub"))}</p>
      <div class="lang-grid" role="radiogroup" aria-label="${h(t("language"))}">${LANGS.map(([v, l]) => `<label class="lang-tile"><input type="radio" name="lang" value="${v}" ${p.lang === v ? "checked" : ""}><span>${h(l)}<small>${v.toUpperCase()}</small></span></label>`).join("")}</div>
      <label class="field"><span>${h(t("your_name"))}</span><input name="name" value="${h(S.state.profile.name)}" autocomplete="given-name" placeholder="${h(t("optional"))}"></label>`,
    () => `<h2>${h(t("ob_diet"))}</h2><p class="meta">${h(t("ob_diet_sub"))}</p>
      <fieldset class="field"><legend>${h(t("food_type"))}</legend><div class="choices">${DIET_LIST.map((d) => choice("diet", d, t("diet_" + d), p.diet === d)).join("")}</div></fieldset>
      <fieldset class="field"><legend>${h(t("restrictions"))}</legend><div class="choices">${RESTR_LIST.map((r) => choice("restr", r, t("tag_" + r), p.restrictions.includes(r), "checkbox")).join("")}</div></fieldset>`,
    () => `<h2>${h(t("ob_allergies"))}</h2><p class="meta">${h(t("ob_allergies_sub"))}</p>
      <fieldset class="field"><legend>${h(t("allergies"))}</legend><div class="choices">${ALLERGY_LIST.map((a) => choice("allergy", a, t("tag_" + a), p.allergies.includes(a), "checkbox")).join("")}</div></fieldset>
      <label class="field"><span>${h(t("other_exclusions"))}</span><input name="exclusions" value="${h(p.exclusions.join(", "))}" placeholder="${h(t("exclusions_ph"))}"></label>`,
    () => `<h2>${h(t("ob_cooking"))}</h2>
      <fieldset class="field"><legend>${h(t("cooking_level"))}</legend><div class="choices">${LEVELS.map((l) => choice("level", l, t("level_" + l), p.level === l)).join("")}</div></fieldset>
      <fieldset class="field"><legend>${h(t("usual_time"))}</legend><div class="choices">${[15, 30, 60, 0].map((n) => choice("maxTime", n, n ? t("under_min", { n }) : t("no_limit"), (p.maxTime || 0) === n)).join("")}</div></fieldset>
      <fieldset class="field"><legend>${h(t("cuisines"))}</legend><div class="choices">${CUISINES.map((c) => choice("cuisine", c, t("cu_" + c.replace(/ /g, "_")), p.cuisines.includes(c), "checkbox")).join("")}</div></fieldset>`,
    () => `<h2>${h(t("ob_done", { name: S.state.profile.name || "" }).trim())}</h2><p class="lead">${h(t("ob_done_sub"))}</p>
      <ol class="ob-next"><li>${h(t("ob_next_1"))}</li><li>${h(t("ob_next_2"))}</li><li>${h(t("ob_next_3"))}</li></ol>
      <label class="opt"><input type="checkbox" name="samples" checked><span>${h(t("ob_load_samples"))}<small>${h(t("ob_load_samples_sub"))}</small></span></label>`,
  ];
  const n = steps.length;
  return `<div class="onboard">
    <div class="ob-card">
      <div class="ob-art" aria-hidden="true"><span class="ring" style="width:220px;height:220px"></span><span class="ring" style="width:320px;height:320px"></span><span class="ring" style="width:440px;height:440px"></span><div class="mark">${icon("cooking-pot")}</div></div>
      <div class="ob-inner">
      <div class="ob-progress" aria-label="${h(t("step_x_of_y", { x: ob.step + 1, y: n }))}">${[...Array(n)].map((_, i) => `<span class="${i <= ob.step ? "on" : ""}"></span>`).join("")}</div>
      <p class="meta">${h(t("step_x_of_y", { x: ob.step + 1, y: n }))}</p>
      <form class="form" id="ob-form">${steps[ob.step]()}
        <div class="row-between">
          ${ob.step > 0 ? `<button type="button" class="btn" data-act="ob-back">${icon("chevron-left")} ${h(t("back"))}</button>` : "<span></span>"}
          <div class="row">${ob.step > 0 && ob.step < n - 1 ? `<button type="button" class="btn btn-link" data-act="ob-skip">${h(t("skip"))}</button>` : ""}
          <button class="btn btn-primary btn-lg">${h(ob.step === n - 1 ? t("start_using") : t("continue"))} ${icon("arrow-right")}</button></div>
        </div>
      </form>
      ${ob.step === 0 ? `<p class="meta center"><button class="btn-link" data-act="ob-finish">${h(t("skip_setup"))}</button></p>
        <p class="meta center"><button class="btn-link ob-signin" data-act="ob-signin">${icon("cloud")} ${h(t("ob_have_account"))}</button></p>` : ""}
      </div>
    </div>
  </div>`;
}
function readOnboard(form) {
  const p = S.state.prefs, f = form.elements;
  const vals = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  if (f.name) S.state.profile.name = f.name.value.trim();
  if (form.querySelector("input[name=lang]")) p.lang = vals("lang")[0] || p.lang;
  if (form.querySelector("input[name=diet]")) { p.diet = vals("diet")[0] || "none"; p.restrictions = vals("restr"); }
  if (form.querySelector("input[name=allergy]")) { p.allergies = vals("allergy"); p.exclusions = f.exclusions.value.split(",").map((x) => x.trim()).filter(Boolean); }
  if (form.querySelector("input[name=level]")) { p.level = vals("level")[0] || ""; p.maxTime = +vals("maxTime")[0] || null; p.cuisines = vals("cuisine"); }
}
export function bindOnboarding(root, rr) {
  const form = root.querySelector("#ob-form");
  form?.querySelector("input[name=lang]") && form.querySelectorAll("input[name=lang]").forEach((i) => i.addEventListener("change", () => { readOnboard(form); save(); rr(); }));
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    readOnboard(form);
    if (ob.step === 4) { if (form.elements.samples?.checked) loadSamples(); return finishOnboarding(); }
    ob.step++; save(); rr();
  });
}
function finishOnboarding() { S.state.onboarded = true; save(); go("#/home"); }
export const onboardActions = {
  "ob-back": (_, rr) => { ob.step = Math.max(0, ob.step - 1); rr(); },
  "ob-skip": (_, rr) => { ob.step++; rr(); },
  "ob-finish": () => finishOnboarding(),
  // A second device: skip the set-up and go straight to signing in, so the library arrives from the cloud.
  "ob-signin": () => { S.state.onboarded = true; save(); go("#/profile"); },
};

/* ---------- starter recipes ---------- */
export function loadSamples() {
  const have = new Set(S.state.recipes.map((r) => r.title));
  let n = 0;
  for (const s of SAMPLE_RECIPES) {
    if (have.has(s.title)) continue;
    S.state.recipes.push({
      id: uid(), title: s.title, description: s.description, image: "", category: s.category, meals: guessMeals(s), cuisine: s.cuisine, difficulty: s.difficulty,
      prepTime: s.prepTime, cookTime: s.cookTime, servings: s.servings, tags: [], notes: "",
      ingredients: s.ingredients.map(([id, q, unit, note, essential]) => ({ name: BY_ID[id].names.en, ingredientId: id, qty: q, unit, note, essential })),
      steps: s.steps.map((text, i) => ({ text, timer: s.timers?.[i] || 0 })),
      source: { type: "sample" }, language: "en", favorite: false, collections: [], createdAt: new Date().toISOString(), translations: {},
    });
    n++;
  }
  save();
  return n;
}

/* ---------- profile & settings ---------- */
export function viewProfile() {
  const st = S.state, p = st.prefs, s = st.settings;
  const staples = p.staples.map((id) => BY_ID[id]).filter(Boolean);
  const files = st.files.slice().reverse();
  return `<div class="page page-profile">
    <header class="page-head"><div><p class="eyebrow">${h(t("nav_profile"))}</p><h1>${h(st.profile.name || t("your_profile"))}</h1>
      <p class="lead">${h(t("profile_stats", { r: st.recipes.length, i: st.inventory.length, c: st.history.length }))}</p></div></header>

    ${syncPanel()}
    <form class="form settings" id="prefs-form">
      <section class="panel"><h2>${icon("user")} ${h(t("account"))}</h2>
        <label class="field"><span>${h(t("your_name"))}</span><input name="name" value="${h(st.profile.name)}"></label>
        <fieldset class="field"><legend>${h(t("language"))}</legend><div class="choices">${LANGS.map(([v, l]) => choice("lang", v, l, p.lang === v)).join("")}</div></fieldset>
        <p class="meta">${h(t("local_account_note"))}</p>
      </section>

      <section class="panel"><h2>${icon("sun-moon")} ${h(t("appearance"))}</h2>
        <fieldset class="field"><legend>${h(t("theme"))}</legend><div class="seg seg-full">
          ${[["system", "monitor-smartphone", t("theme_system")], ["light", "sun", t("theme_light")], ["dark", "moon", t("theme_dark")]].map(([v, ic, l]) => `<label><input type="radio" name="theme" value="${v}" ${(p.theme || "system") === v ? "checked" : ""}><span>${icon(ic)} ${h(l)}</span></label>`).join("")}
        </div></fieldset>
        <p class="meta">${h(t("theme_note"))}</p>
      </section>

      <section class="panel"><h2>${icon("leaf")} ${h(t("dietary_prefs"))}</h2>
        <fieldset class="field"><legend>${h(t("food_type"))}</legend><div class="choices">${DIET_LIST.map((d) => choice("diet", d, t("diet_" + d), p.diet === d)).join("")}</div></fieldset>
        <fieldset class="field"><legend>${h(t("restrictions"))}</legend><div class="choices">${RESTR_LIST.map((r) => choice("restr", r, t("tag_" + r), p.restrictions.includes(r), "checkbox")).join("")}</div></fieldset>
        <fieldset class="field"><legend>${h(t("cuisines"))}</legend><div class="choices">${CUISINES.map((c) => choice("cuisine", c, t("cu_" + c.replace(/ /g, "_")), p.cuisines.includes(c), "checkbox")).join("")}</div></fieldset>
        <div class="grid-2">
          <label class="field"><span>${h(t("cooking_level"))}</span><select name="level"><option value="">—</option>${LEVELS.map((l) => `<option value="${l}" ${p.level === l ? "selected" : ""}>${h(t("level_" + l))}</option>`).join("")}</select></label>
          <label class="field"><span>${h(t("usual_time"))}</span><select name="maxTime">${[0, 15, 30, 60].map((n) => `<option value="${n}" ${(p.maxTime || 0) === n ? "selected" : ""}>${h(n ? t("under_min", { n }) : t("no_limit"))}</option>`).join("")}</select></label>
        </div>
      </section>

      <section class="panel panel-warn"><h2>${icon("shield-alert")} ${h(t("allergies"))}</h2>
        <p class="meta">${h(t("allergy_strict_note"))}</p>
        <fieldset class="field"><legend class="sr-only">${h(t("allergies"))}</legend><div class="choices">${ALLERGY_LIST.map((a) => choice("allergy", a, t("tag_" + a), p.allergies.includes(a), "checkbox")).join("")}</div></fieldset>
        <label class="field"><span>${h(t("other_exclusions"))}</span><input name="exclusions" value="${h(p.exclusions.join(", "))}" placeholder="${h(t("exclusions_ph"))}"></label>
      </section>

      <section class="panel"><h2>${icon("package")} ${h(t("staples"))}</h2>
        <p class="meta">${h(t("staples_help"))}</p>
        <div class="tags">${staples.map((i) => `<span class="tag">${h(i.names[p.lang] || i.names.en)}<button type="button" data-act="staple-del" data-id="${i.id}" aria-label="${h(t("remove"))}">${icon("x")}</button></span>`).join("") || `<span class="meta">—</span>`}</div>
        <div class="add-row"><input id="staple-add" list="staple-list" placeholder="${h(t("add_staple_ph"))}"><button type="button" class="btn btn-sm" data-act="staple-add">${icon("plus")} ${h(t("add"))}</button></div>
        <datalist id="staple-list">${INGREDIENTS.map((i) => `<option value="${h(i.names[p.lang] || i.names.en)}">`).join("")}</datalist>
      </section>

      <section class="panel"><h2>${icon("bot")} ${h(t("ai_features"))}</h2>
        <p class="meta">${h(t("ai_explain"))}</p>
        <label class="field"><span>${h(t("api_key"))}</span><input name="apiKey" type="password" autocomplete="off" value="${h(s.apiKey)}" placeholder="sk-ant-…"></label>
        <label class="field"><span>${h(t("model"))}</span><select name="model">
          ${[["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5"]].map(([v, l]) => `<option value="${v}" ${s.model === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="opt"><input type="checkbox" name="aiConsent" ${s.aiConsent ? "checked" : ""}><span>${h(t("ai_consent"))}<small>${h(t("ai_consent_sub"))}</small></span></label>
        <p class="meta">${h(t("ai_key_note"))}</p>
      </section>
      <div class="row-end"><button class="btn btn-primary">${icon("check")} ${h(t("save_settings"))}</button></div>
    </form>

    <section class="panel"><h2>${icon("history")} ${h(t("cooking_history"))}</h2>
      ${st.history.length ? `<ul class="hist">${st.history.slice().reverse().slice(0, 30).map((x) => `<li><span>${h(dateLabel(x.date))}</span> ${recipeById(x.recipeId) ? `<a href="#/recipe/${x.recipeId}">${h(x.title)}</a>` : h(x.title)} <span class="meta">${x.servings ? h(t("n_servings", { n: x.servings })) : ""}</span></li>`).join("")}</ul>` : `<p class="meta">${h(t("no_history"))}</p>`}
      ${st.txLog.length ? `<p class="meta">${h(t("last_update", { x: st.txLog[st.txLog.length - 1].recipeTitle }))} <button class="btn-link" data-act="undo-last">${h(t("undo"))}</button></p>` : ""}
    </section>

    <section class="panel"><h2>${icon("folder")} ${h(t("uploaded_files"))}</h2>
      ${files.length ? `<ul class="hist">${files.map((f) => `<li><span>${h(dateLabel(f.added?.slice(0, 10)))}</span> ${h(f.name)} <span class="meta">${f.pages ? h(t("n_pages", { n: f.pages })) + " · " : ""}${h(t("n_recipes_found_short", { n: f.recipes || 0 }))}</span> <button class="btn-link" data-act="open-file" data-id="${h(f.id)}">${h(t("open"))}</button></li>`).join("")}</ul>` : `<p class="meta">${h(t("no_files"))}</p>`}
    </section>

    <section class="panel"><h2>${icon("wallet")} ${h(t("prices_title"))}</h2>
      <p class="meta">${h(t("prices_sub"))}</p>
      <button class="btn" data-act="edit-prices">${icon("pencil")} ${h(t("edit_prices"))}${Object.keys(S.state.prefs.prices || {}).length ? " (" + Object.keys(S.state.prefs.prices).length + ")" : ""}</button>
    </section>
    <section class="panel"><h2>${icon("database")} ${h(t("your_data"))}</h2>
      <p class="meta">${h(t("data_note"))}</p>
      <div class="row wrap">
        <button class="btn" data-act="export">${icon("download")} ${h(t("export_data"))}</button>
        <label class="btn">${icon("upload")} ${h(t("import_data"))}<input type="file" accept="application/json,.json" id="import-data" hidden></label>
        <button class="btn" data-act="load-samples">${icon("book-open")} ${h(t("load_samples"))}</button>
        <button class="btn btn-danger-ghost" data-act="wipe">${icon("trash-2")} ${h(t("delete_all"))}</button>
      </div>
    </section>
  </div>`;
}

function syncPanel() {
  const st = S.state;
  if (!sync.user) return `<section class="panel sync-panel"><h2>${icon("cloud")} ${h(t("sync_title"))}</h2>
    <p class="meta">${h(t("sync_explain"))}</p>
    <form class="form" id="auth-form">
      <div class="grid-2">
        <label class="field"><span>${h(t("email"))}</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>${h(t("password"))}</span><input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      </div>
      <p class="form-error" id="auth-err" role="alert"></p>
      <div class="row wrap">
        <button class="btn btn-primary" data-mode="in">${icon("log-in")} ${h(t("sign_in"))}</button>
        <button class="btn" data-mode="up">${icon("user-plus")} ${h(t("create_account"))}</button>
        <button type="button" class="btn-link" data-mode="reset">${h(t("forgot_password"))}</button>
      </div>
    </form></section>`;
  return `<section class="panel sync-panel"><h2>${icon("cloud")} ${h(t("sync_title"))}</h2>
    <p>${icon(sync.status === "error" ? "cloud-alert" : sync.status === "syncing" ? "refresh-cw" : "cloud-check", sync.status === "syncing" ? "spin" : "")} <strong>${h(syncLabel())}</strong>
      <span class="meta"> · ${h(sync.user.email)}${sync.last ? " · " + h(t("last_synced", { t: new Date(sync.last).toLocaleTimeString(st.prefs.lang, { hour: "2-digit", minute: "2-digit" }) })) : ""}</span></p>
    ${sync.status === "error" ? `<p class="form-error">${h(sync.error)}</p>` : ""}
    <p class="meta">${h(t("sync_what"))}</p>
    <label class="opt"><input type="checkbox" id="cloud-ai" ${st.settings.cloudAI !== false ? "checked" : ""}><span>${h(t("use_cloud_ai"))}<small>${h(t("use_cloud_ai_sub"))}</small></span></label>
    <div class="row wrap"><button class="btn" data-act="sync-now">${icon("refresh-cw")} ${h(t("sync_now"))}</button><button class="btn btn-danger-ghost" data-act="sign-out">${icon("log-out")} ${h(t("sign_out"))}</button></div>
  </section>`;
}

export function bindProfile(root, rr) {
  const af = root.querySelector("#auth-form");
  if (af) {
    let mode = "in";
    af.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; }));
    const err = (m) => { root.querySelector("#auth-err").textContent = m; };
    af.querySelector('[data-mode="reset"]').addEventListener("click", async () => {
      const email = af.email.value.trim();
      if (!email) return err(t("enter_email_first"));
      try { await resetPassword(email); toast(t("reset_sent")); } catch (e) { err(e.message); }
    });
    af.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btns = af.querySelectorAll("button"); btns.forEach((b) => b.disabled = true);
      try {
        if (mode === "up") {
          const signedIn = await signUp(af.email.value.trim(), af.password.value);
          toast(signedIn ? t("account_created") : t("confirm_email_sent"));
        } else { await signIn(af.email.value.trim(), af.password.value); toast(t("signed_in")); }
        rr();
      } catch (ex) { err(/Invalid login/i.test(ex.message) ? t("wrong_login") : /not confirmed/i.test(ex.message) ? t("confirm_email_first") : ex.message); btns.forEach((b) => b.disabled = false); }
    });
  }
  root.querySelector("#cloud-ai")?.addEventListener("change", (e) => { S.state.settings.cloudAI = e.target.checked; save(); });
  const form = root.querySelector("#prefs-form");
  if (!form) return;
  form.querySelectorAll("input[name=theme]").forEach((i) => i.addEventListener("change", () => { S.state.prefs.theme = i.value; save(); rr(); }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const st = S.state, p = st.prefs, f = form.elements;
    const vals = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    st.profile.name = f.name.value.trim();
    p.lang = vals("lang")[0] || p.lang;
    p.theme = vals("theme")[0] || p.theme || "system";
    p.diet = vals("diet")[0] || "none";
    p.restrictions = vals("restr");
    p.cuisines = vals("cuisine");
    p.level = f.level.value;
    p.maxTime = +f.maxTime.value || null;
    p.allergies = vals("allergy");
    p.exclusions = f.exclusions.value.split(",").map((x) => x.trim()).filter(Boolean);
    st.settings.apiKey = f.apiKey.value.trim();
    st.settings.model = f.model.value;
    st.settings.aiConsent = f.aiConsent.checked;
    document.documentElement.lang = p.lang;
    save(); toast(t("settings_saved")); rr();
  });
  root.querySelector("#import-data")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.recipes) || !Array.isArray(data.inventory)) throw new Error("format");
      if (!(await confirmDialog(t("import_data_q", { r: data.recipes.length, i: data.inventory.length }), { ok: t("replace") }))) return;
      const base = emptyState();
      S.state = Object.assign(S.state, { ...base, ...data, prefs: { ...base.prefs, ...data.prefs }, settings: { ...base.settings, ...S.state.settings } });
      ensureMeals();
      await saveNow(); toast(t("data_imported")); rr();
    } catch { toast(t("bad_backup"), "error"); }
  });
}

export const profileActions = {
  "edit-prices": (_, rr) => {
    const mine = S.state.prefs.prices ||= {};
    const lang = S.state.prefs.lang || "en";
    const rows = INGREDIENTS.filter((i) => FACTS[i.id] && FACTS[i.id][2] > 0).map((i) => ({ id: i.id, name: i.names[lang] || i.names.en, def: FACTS[i.id][2] })).sort((a, b) => a.name.localeCompare(b.name, lang));
    openSheet(t("prices_title"), `<p class="meta">${h(t("prices_sub"))}</p>
      <label class="search">${icon("search")}<input type="search" id="price-q" placeholder="${h(t("search"))}"></label>
      <form id="price-form"><div class="price-list">${rows.map((x) => `<label class="price-row" data-name="${h(x.name.toLowerCase())}"><span>${h(x.name)}</span><input name="${x.id}" inputmode="numeric" value="${mine[x.id] ?? ""}" placeholder="${x.def.toLocaleString("en-US")}"><small>₩ / kg</small></label>`).join("")}</div>
      <div class="row-between sticky-actions"><button type="button" class="btn" data-reset>${h(t("prices_reset"))}</button><button class="btn btn-primary">${icon("check")} ${h(t("save"))}</button></div></form>`, {
      wide: true,
      onMount: (el, close) => {
        el.querySelector("#price-q").addEventListener("input", (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll(".price-row").forEach((r) => { r.hidden = !!q && !r.dataset.name.includes(q); }); });
        el.querySelector("[data-reset]").onclick = () => el.querySelectorAll(".price-row input").forEach((i) => { i.value = ""; });
        el.querySelector("#price-form").onsubmit = (e) => {
          e.preventDefault();
          const next = {};
          for (const i of e.target.querySelectorAll("input[name]")) { const n = parseFloat(i.value.replace(/[,\s]/g, "")); if (n >= 0 && i.value.trim() !== "") next[i.name] = n; }
          S.state.prefs.prices = next; save(); close(); toast(t("prices_saved")); rr();
        };
      },
    });
  },
  "sync-now": async (_, rr) => { await pull(); rr(); },
  "sign-out": async (_, rr) => { if (await confirmDialog(t("sign_out_q"))) { await signOut(); rr(); } },
  "staple-del": (el, rr) => { S.state.prefs.staples = S.state.prefs.staples.filter((x) => x !== el.dataset.id); save(); rr(); },
  "staple-add": (_, rr) => {
    const v = document.getElementById("staple-add").value;
    const id = resolveIngredient(v);
    if (!id) return toast(t("not_in_catalog_note"), "error");
    if (!S.state.prefs.staples.includes(id)) S.state.prefs.staples.push(id);
    save(); rr();
  },
  export: () => {
    const data = { ...S.state, settings: { ...S.state.settings, apiKey: "" }, exportedAt: new Date().toISOString(), app: "kitchen-companion" };
    download(`kitchen-companion-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  },
  "load-samples": (_, rr) => { const n = loadSamples(); toast(n ? t("samples_loaded", { n }) : t("samples_already")); rr(); },
  wipe: async () => {
    if (!(await confirmDialog(t("delete_all_q"), { danger: true, ok: t("delete_all") }))) return;
    S.state = Object.assign(S.state, emptyState());
    await saveNow(); location.hash = "#/welcome"; location.reload();
  },
  "open-file": async (el) => {
    const f = await fileGet(el.dataset.id);
    if (!f) return toast(t("file_missing"), "error");
    openBlob(f, el.dataset.page);
  },
};

/* ---------- assistant ---------- */
let pending = false;
export function viewAssistant(params) {
  const st = S.state;
  const recipe = params.get("recipe") ? recipeById(params.get("recipe")) : null;
  const ready = aiAvailable();
  const prompts = recipe
    ? [["leaf", t("ap_healthier")], ["flame", t("ap_no_oven")], ["user", t("ap_scale", { n: 5 })], ["droplet", t("ap_less_spicy")]]
    : [["refrigerator", t("ap_use_what_i_have")], ["shuffle", t("ap_random")], ["clock", t("ap_under_20")], ["leaf", t("ap_use_expiring")], ["help-circle", t("ap_butter_oil")]];
  const name = st.profile.name;
  return `<div class="page page-chat">
    <header class="chef-head">
      <a class="circle-btn sm" href="${recipe ? "#/recipe/" + recipe.id : "#/home"}" aria-label="${h(t("back"))}">${icon("chevron-left")}</a>
      <div style="flex:1"><h1>${icon("sparkle")} ${h(t("ai_chef"))}</h1><p>${recipe ? h(t("about_recipe", { x: recipe.title })) : h(t("ai_chef_sub"))}</p></div>
      ${st.chat.length ? `<button class="circle-btn sm" data-act="chat-clear" aria-label="${h(t("new_chat"))}">${icon("eraser")}</button>` : ""}
    </header>
    ${!ready ? `<div class="notice notice-amber">${icon("info")}<div><p>${h(t("assistant_needs_key"))}</p><p><a href="#/profile">${h(t("open_settings"))}</a></p></div></div>` : ""}
    <div class="chat" id="chat" aria-live="polite">
      ${!st.chat.length ? `<div class="msg msg-assistant"><div class="bubble">${h(name ? t("chef_hello_name", { name }) : t("chef_hello"))}</div></div>
        <div class="chat-prompts">${prompts.map(([ic, p]) => `<button class="chip" data-act="chat-prompt" data-v="${h(p)}" ${ready ? "" : "disabled"}>${icon(ic)} ${h(p)}</button>`).join("")}</div>` : ""}
      ${st.chat.map((m) => `<div class="msg msg-${m.role}"><div class="bubble">${fmtChat(m.text)}</div></div>`).join("")}
    </div>
    <form class="chat-form" id="chat-form">
      <textarea name="q" rows="1" placeholder="${h(t("ask_me_anything"))}" aria-label="${h(t("ask_ph"))}" ${ready ? "" : "disabled"}></textarea>
      <button class="circle-btn accent" ${ready ? "" : "disabled"} aria-label="${h(t("send"))}">${icon("send")}</button>
    </form>
    <p class="meta">${h(t("assistant_disclaimer"))}</p>
  </div>`;
}
function fmtChat(text) {
  return h(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}
function kitchenContext(recipe) {
  const st = S.state, p = st.prefs;
  const inv = st.inventory.map((i) => `${iname({ ...i, ingredientId: i.ingredientId })}${i.qty != null ? " " + i.qty + " " + (i.unit || "") : ""}${["soon", "expired"].includes(expiryStatus(i)) ? " (expires " + i.expires + ")" : ""}`).join("; ") || "empty";
  const lines = [
    `Diet: ${p.diet}; restrictions: ${p.restrictions.join(", ") || "none"}; allergies (never suggest): ${p.allergies.join(", ") || "none"}; other exclusions: ${p.exclusions.join(", ") || "none"}.`,
    `Cooking level: ${p.level || "unknown"}; usual max time: ${p.maxTime ? p.maxTime + " min" : "any"}.`,
    `Assumed staples: ${p.staples.join(", ")}.`,
    `Kitchen inventory: ${inv}.`,
    `Saved recipe titles: ${st.recipes.map((r) => r.title).slice(0, 80).join("; ") || "none"}.`,
  ];
  if (recipe) {
    lines.push(`Selected recipe: ${recipe.title} (serves ${recipe.servings ?? "unknown"}).`);
    lines.push("Ingredients: " + recipe.ingredients.map((i) => `${i.qty ?? ""} ${i.unit || ""} ${i.name}${i.note ? " (" + i.note + ")" : ""}${i.essential === false ? " [optional]" : ""}`).join("; "));
    lines.push("Steps: " + recipe.steps.map((s, k) => `${k + 1}. ${s.text}`).join(" "));
  }
  return lines.join("\n");
}
async function send(text, params, rr) {
  if (pending || !text.trim()) return;
  const st = S.state;
  const recipe = params.get("recipe") ? recipeById(params.get("recipe")) : null;
  st.chat.push({ role: "user", text: text.trim() });
  pending = true; rr();
  const chat = document.getElementById("chat");
  const msg = document.createElement("div");
  msg.className = "msg msg-assistant";
  msg.innerHTML = `<div class="bubble"><span class="typing" aria-label="${h(t("thinking"))}"><i></i><i></i><i></i></span></div>`;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
  let acc = "";
  try {
    const full = await askAssistant(st.settings, { history: st.chat.slice(-20), context: kitchenContext(recipe), lang: st.prefs.lang }, (d) => {
      acc += d; msg.querySelector(".bubble").innerHTML = fmtChat(acc); chat.scrollTop = chat.scrollHeight;
    });
    st.chat.push({ role: "assistant", text: full || acc });
  } catch (e) {
    st.chat.pop();
    toast(t(aiErrorKey(e)), "error");
  }
  pending = false; save(); rr();
}
export function bindAssistant(root, rr, params) {
  const form = root.querySelector("#chat-form");
  if (!form) return;
  const chat = root.querySelector("#chat");
  chat.scrollTop = chat.scrollHeight;
  form.addEventListener("submit", (e) => { e.preventDefault(); const v = form.q.value; form.q.value = ""; send(v, params, rr); });
  form.q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  root.querySelectorAll('[data-act="chat-prompt"]').forEach((b) => b.onclick = () => send(b.dataset.v, params, rr));
}
export const assistantActions = {
  "chat-clear": (_, rr) => { S.state.chat = []; save(); rr(); },
};
