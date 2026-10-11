// «Заказы» (менеджер и руководитель): заказы с сайта и звонков, назначение мастера и даты выезда, статусы,
// сумма договора, материалы по плану, расходы со склада и история изменений.
// Складовщик видит заказы в урезанном виде и только выписывает материал в «Расходы».
import { esc, money, num, dateTime, dateShort, toLocalInput, toast, copyText, armed, localDay } from "../core.js";
import { STATUSES, SERVICES, OBJECTS, SOURCES, CATEGORIES } from "../config.js";
import { db } from "../db.js";
import { isDirector, isWarehouse, currentUser } from "../auth.js";
import { openExpense } from "./warehouse.js";
import { levelTitle } from "./masters.js";
import { openDrawer, statusPill, options, field, empty, chips, formError } from "../ui.js";
import { qtyOf, product, shortages, expensedQty, expenseTotal, locChip } from "../stock.js";

let filter = "active";  // active · new · assigned · in_work · done · cancelled · all
let mine = false;
let query = "";
let me = null;

const ACTIVE = ["new", "assigned", "in_work"];
const staffName = (id) => db.find("staff", id)?.name || "";
const masterName = (id) => db.find("masters", id)?.name || "";
export const requestTotal = (r) => r.amount || 0;
export const itemsTotal = (r) => (r.items || []).reduce((n, it) => n + it.qty * (it.price || 0), 0);

function log(r, text) {
  (r.history ||= []).push({ at: new Date().toISOString(), by: me?.name || "", text });
}

function matches(r) {
  if (filter === "active" && !ACTIVE.includes(r.status)) return false;
  if (!["active", "all"].includes(filter) && r.status !== filter) return false;
  if (mine && r.manager_id !== me.id) return false;
  if (!query) return true;
  const hay = `${r.id} ${r.client} ${r.phone} ${r.address} ${r.service} ${masterName(r.master_id)}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function rowHtml(r) {
  const visit = r.visit_at && ACTIVE.includes(r.status) ? `<small class="muted">Выезд ${dateTime(r.visit_at)}</small>` : "";
  return `<button class="req-row" data-act="open" data-id="${r.id}">
    <span class="req-no">№${r.id}<small>${dateShort(r.created_at)}</small></span>
    <span class="req-main"><b>${esc(r.client)}</b><small>${esc(r.service)} · ${esc(r.address)}</small></span>
    <span class="req-who"><span>${r.master_id ? esc(masterName(r.master_id)) : `<em class="muted">мастер не выбран</em>`}</span>${visit}</span>
    <span class="req-side">${statusPill(r.status)}${isWarehouse(me) ? "" : `<b class="num">${r.amount ? money(r.amount) : ""}</b>`}</span>
  </button>`;
}

function listHtml() {
  const list = db.list("requests").filter(matches).sort((a, b) =>
    (a.status === "new" ? 0 : 1) - (b.status === "new" ? 0 : 1) || new Date(b.created_at) - new Date(a.created_at));
  if (!list.length) return empty("Заказов нет", query ? "Попробуйте другой запрос." : "Здесь появятся заказы с сайта и те, что вы добавите сами.");
  return list.map(rowHtml).join("");
}

function render(user) {
  me = user;
  const all = db.list("requests");
  const count = (st) => all.filter((r) => (st === "active" ? ACTIVE.includes(r.status) : st === "all" || r.status === st)).length;
  const warehouse = isWarehouse(user);
  return `<div class="toolbar">
      <input class="search" type="search" id="reqSearch" placeholder="Поиск: клиент, адрес, №" value="${esc(query)}" data-input="search" aria-label="Поиск заказов">
      ${warehouse ? `<button class="btn primary" data-act="expenseAny">Расход</button>` : `<label class="toggle"><input type="checkbox" id="reqMine" data-change="mine"${mine ? " checked" : ""}><span>Только мои</span></label>
      <button class="btn primary" data-act="create">Новый заказ</button>`}
    </div>
    ${warehouse ? `<p class="lead">Здесь видно, какие материалы нужны под заказы. Откройте заказ и выпишите материал: он попадёт в «Расходы» этого заказа.</p>` : ""}
    ${chips("filter", [["active", "В работе", count("active")], ...STATUSES.map((s) => [s.id, s.title, count(s.id)]), ["all", "Все", count("all")]], filter)}
    <div class="req-list" id="reqList">${listHtml()}</div>`;
}

/* ---------- Карточка заказа ---------- */
function productOptions() {
  return CATEGORIES.map((c) => `<optgroup label="${esc(c.title)}">${db.list("products").filter((p) => p.category === c.id)
    .map((p) => `<option value="${p.id}">${esc(p.name)} — ${num(qtyOf(p.id))} ${esc(p.unit)}</option>`).join("")}</optgroup>`).join("");
}

function masterLoad(masterId, visitAt, selfId) {
  if (!masterId || !visitAt) return "";
  const day = localDay(new Date(visitAt));
  const same = db.list("requests").filter((r) => r.id !== selfId && r.master_id === Number(masterId) && ACTIVE.includes(r.status)
    && r.visit_at && localDay(new Date(r.visit_at)) === day);
  return same.length ? `<p class="note warn">У мастера в этот день ещё ${same.length} ${same.length === 1 ? "выезд" : "выезда"}: ${same.map((r) =>
    `№${r.id} в ${new Date(r.visit_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`).join(", ")}</p>` : "";
}

function itemsHtml(r) {
  const items = r.items || [];
  const short = new Set(shortages(r).map((s) => s.product_id));
  const editable = !["done", "cancelled"].includes(r.status) && !isWarehouse(me);
  return `<div class="items">${items.length ? `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Материал</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th>${editable ? "<th></th>" : ""}</tr></thead>
    <tbody>${items.map((it, i) => {
      const p = product(it.product_id);
      return `<tr><td>${esc(p?.name || "Удалённый товар")}${short.has(it.product_id) && expensedQty(r, it.product_id) < it.qty ? `<small class="bad">на складе ${num(qtyOf(it.product_id))}</small>` : ""}${expensedQty(r, it.product_id) ? `<small>выписано ${num(expensedQty(r, it.product_id))} из ${num(it.qty)}</small>` : ""}</td>
        <td class="r num">${num(it.qty)} ${esc(p?.unit || "")}</td><td class="r num">${money(it.price)}</td><td class="r num">${money(it.qty * it.price)}</td>
        ${editable ? `<td class="r"><button class="icon-btn" data-act="removeItem" data-id="${i}" aria-label="Убрать">✕</button></td>` : ""}</tr>`;
    }).join("")}</tbody>
    <tfoot><tr><td colspan="3">Материалы по прайсу</td><td class="r num"><b>${money(itemsTotal(r))}</b></td>${editable ? "<td></td>" : ""}</tr></tfoot></table></div>` : `<p class="muted">Материалы не добавлены.</p>`}
    ${items.length && !r.expenses?.length ? `<p class="note">Складовщик выписывает материалы в «Склад → Расход», они появятся в «Расходах» ниже.</p>` : ""}
    ${editable ? `<form class="inline-form" data-form="addItem">
      <select name="product" aria-label="Материал" required><option value="">Добавить материал со склада…</option>${productOptions()}</select>
      <input name="qty" type="number" min="0.1" step="any" inputmode="decimal" placeholder="Кол-во" aria-label="Количество" required>
      <button class="btn" type="submit">Добавить</button></form>` : ""}</div>`;
}

/** «Расходы»: материалы, выписанные со склада под заказ, по себестоимости */
function expensesHtml(r, { button = false } = {}) {
  const list = r.expenses || [];
  const open = ACTIVE.includes(r.status);
  return `${list.length ? `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Материал</th><th>Место</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th><th>Когда</th></tr></thead>
    <tbody>${list.map((e) => { const p = product(e.product_id); return `<tr><td>${esc(p?.name || "Удалённый товар")}${e.note ? `<small class="note-line">${esc(e.note)}</small>` : ""}${e.by ? `<small>${esc(e.by)}</small>` : ""}</td><td>${e.loc ? locChip(e.loc) : ""}</td>
      <td class="r num">${num(e.qty)} ${esc(p?.unit || "")}</td><td class="r num">${money(e.cost)}</td><td class="r num">${money(e.qty * e.cost)}</td><td class="num nowrap">${dateTime(e.at)}</td></tr>`; }).join("")}</tbody>
    <tfoot><tr><td colspan="4">Итого расходы</td><td class="r num"><b>${money(expenseTotal(r))}</b></td><td></td></tr></tfoot></table></div>` : `<p class="muted">Со склада пока ничего не выписано.</p>`}
    ${button && open ? `<button class="btn primary" data-act="expense">Выписать материал</button>` : ""}`;
}

/** Складовщик видит заказ без цен и контактов: адрес, мастера, материалы по плану и расходы */
function warehouseDetailHtml(r) {
  const plan = r.items || [];
  const master = db.find("masters", r.master_id);
  return `<header class="d-head"><p class="eyebrow">Заказ №${r.id} · ${dateTime(r.created_at)}</p><h2>${esc(r.client)}</h2>
      <div class="d-meta">${statusPill(r.status)}</div></header>
    <section class="d-sec"><dl class="kv">
      <dt>Адрес</dt><dd>${esc(r.address)}</dd><dt>Услуга</dt><dd>${esc(r.service)}</dd>
      <dt>Мастер</dt><dd>${master ? `${esc(master.name)} · ${esc(levelTitle(master))}` : "Не назначен"}</dd>
      ${r.visit_at ? `<dt>Выезд</dt><dd>${dateTime(r.visit_at)}</dd>` : ""}</dl></section>
    <section class="d-sec"><h3>Материалы по плану менеджера</h3>${plan.length ? `<div class="mini-list">${plan.map((it) => { const p = product(it.product_id), done = expensedQty(r, it.product_id);
      return `<div class="mini-row static"><span><b>${esc(p?.name || "")}</b><small>${done >= it.qty ? "выписано полностью" : done ? `выписано ${num(done)}` : `на складе ${num(qtyOf(it.product_id))}`}</small></span>
        <span class="r num"><b>${num(it.qty)} ${esc(p?.unit || "")}</b></span></div>`; }).join("")}</div>` : `<p class="muted">Менеджер не добавил материалы. Выписать можно любой товар.</p>`}</section>
    <section class="d-sec"><h3>Расходы</h3>${expensesHtml(r, { button: true })}</section>`;
}

function detailHtml(id) {
  const r = db.find("requests", id);
  if (!r) return empty("Заказ удалён");
  if (isWarehouse(me)) return warehouseDetailHtml(r);
  const masters = db.list("masters").filter((m) => m.active || m.id === r.master_id);
  const managers = db.list("staff").filter((s) => s.active && (s.role === "manager" || s.role === "director"));
  const closed = ["done", "cancelled"].includes(r.status);
  return `<header class="d-head">
      <p class="eyebrow">Заказ №${r.id} · ${esc(r.source || "")} · ${dateTime(r.created_at)}</p>
      <h2>${esc(r.client)}</h2>
      <div class="d-meta">${statusPill(r.status)}<span class="muted">${r.manager_id ? `Менеджер: ${esc(staffName(r.manager_id))}` : "Менеджер не назначен"}</span></div>
    </header>

    <section class="d-sec">
      <dl class="kv">
        <dt>Телефон</dt><dd><span class="num">${esc(r.phone)}</span> <button class="link" data-act="copyPhone">Скопировать</button></dd>
        <dt>Адрес</dt><dd>${esc(r.address)}</dd>
        <dt>Объект</dt><dd>${esc(r.object || "—")}</dd>
        <dt>Услуга</dt><dd>${esc(r.service)}</dd>
        ${r.note ? `<dt>Со слов клиента</dt><dd>${esc(r.note)}</dd>` : ""}
      </dl>
      <button class="btn ghost sm" data-act="edit">Изменить данные клиента</button>
    </section>

    ${r.status === "new" ? `<section class="d-sec callout">
      <p><b>Новый заказ.</b> Возьмите его, позвоните клиенту и назначьте мастера.</p>
      <button class="btn primary" data-act="take">Взять заказ</button></section>` : ""}

    ${isDirector(me) ? `<section class="d-sec"><h3>Ответственный менеджер</h3>
      <form class="inline-form" data-form="setManager"><select name="manager" aria-label="Менеджер">${options(managers.map((s) => ({ id: s.id, title: s.name })), r.manager_id, { empty: "Не назначен" })}</select>
      <button class="btn" type="submit">Назначить</button></form></section>` : ""}

    <section class="d-sec"><h3>Мастер и выезд</h3>
      <form data-form="assign" class="grid2">
        ${field("Мастер", `<select name="master" data-change="previewLoad">${options(masters.map((m) => ({ id: m.id, title: `${m.name} · ${levelTitle(m)}` })), r.master_id, { empty: "Выберите мастера" })}</select>`)}
        ${field("Дата и время выезда", `<input name="visit" type="datetime-local" value="${toLocalInput(r.visit_at)}" data-change="previewLoad">`)}
        <div class="span2" id="loadNote">${masterLoad(r.master_id, r.visit_at, r.id)}</div>
        <div class="form-actions span2"><button class="btn primary" type="submit"${closed ? " disabled" : ""}>Сохранить мастера и дату</button></div>
      </form>
      <p class="muted small">У мастеров нет аккаунтов: сообщите мастеру адрес и время сами. Телефон мастера — в разделе «Мастера».</p>
    </section>

    <section class="d-sec"><h3>Статус</h3>
      <div class="status-steps">${STATUSES.filter((s) => s.id !== "cancelled").map((s, i, arr) => {
        const at = arr.findIndex((x) => x.id === r.status);
        return `<span class="step${s.id === r.status ? " now" : at > i ? " past" : ""}">${esc(s.title)}</span>`;
      }).join("")}</div>
      <div class="btn-row">
        ${r.status === "assigned" ? `<button class="btn" data-act="status" data-id="in_work">Мастер выехал — в работе</button>` : ""}
        ${["assigned", "in_work"].includes(r.status) ? `<button class="btn primary" data-act="status" data-id="done">Работы выполнены</button>` : ""}
        ${closed ? `<button class="btn" data-act="status" data-id="${r.master_id ? "in_work" : "new"}">Вернуть в работу</button>` : `<button class="btn ghost danger" data-act="status" data-id="cancelled">Отменить заказ</button>`}
      </div>
    </section>

    <section class="d-sec"><h3>Сумма договора</h3>
      <form class="inline-form" data-form="amount">
        <input name="amount" type="number" min="0" step="100" inputmode="numeric" value="${r.amount || ""}" placeholder="0" aria-label="Сумма договора, ₽">
        <span class="muted">₽</span><button class="btn" type="submit">Сохранить</button></form>
      <p class="muted small">Работы и оборудование для клиента. По выполненным заказам сумма идёт в выручку в «Аналитике».</p>
    </section>

    <section class="d-sec"><h3>Материалы по плану</h3>${itemsHtml(r)}</section>

    <section class="d-sec"><h3>Расходы</h3>${expensesHtml(r)}</section>

    <section class="d-sec"><h3>Комментарий менеджера</h3>
      <form data-form="comment"><textarea name="comment" rows="3" placeholder="Договорились о замере, клиент просит позвонить за час…">${esc(r.comment || "")}</textarea>
      <div class="form-actions"><button class="btn" type="submit">Сохранить комментарий</button></div></form></section>

    <section class="d-sec"><h3>История</h3>
      <ol class="history">${[...(r.history || [])].reverse().map((h) => `<li><b>${esc(h.text)}</b><small>${dateTime(h.at)}${h.by ? ` · ${esc(h.by)}` : ""}</small></li>`).join("")}</ol></section>`;
}

let openId = null;
const current = () => db.find("requests", openId);

function save(text) {
  db.batch(() => {});
  if (text) toast(text, "ok");
}

const detailActions = {
  expense: () => openExpense({ requestId: openId }),
  copyPhone: (el) => copyText(current().phone, el),
  edit: () => openForm(current()),
  take() {
    const r = current();
    r.manager_id = me.id;
    log(r, "Менеджер взял заказ");
    save("Заказ ваш — назначьте мастера");
  },
  setManager(fd) {
    const r = current(), id = Number(fd.get("manager")) || null;
    if (id === r.manager_id) return;
    r.manager_id = id;
    log(r, id ? `Ответственный менеджер: ${staffName(id)}` : "Менеджер снят");
    save("Менеджер назначен");
  },
  previewLoad(el) {
    const form = el.closest("form");
    document.getElementById("loadNote").innerHTML = masterLoad(form.master.value, form.visit.value, openId);
  },
  assign(fd, form) {
    const r = current();
    const masterId = Number(fd.get("master")) || null, visit = fd.get("visit");
    if (!masterId) return formError(form, "Выберите мастера");
    if (!visit) return formError(form, "Укажите дату и время выезда");
    const visitIso = new Date(visit).toISOString();
    if (masterId !== r.master_id) log(r, `Назначен мастер: ${db.find("masters", masterId).name}`);
    if (visitIso !== r.visit_at) log(r, `Выезд: ${dateTime(visitIso)}`);
    r.master_id = masterId;
    r.visit_at = visitIso;
    if (!r.manager_id) r.manager_id = me.id;
    if (r.status === "new") { r.status = "assigned"; log(r, "Статус: Мастер назначен"); }
    save("Мастер и дата сохранены");
  },
  status(el) {
    const r = current(), next = el.dataset.id;
    if (next === "cancelled" && !armed(el, "Точно отменить?")) return;
    if (["assigned", "in_work", "done"].includes(next) && !r.master_id) return toast("Сначала выберите мастера", "bad");
    r.status = next;
    r.done_at = next === "done" ? new Date().toISOString() : null;
    if (!r.manager_id) r.manager_id = me.id;
    log(r, `Статус: ${STATUSES.find((s) => s.id === next).title}`);
    save(next === "done" ? "Заказ выполнен" : "Статус изменён");
  },
  amount(fd) {
    const r = current(), amount = Math.max(0, Math.round(Number(fd.get("amount")) || 0));
    if (amount === (r.amount || 0)) return;
    r.amount = amount;
    log(r, `Сумма договора: ${money(amount)}`);
    save("Сумма сохранена");
  },
  addItem(fd, form) {
    const r = current(), p = product(fd.get("product")), qty = Number(String(fd.get("qty")).replace(",", "."));
    if (!p) return formError(form, "Выберите материал");
    if (!(qty > 0)) return formError(form, "Впишите количество");
    const existing = (r.items ||= []).find((it) => it.product_id === p.id);
    if (existing) existing.qty = Math.round((existing.qty + qty) * 1000) / 1000;
    else r.items.push({ product_id: p.id, qty, price: p.price });
    save(`Добавлено: ${p.name}`);
  },
  removeItem(el) {
    const r = current();
    r.items.splice(Number(el.dataset.id), 1);
    save();
  },
  comment(fd) {
    const r = current();
    r.comment = String(fd.get("comment") || "").trim();
    save("Комментарий сохранён");
  },
};

export function openRequest(id) {
  me = currentUser();
  openId = Number(id);
  openDrawer(() => detailHtml(openId), detailActions, { live: true, full: true });
}

/* ---------- Новый заказ и правка данных клиента ---------- */
function formHtml(r) {
  return `<header class="d-head"><p class="eyebrow">${r ? `Заказ №${r.id}` : "Звонок или обращение"}</p><h2>${r ? "Данные клиента" : "Новый заказ"}</h2></header>
    <form data-form="saveForm" class="grid2">
      ${field("Клиент", `<input name="client" required maxlength="120" value="${esc(r?.client || "")}" placeholder="ФИО или название организации" autofocus>`)}
      ${field("Телефон", `<input name="phone" required type="tel" maxlength="30" value="${esc(r?.phone || "")}" placeholder="+7 928 000-00-00">`)}
      <div class="span2">${field("Адрес объекта", `<input name="address" required maxlength="200" value="${esc(r?.address || "")}" placeholder="Город, улица, дом, квартира">`)}</div>
      ${field("Объект", `<select name="object">${options(OBJECTS, r?.object)}</select>`)}
      ${field("Услуга", `<select name="service">${options(SERVICES, r?.service)}</select>`)}
      ${field("Откуда узнали", `<select name="source">${options(SOURCES, r?.source || "Звонок")}</select>`)}
      <div class="span2">${field("Что нужно клиенту", `<textarea name="note" rows="3" maxlength="1000" placeholder="Площадь, что не устраивает, удобное время">${esc(r?.note || "")}</textarea>`)}</div>
      <div class="form-actions span2"><button class="btn primary" type="submit">${r ? "Сохранить" : "Создать заказ"}</button>
        <button class="btn ghost" type="button" data-act="cancelForm">Отмена</button></div>
    </form>`;
}

function openForm(r) {
  me = currentUser();
  openDrawer(() => formHtml(r), {
    cancelForm: () => (r ? openRequest(r.id) : document.getElementById("drawerClose").click()),
    saveForm(fd, form) {
      const values = Object.fromEntries(["client", "phone", "address", "object", "service", "source", "note"].map((k) => [k, String(fd.get(k) || "").trim()]));
      if (!values.client || !values.phone || !values.address) return formError(form, "Заполните клиента, телефон и адрес");
      if (r) {
        Object.assign(r, values);
        log(r, "Изменены данные клиента");
        save("Сохранено");
        openRequest(r.id);
      } else {
        const created = db.insert("requests", { ...values, status: "new", manager_id: me.id, master_id: null, visit_at: null, amount: 0, items: [], comment: "",
          history: [{ at: new Date().toISOString(), by: me.name, text: "Заказ завёл менеджер" }] });
        toast(`Заказ №${created.id} создана`, "ok");
        openRequest(created.id);
      }
    },
  }, { wide: true });
}

export default {
  title: () => "Заказы",
  render,
  actions: {
    open: (el) => openRequest(el.dataset.id),
    create: () => openForm(null),
    expenseAny: () => openExpense(),
    filter(el) { filter = el.dataset.id; refresh(); },
    mine(el) { mine = el.checked; refresh(); },
    search(el) { query = el.value.trim(); document.getElementById("reqList").innerHTML = listHtml(); },
  },
};

function refresh() {
  const view = document.getElementById("view");
  view.innerHTML = render(me);
}
