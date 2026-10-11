// «Заказы» (менеджер и руководитель): единый список по порядку с сортировками, создание и удаление заказов, мастер, выезд, статусы,
// сумма договора, расходы со склада (их добавляет только складовщик) и история изменений.
// Складовщик видит заказы в урезанном виде и только выписывает материал в «Расходы».
import { storage, esc, money, num, dateTime, dateShort, toLocalInput, toast, copyText, armed, localDay } from "../core.js";
import { STATUSES, ACTIVE_STATUSES, SERVICES, OBJECTS, SOURCES, CATEGORIES } from "../config.js";
import { db } from "../db.js";
import { isDirector, isWarehouse, currentUser } from "../auth.js";
import { openExpense } from "./warehouse.js";
import { levelTitle } from "./masters.js";
import { openDrawer, statusPill, options, field, empty, chips, formError } from "../ui.js";
import { product, expenseTotal, locChip } from "../stock.js";

let sort = { key: "updated", dir: -1 }; // по умолчанию — по последней смене статуса, свежие сверху
let sel = null;      // выбранный заказ: открыт в нижней панели
let tab = "main";    // вкладка нижней панели
let query = "";
let me = null;

const ACTIVE = ACTIVE_STATUSES;
const staffName = (id) => db.find("staff", id)?.name || "";
const masterName = (id) => db.find("masters", id)?.name || "";
export const requestTotal = (r) => r.amount || 0;

function log(r, text) {
  (r.history ||= []).push({ at: new Date().toISOString(), by: me?.name || "", text });
}

// Адрес хранится строкой «г. Город, ул. Мира, 5»: город — до первой запятой, остальное — улица и дом
const cityOf = (r) => (r.address.includes(",") ? r.address.split(",")[0].trim() : "");
const streetOf = (r) => (r.address.includes(",") ? r.address.slice(r.address.indexOf(",") + 1).trim() : r.address);
const F0 = { created: "", done: "", phone: "", city: "", street: "", status: "" };
let F = { ...F0 };
const dayOf = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function matches(r) {
  const c = dayOf(r.created_at), d = r.done_at ? dayOf(r.done_at) : null;
  if (F.created && c !== F.created) return false;
  if (F.done && d !== F.done) return false;
  if (F.phone && !r.phone.replace(/\D/g, "").includes(F.phone.replace(/\D/g, "")) && !r.phone.includes(F.phone)) return false;
  if (F.city && !cityOf(r).toLowerCase().replace(/^г\.\s*/, "").includes(F.city.toLowerCase().replace(/^г\.\s*/, ""))) return false;
  if (F.street && !streetOf(r).toLowerCase().includes(F.street.toLowerCase())) return false;
  if (F.status && r.status !== F.status) return false;
  if (!query) return true;
  const hay = `${r.id} ${r.client} ${r.phone} ${r.address} ${r.service} ${masterName(r.master_id)}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

/** Когда последний раз менялся статус: последняя запись «Статус: …» в истории, иначе дата оформления */
export function statusAt(r) {
  const h = [...(r.history || [])].reverse().find((x) => x.text.startsWith("Статус:"));
  return h?.at || r.created_at;
}

const sortValue = {
  updated: (r) => new Date(statusAt(r)).getTime(),
  id: (r) => r.id,
  created: (r) => new Date(r.created_at).getTime(),
  done: (r) => (r.done_at ? new Date(r.done_at).getTime() : null),
  phone: (r) => r.phone.replace(/\D/g, ""),
  city: (r) => cityOf(r).toLowerCase(),
  street: (r) => streetOf(r).toLowerCase(),
  status: (r) => STATUSES.findIndex((s) => s.id === r.status),
};

function sorted(list) {
  const val = sortValue[sort.key];
  return list.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // без значения — в конец
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.id - a.id;
  });
}

function rowHtml(r) {
  return `<tr class="clickable${r.id === sel ? " selected" : ""}" data-act="select" data-id="${r.id}">
    <td class="num"><b>№${r.id}</b></td>
    <td class="num nowrap">${dateShort(r.created_at)}</td>
    <td class="num nowrap">${r.done_at ? dateShort(r.done_at) : `<span class="muted">—</span>`}</td>
    <td><b class="num nowrap">${esc(r.phone)}</b><small>${esc(r.client)}</small></td>
    <td class="nowrap">${esc(cityOf(r))}</td>
    <td>${esc(streetOf(r))}</td>
    <td class="nowrap">${statusPill(r.status)}</td></tr>`;
}

function rowsHtml() {
  const list = sorted(db.list("requests").filter(matches));
  const filtered = query || Object.values(F).some(Boolean);
  if (!list.length) return `<tr><td colspan="7">${empty("Заказов нет", filtered ? "Попробуйте изменить фильтры." : "Здесь появятся заказы с сайта и те, что вы добавите сами.")}</td></tr>`;
  return list.map(rowHtml).join("");
}

const COLS = [["id", "№"], ["created", "Дата оформления"], ["done", "Дата завершения"], ["phone", "Номер клиента"], ["city", "Город"], ["street", "Улица"], ["status", "Статус заказа"]];
const flt = (label, control, cls = "") => `<label class="flt${cls}"><span>${esc(label)}</span>${control}</label>`;

function render(user) {
  me = user;
  if (sel && !db.find("requests", sel)) sel = null;
  const warehouse = isWarehouse(user);
  const th = ([key, title]) => `<th><button type="button" class="th-sort" data-act="sort" data-id="${key}">${esc(title)}${sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}</button></th>`;
  const active = query || Object.values(F).some(Boolean);
  return `<form data-form="find"><div class="filterbar">
      ${flt("Поиск", `<input type="search" name="q" placeholder="Заказ №" value="${esc(query)}">`)}
      ${flt("Дата оформления", `<input type="date" name="created" value="${F.created}">`)}
      ${flt("Дата завершения", `<input type="date" name="done" value="${F.done}">`)}
      ${flt("Номер клиента", `<input type="search" name="phone" value="${esc(F.phone)}" placeholder="+7 900…">`)}
      ${flt("Город", `<input type="search" name="city" value="${esc(F.city)}" placeholder="Город" list="cityList">
        <datalist id="cityList">${[...new Set(db.list("requests").map(cityOf).filter(Boolean))].sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>`)}
      ${flt("Улица", `<input type="search" name="street" value="${esc(F.street)}" placeholder="Улица, дом">`)}
      ${flt("Статус заказа", `<select name="status">${options(STATUSES, F.status, { empty: "Все статусы" })}</select>`)}
      <button class="btn" type="submit">Найти</button>
      <button class="btn" type="button" data-act="resetFilters"${active ? "" : " disabled"}>Сбросить</button>
      ${warehouse ? "" : `<button class="btn primary" type="button" data-act="create">Создать заказ</button>`}
    </div>
    <div class="table-wrap"><table class="tbl req-tbl"><thead>
      <tr>${COLS.map(th).join("")}</tr>
    </thead><tbody id="reqList">${rowsHtml()}</tbody></table></div></form>
    ${sheetHtml()}`;
}

/* ---------- Нижняя панель выбранного заказа ---------- */
const TABS = [["main", "Основное"], ["pay", "Оплата"], ["exp", "Расходы"], ["hist", "История"]];

function sheetMain(r) {
  const master = db.find("masters", r.master_id);
  const warehouse = isWarehouse(me);
  return `<dl class="kv sheet-kv">
      <dt>Город</dt><dd>${esc(cityOf(r) || "—")}</dd>
      <dt>Улица</dt><dd>${esc(streetOf(r))}</dd>
      ${warehouse ? "" : `<dt>Клиент</dt><dd>${esc(r.client)}</dd><dt>Телефон</dt><dd class="num">${esc(r.phone)}</dd>`}
      <dt>Услуга</dt><dd>${esc(r.service)}${r.object ? ` · ${esc(r.object)}` : ""}</dd>
      <dt>Мастер</dt><dd>${master ? `${esc(master.name)} · ${esc(levelTitle(master))}` : `<span class="muted">не назначен</span>`}</dd>
      <dt>Выезд</dt><dd>${r.visit_at ? dateTime(r.visit_at) : "—"}</dd>
      ${warehouse ? "" : `<dt>Менеджер</dt><dd>${r.manager_id ? esc(staffName(r.manager_id)) : "—"}</dd>`}
      <dt>Оформлен</dt><dd>${dateTime(r.created_at)}${r.source ? ` · ${esc(r.source)}` : ""}</dd>
      ${r.done_at ? `<dt>Завершён</dt><dd>${dateTime(r.done_at)}</dd>` : ""}
      ${r.note ? `<dt>Со слов клиента</dt><dd>${esc(r.note)}</dd>` : ""}
      ${r.comment && !warehouse ? `<dt>Комментарий</dt><dd>${esc(r.comment)}</dd>` : ""}
    </dl>
    ${warehouse ? "" : `<div class="status-steps sheet-steps">${STATUSES.map((st) =>
      `<button type="button" class="chip sortbtn" data-act="sheetStatus" data-id="${st.id}" aria-pressed="${st.id === r.status}"${st.id === r.status ? " disabled" : ""}>${esc(st.title)}</button>`).join("")}</div>`}`;
}

function sheetPay(r) {
  const paid = (r.payments || []).reduce((n, p) => n + p.sum, 0);
  const cost = expenseTotal(r);
  return `<div class="sheet-cols">
    <div><dl class="kv sheet-kv">
      <dt>Сумма договора</dt><dd class="num"><b>${money(r.amount || 0)}</b></dd>
      <dt>Оплачено</dt><dd class="num">${money(paid)}</dd>
      <dt>Остаток</dt><dd class="num ${(r.amount || 0) - paid > 0 ? "bad" : ""}"><b>${money(Math.max(0, (r.amount || 0) - paid))}</b></dd>
      <dt>Материалы со склада</dt><dd class="num">${money(cost)}</dd>
      <dt>Прибыль</dt><dd class="num">${money((r.amount || 0) - cost)}</dd></dl>
      <form class="inline-form" data-form="sheetAmount"><input name="amount" type="number" min="0" step="100" inputmode="numeric" value="${r.amount || ""}" placeholder="Сумма договора" aria-label="Сумма договора, ₽"><button class="btn" type="submit">Сохранить сумму</button></form></div>
    <div>${(r.payments || []).length ? `<ol class="history">${[...r.payments].reverse().map((p) => `<li><b class="num">${money(p.sum)}</b>${p.note ? ` · ${esc(p.note)}` : ""}<small>${dateTime(p.at)}${p.by ? ` · ${esc(p.by)}` : ""}</small></li>`).join("")}</ol>` : `<p class="muted">Оплат пока не было.</p>`}
      <form class="inline-form" data-form="sheetPay"><input name="sum" type="number" min="1" step="1" inputmode="numeric" placeholder="Сумма оплаты" aria-label="Сумма оплаты, ₽" required><input name="note" maxlength="80" placeholder="Наличные, перевод…" aria-label="Способ оплаты"><button class="btn primary" type="submit">Внести оплату</button></form></div>
  </div>`;
}

function sheetHist(r) {
  const list = [...(r.history || [])].reverse();
  return list.length ? `<ol class="history">${list.map((h) => {
    const st = h.text.startsWith("Статус:") && STATUSES.find((x) => x.title === h.text.slice(7).trim());
    return `<li>${st ? statusPill(st.id) : `<b>${esc(h.text)}</b>`}<small>${dateTime(h.at)}${h.by ? ` · ${esc(h.by)}` : ""}</small></li>`;
  }).join("")}</ol>` : `<p class="muted">Изменений нет.</p>`;
}

function sheetHtml() {
  const r = sel && db.find("requests", sel);
  if (!r) return "";
  const tabs = TABS.filter(([id]) => !(id === "pay" && isWarehouse(me)));
  if (!tabs.some(([id]) => id === tab)) tab = "main";
  const body = tab === "pay" ? sheetPay(r) : tab === "exp" ? expensesHtml(r, { button: me?.position === "storekeeper" }) : tab === "hist" ? sheetHist(r) : sheetMain(r);
  return `<div class="sheet-space" style="height:${sheetH}vh"></div><section class="sheet" style="height:${sheetH}vh" aria-label="Заказ №${r.id}">
    <div class="sheet-grip" role="separator" aria-orientation="horizontal" aria-label="Потяните, чтобы изменить высоту" tabindex="0"></div>
    <header class="sheet-head"><b>Заказ №${r.id}</b>${statusPill(r.status)}
      <nav class="sheet-tabs">${tabs.map(([id, title]) => `<button type="button" data-act="tab" data-id="${id}" aria-pressed="${id === tab}">${esc(title)}</button>`).join("")}</nav>
      <span class="sheet-tools">${isWarehouse(me) ? "" : `<button type="button" class="btn sm" data-act="open" data-id="${r.id}">Открыть карточку</button>`}
        <button type="button" class="icon-btn" data-act="closeSheet" aria-label="Закрыть">✕</button></span></header>
    <div class="sheet-body">${body}</div></section>`;
}

const selected = () => db.find("requests", sel);

// Высоту панели тянут за ручку сверху (мышь или палец); запоминаем в этом браузере
let sheetH = Math.min(90, Math.max(15, Number(storage.get("sheetH", 40)) || 40));
function setSheetH(vh) {
  sheetH = Math.round(Math.min(90, Math.max(15, vh)));
  document.querySelectorAll(".sheet, .sheet-space").forEach((el) => { el.style.height = `${sheetH}vh`; });
}
document.addEventListener("pointerdown", (e) => {
  const grip = e.target.closest?.(".sheet-grip");
  if (!grip) return;
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  const moveTo = (ev) => setSheetH(((innerHeight - ev.clientY) / innerHeight) * 100);
  const stop = () => { grip.removeEventListener("pointermove", moveTo); storage.set("sheetH", sheetH); };
  grip.addEventListener("pointermove", moveTo);
  grip.addEventListener("pointerup", stop, { once: true });
  grip.addEventListener("pointercancel", stop, { once: true });
});
document.addEventListener("keydown", (e) => {
  if (!e.target.closest?.(".sheet-grip") || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
  e.preventDefault();
  setSheetH(sheetH + (e.key === "ArrowUp" ? 5 : -5));
  storage.set("sheetH", sheetH);
});

function setStatus(r, next, el) {
  if (next === "cancelled" && !armed(el, "Точно отменить?")) return false;
  if (!["new", "cancelled"].includes(next) && !r.master_id) { toast("Сначала выберите мастера", "bad"); return false; }
  r.status = next;
  r.done_at = next === "done" ? new Date().toISOString() : null;
  if (!r.manager_id) r.manager_id = me.id;
  log(r, `Статус: ${STATUSES.find((s) => s.id === next).title}`);
  return true;
}

/* ---------- Карточка заказа ---------- */
function masterLoad(masterId, visitAt, selfId) {
  if (!masterId || !visitAt) return "";
  const day = localDay(new Date(visitAt));
  const same = db.list("requests").filter((r) => r.id !== selfId && r.master_id === Number(masterId) && ACTIVE.includes(r.status)
    && r.visit_at && localDay(new Date(r.visit_at)) === day);
  return same.length ? `<p class="note warn">У мастера в этот день ещё ${same.length} ${same.length === 1 ? "выезд" : "выезда"}: ${same.map((r) =>
    `№${r.id} в ${new Date(r.visit_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`).join(", ")}</p>` : "";
}

/** «Расходы»: материалы, выписанные со склада под заказ, по себестоимости */
function expensesHtml(r, { button = false } = {}) {
  const list = r.expenses || [];
  const open = r.status !== "cancelled"; // добавить расход можно и в завершённый заказ: вдруг забыли
  return `${list.length ? `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Материал</th><th>Место</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th><th>Когда</th></tr></thead>
    <tbody>${list.map((e) => { const p = product(e.product_id); return `<tr><td>${esc(p?.name || "Удалённый товар")}${e.note ? `<small class="note-line">${esc(e.note)}</small>` : ""}${e.by ? `<small>${esc(e.by)}</small>` : ""}</td><td>${e.loc ? locChip(e.loc) : ""}</td>
      <td class="r num">${num(e.qty)} ${esc(p?.unit || "")}</td><td class="r num">${money(e.cost)}</td><td class="r num">${money(e.qty * e.cost)}</td><td class="num nowrap">${dateTime(e.at)}</td></tr>`; }).join("")}</tbody>
    <tfoot><tr><td colspan="4">Итого расходы</td><td class="r num"><b>${money(expenseTotal(r))}</b></td><td></td></tr></tfoot></table></div>` : `<p class="muted">Со склада пока ничего не выписано.</p>`}
    ${button && open ? `<button class="btn primary" data-act="expense">Добавить расход</button>` : ""}`;
}

/** Складовщик видит заказ без цен и контактов: адрес, мастера и расходы */
function warehouseDetailHtml(r) {
  const master = db.find("masters", r.master_id);
  return `<header class="d-head"><p class="eyebrow">Заказ №${r.id} · ${dateTime(r.created_at)}</p><h2>${esc(r.client)}</h2>
      <div class="d-meta">${statusPill(r.status)}</div></header>
    <section class="d-sec"><dl class="kv">
      <dt>Адрес</dt><dd>${esc(r.address)}</dd><dt>Услуга</dt><dd>${esc(r.service)}</dd>
      <dt>Мастер</dt><dd>${master ? `${esc(master.name)} · ${esc(levelTitle(master))}` : "Не назначен"}</dd>
      ${r.visit_at ? `<dt>Выезд</dt><dd>${dateTime(r.visit_at)}</dd>` : ""}</dl></section>
    <section class="d-sec"><h3>Расходы</h3>${expensesHtml(r, { button: me?.position === "storekeeper" })}</section>`;
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
      <p><b>Заказ создан.</b> Возьмите его, позвоните клиенту и назначьте мастера.</p>
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
      <div class="status-steps">${STATUSES.filter((s) => s.id !== "cancelled").map((s) =>
        `<button class="chip sortbtn" data-act="status" data-id="${s.id}" aria-pressed="${s.id === r.status}"${s.id === r.status ? " disabled" : ""}>${esc(s.title)}</button>`).join("")}</div>
      <div class="btn-row">
        ${r.status === "cancelled" ? `<button class="btn" data-act="status" data-id="${r.master_id ? "in_work" : "new"}">Вернуть в работу</button>` : `<button class="btn ghost danger" data-act="status" data-id="cancelled">Отменить заказ</button>`}
        <button class="btn ghost danger" data-act="remove">Удалить заказ</button>
      </div>
    </section>

    <section class="d-sec"><h3>Сумма договора</h3>
      <form class="inline-form" data-form="amount">
        <input name="amount" type="number" min="0" step="100" inputmode="numeric" value="${r.amount || ""}" placeholder="0" aria-label="Сумма договора, ₽">
        <span class="muted">₽</span><button class="btn" type="submit">Сохранить</button></form>
      <p class="muted small">Работы и оборудование для клиента. По выполненным заказам сумма идёт в выручку в «Аналитике».</p>
    </section>

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
    if (r.status === "new") { r.status = "assigned"; log(r, "Статус: Назначен Мастер"); }
    save("Мастер и дата сохранены");
  },
  status(el) {
    const next = el.dataset.id;
    if (!setStatus(current(), next, el)) return;
    save(next === "done" ? "Заказ завершён" : "Статус изменён");
  },
  remove(el) {
    if (!armed(el, "Точно удалить?")) return;
    const r = current();
    db.remove("requests", r.id);
    document.getElementById("drawerClose").click();
    toast(`Заказ №${r.id} удалён`);
  },
  amount(fd) {
    const r = current(), amount = Math.max(0, Math.round(Number(fd.get("amount")) || 0));
    if (amount === (r.amount || 0)) return;
    r.amount = amount;
    log(r, `Сумма договора: ${money(amount)}`);
    save("Сумма сохранена");
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
        toast(`Заказ №${created.id} создан`, "ok");
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
    select(el) { const id = Number(el.dataset.id); sel = sel === id ? null : id; refresh(); },
    closeSheet() { sel = null; refresh(); },
    tab(el) { tab = el.dataset.id; refresh(); },
    sheetStatus(el) { const next = el.dataset.id; if (setStatus(selected(), next, el)) save(next === "done" ? "Заказ завершён" : "Статус изменён"); },
    sheetAmount(fd) {
      const r = selected(), amount = Math.max(0, Math.round(Number(fd.get("amount")) || 0));
      if (amount === (r.amount || 0)) return;
      r.amount = amount; log(r, `Сумма договора: ${money(amount)}`); save("Сумма сохранена");
    },
    sheetPay(fd, form) {
      const r = selected(), sum = Math.round(Number(fd.get("sum")) || 0);
      if (!(sum > 0)) return formError(form, "Впишите сумму");
      const note = String(fd.get("note") || "").trim();
      (r.payments ||= []).push({ sum, note, at: new Date().toISOString(), by: me.name });
      log(r, `Оплата: ${money(sum)}${note ? ` (${note})` : ""}`);
      save("Оплата внесена");
    },
    expense: () => openExpense({ requestId: sel }),
    create: () => openForm(null),
    sort(el) {
      const key = el.dataset.id;
      sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === "created" || key === "done" ? -1 : 1 };
      refresh();
    },
    find(fd) {
      query = String(fd.get("q") || "").trim();
      for (const k of Object.keys(F0)) F[k] = String(fd.get(k) || "").trim();
      refresh();
    },
    resetFilters() { F = { ...F0 }; query = ""; refresh(); },
  },
};

function refresh() {
  const view = document.getElementById("view");
  view.innerHTML = render(me);
}
