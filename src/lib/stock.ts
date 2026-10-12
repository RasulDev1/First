// Склад: места хранения «линия-стеллаж-полка», остатки по местам и операции (приёмка, перемещение, списание, пересчёт,
// выдача по заказу). Каждая операция пишется в журнал движений (таблица moves).
import { LINES, RACKS, SHELVES, CATEGORIES, ACTIVE_STATUSES } from "./config";
import { db } from "./db";
import type { Move, Product, Request, Staff, StockRow } from "./types";

type User = Pick<Staff, "name"> | null | undefined;

/** Все 54 места по порядку: А-1-1, А-1-2, А-1-3, А-2-1 … В-6-3 */
export const LOCATIONS: string[] = [];
for (const line of LINES)
  for (let rack = 1; rack <= RACKS; rack++) for (let shelf = 1; shelf <= SHELVES; shelf++) LOCATIONS.push(`${line}-${rack}-${shelf}`);

const ORDER = new Map(LOCATIONS.map((code, i) => [code, i]));
export const byLocation = (a: string, b: string) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9);
export const isLocation = (code: string) => ORDER.has(code);

/** «А-1-2» → «Линия А, стеллаж 1, полка 2» */
export function describeLocation(code: string) {
  const [line, rack, shelf] = String(code).split("-");
  return `Линия ${line}, стеллаж ${rack}, полка ${shelf}`;
}

export const categoryTitle = (id: string) => CATEGORIES.find((c) => c.id === id)?.title || "Без категории";
export const product = (id: unknown) => db.find("products", id);

/** Строки остатков товара по местам, по порядку мест */
export const placesOf = (productId: unknown) => db.list("stock")
  .filter((s) => s.product_id === Number(productId) && s.qty > 0).sort((a, b) => byLocation(a.loc, b.loc));
export const qtyOf = (productId: unknown) => placesOf(productId).reduce((n, s) => n + s.qty, 0);
export const qtyAt = (productId: unknown, loc: string) =>
  db.list("stock").find((s) => s.product_id === Number(productId) && s.loc === loc)?.qty || 0;
/** Что лежит на месте */
export const contentsOf = (loc: string) => db.list("stock").filter((s) => s.loc === loc && s.qty > 0);
export const isLow = (p: Product) => qtyOf(p.id) <= (Number(p.min_qty) || 0);

/** Сколько нужно закупить: до двойного минимума */
export const toBuy = (p: Product) => Math.max(0, (Number(p.min_qty) || 0) * 2 - qtyOf(p.id));

function changeQty(productId: unknown, loc: string, delta: number) {
  const rows = db.list("stock");
  let row: StockRow | undefined = rows.find((s) => s.product_id === Number(productId) && s.loc === loc);
  if (!row) row = db.insertQuiet("stock", { product_id: Number(productId), loc, qty: 0 }) as StockRow;
  row.qty = Math.round((row.qty + delta) * 1000) / 1000;
  if (row.qty <= 0) db.removeWhere("stock", (s) => s === row);
}

const round = (n: unknown) => Math.round(Number(n) * 1000) / 1000;
const fail = (text: string): never => { throw new Error(text); };
const logMove = (move: Omit<Move, "id" | "at" | "by">, user: User) =>
  db.insertQuiet("moves", { at: new Date().toISOString(), by: user?.name || "", ...move } as Omit<Move, "id">);

/** Приёмка: товар пришёл от поставщика и лёг на место */
export function receive({ productId, loc, qty, cost, note }: { productId: unknown; loc: string; qty: unknown; cost?: unknown; note?: string }, user: User) {
  const q = round(qty);
  if (!(q > 0)) fail("Впишите количество больше нуля");
  if (!isLocation(loc)) fail("Выберите место на складе");
  db.batch(() => {
    changeQty(productId, loc, q);
    const p = product(productId);
    if (p && Number(cost) > 0) p.cost = Number(cost);
    logMove({ kind: "in", product_id: Number(productId), to: loc, qty: q, cost: p?.cost || 0, note }, user);
  });
}

/** Перемещение между местами */
export function move({ productId, from, to, qty }: { productId: unknown; from: string; to: string; qty: unknown }, user: User) {
  const q = round(qty);
  if (!(q > 0)) fail("Впишите количество больше нуля");
  if (!isLocation(to)) fail("Выберите, куда переложить");
  if (from === to) fail("Место «откуда» и «куда» совпадает");
  if (q > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  db.batch(() => {
    changeQty(productId, from, -q);
    changeQty(productId, to, q);
    logMove({ kind: "move", product_id: Number(productId), from, to, qty: q }, user);
  });
}

/** Списание: брак, потеря, использовали в мастерской */
export function writeOff({ productId, from, qty, note }: { productId: unknown; from: string; qty: unknown; note?: string }, user: User) {
  const q = round(qty);
  if (!(q > 0)) fail("Впишите количество больше нуля");
  if (q > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  if (!note?.trim()) fail("Напишите комментарий: куда и зачем убрали товар");
  db.batch(() => {
    changeQty(productId, from, -q);
    logMove({ kind: "out", product_id: Number(productId), from, qty: q, note }, user);
  });
}

/** Пересчёт: на месте фактически столько-то; разница пишется в журнал */
export function recount({ productId, loc, qty }: { productId: unknown; loc: string; qty: unknown }, user: User) {
  const q = round(qty);
  if (!(q >= 0)) fail("Впишите количество");
  const delta = round(q - qtyAt(productId, loc));
  if (!delta) return 0;
  db.batch(() => {
    changeQty(productId, loc, delta);
    logMove({ kind: "fix", product_id: Number(productId), [delta > 0 ? "to" : "from"]: loc, qty: Math.abs(delta), delta }, user);
  });
  return delta;
}

/** Сколько штук товара уже выписано в расходы заказа */
export const expensedQty = (request: Request, productId: unknown) =>
  (request.expenses || []).filter((e) => e.product_id === Number(productId)).reduce((n, e) => n + e.qty, 0);
export const expenseTotal = (request: Request) => (request.expenses || []).reduce((n, e) => n + e.qty * (e.cost || 0), 0);
export const ACTIVE_REQUESTS = ACTIVE_STATUSES;

/** Расход: складовщик выписывает материал с места в «Расходы» заказа */
export function expense({ requestId, productId, from, qty, note }: { requestId: unknown; productId: unknown; from: string; qty: unknown; note?: string }, user: User) {
  const request = db.find("requests", requestId) ?? fail("Выберите заказ");
  if (request.status === "cancelled") fail("Заказ отменён: добавить расход нельзя");
  const p = product(productId) ?? fail("Выберите товар");
  const q = round(qty);
  if (!(q > 0)) fail("Впишите количество больше нуля");
  if (!from) fail("Выберите место, откуда берём");
  if (q > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  const clean = String(note || "").trim();
  db.batch(() => {
    changeQty(productId, from, -q);
    const at = new Date().toISOString();
    (request.expenses ||= []).push({ product_id: p.id, qty: q, loc: from, cost: p.cost || 0, note: clean, at, by: user?.name || "" });
    logMove({ kind: "issue", product_id: p.id, from, qty: q, request_id: request.id, note: clean }, user);
    (request.history ||= []).push({ at, by: user?.name || "", text: `Склад выписал: ${p.name}, ${q} ${p.unit}${clean ? ` · ${clean}` : ""}` });
  });
}

/** Закупки за период: что принято на склад (движения «Приёмка»), сколько штук и на какую сумму по закупочной цене */
export function purchases(since = 0) {
  const rows = new Map<number, { product_id: number; qty: number; sum: number; last: string }>();
  for (const m of db.list("moves")) {
    if (m.kind !== "in" || Date.parse(m.at) < since) continue;
    const row = rows.get(m.product_id) ?? { product_id: m.product_id, qty: 0, sum: 0, last: m.at };
    row.qty += m.qty;
    row.sum += m.qty * (m.cost ?? product(m.product_id)?.cost ?? 0);
    if (m.at > row.last) row.last = m.at;
    rows.set(m.product_id, row);
  }
  const list = [...rows.values()].sort((a, b) => b.sum - a.sum);
  return { list, qty: list.reduce((n, r) => n + r.qty, 0), sum: list.reduce((n, r) => n + r.sum, 0) };
}

/** Стоимость склада по закупочным и по продажным ценам */
export function stockValue() {
  let cost = 0, price = 0;
  for (const s of db.list("stock")) {
    const p = product(s.product_id);
    if (!p) continue;
    cost += s.qty * (p.cost || 0);
    price += s.qty * (p.price || 0);
  }
  return { cost, price };
}
