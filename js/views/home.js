// «Главная»: что требует внимания сегодня — своё для каждой роли.
import { esc, money, num, dateTime, localDay, pluralize, emit } from "../core.js";
import { db } from "../db.js";
import { isDirector, isManager, isWarehouse } from "../auth.js";
import { statusPill } from "../ui.js";
import { openRequest } from "./requests.js";
import { isLow, qtyOf, product, toBuy, locChip } from "../stock.js";

let me = null;
const DAY = 864e5;
const ACTIVE = ["assigned", "measure", "pricing", "in_work"];

const reqRow = (r, side) => `<button class="mini-row" data-act="request" data-id="${r.id}">
  <span><b>№${r.id} · ${esc(r.client)}</b><small>${esc(r.service)} · ${esc(r.address)}</small></span>
  <span class="r">${side}</span></button>`;

function panel(title, body) {
  return `<section class="panel"><header class="panel-head"><h3>${title}</h3></header>${body}</section>`;
}

function visitsPanel(list, title) {
  const today = localDay(new Date()), tomorrow = localDay(new Date(Date.now() + DAY));
  const visits = list.filter((r) => ACTIVE.includes(r.status) && r.visit_at && [today, tomorrow].includes(localDay(new Date(r.visit_at))))
    .sort((a, b) => new Date(a.visit_at) - new Date(b.visit_at));
  return panel(title, visits.length ? `<div class="mini-list">${visits.map((r) => reqRow(r,
    `<b>${localDay(new Date(r.visit_at)) === today ? "Сегодня" : "Завтра"} ${new Date(r.visit_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b><small>${esc(db.find("masters", r.master_id)?.name || "")}</small>`)).join("")}</div>`
    : `<p class="muted">На сегодня и завтра выездов нет.</p>`, "requests");
}

function tasksPanel(list, title) {
  const open = list.filter((t) => !t.done_at).sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 6);
  return panel(title, open.length ? `<div class="mini-list">${open.map((t) => `<button class="mini-row" data-act="go" data-id="tasks">
    <span><b>${esc(t.title)}</b><small>${isDirector(me) ? esc(db.find("staff", t.assignee_id)?.name || "") : ""}</small></span>
    <span class="r"><small class="${new Date(t.due) < new Date() ? "bad" : ""}">${new Date(t.due) < new Date() ? "Просрочено · " : ""}${dateTime(t.due)}</small></span></button>`).join("")}</div>`
    : `<p class="muted">Открытых задач нет.</p>`, "tasks");
}

function newPanel(requests) {
  const fresh = requests.filter((r) => r.status === "new").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return panel(`Новые заказы${fresh.length ? ` <i class="count">${fresh.length}</i>` : ""}`, fresh.length ? `<div class="mini-list">${fresh.slice(0, 6).map((r) =>
    reqRow(r, `<small>${dateTime(r.created_at)}</small><small>${esc(r.source)}</small>`)).join("")}</div>`
    : `<p class="muted">Все заказы разобраны.</p>`, "requests");
}

function stockPanel() {
  const low = db.list("products").filter(isLow).sort((a, b) => qtyOf(a.id) / (a.min_qty || 1) - qtyOf(b.id) / (b.min_qty || 1));
  return panel(`Заканчивается${low.length ? ` <i class="count warn">${low.length}</i>` : ""}`, low.length ? `<div class="mini-list">${low.slice(0, 7).map((p) => `<button class="mini-row" data-act="go" data-id="warehouse">
    <span><b>${esc(p.name)}</b><small>${esc(p.sku)} · минимум ${num(p.min_qty)} ${esc(p.unit)}</small></span>
    <span class="r"><b class="num bad">${num(qtyOf(p.id))} ${esc(p.unit)}</b><small>купить ${num(toBuy(p))}</small></span></button>`).join("")}</div>`
    : `<p class="muted">Всего хватает.</p>`, "warehouse");
}

function render(user) {
  me = user;
  const requests = db.list("requests");
  const hello = `<p class="lead">Здравствуйте, ${esc(user.name.split(" ")[0])}! Сегодня ${new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}.</p>`;

  if (isWarehouse(user)) {
    const working = requests.filter((r) => ACTIVE.includes(r.status)).sort((a, b) => new Date(a.visit_at || a.created_at) - new Date(b.visit_at || b.created_at)).slice(0, 8);
    const moves = [...db.list("moves")].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
    return `${hello}<div class="home-grid">
      ${stockPanel()}
      ${panel(`Заказы в работе${working.length ? ` <i class="count">${working.length}</i>` : ""}`, working.length ? `<div class="mini-list">${working.map((r) => `<button class="mini-row" data-act="request" data-id="${r.id}">
        <span><b>Заказ №${r.id}</b><small>${esc(db.find("masters", r.master_id)?.name || "мастер не назначен")} · ${esc(r.address)}</small></span>
        <span class="r"><small>${r.visit_at ? `выезд ${dateTime(r.visit_at)}` : ""}</small></span></button>`).join("")}</div>` : `<p class="muted">Заказов в работе нет.</p>`, "requests")}
      ${panel("Последние движения", `<div class="mini-list">${moves.map((m) => `<div class="mini-row static"><span><b>${esc(product(m.product_id)?.name || "")}</b><small>${esc(m.by)} · ${dateTime(m.at)}</small></span>
        <span class="r">${m.kind === "move" ? `${locChip(m.from)} → ${locChip(m.to)}` : locChip(m.to || m.from)}</span></div>`).join("")}</div>`, "warehouse")}
    </div>`;
  }

  const month = requests.filter((r) => new Date(r.created_at) >= new Date(Date.now() - 30 * DAY));
  const done = month.filter((r) => r.status === "done");
  const kpis = `<section class="kpis">
    <div class="kpi"><small>Новые заказы</small><b class="num">${requests.filter((r) => r.status === "new").length}</b></div>
    <div class="kpi"><small>Заказы в работе</small><b class="num">${requests.filter((r) => ACTIVE.includes(r.status)).length}</b></div>
    <div class="kpi"><small>Заказов за 30 дней</small><b class="num">${month.length}</b><span>${done.length} выполнено</span></div>
    <div class="kpi accent"><small>Продажи за 30 дней</small><b class="num">${money(done.reduce((n, r) => n + (r.amount || 0), 0))}</b><span>по выполненным</span></div>
  </section>`;

  if (isManager(user)) {
    const mine = requests.filter((r) => r.manager_id === user.id);
    return `${hello}${kpis}<div class="home-grid">
      ${newPanel(requests)}
      ${visitsPanel(mine, "Мои выезды на сегодня и завтра")}
      ${tasksPanel(db.list("tasks").filter((t) => t.assignee_id === user.id), "Мои задачи")}
      ${panel("Мои заказы в работе", (() => {
        const list = mine.filter((r) => ACTIVE.includes(r.status)).slice(0, 6);
        return list.length ? `<div class="mini-list">${list.map((r) => reqRow(r, statusPill(r.status))).join("")}</div>` : `<p class="muted">Нет заказов в работе.</p>`;
      })(), "requests")}
    </div>`;
  }

  return `${hello}${kpis}<div class="home-grid">
    ${newPanel(requests)}
    ${visitsPanel(requests, "Выезды мастеров сегодня и завтра")}
    ${tasksPanel(db.list("tasks"), "Задачи менеджеров")}
    ${stockPanel()}
  </div>`;
}

export default {
  title: () => "Главная",
  render,
  actions: {
    request: (el) => openRequest(el.dataset.id),
    go: (el) => emit("go", { section: el.dataset.id }),
  },
};
