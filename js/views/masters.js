// «Мастера»: мастера и стажёры. Менеджер выбирает их в заказе; здесь — контакты, загрузка и ближайшие выезды.
// Добавляет мастеров, задаёт их ставку и логин с паролем только руководитель; мастер входит и видит свои заказы.
import { esc, money, dateTime, toast, copyText, armed, pluralize } from "../core.js";
import { db, hashPassword, newSalt } from "../db.js";
import { isDirector } from "../auth.js";
import { rateOf } from "../pay.js";
import { MASTER_LEVELS } from "../config.js";
import { openDrawer, field, empty, formError, statusPill } from "../ui.js";
import { openRequest } from "./requests.js";
import { commentsHtml, commentForm, pushComment } from "../comments.js";

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

const accountOf = (m) => db.list("staff").find((s) => s.master_id === m.id);

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
  return `<div class="toolbar"><p class="lead">Менеджер назначает мастера в заказе. Мастер входит в CRM и видит только свои заказы.</p>
      ${isDirector(user) ? `<button class="btn primary" data-act="create">Добавить мастера или стажёра</button>` : ""}</div>
    <div class="cards">${list.length ? list.map(card).join("") : empty("Мастеров пока нет", "Добавьте первого мастера, чтобы назначать его на заказы.")}</div>`;
}

function detailHtml(id) {
  const m = db.find("masters", id);
  if (!m) return empty("Мастер удалён");
  const s = statsOf(m);
  return `<header class="d-head"><p class="eyebrow">${levelTitle(m)}</p><h2>${esc(m.name)}</h2>
      <div class="d-meta"><span class="num">${esc(m.phone)}</span><button class="link" data-act="copy">Скопировать телефон</button></div>
      ${isDirector(me) ? `<p class="muted small">${accountOf(m) ? `Логин: <b>${esc(accountOf(m).login)}</b>` : "Аккаунта нет — мастер не может войти"} · зарплата ${rateOf(m)}% от суммы заказа</p>` : ""}</header>
    <section class="d-sec"><div class="kpis small">
      <div class="kpi"><small>В работе</small><b class="num">${s.active.length}</b></div>
      <div class="kpi"><small>Выполнено</small><b class="num">${s.done.length}</b></div>
      <div class="kpi"><small>Выручка по его заказам</small><b class="num">${money(s.revenue)}</b></div></div></section>
    <section class="d-sec"><h3>Выезды</h3>${s.active.length ? `<div class="mini-list">${s.active.sort((a, b) => new Date(a.visit_at || 0) - new Date(b.visit_at || 0)).map((r) =>
      `<button class="mini-row" data-act="request" data-id="${r.id}"><span><b>№${r.id} · ${esc(r.client)}</b><small>${esc(r.address)}</small></span>
        <span class="r">${statusPill(r.status)}<small>${dateTime(r.visit_at)}</small></span></button>`).join("")}</div>`
      : `<p class="muted">Активных заказов нет.</p>`}</section>
    <section class="d-sec"><h3>Выполненные заказы (${s.done.length})</h3>${s.done.length ? `<div class="mini-list">${[...s.done].sort((a, b) => new Date(b.done_at || 0) - new Date(a.done_at || 0)).map((r) =>
      `<button class="mini-row" data-act="request" data-id="${r.id}"><span><b>№${r.id} · ${esc(r.client)}</b><small>${esc(r.address)}</small></span>
        <span class="r"><b class="num">${money(r.amount || 0)}</b><small>${r.done_at ? dateTime(r.done_at) : ""}</small></span></button>`).join("")}</div>` : `<p class="muted">Выполненных заказов пока нет.</p>`}</section>
    <section class="d-sec"><h3>Комментарии о мастере</h3>${commentsHtml(m.comments)}${commentForm()}</section>
    ${isDirector(me) ? `<section class="d-sec btn-row"><button class="btn" data-act="edit">Изменить</button>
      <button class="btn ghost${m.active ? " danger" : ""}" data-act="toggle">${m.active ? "Больше не работает" : "Снова работает"}</button></section>` : ""}
    ${!m.active ? `<p class="muted small">Неработающего мастера нельзя выбрать в новом заказе; история его заказов сохраняется.</p>` : ""}`;
}

function openMaster(id) {
  openDrawer(() => detailHtml(id), {
    copy: (el) => copyText(db.find("masters", id).phone, el),
    request: (el) => openRequest(el.dataset.id),
    comment(fd) { const m = db.find("masters", id); if (pushComment(m, fd.get("text"), me)) { db.patch("masters", id, { comments: m.comments }); toast("Комментарий добавлен", "ok"); } },
    edit: () => { if (isDirector(me)) openForm(db.find("masters", id)); },
    toggle(el) {
      const m = db.find("masters", id);
      if (m.active && statsOf(m).active.length && !armed(el, `У мастера ${statsOf(m).active.length} ${pluralize(statsOf(m).active.length, "заказ", "заказа", "заказов")} в работе. Всё равно?`)) return;
      db.patch("masters", id, { active: !m.active });
      if (accountOf(m)) db.patch("staff", accountOf(m).id, { active: !m.active });
      toast(m.active ? "Мастер снова доступен" : "Мастер отключён");
    },
  }, { live: true });
}

function openForm(m) {
  const acc = m && accountOf(m);
  openDrawer(() => `<header class="d-head"><h2>${m ? "Изменить" : "Новый мастер или стажёр"}</h2></header>
    <form data-form="save">
      ${field("ФИО", `<input name="name" required maxlength="80" value="${esc(m?.name || "")}" autofocus>`)}
      ${field("Телефон", `<input name="phone" required type="tel" maxlength="30" value="${esc(m?.phone || "")}" placeholder="+7 928 000-00-00">`)}
      ${field("Кто", `<select name="level">${MASTER_LEVELS.map((l) => `<option value="${l.id}"${l.id === (m?.level || "master") ? " selected" : ""}>${l.title}</option>`).join("")}</select>`)}
      ${field("Зарплата, % от суммы заказа", `<input name="rate" type="number" min="0" max="100" step="0.5" inputmode="decimal" required value="${m ? rateOf(m) : 20}">`, "Мастер увидит, сколько заработает с каждого заказа")}
      ${acc ? `<p class="note">Логин: <b>${esc(acc.login)}</b></p>` : field("Логин для входа", `<input name="login" ${m ? "" : "required"} maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="например, petrov">`, "Латинские буквы, цифры, точка, дефис или _")}
      ${field(acc ? "Новый пароль" : "Пароль", `<input name="password" type="text" autocomplete="new-password" autocapitalize="none" spellcheck="false" ${acc ? 'placeholder="Оставьте пустым, чтобы не менять"' : m ? "" : "required"}>`, "Не короче 8 символов. Передайте его мастеру лично.")}
      <div class="form-actions"><button class="btn primary" type="submit">${m ? "Сохранить" : "Добавить"}</button></div>
    </form>`, {
    save(fd, form) {
      const values = { name: String(fd.get("name")).trim(), phone: String(fd.get("phone")).trim(), level: fd.get("level"), rate: Math.min(100, Math.max(0, Number(fd.get("rate")) || 0)) };
      if (!values.name || !values.phone) return formError(form, "Впишите ФИО и телефон");
      const login = String(fd.get("login") || "").trim().toLowerCase(), password = String(fd.get("password") || "");
      const wantsAccount = !acc && (login || password);
      if (wantsAccount || (acc && password)) {
        if (password.length < 8) return formError(form, "Пароль — не короче 8 символов");
        if (!acc) {
          if (!/^[a-z0-9._-]{3,32}$/.test(login)) return formError(form, "Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или _");
          if (db.list("staff").some((x) => x.login === login)) return formError(form, "Такой логин уже занят");
        }
      }
      const saved = m ? (db.patch("masters", m.id, values), m) : db.insert("masters", { ...values, active: true });
      const position = values.level === "trainee" ? "trainee" : "master";
      if (acc) {
        const changes = { name: values.name, position };
        if (password) { changes.salt = newSalt(); changes.password_hash = hashPassword(password, changes.salt); }
        db.patch("staff", acc.id, changes);
      } else if (wantsAccount) {
        const salt = newSalt();
        db.insert("staff", { login, name: values.name, position, role: "master", master_id: saved.id, salt, password_hash: hashPassword(password, salt), active: true });
      }
      toast(m ? "Сохранено" : "Мастер добавлен", "ok");
      openMaster(saved.id);
    },
  });
}

export default {
  title: () => "Мастера и стажёры",
  render,
  actions: { open: (el) => openMaster(Number(el.dataset.id)), create: () => { if (isDirector(me)) openForm(null); } },
};
