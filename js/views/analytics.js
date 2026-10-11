// «Аналитика» (менеджер и руководитель): заказы, конверсия и выручка за период, источники, услуги,
// загрузка мастеров и результаты менеджеров. Руководитель дополнительно видит стоимость склада.
import { esc, money, num, pluralize } from "../core.js";
import { STATUSES } from "../config.js";
import { db } from "../db.js";
import { isDirector } from "../auth.js";
import { chips, empty } from "../ui.js";
import { stockValue, isLow } from "../stock.js";

let period = 90; // дней; 0 — всё время
let me = null;

const DAY = 864e5;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const inPeriod = (r) => !period || new Date(r.created_at) >= new Date(Date.now() - period * DAY);

function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Столбики по неделям: одна серия, подпись значения при наведении и у последнего столбика */
function columns(list, value, format, label) {
  const first = weekStart(period ? Date.now() - period * DAY : Math.min(...list.map((r) => new Date(r.created_at))));
  const weeks = [];
  for (let w = new Date(first); w <= new Date(); w.setDate(w.getDate() + 7)) weeks.push({ from: new Date(w), v: 0 });
  for (const r of list) {
    const i = Math.floor((weekStart(r.created_at) - first) / (7 * DAY));
    if (weeks[i]) weeks[i].v += value(r);
  }
  const max = Math.max(1, ...weeks.map((w) => w.v));
  const step = Math.ceil(weeks.length / 7);
  return `<figure class="chart" aria-label="${esc(label)}">
    <div class="cols" style="--n:${weeks.length}">${weeks.map((w, i) => `<div class="col${i === weeks.length - 1 ? " last" : ""}" tabindex="0">
      <span class="bar" style="height:${(w.v / max) * 100}%"></span>
      <span class="tip">Неделя с ${w.from.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}: <b>${format(w.v)}</b></span>
</div>`).join("")}</div>
    <div class="cols-axis" style="--n:${weeks.length}">${weeks.map((w, i) => `<span>${i % step === 0 ? w.from.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : ""}</span>`).join("")}</div>
    <div class="cols-scale"><span>Последняя неделя: <b>${format(weeks[weeks.length - 1].v)}</b></span><span>Максимум: ${format(max)}</span></div>
  </figure>`;
}

/** Горизонтальные полосы: подпись слева, значение справа текстом */
function bars(rows, format = num) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar"><span class="hbar-label">${esc(r.label)}</span>
    <span class="hbar-track"><span class="hbar-fill${r.cls ? ` ${r.cls}` : ""}" style="width:${(r.v / max) * 100}%"></span></span>
    <span class="hbar-value num">${format(r.v)}${r.extra ? `<small>${r.extra}</small>` : ""}</span></div>`).join("")}</div>`;
}

function render(user) {
  me = user;
  const list = db.list("requests").filter(inPeriod);
  const done = list.filter((r) => r.status === "done");
  const cancelled = list.filter((r) => r.status === "cancelled");
  const closed = done.length + cancelled.length;
  const revenue = done.reduce((n, r) => n + (r.amount || 0), 0);
  const group = (key, names) => {
    const map = new Map();
    for (const r of list) {
      const k = r[key] ?? "—";
      const g = map.get(k) || map.set(k, { label: names ? names(k) : k, all: 0, done: 0, revenue: 0, active: 0 }).get(k);
      g.all++;
      if (r.status === "done") { g.done++; g.revenue += r.amount || 0; }
      if (["assigned", "measure", "pricing", "in_work"].includes(r.status)) g.active++;
    }
    return [...map.values()].sort((a, b) => b.all - a.all);
  };
  const sources = group("source"), services = group("service");
  const masters = group("master_id", (id) => db.find("masters", id)?.name || "Без мастера").filter((g) => g.label !== "Без мастера");
  const managers = group("manager_id", (id) => db.find("staff", id)?.name || "Не взята").filter((g) => g.label !== "Не взята");

  const periodChips = chips("period", [[30, "30 дней"], [90, "90 дней"], [365, "Год"], [0, "Всё время"]], period);
  if (!list.length) return periodChips + empty("За этот период заказов нет", "Выберите период побольше.");

  const sv = isDirector(user) ? stockValue() : null;
  return `${periodChips}
    <section class="kpis">
      <div class="kpi"><small>Заказов</small><b class="num">${num(list.length)}</b><span>${num(list.filter((r) => r.status === "new").length)} ждут менеджера</span></div>
      <div class="kpi"><small>Выполнено</small><b class="num">${num(done.length)}</b><span>${pct(done.length, closed)}% закрытых — успешно</span></div>
      <div class="kpi accent"><small>Выручка</small><b class="num">${money(revenue)}</b><span>по выполненным заказам</span></div>
      <div class="kpi"><small>Средний чек</small><b class="num">${money(done.length ? revenue / done.length : 0)}</b><span>${num(cancelled.length)} ${pluralize(cancelled.length, "отказ", "отказа", "отказов")}</span></div>
    </section>

    <div class="an-grid">
      <section class="panel"><h3>Новые заказы по неделям</h3>${columns(list, () => 1, (v) => num(v), "Заказы по неделям")}</section>
      <section class="panel"><h3>Выручка по неделям создания заказа</h3>${columns(done, (r) => r.amount || 0, money, "Выручка по неделям")}</section>

      <section class="panel"><h3>Где сейчас заказы</h3>
        ${bars(STATUSES.map((s) => ({ label: s.title, v: list.filter((r) => r.status === s.id).length, cls: `st-${s.id}` })))}</section>

      <section class="panel"><h3>Откуда приходят клиенты</h3>
        ${bars(sources.map((g) => ({ label: g.label, v: g.all, extra: `${pct(g.done, g.all)}% выполнено` })))}</section>

      <section class="panel wide"><h3>Услуги</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Услуга</th><th class="r">Заказов</th><th class="r">Выполнено</th><th class="r">Выручка</th><th class="r">Средний чек</th></tr></thead>
        <tbody>${services.map((g) => `<tr><td>${esc(g.label)}</td><td class="r num">${g.all}</td><td class="r num">${g.done}</td>
          <td class="r num">${money(g.revenue)}</td><td class="r num">${money(g.done ? g.revenue / g.done : 0)}</td></tr>`).join("")}</tbody></table></div></section>

      <section class="panel"><h3>Мастера</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Мастер</th><th class="r">В работе</th><th class="r">Выполнено</th><th class="r">Выручка</th></tr></thead>
        <tbody>${masters.sort((a, b) => b.revenue - a.revenue).map((g) => `<tr><td>${esc(g.label)}</td><td class="r num">${g.active}</td><td class="r num">${g.done}</td><td class="r num">${money(g.revenue)}</td></tr>`).join("")}</tbody></table></div></section>

      <section class="panel"><h3>Менеджеры</h3>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Менеджер</th><th class="r">Взято</th><th class="r">Выполнено</th><th class="r">Выручка</th></tr></thead>
        <tbody>${managers.sort((a, b) => b.revenue - a.revenue).map((g) => `<tr${me.name === g.label ? ' class="me"' : ""}><td>${esc(g.label)}</td><td class="r num">${g.all}</td><td class="r num">${g.done}</td><td class="r num">${money(g.revenue)}</td></tr>`).join("")}</tbody></table></div></section>

      ${sv ? `<section class="panel wide"><h3>Склад сейчас</h3><div class="kpis small">
        <div class="kpi"><small>Стоимость остатков</small><b class="num">${money(sv.cost)}</b></div>
        <div class="kpi${db.list("products").filter(isLow).length ? " bad" : ""}"><small>Позиций ниже минимума</small><b class="num">${db.list("products").filter(isLow).length}</b></div></div></section>` : ""}
    </div>`;
}

export default {
  title: () => "Аналитика",
  render,
  actions: { period(el) { period = Number(el.dataset.id); document.getElementById("view").innerHTML = render(me); } },
};
