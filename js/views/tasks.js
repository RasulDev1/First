// «Задачи»: задания менеджерам со сроком. Ставит задачи только руководитель; менеджер видит свои и отмечает выполнение.
import { esc, dateTime, toLocalInput, localDay, toast, armed } from "../core.js";
import { db } from "../db.js";
import { isDirector } from "../auth.js";
import { openDrawer, closeDrawer, field, options, empty, chips, formError } from "../ui.js";
import { ACTIVE_STATUSES } from "../config.js";
import { openRequest } from "./requests.js";
import { commentsHtml, commentForm, pushComment } from "../comments.js";

let me = null;
let who = "all"; // руководитель: all или id менеджера

const managers = () => db.list("staff").filter((s) => s.active && s.role === "manager");
const staffName = (id) => db.find("staff", id)?.name || "—";
const isLate = (t) => !t.done_at && new Date(t.due) < new Date();

function visible() {
  return db.list("tasks").filter((t) => isDirector(me) ? who === "all" || t.assignee_id === Number(who) : t.assignee_id === me.id);
}

function groups(list) {
  const today = localDay(new Date()), tomorrow = localDay(new Date(Date.now() + 864e5));
  const open = list.filter((t) => !t.done_at).sort((a, b) => new Date(a.due) - new Date(b.due));
  const out = new Map();
  const add = (title, t) => (out.get(title) || out.set(title, []).get(title)).push(t);
  for (const t of open) {
    const d = localDay(new Date(t.due));
    if (isLate(t)) add("Просрочено", t);
    else if (d === today) add("Сегодня", t);
    else if (d === tomorrow) add("Завтра", t);
    else add(new Date(t.due).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase()), t);
  }
  const done = list.filter((t) => t.done_at).sort((a, b) => new Date(b.done_at) - new Date(a.done_at)).slice(0, 20);
  if (done.length) out.set("Выполнено", done);
  return [...out];
}

function taskRow(t) {
  return `<div class="task${t.done_at ? " done" : ""}${isLate(t) ? " late" : ""}">
    <button class="check" data-act="toggle" data-id="${t.id}" aria-pressed="${Boolean(t.done_at)}" aria-label="${t.done_at ? "Вернуть в работу" : "Отметить выполненной"}"></button>
    <button class="task-main" data-act="open" data-id="${t.id}"><b>${esc(t.title)}</b>
      <small>${t.done_at ? `Выполнено ${dateTime(t.done_at)}` : `Срок: ${dateTime(t.due)}`}${isDirector(me) ? ` · ${esc(staffName(t.assignee_id))}` : ""}${t.request_id ? ` · заказ №${t.request_id}` : ""}</small></button>
  </div>`;
}

function render(user) {
  me = user;
  const list = visible();
  const director = isDirector(user);
  return `<div class="toolbar"><p class="lead">${director ? "Задания менеджерам со сроком. Менеджер видит свои задачи и отмечает выполнение." : "Задания от руководителя. Отметьте задачу, когда сделаете."}</p>
      ${director ? `<button class="btn primary" data-act="create">Поставить задачу</button>` : ""}</div>
    ${director ? chips("who", [["all", "Все менеджеры"], ...managers().map((m) => [m.id, m.name, db.list("tasks").filter((t) => t.assignee_id === m.id && !t.done_at).length])], who) : ""}
    ${list.length ? groups(list).map(([title, items]) => `<section class="task-group${title === "Просрочено" ? " late" : ""}"><h3>${esc(title)}<i>${items.length}</i></h3>${items.map(taskRow).join("")}</section>`).join("")
      : empty("Задач нет", director ? "Поставьте задачу менеджеру — он увидит её у себя." : "Когда руководитель поставит задачу, она появится здесь.")}`;
}

function toggle(id) {
  const t = db.find("tasks", id);
  if (!isDirector(me) && t.assignee_id !== me.id) return;
  db.patch("tasks", id, { done_at: t.done_at ? null : new Date().toISOString() });
  toast(t.done_at ? "Задача выполнена" : "Задача снова в работе", "ok");
}

function detailHtml(id) {
  const t = db.find("tasks", id);
  if (!t) return empty("Задача удалена");
  return `<header class="d-head"><p class="eyebrow">${t.done_at ? "Выполнена" : isLate(t) ? "Просрочена" : "В работе"}</p><h2>${esc(t.title)}</h2></header>
    <section class="d-sec"><dl class="kv">
      <dt>Кому</dt><dd>${esc(staffName(t.assignee_id))}</dd>
      <dt>Срок</dt><dd>${dateTime(t.due)}</dd>
      <dt>Поставил</dt><dd>${esc(staffName(t.created_by))}, ${dateTime(t.created_at)}</dd>
      ${t.done_at ? `<dt>Выполнена</dt><dd>${dateTime(t.done_at)}</dd>` : ""}
      ${t.request_id ? `<dt>Заказ</dt><dd><button class="link" data-act="request">№${t.request_id} · ${esc(db.find("requests", t.request_id)?.client || "")}</button></dd>` : ""}
    </dl>${t.note ? `<p class="prose">${esc(t.note)}</p>` : ""}</section>
    <section class="d-sec"><h3>Комментарии</h3>${commentsHtml(t.comments)}${commentForm()}</section>
    <section class="d-sec btn-row"><button class="btn primary" data-act="toggleOne">${t.done_at ? "Вернуть в работу" : "Выполнено"}</button>
      ${isDirector(me) ? `<button class="btn" data-act="edit">Изменить</button><button class="btn ghost danger" data-act="remove">Удалить</button>` : ""}</section>`;
}

function openTask(id) {
  openDrawer(() => detailHtml(id), {
    toggleOne: () => toggle(id),
    comment(fd) { const t = db.find("tasks", id); if (pushComment(t, fd.get("text"), me)) { db.patch("tasks", id, { comments: t.comments }); toast("Комментарий добавлен", "ok"); } },
    request: () => openRequest(db.find("tasks", id).request_id),
    edit: () => openForm(db.find("tasks", id)),
    remove(el) { if (!armed(el, "Точно удалить?")) return; db.remove("tasks", id); closeDrawer(); toast("Задача удалена"); },
  }, { live: true });
}

function openForm(t) {
  const due = t?.due || new Date(new Date().setHours(18, 0, 0, 0) + (new Date().getHours() >= 17 ? 864e5 : 0)).toISOString();
  const reqs = db.list("requests").filter((r) => ACTIVE_STATUSES.includes(r.status) || r.id === t?.request_id)
    .sort((a, b) => b.id - a.id).map((r) => ({ id: r.id, title: `№${r.id} · ${r.client}` }));
  openDrawer(() => `<header class="d-head"><h2>${t ? "Изменить задачу" : "Задача менеджеру"}</h2></header>
    <form data-form="save">
      ${field("Что сделать", `<input name="title" required maxlength="200" value="${esc(t?.title || "")}" placeholder="Перезвонить клиенту по заказу №1040" autofocus>`)}
      ${field("Менеджер", `<select name="assignee" required>${options(managers().map((m) => ({ id: m.id, title: m.name })), t?.assignee_id ?? (who !== "all" ? who : ""), { empty: "Выберите менеджера" })}</select>`)}
      ${field("Срок", `<input name="due" type="datetime-local" required value="${toLocalInput(due)}">`)}
      ${field("По заказу", `<select name="request">${options(reqs, t?.request_id, { empty: "Без заказа" })}</select>`)}
      ${field("Подробности", `<textarea name="note" rows="3" maxlength="1000">${esc(t?.note || "")}</textarea>`)}
      <div class="form-actions"><button class="btn primary" type="submit">${t ? "Сохранить" : "Поставить задачу"}</button></div>
    </form>`, {
    save(fd, form) {
      const values = { title: String(fd.get("title")).trim(), assignee_id: Number(fd.get("assignee")) || null, due: fd.get("due"),
        request_id: Number(fd.get("request")) || null, note: String(fd.get("note") || "").trim() };
      if (!values.title) return formError(form, "Напишите, что сделать");
      if (!values.assignee_id) return formError(form, "Выберите менеджера");
      if (!values.due) return formError(form, "Укажите срок");
      values.due = new Date(values.due).toISOString();
      if (t) { db.patch("tasks", t.id, values); toast("Задача изменена", "ok"); openTask(t.id); }
      else { db.insert("tasks", { ...values, created_by: me.id, done_at: null }); toast(`Задача поставлена: ${staffName(values.assignee_id)}`, "ok"); closeDrawer(); }
    },
  });
}

export default {
  title: (user) => (isDirector(user) ? "Задачи менеджерам" : "Мои задачи"),
  render,
  actions: {
    open: (el) => openTask(Number(el.dataset.id)),
    toggle: (el) => toggle(Number(el.dataset.id)),
    create: () => openForm(null),
    who(el) { who = el.dataset.id; document.getElementById("view").innerHTML = render(me); },
  },
};
