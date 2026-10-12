// Деньги по заказу: зарплата мастера — процент от суммы заказа, чистая выручка — сумма минус материалы и зарплата.
import { db } from "./db";
import { expenseTotal } from "./stock";
import type { Master, Request } from "./types";

export const DEFAULT_RATE: Record<string, number> = { master: 20, trainee: 10 }; // % от суммы заказа, если руководитель не задал свой
export const rateOf = (master?: Master | null) => Number(master?.rate ?? DEFAULT_RATE[master?.level ?? "master"] ?? DEFAULT_RATE.master);
export const payOf = (r: Request) => Math.round(((r.amount || 0) * rateOf(db.find("masters", r.master_id))) / 100);
export const materialsOf = (r: Request) => expenseTotal(r);
export const netOf = (r: Request) => (r.amount || 0) - materialsOf(r) - payOf(r);
