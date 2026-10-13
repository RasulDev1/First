// Автосмета: из замеров сама считаются материалы (по складу) и работы (по прайсу), смета пересчитывается при любой правке замеров.
// Менеджер управляет только наценкой на материалы (не ниже 25%): цену ниже закупки плюс наценка поставить нельзя.
import { MARKUP, MIN_MARKUP, WORKS } from "./config";
import { db } from "./db";
import { surveyOf } from "./survey";
import { expenseTotal } from "./stock";
import type { EstimateLine, Product, Request } from "./types";

/** Наценка = (цена − закупка) / закупка; ниже MIN_MARKUP её опускать нельзя */
export const minMargin = () => MIN_MARKUP;
/** Наценка, которую можно сохранить: от 25% до 300% */
export const clampMarkup = (value: unknown) => Math.min(300, Math.max(MIN_MARKUP, Number(value) || MIN_MARKUP));
/** Наценка заказа; пока менеджер её не менял — наценка по умолчанию */
export const markupFor = (r: Pick<Request, "estimate">) => clampMarkup(r.estimate?.markup ?? MARKUP);

/** Маржа = прибыль / цена продажи */
export const marginOf = (price: number, cost: number) => (price > 0 ? ((price - cost) / price) * 100 : 0);
export const markupOf = (price: number, cost: number) => (cost > 0 ? ((price - cost) / cost) * 100 : 0);
/** Самая низкая цена строки при минимальной наценке: закупка × (1 + наценка) */
export const floorOf = (cost: number, m = minMargin()) => (cost > 0 ? Math.ceil(cost * (1 + m / 100) - 1e-9) : 0);

export const lineSum = (l: EstimateLine) => l.qty * l.price;
export const lineCost = (l: EstimateLine) => l.qty * (l.cost || 0);
export function totals(lines: EstimateLine[]) {
  const total = lines.reduce((n, l) => n + lineSum(l), 0), cost = lines.reduce((n, l) => n + lineCost(l), 0);
  return { total, cost, profit: total - cost, margin: marginOf(total, cost) };
}

/** Как считается смета: сумма от замеров (материалы по закупке, работы по прайсу) плюс расходы заказа — это основа,
 * на неё накидывается наценка. Цена в строках — без наценки. */
export function estimateSums(lines: EstimateLine[], expenses: number, markup = MARKUP) {
  const sum = (kind: "mat" | "work") => lines.filter((l) => l.kind === kind).reduce((n, l) => n + lineSum(l), 0);
  const mats = sum("mat"), works = sum("work"), base = mats + works + expenses;
  const extra = Math.round((base * clampMarkup(markup)) / 100);
  return { mats, works, expenses, base, extra, total: base + extra, markup: clampMarkup(markup) };
}
/** Смета заказа с его расходами и наценкой (расходы берутся актуальные, со склада) */
export const sumsOf = (r: Request) => estimateSums(r.estimate?.lines || [], expenseTotal(r), markupFor(r));
/** Цены строк с наценкой (для калькулятора): основа × (1 + наценка) */
export const withMarkup = (lines: EstimateLine[], markup = MARKUP): EstimateLine[] =>
  lines.map((l) => ({ ...l, cost: l.price, price: Math.round((l.price * (1 + markup / 100)) / 10) * 10 }));

/** Самая низкая допустимая стоимость работы для менеджера: основа плюс наценка 25%; 0 — основы ещё нет */
export function minAmount(r: Request) {
  const base = sumsOf(r).base;
  return base > 0 ? floorOf(base) : 0;
}

/* ---------- Расчёт из замера ---------- */
const ceil1 = (n: number) => Math.ceil(n - 1e-9);
const FAN: Record<number, string> = { 100: "VK-100", 125: "VK-160", 160: "VK-160", 200: "VK-200", 250: "VK-200" };
const BEND: Record<number, string> = { 100: "O90-125", 125: "O90-125", 160: "O90-160", 200: "O90-200", 250: "O90-200" };
const AC_SPLIT = (area: number) => (area <= 25 ? "SPL-09" : area <= 35 ? "SPL-12" : "SPL-18");

let seq = 0;
const nextId = () => `l${Date.now().toString(36)}${++seq}`;
export function materialLine(p: Product, qty: number): EstimateLine {
  return { id: nextId(), kind: "mat", product_id: p.id, name: p.name, unit: p.unit, qty, cost: p.cost || 0, price: p.cost || 0 };
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

/** Смета заказа считается сама из замеров; менеджер задаёт только наценку на материалы.
 * Вызывается при сохранении замеров и наценки: обновляет смету и стоимость работы. false — в замерах нет помещений и трасс. */
export function syncEstimate(r: Request, by: string, markup = markupFor(r), survey = r.survey): boolean {
  const s = survey || { rooms: [], routes: [], photos: [], note: "" };
  if (!s.rooms.length && !s.routes.length) return false;
  const lines = buildEstimate({ survey: s }, db.list("products"));
  if (!lines.length) return false;
  r.estimate = { lines, at: new Date().toISOString(), by, markup: clampMarkup(markup) };
  r.amount = estimateSums(lines, expenseTotal(r), markup).total;
  return true;
}
