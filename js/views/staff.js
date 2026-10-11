// «Сотрудники» (только руководитель): аккаунты, должности и роли. Пароль хранится только в виде хеша — его можно задать заново.
import { esc, dateShort, toast, copyText, armed } from "../core.js";
import { POSITIONS, ROLES } from "../config.js";
import { db, hashPassword, newSalt } from "../db.js";
import { positionTitle } from "../auth.js";
import { openDrawer, closeDrawer, field, options, formError } from "../ui.js";

let me = null;
const ACCESS = {
  director: "Все разделы. Распределяет роли и ставит задачи менеджерам.",
  manager: "Заказы (мастера выбирает в самом заказе), свои задачи и «Моя статистика»: свои заказы, их сумма и премия. Общей аналитики у менеджера нет.",
  master: "Только «Мои заказы»: статус своих заказов и сколько мастер заработает в этом месяце. Аккаунты мастеров создаёт руководитель в разделе «Мастера».",
  warehouse: "Склад: остатки, приём, расход, перемещение, списание и закупка. В заказах только выписывает материал в «Расходы».",
};
const SECTION_NAMES = { home: "Главная", requests: "Заказы", masters: "Мастера", tasks: "Задачи", warehouse: "Склад", analytics: "Аналитика", staff: "Сотрудники", myorders: "Мои заказы", mystats: "Моя статистика" };
const loginLink = () => location.href.split(/[?#]/)[0];
const activeDirectors = () => db.list("staff").filter((s) => s.active && s.role === "director");

function render(user) {
  me = user;
  const list = db.list("staff").filter((s) => s.role !== "master").sort((a, b) => b.active - a.active || POSITIONS.findIndex((p) => p.id === a.position) - POSITIONS.findIndex((p) => p.id === b.position));
  return `<div class="toolbar"><p class="lead">Сотрудник входит по ссылке своим логином и паролем и видит только разделы своей роли.</p>
      <button class="btn primary" data-act="create">Добавить сотрудника</button></div>
    <div class="link-box"><span class="num">${esc(loginLink())}</span><button class="btn sm" data-act="copyLink">Скопировать ссылку для входа</button></div>
    <div class="roles">${Object.entries(ROLES).map(([id, r]) => `<div class="role-card"><b>${id === "warehouse" ? "Закупщик и складовщик" : id === "master" ? "Мастер и стажёр" : esc(r.title)}</b>
      <p>${ACCESS[id]}</p><small>${r.sections.map((s) => SECTION_NAMES[s]).join(" · ")}</small></div>`).join("")}</div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Сотрудник</th><th>Должность</th><th>Логин</th><th>С нами с</th><th></th></tr></thead>
    <tbody>${list.map((s) => `<tr class="clickable${s.active ? "" : " off"}" data-act="open" data-id="${s.id}" tabindex="0">
      <td><b>${esc(s.name)}${s.id === user.id ? " (вы)" : ""}</b></td><td>${esc(positionTitle(s))}</td><td class="num">${esc(s.login)}</td>
      <td class="num">${dateShort(s.created_at)}</td><td class="r">${s.active ? "" : `<span class="pill st-cancelled">Отключён</span>`}</td></tr>`).join("")}</tbody></table></div>`;
}

function formHtml(s) {
  const self = s?.id === me.id;
  return `<header class="d-head"><p class="eyebrow">${s ? `Логин ${esc(s.login)}` : "Новый аккаунт"}</p><h2>${s ? esc(s.name) : "Новый сотрудник"}</h2></header>
    <form data-form="save">
      ${field("ФИО", `<input name="name" required maxlength="80" value="${esc(s?.name || "")}" placeholder="Фамилия Имя Отчество" autofocus>`)}
      ${field("Должность", `<select name="position"${self ? " disabled" : ""}>${options(POSITIONS.filter((p) => p.role !== "master"), s?.position || "manager")}</select>`,
        self ? "Свою роль руководитель поменять не может — так CRM не останется без руководителя." : "От должности зависит, какие разделы видит сотрудник.")}
      ${s ? "" : field("Логин", `<input name="login" required maxlength="32" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="например, petrov">`, "Латинские буквы, цифры, точка, дефис или _")}
      ${field(s ? "Новый пароль" : "Пароль", `<input name="password" type="text" autocomplete="new-password" autocapitalize="none" spellcheck="false" ${s ? 'placeholder="Оставьте пустым, чтобы не менять"' : "required"}>`, "Не короче 8 символов. Передайте его сотруднику лично.")}
      <div class="form-actions"><button class="btn primary" type="submit">${s ? "Сохранить" : "Добавить"}</button>
        ${s && !self ? `<button class="btn ghost${s.active ? " danger" : ""}" type="button" data-act="toggle">${s.active ? "Отключить доступ" : "Вернуть доступ"}</button>` : ""}</div>
    </form>`;
}

function openForm(s) {
  openDrawer(() => formHtml(s), {
    save(fd, form) {
      const name = String(fd.get("name") || "").trim(), password = String(fd.get("password") || "");
      const position = s?.id === me.id ? s.position : fd.get("position");
      const role = POSITIONS.find((p) => p.id === position).role;
      if (!name) return formError(form, "Впишите ФИО");
      if ((!s || password) && password.length < 8) return formError(form, "Пароль — не короче 8 символов");
      if (s?.role === "director" && role !== "director" && activeDirectors().length < 2) return formError(form, "Это единственный руководитель — сначала назначьте другого");
      if (s) {
        const changes = { name, position, role };
        if (password) { changes.salt = newSalt(); changes.password_hash = hashPassword(password, changes.salt); }
        db.patch("staff", s.id, changes);
        toast(password ? "Сохранено, пароль изменён" : "Сохранено", "ok");
      } else {
        const login = String(fd.get("login") || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{3,32}$/.test(login)) return formError(form, "Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или _");
        if (db.list("staff").some((x) => x.login === login)) return formError(form, "Такой логин уже занят");
        const salt = newSalt();
        db.insert("staff", { login, name, position, role, salt, password_hash: hashPassword(password, salt), active: true });
        toast(`${name} может входить: логин ${login}`, "ok");
      }
      closeDrawer();
    },
    toggle(el) {
      const fresh = db.find("staff", s.id);
      if (fresh.active && fresh.role === "director" && activeDirectors().length < 2) return toast("Нельзя отключить единственного руководителя", "bad");
      if (fresh.active && !armed(el, "Точно отключить?")) return;
      db.patch("staff", s.id, { active: !fresh.active });
      toast(fresh.active ? "Доступ отключён — сотрудник больше не войдёт" : "Доступ возвращён");
      closeDrawer();
    },
  });
}

export default {
  title: () => "Сотрудники и роли",
  render,
  actions: {
    create: () => openForm(null),
    open: (el) => openForm(db.find("staff", el.dataset.id)),
    copyLink: (el) => copyText(loginLink(), el),
  },
};
