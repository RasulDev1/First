// Точка входа CRM (index.html): вход сотрудника, меню по роли и разделы.
import { $, esc, on, toast, armed } from "./core.js";
import { COMPANY, ROLES } from "./config.js";
import { db } from "./db.js";
import { login, logout, currentUser, can, positionTitle, isWarehouse } from "./auth.js";
import { initUi, setViewActions, closeDrawer, refreshDrawer, drawerOpen } from "./ui.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./seed.js";
import { isLow } from "./stock.js";
import home from "./views/home.js";
import requests from "./views/requests.js";
import masters from "./views/masters.js";
import tasks from "./views/tasks.js";
import warehouse from "./views/warehouse.js";
import analytics from "./views/analytics.js";
import staff from "./views/staff.js";
import myorders from "./views/myorders.js";

const VIEWS = { home, requests, masters, tasks, warehouse, analytics, staff, myorders };
const NAV = [
  ["home", "Главная", "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["requests", "Заказы", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["masters", "Мастера", "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  ["tasks", "Задачи", "M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M12 20h8"],
  ["warehouse", "Склад", "M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10"],
  ["analytics", "Аналитика", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ["myorders", "Мои заказы", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["staff", "Сотрудники", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6"],
];

let user = null;
let section = "home";

/* ---------- Вход ---------- */
function renderLogin() {
  $("login").hidden = false;
  $("shell").hidden = true;
  $("demoAccounts").innerHTML = DEMO_ACCOUNTS.map((a) => {
    const s = db.list("staff").find((x) => x.login === a.login);
    return s ? `<button type="button" class="demo-acc" data-login="${esc(a.login)}"><b>${esc(positionTitle(s))}</b><span>${esc(a.login)}</span></button>` : "";
  }).join("");
  $("demoPassword").textContent = DEMO_PASSWORD;
  setTimeout(() => $("loginName").focus(), 50);
}

function initLogin() {
  $("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      user = login($("loginName").value, $("loginPass").value);
      $("loginError").textContent = "";
      $("loginPass").value = "";
      toast(`Вы вошли: ${user.name}`);
      section = "home";
      start();
    } catch (error) {
      $("loginError").textContent = error.message;
      $("loginPass").value = "";
      $("loginPass").focus();
    }
  });
  $("demoAccounts").addEventListener("click", (e) => {
    const b = e.target.closest("[data-login]");
    if (!b) return;
    $("loginName").value = b.dataset.login;
    $("loginPass").value = DEMO_PASSWORD;
    $("loginForm").requestSubmit();
  });
}

/* ---------- Меню и разделы ---------- */
function badge(id) {
  if (id === "requests") return isWarehouse(user) ? 0 : db.list("requests").filter((r) => r.status === "new").length;
  if (id === "tasks") {
    const now = new Date();
    return db.list("tasks").filter((t) => !t.done_at && (user.role === "director" || t.assignee_id === user.id) && new Date(t.due) <= now).length;
  }
  if (id === "warehouse") return db.list("products").filter((p) => isLow(p)).length;
  return 0;
}

function renderNav() {
  $("nav").innerHTML = NAV.filter(([id]) => can(user, id)).map(([id, label, path]) => {
    const n = badge(id);
    return `<a class="nav-item" href="#${id}" data-section="${id}"${id === section ? ' aria-current="page"' : ""}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg><span>${label}</span>${n ? `<i class="nav-badge${id === "requests" && !isWarehouse(user) ? "" : " warn"}">${n}</i>` : ""}</a>`;
  }).join("");
  $("nav").querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  $("me").innerHTML = `<span class="me-name">${esc(user.name)}</span><span class="me-role">${esc(positionTitle(user))}</span>`;
}

function renderView() {
  const view = VIEWS[section];
  $("pageTitle").textContent = view.title(user);
  document.title = `${view.title(user)} · ${COMPANY} CRM`;
  setViewActions(view.actions);
  $("view").innerHTML = view.render(user);
  view.mounted?.(user);
}

export function go(next, { keepDrawer = false } = {}) {
  if (!can(user, next)) next = ROLES[user.role].sections[0];
  if (!keepDrawer) closeDrawer();
  section = next;
  if (location.hash.slice(1) !== next) history.replaceState(null, "", `#${next}`);
  renderNav();
  renderView();
  $("view").scrollTop = 0;
  window.scrollTo(0, 0);
}

function start() {
  $("login").hidden = true;
  $("shell").hidden = false;
  const fromHash = location.hash.slice(1);
  go(VIEWS[fromHash] && can(user, fromHash) ? fromHash : section);
}

function initShell() {
  $("nav").addEventListener("click", (e) => {
    const a = e.target.closest("[data-section]");
    if (!a) return;
    e.preventDefault();
    go(a.dataset.section);
  });
  $("logout").addEventListener("click", (e) => {
    if (!armed(e.currentTarget, "Точно выйти?")) return;
    logout();
    user = null;
    closeDrawer();
    history.replaceState(null, "", location.pathname + location.search);
    renderLogin();
  });
  $("demoReset").addEventListener("click", (e) => {
    if (!armed(e.currentTarget, "Сбросить все данные?")) return;
    db.reset();
    toast("Демо-данные восстановлены");
    if (user) { user = currentUser(); user ? go("home") : renderLogin(); } else renderLogin();
  });
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (user && VIEWS[id] && id !== section) go(id);
  });
  // Любое изменение данных (здесь или в другой вкладке) — перерисовываем меню, раздел и открытую карточку
  on("db", () => {
    if (!user) return;
    const fresh = currentUser();
    if (!fresh) { user = null; closeDrawer(); renderLogin(); toast("Ваш аккаунт отключён"); return; }
    user = fresh;
    renderNav();
    const active = document.activeElement;
    const typing = active?.closest?.("#view") && active.matches("input, textarea, select");
    if (!typing) renderView();
    if (drawerOpen()) refreshDrawer();
  });
  on("go", (e) => go(e.detail.section, { keepDrawer: e.detail.keepDrawer }));
}

initUi();
initLogin();
initShell();
if (!db.persistent) $("storageNote").hidden = false;
user = currentUser();
user ? start() : renderLogin();

