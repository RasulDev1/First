// База клиентов: клиент один раз заводится по номеру телефона, заказы ссылаются на него (client_id) и копируют имя и телефон.
import { db } from "./db";
import type { Client } from "./types";

export const digits = (phone: unknown) => String(phone || "").replace(/\D/g, "");
const same = (a: unknown, b: unknown) => digits(a).slice(-10) === digits(b).slice(-10) && digits(a).length >= 10;

export const findByPhone = (phone: unknown) => db.list("clients").find((c) => same(c.phone, phone)) || null;

/** Клиент по телефону: находит существующего или заводит нового */
export function ensureClient({ name, phone }: { name: string; phone: string }) {
  return findByPhone(phone) || db.insert("clients", { name: String(name || "").trim(), phone: String(phone || "").trim(), note: "" });
}

export const ordersOf = (client: Client) => db.list("requests").filter((r) => r.client_id === client.id)
  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
