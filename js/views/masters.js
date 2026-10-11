// «Мастера»: мастера и стажёры без аккаунтов. Менеджер выбирает их в заказе; здесь — контакты, загрузка и ближайшие выезды.
import { esc, money, dateTime, toast, copyText, armed, pluralize } from "../core.js";
import { db } from "../db.js";
import { MASTER_LEVELS } from "../config.js";
import { openDrawer, field, empty, formError, statusPill } from "../ui.js";
import { openRequest } from "./requests.js";

const ACTIVE = ["assigned", "measure", "pricing", "in_work"];
export const levelTitle = (m) => MASTER_LEVELS.find((l) => l.id === m.level)?.title || "Мастер";
let me = null;

function statsOf(m) {
  const list = db.list("requests").filter((r) => r.master_id === m.id);
  const active = list.filter((r) => ACTIVE.includes(r.status));
  const done = list.filter((r) => r.status === "done");
  return { active, done, revenue: done.reduce((n, r) => n + (r.amount || 0), 0),
    next: active.filter((r) => r.visit_at && new Date(r.visit_at) >= new Date(Date.now() - 864e5)).sort((a, b) => new Date(a.visit_at) - new Date(b.visit_at)) };
}

function card(m) {
  const s = statsOf(m);
  return `<button class="card master" data-act="open" data-id="${m.id}"${m.active ? "" : ' data-off=""'}>
    <span class="avatar" aria-hidden="true">${esc(m.name.split(" ").map((w) => w[0]).slice(0, 2).join(""))}</span>
    <span class="master-main"><b>${esc(m.name)}</b><small>${levelTitle(m)}${m.active ? "" : " · не работает"}</small><small class="num">${esc(m.phone)}</small></span>
    <span class="master-stats"><span><b class="num">${s.active.length}</b><small>в работе</small></span>
      <span><b class="num">${s.done.length}</b><small>выполнено</small></span></span>
    ${s.next[0] ? `<span class="master-next">Ближайший выезд: ${dateTime(s.next[0].visit_at)} · №${s.next[0].id}</span>` : `<span class="master-next muted">Свободен</span>`}
  </button>`;
}

function render(user) {
  me = user;
  const list = [...db.list("masters")].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  return `<div class="toolbar"><p class="lead">Мастера и стажёры не входят в CRM. Менеджер назначает мастера в заказе и сам сообщает ему адрес и время.</p>
      <button class="btn primary" data-act="create">Добавить мастера или стажёра</button></div>
    <div class="cards">${list.length ? list.map(card).join("") : empty("Мастеров пока нет", "Добавьте первого мастера, чтобы назначать его на заказы.")}</div>`;
}

function detailHtml(id) {
  const m = db.find("masters", id);
  if (!m) return empty("Мастер удалён");
  const s = statsOf(m);
  return `<header class="d-head"><p class="eyebrow">${levelTitle(m)}</p><h2>${esc(m.name)}</h2>
      <div class="d-meta"><span class="num">${esc(m.phone)}</span><button class="link" data-act="copy">Скопировать телефон</button></div></header>
    <section class="d-sec"><div class="kpis small">
      <div class="kpi"><small>В работе</small><b class="num">${s.active.length}</b></div>
      <div class="kpi"><small>Выполнено</small><b class="num">${s.done.length}</b></div>
      <div class="kpi"><small>Выручка по его заказам</small><b class="num">${money(s.revenue)}</b></div></div></section>
    <section class="d-sec"><h3>Выезды</h3>${s.active.length ? `<div class="mini-list">${s.active.sort((a, b) => new Date(a.visit_at || 0) - new Date(b.visit_at || 0)).map((r) =>
      `<button class="mini-row" data-act="request" data-id="${r.id}"><span><b>№${r.id} · ${esc(r.client)}</b><small>${esc(r.address)}</small></span>
        <span class="r">${statusPill(r.status)}<small>${dateTime(r.visit_at)}</small></span></button>`).join("")}</div>`
      : `<p class="muted">Активных заказов нет.</p>`}</section>
    <section class="d-sec btn-row"><button class="btn" data-act="edit">Изменить</button>
      <button class="btn ghost${m.active ? " danger" : ""}" data-act="toggle">${m.active ? "Больше не работает" : "Снова работает"}</button></section>
    ${!m.active ? `<p class="muted small">Неработающего мастера нельзя выбрать в новом заказе; история его заказов сохраняется.</p>` : ""}`;
}

function openMaster(id) {
  openDrawer(() => detailHtml(id), {
    copy: (el) => copyText(db.find("masters", id).phone, el),
    request: (el) => openRequest(el.dataset.id),
    edit: () => openForm(db.find("masters", id)),
    toggle(el) {
      const m = db.find("masters", id);
      if (m.active && statsOf(m).active.length && !armed(el, `У мастера ${statsOf(m).active.length} ${pluralize(statsOf(m).active.length, "заказ", "заказа", "заказов")} в работе. Всё равно?`)) return;
      db.patch("masters", id, { active: !m.active });
      toast(m.active ? "Мастер снова доступен" : "Мастер отключён");
    },
  }, { live: true });
}

function openForm(m) {
  openDrawer(() => `<header class="d-head"><h2>${m ? "Изменить" : "Новый мастер или стажёр"}</h2></header>
    <form data-form="save">
      ${field("ФИО", `<input name="name" required maxlength="80" value="${esc(m?.name || "")}" autofocus>`)}
      ${field("Телефон", `<input name="phone" required type="tel" maxlength="30" value="${esc(m?.phone || "")}" placeholder="+7 928 000-00-00">`)}
      ${field("Кто", `<select name="level">${MASTER_LEVELS.map((l) => `<option value="${l.id}"${l.id === (m?.level || "master") ? " selected" : ""}>${l.title}</option>`).join("")}</select>`)}
      <div class="form-actions"><button class="btn primary" type="submit">${m ? "Сохранить" : "Добавить"}</button></div>
    </form>`, {
    save(fd, form) {
      const values = { name: String(fd.get("name")).trim(), phone: String(fd.get("phone")).trim(), level: fd.get("level") };
      if (!values.name || !values.phone) return formError(form, "Впишите ФИО и телефон");
      if (m) { db.patch("masters", m.id, values); toast("Сохранено", "ok"); openMaster(m.id); }
      else { const created = db.insert("masters", { ...values, active: true }); toast("Мастер добавлен", "ok"); openMaster(created.id); }
    },
  });
}

export default {
  title: () => "Мастера и стажёры",
  render,
  actions: { open: (el) => openMaster(Number(el.dataset.id)), create: () => openForm(null) },
};
