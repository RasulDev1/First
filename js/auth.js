// Вход сотрудников по логину и паролю и права ролей.
// Руководитель видит всё, распределяет роли и даёт задания менеджерам. Менеджер — заказы, мастера, свои задачи и аналитика.
// Закупщик и складовщик — склад.
import { ROLES, POSITIONS } from "./config.js";
import { storage } from "./core.js";
import { db, hashPassword } from "./db.js";

const SESSION_KEY = "session";

export function login(loginName, password) {
  const name = String(loginName || "").trim().toLowerCase();
  const user = db.list("staff").find((s) => s.login === name);
  if (!user || user.password_hash !== hashPassword(password, user.salt)) throw new Error("Неверный логин или пароль");
  if (!user.active) throw new Error("Аккаунт отключён. Обратитесь к руководителю.");
  storage.set(SESSION_KEY, { id: user.id, at: Date.now() });
  return user;
}

export function logout() { storage.remove(SESSION_KEY); }

/** Текущий сотрудник; если его отключили или удалили — выходим */
export function currentUser() {
  const session = storage.get(SESSION_KEY, null);
  const user = session && db.find("staff", session.id);
  if (!user?.active) return null;
  return user;
}

export const positionTitle = (user) => POSITIONS.find((p) => p.id === user?.position)?.title || ROLES[user?.role]?.title || "";
export const can = (user, section) => Boolean(user && ROLES[user.role]?.sections.includes(section));
export const isDirector = (user) => user?.role === "director";
export const isManager = (user) => user?.role === "manager";
export const isWarehouse = (user) => user?.role === "warehouse";
