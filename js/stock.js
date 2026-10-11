// Склад: места хранения «линия.стеллаж.полка», остатки по местам и операции (приёмка, перемещение, списание, пересчёт,
// выдача по заказу). Каждая операция пишется в журнал движений (таблица moves).
import { LINES, RACKS, SHELVES, CATEGORIES } from "./config.js";
import { db } from "./db.js";
import { esc } from "./core.js";

/** Все 90 мест по порядку: 1.А.А, 1.А.Б, 1.А.В, 1.Б.А … 3.К.В */
export const LOCATIONS = [];
for (let line = 1; line <= LINES; line++)
  for (const rack of RACKS) for (const shelf of SHELVES) LOCATIONS.push(`${line}.${rack}.${shelf.id}`);

const ORDER = new Map(LOCATIONS.map((code, i) => [code, i]));
export const byLocation = (a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9);
export const isLocation = (code) => ORDER.has(code);

/** «1.А.Ж» → «Линия 1, стеллаж 1, жёлтая полка» */
export function describeLocation(code) {
  const [line, rack, shelf] = String(code).split(".");
  return `Линия ${line}, стеллаж ${RACKS.indexOf(rack) + 1}, ${(SHELVES.find((x) => x.id === shelf)?.title || "").toLowerCase().replace(/ая$/, "ая")} полка`;
}

export const shelfOf = (code) => SHELVES.find((x) => x.id === String(code).split(".")[2]);
/** Метка места с цветной точкой полки; extra — например, количество */
export const locChip = (code, extra = "", cls = "") => {
  const sh = shelfOf(code);
  return `<span class="loc ${cls} sh-${sh?.color || "n"}"><span class="dot"></span>${esc(code)}${extra}</span>`;
};

export const categoryTitle = (id) => CATEGORIES.find((c) => c.id === id)?.title || "Без категории";
export const product = (id) => db.find("products", id);

/** Строки остатков товара по местам, по порядку мест */
export const placesOf = (productId) => db.list("stock")
  .filter((s) => s.product_id === Number(productId) && s.qty > 0).sort((a, b) => byLocation(a.loc, b.loc));
export const qtyOf = (productId) => placesOf(productId).reduce((n, s) => n + s.qty, 0);
export const qtyAt = (productId, loc) => db.list("stock").find((s) => s.product_id === Number(productId) && s.loc === loc)?.qty || 0;
/** Что лежит на месте */
export const contentsOf = (loc) => db.list("stock").filter((s) => s.loc === loc && s.qty > 0);
export const isLow = (p) => qtyOf(p.id) <= (Number(p.min_qty) || 0);

/** Сколько нужно закупить: до двойного минимума */
export const toBuy = (p) => Math.max(0, (Number(p.min_qty) || 0) * 2 - qtyOf(p.id));

function changeQty(productId, loc, delta) {
  const rows = db.list("stock");
  let row = rows.find((s) => s.product_id === Number(productId) && s.loc === loc);
  if (!row) row = db.insertQuiet("stock", { product_id: Number(productId), loc, qty: 0 });
  row.qty = Math.round((row.qty + delta) * 1000) / 1000;
  if (row.qty <= 0) db.removeWhere("stock", (s) => s === row);
}

const round = (n) => Math.round(Number(n) * 1000) / 1000;
const fail = (text) => { throw new Error(text); };
const logMove = (move, user) => db.insertQuiet("moves", { at: new Date().toISOString(), by: user?.name || "", ...move });

/** Приёмка: товар пришёл от поставщика и лёг на место */
export function receive({ productId, loc, qty, cost, note }, user) {
  qty = round(qty);
  if (!(qty > 0)) fail("Впишите количество больше нуля");
  if (!isLocation(loc)) fail("Выберите место на складе");
  db.batch(() => {
    changeQty(productId, loc, qty);
    if (cost > 0) product(productId).cost = Number(cost);
    logMove({ kind: "in", product_id: Number(productId), to: loc, qty, note }, user);
  });
}

/** Перемещение между местами */
export function move({ productId, from, to, qty }, user) {
  qty = round(qty);
  if (!(qty > 0)) fail("Впишите количество больше нуля");
  if (!isLocation(to)) fail("Выберите, куда переложить");
  if (from === to) fail("Место «откуда» и «куда» совпадает");
  if (qty > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  db.batch(() => {
    changeQty(productId, from, -qty);
    changeQty(productId, to, qty);
    logMove({ kind: "move", product_id: Number(productId), from, to, qty }, user);
  });
}

/** Списание: брак, потеря, использовали в мастерской */
export function writeOff({ productId, from, qty, note }, user) {
  qty = round(qty);
  if (!(qty > 0)) fail("Впишите количество больше нуля");
  if (qty > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  if (!note?.trim()) fail("Напишите комментарий: куда и зачем убрали товар");
  db.batch(() => {
    changeQty(productId, from, -qty);
    logMove({ kind: "out", product_id: Number(productId), from, qty, note }, user);
  });
}

/** Пересчёт: на месте фактически столько-то; разница пишется в журнал */
export function recount({ productId, loc, qty }, user) {
  qty = round(qty);
  if (!(qty >= 0)) fail("Впишите количество");
  const delta = round(qty - qtyAt(productId, loc));
  if (!delta) return 0;
  db.batch(() => {
    changeQty(productId, loc, delta);
    logMove({ kind: "fix", product_id: Number(productId), [delta > 0 ? "to" : "from"]: loc, qty: Math.abs(delta), delta }, user);
  });
  return delta;
}

/** Хватает ли на складе материалов заказа */
export const shortages = (request) => (request.items || [])
  .map((it) => ({ ...it, have: qtyOf(it.product_id) })).filter((it) => it.have < it.qty);

/** Сколько штук товара уже выписано в расходы заказа */
export const expensedQty = (request, productId) => (request.expenses || []).filter((e) => e.product_id === Number(productId)).reduce((n, e) => n + e.qty, 0);
/** Материалы по плану менеджера, которые ещё не выписаны полностью: [{ product_id, qty (осталось), plan }] */
export const pendingItems = (request) => (request.items || [])
  .map((it) => ({ product_id: it.product_id, plan: it.qty, qty: Math.round((it.qty - expensedQty(request, it.product_id)) * 1000) / 1000 })).filter((it) => it.qty > 0);
export const expenseTotal = (request) => (request.expenses || []).reduce((n, e) => n + e.qty * (e.cost || 0), 0);
export const ACTIVE_REQUESTS = ["new", "assigned", "measure", "pricing", "in_work"];

/** Расход: складовщик выписывает материал с места в «Расходы» заказа */
export function expense({ requestId, productId, from, qty, note }, user) {
  const request = db.find("requests", requestId);
  if (!request) fail("Выберите заказ");
  if (request.status === "cancelled") fail("Заказ отменён: добавить расход нельзя");
  const p = product(productId);
  if (!p) fail("Выберите товар");
  qty = round(qty);
  if (!(qty > 0)) fail("Впишите количество больше нуля");
  if (!from) fail("Выберите место, откуда берём");
  if (qty > qtyAt(productId, from)) fail(`На месте ${from} только ${qtyAt(productId, from)}`);
  db.batch(() => {
    changeQty(productId, from, -qty);
    const at = new Date().toISOString();
    (request.expenses ||= []).push({ product_id: p.id, qty, loc: from, cost: p.cost || 0, note: String(note || "").trim(), at, by: user?.name || "" });
    logMove({ kind: "issue", product_id: p.id, from, qty, request_id: request.id, note: String(note || "").trim() }, user);
    (request.history ||= []).push({ at, by: user?.name || "", text: `Склад выписал: ${p.name}, ${qty} ${p.unit}${note?.trim() ? ` · ${note.trim()}` : ""}` });
  });
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
