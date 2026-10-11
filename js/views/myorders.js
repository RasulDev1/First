// «Мои заказы» (мастер и стажёр): только свои заказы, статус и сколько мастер заработает в этом месяце.
// Мастер отмечает два шага: «Выехал на замеры» и «Завершён»; остальные статусы ставятся сами по действиям менеджера.
import { esc, money, dateTime, armed, toast } from "../core.js";
import { STATUSES, ACTIVE_STATUSES } from "../config.js";
import { db } from "../db.js";
import { openDrawer, statusPill, empty } from "../ui.js";
import { payOf, rateOf } from "../pay.js";
import { statusAt, setStatus } from "./requests.js";

let me = null;

const monthOf = (iso) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
const mine = () => db.list("requests").filter((r) => r.master_id === me.master_id);
const visible = (r) => ACTIVE_STATUSES.includes(r.status) || (r.status === "done" && r.done_at && monthOf(r.done_at));
const earn = (r) => (r.amount ? money(payOf(r)) : `<span class="muted">цена не согласована</span>`);

function rowHtml(r) {
  return `<tr class="clickable" data-act="open" data-id="${r.id}">
    <td class="num"><b>№${r.id}</b></td>
    <td>${esc(r.address)}<small>${esc(r.service)}</small></td>
    <td class="num nowrap">${r.visit_at ? dateTime(r.visit_at) : `<span class="muted">—</span>`}</td>
    <td class="nowrap">${statusPill(r.status)}</td>
    <td class="r num nowrap"><b>${earn(r)}</b></td></tr>`;
}

function render(user) {
  me = user;
  const master = db.find("masters", user.master_id);
  const orders = mine().filter(visible).sort((a, b) => new Date(statusAt(b)) - new Date(statusAt(a)));
  const earned = orders.filter((r) => r.status === "done").reduce((n, r) => n + payOf(r), 0);
  const expected = orders.filter((r) => r.status !== "done").reduce((n, r) => n + payOf(r), 0);
  return `<section class="kpis">
      <div class="kpi accent"><small>Заработано в этом месяце</small><b class="num">${money(earned)}</b><span>по завершённым заказам</span></div>
      <div class="kpi"><small>Ожидается</small><b class="num">${money(expected)}</b><span>по заказам в работе</span></div>
      <div class="kpi"><small>Ваша ставка</small><b class="num">${rateOf(master)}%</b><span>от суммы заказа</span></div>
    </section>
    ${orders.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>№</th><th>Адрес</th><th>Выезд</th><th>Статус заказа</th><th class="r">Вы заработаете</th></tr></thead>
      <tbody>${orders.map(rowHtml).join("")}</tbody></table></div>` : empty("Заказов пока нет", "Когда менеджер назначит вам заказ, он появится здесь.")}`;
}

function detailHtml(id) {
  const r = mine().find((x) => x.id === id);
  if (!r) return empty("Заказ не найден");
  const hist = [...(r.history || [])].reverse().filter((h) => h.text.startsWith("Статус:") || h.text.startsWith("Заказ создан"));
  return `<header class="d-head"><p class="eyebrow">Заказ №${r.id}</p><h2>${esc(r.address)}</h2><div class="d-meta">${statusPill(r.status)}</div></header>
    <section class="d-sec"><dl class="kv"><dt>Услуга</dt><dd>${esc(r.service)}${r.object ? ` · ${esc(r.object)}` : ""}</dd>
      <dt>Выезд</dt><dd>${r.visit_at ? dateTime(r.visit_at) : "—"}</dd>
      <dt>Вы заработаете</dt><dd class="num"><b>${earn(r)}</b></dd></dl></section>
    ${r.status === "assigned" ? `<section class="d-sec"><button class="btn primary big" data-act="depart" data-id="${r.id}">Выехал на замеры</button></section>` : ""}
    ${r.status === "in_work" ? `<section class="d-sec"><button class="btn primary big" data-act="finish" data-id="${r.id}">Завершён</button></section>` : ""}
    <section class="d-sec"><h3>Статусы</h3><ol class="history">${hist.map((h) => `<li><b>${esc(h.text.replace("Статус: ", ""))}</b><small>${dateTime(h.at)}</small></li>`).join("")}</ol></section>`;
}

function step(id, from, to, btn, text) {
  const r = mine().find((x) => x.id === id);
  if (!r || r.status !== from) return;
  setStatus(r, to, me.name);
  db.batch(() => {});
  toast(text, "ok");
}

export default {
  title: () => "Мои заказы",
  render,
  actions: {
    open: (el) => openDrawer(() => detailHtml(Number(el.dataset.id)), {
      depart(btn) { step(Number(btn.dataset.id), "assigned", "measure", btn, "Статус изменён: выезд на замеры"); },
      finish(btn) { if (armed(btn, "Точно завершён?")) step(Number(btn.dataset.id), "in_work", "done", btn, "Заказ завершён"); },
    }, { live: true }),
  },
};
