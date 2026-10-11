// Каркас интерфейса: боковая панель (карточка заказа, формы), делегирование нажатий и общие кусочки разметки.
// Разметка кнопок: data-act="имя" (+ data-id) → actions.имя(элемент, событие); формы: <form data-form="имя"> → actions.имя(FormData, form).
import { $, esc } from "./core.js";
import { STATUSES } from "./config.js";

let drawerState = null; // { render, actions, live }
let viewActions = {};

export function setViewActions(actions) { viewActions = actions || {}; }

export function openDrawer(render, actions = {}, { live = false, wide = false, full = false } = {}) {
  drawerState = { render, actions, live };
  const panel = $("drawer");
  panel.classList.toggle("wide", wide);
  panel.classList.toggle("full", full);
  $("drawerBody").innerHTML = render();
  panel.hidden = false;
  $("scrim").hidden = false;
  requestAnimationFrame(() => panel.classList.add("open"));
  document.body.classList.add("drawer-open");
  panel.scrollTop = 0;
  const focusable = panel.querySelector("[autofocus]");
  if (focusable) setTimeout(() => focusable.focus(), 60);
}

/** Перерисовать открытую панель (после сохранения или изменения в другой вкладке) */
export function refreshDrawer(force = false) {
  if (!drawerState || (!force && !drawerState.live)) return;
  const body = $("drawerBody"), top = $("drawer").scrollTop;
  body.innerHTML = drawerState.render();
  $("drawer").scrollTop = top;
}

export function closeDrawer() {
  if (!drawerState) return;
  drawerState = null;
  const panel = $("drawer");
  panel.classList.remove("open");
  $("scrim").hidden = true;
  document.body.classList.remove("drawer-open");
  setTimeout(() => { if (!drawerState) { panel.hidden = true; $("drawerBody").innerHTML = ""; } }, 220);
}
export const drawerOpen = () => Boolean(drawerState);

function actionsFor(el) {
  return el.closest("#drawer") ? drawerState?.actions || {} : viewActions;
}

export function initUi() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const handler = actionsFor(el)[el.dataset.act] || viewActions[el.dataset.act];
    if (handler) { e.preventDefault(); handler(el, e); }
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-input]");
    if (!el) return;
    actionsFor(el)[el.dataset.input]?.(el, e);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-change]");
    if (!el) return;
    actionsFor(el)[el.dataset.change]?.(el, e);
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    actionsFor(form)[form.dataset.form]?.(new FormData(form), form);
  });
  $("scrim").addEventListener("click", closeDrawer);
  $("drawerClose").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawerState) closeDrawer(); });
}

/* ---------- Кусочки разметки ---------- */
export const statusTitle = (id) => STATUSES.find((s) => s.id === id)?.title || id;
export const statusPill = (id) => `<span class="pill st-${esc(id)}">${esc(statusTitle(id))}</span>`;

export const options = (list, selected, { empty } = {}) =>
  (empty ? `<option value="">${esc(empty)}</option>` : "") +
  list.map((o) => {
    const [value, label] = typeof o === "object" ? [o.id, o.title ?? o.name] : [o, o];
    return `<option value="${esc(value)}"${String(value) === String(selected ?? "") ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");

export const field = (label, control, hint = "") =>
  `<label class="field"><span class="field-label">${esc(label)}</span>${control}${hint ? `<small class="field-hint">${hint}</small>` : ""}</label>`;

export const empty = (title, text = "") => `<div class="empty"><b>${esc(title)}</b>${text ? `<p>${text}</p>` : ""}</div>`;

/** Ошибка формы под кнопкой */
export function formError(form, text) {
  let el = form.querySelector(".form-error");
  if (!el) { el = document.createElement("p"); el.className = "form-error"; form.querySelector(".form-actions")?.before(el) ?? form.append(el); }
  el.textContent = text;
}

export const chips = (name, list, active) => `<div class="chips" role="tablist">${list.map(([id, label, count]) =>
  `<button class="chip" data-act="${name}" data-id="${esc(id)}" aria-pressed="${String(id) === String(active)}">${esc(label)}${count != null ? `<i>${count}</i>` : ""}</button>`).join("")}</div>`;
