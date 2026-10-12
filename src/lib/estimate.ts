// Автосмета: из замера считаются материалы (по складу) и работы (по прайсу). Менеджер правит количество и цены,
// внизу видны итог, прибыль и процент. Ниже нижнего порога маржи менеджер цену опустить не может — порог задаёт руководитель.
import { MARKUP, MIN_MARGIN, WORKS } from "./config";
import { db } from "./db";
import { surveyOf } from "./survey";
import { expenseTotal } from "./stock";
import type { EstimateLine, Product, Request } from "./types";

export const minMargin = () => Number(db.list("settings")[0]?.min_margin ?? MIN_MARGIN);
export function setMinMargin(value: unknown) {
  const v = Math.min(90, Math.max(0, Number(value) || 0));
  const row = db.list("settings")[0];
  if (row) db.patch("settings", row.id, { min_margin: v }); else db.insert("settings", { min_margin: v });
  return v;
}

/** Маржа = прибыль / цена продажи */
export const marginOf = (price: number, cost: number) => (price > 0 ? ((price - cost) / price) * 100 : 0);
/** Самая низкая цена строки при пороге маржи: закупка / (1 − порог) */
export const floorOf = (cost: number, m = minMargin()) => (cost > 0 ? Math.ceil(cost / (1 - m / 100)) : 0);
const retail = (cost: number) => Math.round((cost * (1 + MARKUP / 100)) / 10) * 10;

export const lineSum = (l: EstimateLine) => l.qty * l.price;
export const lineCost = (l: EstimateLine) => l.qty * (l.cost || 0);
export function totals(lines: EstimateLine[]) {
  const total = lines.reduce((n, l) => n + lineSum(l), 0), cost = lines.reduce((n, l) => n + lineCost(l), 0);
  return { total, cost, profit: total - cost, margin: marginOf(total, cost) };
}

/** Самая низкая допустимая сумма договора для менеджера; 0 — основы для расчёта ещё нет */
export function minAmount(r: Request) {
  if (r.estimate?.lines?.length) return r.estimate.lines.reduce((n, l) => n + l.qty * floorOf(l.cost || 0), 0);
  const cost = expenseTotal(r);
  return cost > 0 ? floorOf(cost) : 0;
}

/* ---------- Расчёт из замера ---------- */
const ceil1 = (n: number) => Math.ceil(n - 1e-9);
const FAN: Record<number, string> = { 100: "VK-100", 125: "VK-160", 160: "VK-160", 200: "VK-200", 250: "VK-200" };
const BEND: Record<number, string> = { 100: "O90-125", 125: "O90-125", 160: "O90-160", 200: "O90-200", 250: "O90-200" };
const AC_SPLIT = (area: number) => (area <= 25 ? "SPL-09" : area <= 35 ? "SPL-12" : "SPL-18");

let seq = 0;
const nextId = () => `l${Date.now().toString(36)}${++seq}`;
export function materialLine(p: Product, qty: number): EstimateLine {
  return { id: nextId(), kind: "mat", product_id: p.id, name: p.name, unit: p.unit, qty, cost: p.cost || 0, price: retail(p.cost || 0) };
}
export function workLine(w: (typeof WORKS)[number], qty: number): EstimateLine {
  return { id: nextId(), kind: "work", work: w.id, name: w.name, unit: w.unit, qty, cost: 0, price: w.price };
}

export function buildEstimate(r: Pick<Request, "survey">, products: Product[] = db.list("products")) {
  const bySku = (sku: string) => products.find((p) => p.sku === sku);
  const s = surveyOf(r), mats = new Map<string, { p: Product; qty: number }>(), works = new Map<string, number>();
  const mat = (sku: string, qty: number) => { const p = bySku(sku); if (p && qty > 0) mats.set(sku, { p, qty: (mats.get(sku)?.qty || 0) + qty }); };
  const work = (id: string, qty: number) => { if (qty > 0) works.set(id, (works.get(id) || 0) + qty); };
  let meters = 0;
  for (const route of s.routes) {
    mat(`D-${route.diameter}`, Math.ceil(route.length * 1.05 * 10) / 10);
    mat(BEND[route.diameter], route.bends);
    mat(route.diameter >= 200 ? "M-200" : "N-160", ceil1(route.length / 3));
    mat("H-160", ceil1(route.length / 1.5));
    mat("SH-M8", ceil1(route.length / 1.5));
    mat(FAN[route.diameter], 1);
    work("duct", route.length);
    work("bend", route.bends);
    work("fan", 1);
    meters += route.length;
  }
  if (s.routes.length) { mat("LA-50", ceil1(meters / 30)); work("start", 1); }
  const vent = s.rooms.filter((room) => !room.ac);
  if (s.routes.length && vent.length) { mat("DPU-125", vent.length); work("grille", vent.length); }
  for (const room of s.rooms.filter((x) => x.ac)) {
    mat(AC_SPLIT(room.area), 1);
    mat("CU-14", 5);
    mat("DR-16", 5);
    mat("BR-50", 1);
    work("ac", 1);
    work("ac_route", 5);
  }
  if (s.rooms.length || s.routes.length) work("visit", 1);
  return [...[...mats.values()].map(({ p, qty }) => materialLine(p, qty)),
    ...WORKS.filter((w) => works.has(w.id)).map((w) => workLine(w, Math.round(works.get(w.id)! * 10) / 10))];
}

/** Шаги мастера автосметы */
export const STEPS = [["survey", "Замер"], ["mat", "Материалы"], ["work", "Работы"], ["sum", "Итог"]] as const;
