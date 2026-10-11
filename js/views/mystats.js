// «Моя статистика» (менеджер): оформленные им заказы и их сумма, плюс кнопка «Премия» с разбивкой по причинам.
import { esc, money, num, dateShort } from "../core.js";
import { db } from "../db.js";
import { chips, empty, statusPill, openDrawer } from "../ui.js";
import { bonusFor } from "../bonus.js";
import { openRequest } from "./requests.js";

let me = null;
let period = 30; // дней; 0 — всё время

const MONTH = () => new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

/** Окно «Премия»: из чего складывается выплата менеджеру за текущий месяц */
export function openBonus(managerId) {
  const m = db.find("staff", managerId);
  openDrawer(() => {
    const { rows, total } = bonusFor(managerId);
    return `<header class="d-head"><p class="eyebrow">Премия за ${esc(MONTH())}</p><h2>${esc(m?.name || "Менеджер")}</h2></header>
      <section class="d-sec"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Причина</th><th class="r">Сумма</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${r.earned ? "" : "off"}"><td><b>${esc(r.title)}</b><small>${esc(r.rule)}</small></td>
          <td class="r num">${r.earned ? `<b>${money(r.amount)}</b>` : `<span class="muted">${r.bonus ? `+${money(r.bonus)} при выполнении` : "—"}</span>`}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>Итого к выплате</td><td class="r num"><b>${money(total)}</b></td></tr></tfoot></table></div>
        <p class="muted small">Считается по заказам, завершённым в этом месяце. Размеры оклада и надбавок настраиваются в файле js/bonus.js.</p></section>`;
  }, {}, { live: true });
}

function render(user) {
  me = user;
  const since = period ? Date.now() - period * 864e5 : 0;
  const list = db.list("requests").filter((r) => r.manager_id === user.id && new Date(r.created_at) >= since).sort((a, b) => b.id - a.id);
  const done = list.filter((r) => r.status === "done");
  const sum = (rs) => rs.reduce((n, r) => n + (r.amount || 0), 0);
  const placed = list.filter((r) => r.status !== "cancelled");
  const { total } = bonusFor(user.id);
  return `<div class="toolbar">${chips("period", [[30, "30 дней"], [90, "90 дней"], [0, "Всё время"]], period)}
      <button class="btn primary" data-act="bonus" style="margin-left:auto">Премия</button></div>
    <section class="kpis">
      <div class="kpi"><small>Оформлено заказов</small><b class="num">${num(list.length)}</b><span>${num(done.length)} завершено</span></div>
      <div class="kpi accent"><small>Сумма оформленных</small><b class="num">${money(sum(placed))}</b><span>без отменённых</span></div>
      <div class="kpi"><small>Сумма завершённых</small><b class="num">${money(sum(done))}</b><span>${num(done.length)} заказов</span></div>
      <div class="kpi"><small>Премия за ${esc(MONTH())}</small><b class="num">${money(total)}</b><span>нажмите «Премия», чтобы увидеть из чего</span></div>
    </section>
    ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>№</th><th>Оформлен</th><th>Клиент</th><th>Статус заказа</th><th class="r">Сумма</th></tr></thead>
      <tbody>${list.map((r) => `<tr class="clickable" data-act="open" data-id="${r.id}"><td class="num"><b>№${r.id}</b></td><td class="num nowrap">${dateShort(r.created_at)}</td>
        <td>${esc(r.client)}<small>${esc(r.service)}</small></td><td class="nowrap">${statusPill(r.status)}</td><td class="r num">${r.amount ? money(r.amount) : `<span class="muted">—</span>`}</td></tr>`).join("")}</tbody></table></div>`
      : empty("Заказов пока нет", "Здесь появятся заказы, которые вы взяли или оформили.")}`;
}

export default {
  title: () => "Моя статистика",
  render,
  actions: {
    period(el) { period = Number(el.dataset.id); document.getElementById("view").innerHTML = render(me); },
    bonus: () => openBonus(me.id),
    open: (el) => openRequest(el.dataset.id),
  },
};
