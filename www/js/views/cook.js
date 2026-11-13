// Cooking mode: one step at a time, timers, then confirm what to take out of the kitchen.
import { S, t, h, icon, save, toast, openSheet, qty, recipeById, go, uid, iname, minutes, todayISO, unitLabel } from "../core.js";
import { planDeduction, round, matchRecipe } from "../engine.js";
import { ctx } from "./recipes.js";

const cs = { id: null, step: 0, servings: null, showIngs: false, timers: {} };
let wakeLock = null;

export function viewCook(id) {
  const r = recipeById(id);
  if (!r) return `<div class="page"><p>${h(t("recipe_not_found"))}</p></div>`;
  if (cs.id !== id) { Object.values(cs.timers).forEach((tm) => clearInterval(tm.iv)); Object.assign(cs, { id, step: 0, servings: r.servings, showIngs: !r.steps.length, timers: {} }); }
  requestWake();
  const n = r.steps.length;
  const step = r.steps[cs.step];
  const m = matchRecipe(r, ctx(cs.servings));
  const timer = cs.timers[cs.step];
  const stepIngs = step ? m.rows.filter((row) => {
    const names = [row.ri.name, iname(row.ri)].filter(Boolean).map((x) => x.toLowerCase());
    const txt = step.text.toLowerCase();
    return names.some((nm) => nm.length > 2 && (txt.includes(nm) || txt.includes(nm.slice(0, Math.max(4, nm.length - 2)))));
  }) : [];
  return `<div class="cook">
    <header class="cook-head">
      <a class="circle-btn sm" href="#/recipe/${r.id}" data-act="cook-exit" aria-label="${h(t("exit_cooking"))}">${icon("x")}</a>
      <div class="cook-title"><h1>${h(r.title)}</h1></div>
      <button class="circle-btn sm" data-act="cook-ings" aria-pressed="${cs.showIngs}" aria-label="${h(t("ingredients"))}">${icon("list")}</button>
    </header>
    ${n ? `<div class="cook-segs" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${cs.step + 1}">${r.steps.map((_, k) => `<span class="${k <= cs.step ? "on" : ""}"></span>`).join("")}</div>` : ""}
    <div class="cook-body">
      ${cs.showIngs ? `<aside class="cook-ings"><h2>${h(t("ingredients"))}${cs.servings ? ` · ${h(t("n_servings", { n: cs.servings }))}` : ""}</h2>
        <ul>${m.rows.map((row) => `<li><label class="check"><input type="checkbox"><span></span></label><span>${h(qty(row.need, row.ri.unit))} ${h(row.ri.name || iname(row.ri))}${row.ri.note ? `, ${h(row.ri.note)}` : ""}</span></li>`).join("")}</ul></aside>` : ""}
      <main class="cook-step">
        ${n ? `<p class="eyebrow">${h(t("step_x_of_y", { x: cs.step + 1, y: n }))}</p>
          <p class="cook-text">${h(step.text)}</p>
          ${step.photo ? `<div class="cook-img"><img src="${h(step.photo)}" alt=""></div>` : r.image && cs.step === 0 ? `<div class="cook-img"><img src="${h(r.image)}" alt=""></div>` : ""}
          ${step.timer ? `<div class="timer ${timer?.left === 0 ? "done" : ""}">
            <span class="timer-time" id="timer-time" aria-live="polite">${fmt(timer ? timer.left : step.timer)}</span>
            <div class="row">${!timer || timer.left === 0 ? `<button class="btn" data-act="timer-start">${icon("clock")} ${h(timer?.left === 0 ? t("restart_timer") : t("start_timer"))}</button>`
              : `<button class="btn" data-act="timer-toggle">${icon(timer.paused ? "play" : "pause")} ${h(timer.paused ? t("resume") : t("pause"))}</button><button class="btn btn-ghost-dark" data-act="timer-reset" aria-label="${h(t("reset"))}">${icon("rotate-ccw")}</button>`}</div>
          </div>` : ""}
          ${stepIngs.length ? `<p class="eyebrow">${h(t("for_this_step"))}</p><div class="cook-chips">${stepIngs.map((row) => `<span class="chip outline-dark">${h(row.ri.name || iname(row.ri))}${row.need != null ? " · " + h(qty(row.need, row.ri.unit)) : ""}</span>`).join("")}</div>` : ""}`
        : `<p class="cook-text">${h(t("no_steps_cook"))}</p>`}
      </main>
    </div>
    <footer class="cook-foot">
      <button class="circle-btn" data-act="cook-prev" ${cs.step === 0 ? "disabled" : ""} aria-label="${h(t("previous"))}">${icon("arrow-left")}</button>
      ${cs.step < n - 1 ? `<button class="btn btn-primary btn-lg" data-act="cook-next">${h(t("next_step"))} ${icon("arrow-right")}</button>`
        : `<button class="btn btn-primary btn-lg" data-act="cook-done">${icon("check")} ${h(t("finish_cooking"))}</button>`}
    </footer>
  </div>`;
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

async function requestWake() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch {}
}
function releaseWake() { try { wakeLock?.release(); } catch {} wakeLock = null; }

function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.4, 0.8].forEach((d) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.25, ac.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d + 0.3);
      o.start(ac.currentTime + d); o.stop(ac.currentTime + d + 0.32);
    });
  } catch {}
  navigator.vibrate?.([300, 150, 300]);
}

export const cookActions = {
  "cook-next": (_, rr) => { cs.step++; rr(); },
  "cook-prev": (_, rr) => { cs.step = Math.max(0, cs.step - 1); rr(); },
  "cook-ings": (_, rr) => { cs.showIngs = !cs.showIngs; rr(); },
  "cook-exit": () => { releaseWake(); },
  "timer-start": (_, rr) => {
    const r = recipeById(cs.id);
    const k = cs.step;
    clearInterval(cs.timers[k]?.iv);
    const tm = { left: r.steps[k].timer, paused: false, title: r.steps[k].text };
    tm.iv = setInterval(() => {
      if (tm.paused) return;
      tm.left = Math.max(0, tm.left - 1);
      const el = document.getElementById("timer-time");
      if (el && cs.step === k) el.textContent = fmt(tm.left);
      if (tm.left === 0) {
        clearInterval(tm.iv); beep();
        toast(t("timer_done", { n: k + 1 }), "info");
        if (location.hash.startsWith("#/cook/")) rr();
      }
    }, 1000);
    cs.timers[k] = tm; rr();
  },
  "timer-toggle": (_, rr) => { const tm = cs.timers[cs.step]; tm.paused = !tm.paused; rr(); },
  "timer-reset": (_, rr) => { clearInterval(cs.timers[cs.step]?.iv); delete cs.timers[cs.step]; rr(); },
  "cook-done": () => { releaseWake(); finishSheet(recipeById(cs.id), cs.servings); },
};

/** After cooking: show what will be deducted; nothing changes until the user confirms. */
export function finishSheet(r, servings) {
  const lines = planDeduction(r, servings, S.state.inventory);
  const body = `<p class="lead">${h(t("finish_q"))}</p>
    ${lines.length ? `<p class="meta">${h(t("deduct_help"))}</p>
    <form id="deduct" class="deduct-list">${lines.map((l, k) => `<div class="deduct-row">
      <label class="check"><input type="checkbox" name="use" value="${k}" ${l.take != null ? "checked" : ""}><span></span></label>
      <span class="d-name">${h(iname(l.item))}<small class="meta">${h(t("in_stock"))}: ${l.item.qty != null ? h(qty(l.item.qty, l.item.unit)) : "—"} · ${h(t("loc_" + l.item.location))}</small></span>
      <label class="d-qty"><span class="sr-only">${h(t("amount_used"))}</span><input name="q${k}" inputmode="decimal" value="${l.take ?? ""}" placeholder="${h(t("amount"))}"><span>${h(unitLabel(l.item.unit))}</span></label>
    </div>`).join("")}</form>` : `<p class="meta">${h(t("nothing_to_deduct"))}</p>`}
    <div class="row-between"><button class="btn" data-skip>${h(t("skip_update"))}</button><button class="btn btn-primary" data-ok>${icon("check")} ${h(lines.length ? t("update_kitchen") : t("done"))}</button></div>`;
  openSheet(t("finish_cooking"), body, {
    onMount: (el, close) => {
      const record = () => {
        S.state.history.push({ id: uid(), recipeId: r.id, title: r.title, date: todayISO(), servings });
        r.cookedCount = (r.cookedCount || 0) + 1; r.lastCooked = todayISO();
        const planned = S.state.plan.find((p) => p.recipeId === r.id && p.date === todayISO() && !p.done);
        if (planned) planned.done = true;
      };
      el.querySelector("[data-skip]").onclick = () => { record(); save(); close(); go("#/recipe/" + r.id); };
      el.querySelector("[data-ok]").onclick = () => {
        record();
        const changes = [];
        const form = el.querySelector("#deduct");
        if (form) {
          for (const box of form.querySelectorAll("input[name=use]:checked")) {
            const k = +box.value, l = lines[k];
            const amt = parseFloat(String(form["q" + k].value).replace(",", "."));
            const it = S.state.inventory.find((i) => i.id === l.itemId);
            if (!it) continue;
            const before = { ...it };
            if (!isNaN(amt) && it.qty != null) it.qty = round(Math.max(0, it.qty - amt));
            else if (isNaN(amt) && it.qty == null) continue;
            changes.push({ before, after: { ...it } });
          }
          // Remove items that reached zero, but remember them for undo.
          const emptied = S.state.inventory.filter((i) => i.qty === 0 && changes.some((c) => c.after.id === i.id));
          S.state.inventory = S.state.inventory.filter((i) => !emptied.includes(i));
        }
        const log = { id: uid(), date: new Date().toISOString(), recipeTitle: r.title, changes };
        S.state.txLog = [...S.state.txLog.slice(-19), log];
        save(); close(); go("#/recipe/" + r.id);
        toast(t("kitchen_updated_n", { n: changes.length }), "info", changes.length ? { label: t("undo"), fn: () => undoLog(log.id) } : null);
      };
    },
  });
}

export function undoLog(id) {
  const log = S.state.txLog.find((l) => l.id === id);
  if (!log) return;
  for (const c of log.changes) {
    const it = S.state.inventory.find((i) => i.id === c.before.id);
    if (it) Object.assign(it, c.before); else S.state.inventory.push({ ...c.before });
  }
  S.state.txLog = S.state.txLog.filter((l) => l.id !== id);
  save(); toast(t("undone"));
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
