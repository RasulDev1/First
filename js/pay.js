// Деньги по заказу: зарплата мастера — процент от суммы заказа, чистая выручка — сумма минус материалы и зарплата.
import { db } from "./db.js";
import { expenseTotal } from "./stock.js";

export const DEFAULT_RATE = { master: 20, trainee: 10 }; // % от суммы заказа, если руководитель не задал свой
export const rateOf = (master) => Number(master?.rate ?? DEFAULT_RATE[master?.level] ?? DEFAULT_RATE.master);
export const payOf = (r) => Math.round(((r.amount || 0) * rateOf(db.find("masters", r.master_id))) / 100);
export const materialsOf = (r) => expenseTotal(r);
export const netOf = (r) => (r.amount || 0) - materialsOf(r) - payOf(r);
