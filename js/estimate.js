// Автосмета: из замера считаются материалы (по складу) и работы (по прайсу). Менеджер правит количество и цены,
// внизу видны итог, прибыль и процент. Ниже нижнего порога маржи менеджер цену опустить не может — порог задаёт руководитель.
import { esc, money, num } from "./core.js";
import { MARKUP, MIN_MARGIN, WORKS } from "./config.js";
import { db } from "./db.js";
import { surveyOf } from "./survey.js";
import { expenseTotal } from "./stock.js";

export const minMargin = () => Number(db.list("settings")[0]?.min_margin ?? MIN_MARGIN);
export function setMinMargin(value) {
  const v = Math.min(90, Math.max(0, Number(value) || 0));
  const row = db.list("settings")[0];
  if (row) db.patch("settings", row.id, { min_margin: v }); else db.insert("settings", { min_margin: v });
  return v;
}

/** Маржа = прибыль / цена продажи */
export const marginOf = (price, cost) => (price > 0 ? ((price - cost) / price) * 100 : 0);
/** Самая низкая цена строки при пороге маржи: закупка / (1 − порог) */
export const floorOf = (cost, m = minMargin()) => (cost > 0 ? Math.ceil(cost / (1 - m / 100)) : 0);
const retail = (cost) => Math.round((cost * (1 + MARKUP / 100)) / 10) * 10;

export const lineSum = (l) => l.qty * l.price;
export const lineCost = (l) => l.qty * (l.cost || 0);
export function totals(lines) {
  const total = lines.reduce((n, l) => n + lineSum(l), 0), cost = lines.reduce((n, l) => n + lineCost(l), 0);
  return { total, cost, profit: total - cost, margin: marginOf(total, cost) };
}

/** Самая низкая допустимая сумма договора для менеджера; 0 — основы для расчёта ещё нет */
export function minAmount(r) {
  if (r.estimate?.lines?.length) return r.estimate.lines.reduce((n, l) => n + l.qty * floorOf(l.cost || 0), 0);
  const cost = expenseTotal(r);
  return cost > 0 ? floorOf(cost) : 0;
}

/* ---------- Расчёт из замера ---------- */
const ceil1 = (n) => Math.ceil(n - 1e-9);
const FAN = { 100: "VK-100", 125: "VK-160", 160: "VK-160", 200: "VK-200", 250: "VK-200" };
const BEND = { 100: "O90-125", 125: "O90-125", 160: "O90-160", 200: "O90-200", 250: "O90-200" };
const AC_SPLIT = (area) => (area <= 25 ? "SPL-09" : area <= 35 ? "SPL-12" : "SPL-18");

let seq = 0;
const nextId = () => `l${Date.now().toString(36)}${++seq}`;
export function materialLine(p, qty) {
  return { id: nextId(), kind: "mat", product_id: p.id, name: p.name, unit: p.unit, qty, cost: p.cost || 0, price: retail(p.cost || 0) };
}
export function workLine(w, qty) {
  return { id: nextId(), kind: "work", work: w.id, name: w.name, unit: w.unit, qty, cost: 0, price: w.price };
}

export function buildEstimate(r, products = db.list("products")) {
  const bySku = (sku) => products.find((p) => p.sku === sku);
  const s = surveyOf(r), mats = new Map(), works = new Map();
  const mat = (sku, qty) => { const p = bySku(sku); if (p && qty > 0) mats.set(sku, { p, qty: (mats.get(sku)?.qty || 0) + qty }); };
  const work = (id, qty) => { if (qty > 0) works.set(id, (works.get(id) || 0) + qty); };
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
    ...WORKS.filter((w) => works.has(w.id)).map((w) => workLine(w, Math.round(works.get(w.id) * 10) / 10))];
}

/* ---------- Мастер из нескольких шагов (в боковой панели) ---------- */
export const STEPS = [["survey", "Замер"], ["mat", "Материалы"], ["work", "Работы"], ["sum", "Итог"]];

const barHtml = (lines, user) => {
  const t = totals(lines), m = minMargin(), low = t.total > 0 && t.margin < m;
  return `<div class="est-bar${low ? " low" : ""}"><span>Итого<b class="num">${money(t.total)}</b></span>
    <span>Прибыль<b class="num">${money(t.profit)}</b></span>
    <span>Процент<b class="num">${num(Math.round(t.margin * 10) / 10)}%</b></span>
    <small>Нижний порог ${num(m)}%${low ? (user.role === "director" ? ": цена ниже порога" : ": поднимите цены") : ""}</small></div>`;
};

function lineRows(lines, kind, user) {
  const own = lines.filter((l) => l.kind === kind);
  if (!own.length) return `<p class="muted">Строк нет.</p>`;
  return `<div class="table-wrap"><table class="tbl est-tbl"><thead><tr><th>${kind === "mat" ? "Материал" : "Работа"}</th><th class="r">Кол-во</th>
    ${kind === "mat" ? `<th class="r">Закупка</th>` : ""}<th class="r">Цена</th><th class="r">Сумма</th><th class="r">Маржа</th><th></th></tr></thead><tbody>
    ${own.map((l) => { const low = l.cost > 0 && l.price < floorOf(l.cost); return `<tr${low ? ' class="low"' : ""}>
      <td>${esc(l.name)}<small>${esc(l.unit)}</small></td>
      <td class="r"><input class="est-in" type="number" min="0" step="0.1" inputmode="decimal" value="${l.qty}" data-change="estLine" data-id="${l.id}" data-field="qty" aria-label="Количество"></td>
      ${kind === "mat" ? `<td class="r num">${money(l.cost)}</td>` : ""}
      <td class="r"><input class="est-in" type="number" min="0" step="10" inputmode="numeric" value="${l.price}" data-change="estLine" data-id="${l.id}" data-field="price" aria-label="Цена"></td>
      <td class="r num">${money(lineSum(l))}</td>
      <td class="r num">${l.cost > 0 ? `${num(Math.round(marginOf(l.price, l.cost)))}%` : "—"}</td>
      <td class="r"><button type="button" class="icon-btn" data-act="estDel" data-id="${l.id}" aria-label="Убрать строку">✕</button></td></tr>`; }).join("")}</tbody></table></div>`;
}

export function estimateWizard(r, step, lines, user) {
  const s = surveyOf(r);
  const nav = `<nav class="est-steps">${STEPS.map(([id, t], i) => `<button type="button" data-act="estStep" data-id="${i}" aria-pressed="${i === step}"><i>${i + 1}</i>${t}</button>`).join("")}</nav>`;
  let body = "";
  if (step === 0) {
    const vol = s.rooms.reduce((n, x) => n + x.area * x.height, 0), len = s.routes.reduce((n, x) => n + x.length, 0);
    body = `<h3>Данные замера</h3>${s.rooms.length || s.routes.length ? `<dl class="kv">
      <dt>Помещений</dt><dd>${s.rooms.length}, объём ${num(Math.round(vol))} м³</dd><dt>Кондиционеры</dt><dd>${s.rooms.filter((x) => x.ac).length}</dd>
      <dt>Трасс</dt><dd>${s.routes.length}, всего ${num(Math.round(len * 10) / 10)} м</dd><dt>Фото</dt><dd>${s.photos.length}</dd></dl>
      <p class="muted">Материалы подбираются по складу, работы — по прайсу. Дальше всё можно поправить.</p>
      <div class="btn-row"><button class="btn primary" data-act="estNext">${lines.length ? "Дальше" : "Рассчитать смету"}</button>
        ${lines.length ? `<button class="btn ghost danger" data-act="estRebuild">Пересчитать из замера заново</button>` : ""}</div>`
      : `<p class="muted">В замере пока нет помещений и трасс. Заполните вкладку «Замеры» или добавьте строки сметы вручную.</p>
        <button class="btn" data-act="estNext">Добавить строки вручную</button>`}`;
  } else if (step === 1 || step === 2) {
    const kind = step === 1 ? "mat" : "work";
    const add = kind === "mat"
      ? `<form class="inline-form" data-form="estAdd"><select name="item" aria-label="Материал">${db.list("products").map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(money(p.cost))}</option>`).join("")}</select>
          <input name="qty" type="number" min="0.1" step="0.1" value="1" inputmode="decimal" aria-label="Количество"><button class="btn" type="submit">Добавить материал</button></form>`
      : `<form class="inline-form" data-form="estAdd"><select name="item" aria-label="Работа">${WORKS.map((w) => `<option value="${w.id}">${esc(w.name)} · ${esc(money(w.price))}/${esc(w.unit)}</option>`).join("")}</select>
          <input name="qty" type="number" min="0.1" step="0.1" value="1" inputmode="decimal" aria-label="Количество"><button class="btn" type="submit">Добавить работу</button></form>`;
    body = `<h3>${kind === "mat" ? "Материалы" : "Работы"}</h3>${kind === "work" ? `<p class="note">Прайс работ ориентировочный: себестоимость работ пока не оценена, поэтому порог маржи на них не действует.</p>` : `<p class="muted small">Цена не ниже закупки плюс порог ${num(minMargin())}%. Наценка по умолчанию ${MARKUP}%.</p>`}
      ${lineRows(lines, kind, user)}${add}
      <div class="btn-row"><button class="btn" data-act="estStep" data-id="${step - 1}">Назад</button><button class="btn primary" data-act="estNext">Дальше</button></div>`;
  } else {
    const t = totals(lines), bad = lines.filter((l) => l.cost > 0 && l.price < floorOf(l.cost));
    const mats = lines.filter((l) => l.kind === "mat"), works = lines.filter((l) => l.kind === "work");
    body = `<h3>Итог</h3><dl class="kv"><dt>Материалы</dt><dd class="num">${money(mats.reduce((n, l) => n + lineSum(l), 0))}</dd>
      <dt>Работы</dt><dd class="num">${money(works.reduce((n, l) => n + lineSum(l), 0))}</dd>
      <dt>Закупка материалов</dt><dd class="num">${money(t.cost)}</dd>
      <dt>Сумма договора сейчас</dt><dd class="num">${money(r.amount || 0)}</dd></dl>
      ${bad.length ? `<p class="note warn">Ниже порога ${num(minMargin())}%: ${bad.map((l) => esc(l.name)).join(", ")}.${user.role === "director" ? " Руководитель может сохранить так." : " Поднимите цены, чтобы сохранить."}</p>` : ""}
      ${user.role === "director" ? `<form class="inline-form" data-form="estMargin"><label>Нижний порог маржи, %<input name="m" type="number" min="0" max="90" step="1" value="${minMargin()}"></label><button class="btn" type="submit">Сохранить порог</button></form>` : ""}
      <div class="btn-row"><button class="btn" data-act="estStep" data-id="1">Назад</button>
        <button class="btn primary" data-act="estSave"${!lines.length || (bad.length && user.role !== "director") ? " disabled" : ""}>Сохранить смету и поставить сумму договора</button></div>`;
  }
  return `<header class="d-head"><p class="eyebrow">Заказ №${r.id}</p><h2>Автосмета</h2></header>${nav}<section class="d-sec">${body}</section>
    ${step > 0 ? barHtml(lines, user) : ""}`;
}

/** Вкладка «Смета» в нижней панели */
export function estimateTab(r, user) {
  const e = r.estimate, m = minMargin();
  const head = `<div class="btn-row"><button class="btn primary" data-act="estOpen">${e ? "Изменить смету" : "Составить автосмету"}</button></div>`;
  if (!e?.lines?.length) return `<div class="sheet-cols"><div><p class="muted">Сметы пока нет. Автосмета считает материалы и работы из вкладки «Замеры».</p>${head}</div>${marginForm(user, m)}</div>`;
  const t = totals(e.lines);
  return `<div class="sheet-cols"><div><div class="table-wrap"><table class="tbl"><thead><tr><th>Позиция</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead><tbody>
    ${e.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="r num">${num(l.qty)} ${esc(l.unit)}</td><td class="r num">${money(l.price)}</td><td class="r num">${money(lineSum(l))}</td></tr>`).join("")}</tbody></table></div></div>
    <div><dl class="kv sheet-kv"><dt>Итого</dt><dd class="num"><b>${money(t.total)}</b></dd><dt>Прибыль</dt><dd class="num">${money(t.profit)}</dd>
      <dt>Процент</dt><dd class="num ${t.margin < m ? "bad" : ""}">${num(Math.round(t.margin * 10) / 10)}%</dd></dl>
      <p class="muted small">Смета от ${new Date(e.at).toLocaleDateString("ru-RU")}${e.by ? `, ${esc(e.by)}` : ""}. Нижний порог ${num(m)}%.</p>${head}${marginForm(user, m)}</div></div>`;
}
const marginForm = (user, m) => user.role !== "director" ? "" :
  `<div><form class="inline-form" data-form="estMargin"><label>Нижний порог маржи, %<input name="m" type="number" min="0" max="90" step="1" value="${m}"></label><button class="btn" type="submit">Сохранить порог</button></form></div>`;
