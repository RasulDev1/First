// Вход сотрудников по логину и паролю и права ролей.
// Руководитель видит всё, распределяет роли и даёт задания менеджерам. Менеджер — заказы, клиенты, свои задачи и статистика.
// Закупщик и складовщик — склад. Мастер — свои заказы.
import { ROLES, POSITIONS } from "./config";
import { storage } from "./core";
import { db, hashPassword } from "./db";
import type { Staff } from "./types";

const SESSION_KEY = "session";

export function login(loginName: string, password: string): Staff {
  const name = String(loginName || "").trim().toLowerCase();
  const user = db.list("staff").find((s) => s.login === name);
  if (!user || user.password_hash !== hashPassword(password, user.salt)) throw new Error("Неверный логин или пароль");
  if (!user.active) throw new Error("Аккаунт отключён. Обратитесь к руководителю.");
  storage.set(SESSION_KEY, { id: user.id, at: Date.now() });
  return user;
}

export function logout() { storage.remove(SESSION_KEY); }

/** Текущий сотрудник; если его отключили или удалили — выходим */
export function currentUser(): Staff | null {
  const session = storage.get<{ id: number } | null>(SESSION_KEY, null);
  const user = session && db.find("staff", session.id);
  return user?.active ? user : null;
}

export const positionTitle = (user?: Staff | null) =>
  POSITIONS.find((p) => p.id === user?.position)?.title || (user ? ROLES[user.role]?.title : "") || "";
export const can = (user: Staff | null, section: string) => Boolean(user && ROLES[user.role]?.sections.includes(section));
export const isDirector = (user?: Staff | null) => user?.role === "director";
export const isManager = (user?: Staff | null) => user?.role === "manager";
export const isWarehouse = (user?: Staff | null) => user?.role === "warehouse";
export const isMaster = (user?: Staff | null) => user?.role === "master";
