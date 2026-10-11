// «Клиенты» (руководитель и менеджер): база клиентов с поиском по имени и телефону, карточка клиента с историей заказов.
import { esc, money, num, dateShort, toast } from "../core.js";
import { db } from "../db.js";
import { digits, ordersOf, findByPhone } from "../clients.js";
import { openDrawer, field, empty, statusPill, formError } from "../ui.js";
import { openRequest, openNewOrder } from "./requests.js";

let me = null;
let CF = { name: "", phone: "" }; // применяются кнопкой «Найти»
const done = (c) => ordersOf(c).filter((r) => r.status === "done");

function matches(c) {
  if (CF.name && !c.name.toLowerCase().includes(CF.name.toLowerCase())) return false;
  if (CF.phone && !digits(c.phone).includes(digits(CF.phone)) && !c.phone.includes(CF.phone)) return false;
  return true;
}

function rowsHtml() {
  const list = db.list("clients").filter(matches).sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return `<tr><td colspan="5">${empty("Клиентов нет", CF.name || CF.phone ? "Попробуйте изменить поиск." : "Клиенты появляются вместе с заказами.")}</td></tr>`;
  return list.map((c) => {
    const orders = ordersOf(c);
    return `<tr class="clickable" data-act="open" data-id="${c.id}" tabindex="0"><td><b>${esc(c.name)}</b></td><td class="num nowrap">${esc(c.phone)}</td>
      <td class="r num">${orders.length}</td><td class="r num">${money(done(c).reduce((n, r) => n + (r.amount || 0), 0))}</td>
      <td class="num nowrap">${orders[0] ? dateShort(orders[0].created_at) : "—"}</td></tr>`;
  }).join("");
}

function render(user) {
  me = user;
  const active = CF.name || CF.phone;
  return `<form data-form="find" class="filterbar cl">
      <label class="flt"><span>Имя</span><input type="search" name="name" value="${esc(CF.name)}" placeholder="Имя или название"></label>
      <label class="flt"><span>Номер телефона</span><input type="search" name="phone" value="${esc(CF.phone)}" placeholder="+7 900…"></label>
      <button class="btn" type="submit">Найти</button>
      <button class="btn" type="button" data-act="reset"${active ? "" : " disabled"}>Сброс</button>
      <button class="btn primary" type="button" data-act="create">Новый клиент</button>
    </form>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Клиент</th><th>Телефон</th><th class="r">Заказов</th><th class="r">Сумма завершённых</th><th>Последний заказ</th></tr></thead>
    <tbody id="clientRows">${rowsHtml()}</tbody></table></div>`;
}

function detailHtml(id) {
  const c = db.find("clients", id);
  if (!c) return empty("Клиент удалён");
  const orders = ordersOf(c);
  return `<header class="d-head"><p class="eyebrow">Клиент · с ${dateShort(c.created_at)}</p><h2>${esc(c.name)}</h2>
      <div class="d-meta"><span class="num">${esc(c.phone)}</span></div></header>
    <section class="d-sec"><div class="kpis small">
      <div class="kpi"><small>Заказов</small><b class="num">${num(orders.length)}</b></div>
      <div class="kpi"><small>Завершено на сумму</small><b class="num">${money(done(c).reduce((n, r) => n + (r.amount || 0), 0))}</b></div></div>
      <div class="btn-row"><button class="btn primary" data-act="newOrder">Новый заказ</button><button class="btn" data-act="edit">Изменить данные</button></div>
      ${c.note ? `<p class="prose">${esc(c.note)}</p>` : ""}</section>
    <section class="d-sec"><h3>История заказов</h3>${orders.length ? `<div class="mini-list">${orders.map((r) => `<button class="mini-row" data-act="order" data-id="${r.id}">
      <span><b>№${r.id} · ${esc(r.service)}</b><small>${esc(r.address)} · ${dateShort(r.created_at)}</small></span>
      <span class="r">${statusPill(r.status)}<small>${r.amount ? money(r.amount) : ""}</small></span></button>`).join("")}</div>` : `<p class="muted">Заказов пока нет.</p>`}</section>`;
}

function openForm(c) {
  openDrawer(() => `<header class="d-head"><h2>${c ? "Данные клиента" : "Новый клиент"}</h2></header>
    <form data-form="save">
      ${field("Имя или название", `<input name="name" required maxlength="120" value="${esc(c?.name || "")}" autofocus>`)}
      ${field("Телефон", `<input name="phone" required type="tel" maxlength="30" value="${esc(c?.phone || "")}" placeholder="+7 928 000-00-00">`)}
      ${field("Заметка", `<textarea name="note" rows="3" maxlength="1000" placeholder="Как удобно связываться, особенности объекта">${esc(c?.note || "")}</textarea>`)}
      <div class="form-actions"><button class="btn primary" type="submit">${c ? "Сохранить" : "Добавить"}</button></div>
    </form>`, {
    save(fd, form) {
      const values = { name: String(fd.get("name")).trim(), phone: String(fd.get("phone")).trim(), note: String(fd.get("note") || "").trim() };
      if (!values.name || digits(values.phone).length < 10) return formError(form, "Впишите имя и телефон, не меньше 10 цифр");
      const twin = findByPhone(values.phone);
      if (twin && twin.id !== c?.id) return formError(form, `Клиент с таким телефоном уже есть: ${twin.name}`);
      if (c) {
        db.batch(() => { Object.assign(c, values); db.list("requests").filter((r) => r.client_id === c.id).forEach((r) => { r.client = values.name; r.phone = values.phone; }); });
        toast("Сохранено", "ok"); openClient(c.id);
      } else { const created = db.insert("clients", values); toast("Клиент добавлен", "ok"); openClient(created.id); }
    },
  });
}

function openClient(id) {
  openDrawer(() => detailHtml(id), {
    edit: () => openForm(db.find("clients", id)),
    newOrder: () => openNewOrder(db.find("clients", id)),
    order: (el) => openRequest(el.dataset.id),
  }, { live: true });
}

export default {
  title: () => "Клиенты",
  render,
  actions: {
    open: (el) => openClient(Number(el.dataset.id)),
    create: () => openForm(null),
    find(fd) { CF = { name: String(fd.get("name") || "").trim(), phone: String(fd.get("phone") || "").trim() }; document.getElementById("view").innerHTML = render(me); },
    reset() { CF = { name: "", phone: "" }; document.getElementById("view").innerHTML = render(me); },
  },
};
