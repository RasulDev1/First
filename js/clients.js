// База клиентов: клиент один раз заводится по номеру телефона, заказы ссылаются на него (client_id) и копируют имя и телефон.
import { db } from "./db.js";

export const digits = (phone) => String(phone || "").replace(/\D/g, "");
const same = (a, b) => digits(a).slice(-10) === digits(b).slice(-10) && digits(a).length >= 10;

export const findByPhone = (phone) => db.list("clients").find((c) => same(c.phone, phone)) || null;

/** Клиент по телефону: находит существующего или заводит нового */
export function ensureClient({ name, phone }) {
  return findByPhone(phone) || db.insert("clients", { name: String(name || "").trim(), phone: String(phone || "").trim(), note: "" });
}

export const ordersOf = (client) => db.list("requests").filter((r) => r.client_id === client.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
