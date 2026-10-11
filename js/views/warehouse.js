// «Склад» (закупщик, складовщик и руководитель): остатки по местам «линия.стеллаж.полка», карта склада,
// «Приём» и «Расход» (материал в расходы заказа), перемещение, списание, пересчёт, список закупки и журнал движений.
import { esc, money, num, dateTime, toast, armed } from "../core.js";
import { LINES, RACKS, SHELVES, CATEGORIES, UNITS } from "../config.js";
import { db } from "../db.js";
import { openDrawer, closeDrawer, field, options, empty, chips, formError } from "../ui.js";
import { currentUser } from "../auth.js";
import { LOCATIONS, describeLocation, categoryTitle, product, placesOf, qtyOf, qtyAt, contentsOf, isLow, toBuy,
  receive, move, writeOff, recount, expense, locChip, ACTIVE_REQUESTS } from "../stock.js";

let me = null;
let tab = "stock";      // stock · map · buy · log
const WF0 = { name: "", type: "", price: "", place: "" };
let WF = { ...WF0 }; // фильтры остатков, применяются кнопкой «Найти»

const TABS = [["stock", "Остатки"], ["map", "Карта склада"], ["buy", "Закупка"], ["log", "Журнал"]];
const amount = (p, n) => `${num(n)} ${esc(p?.unit || "")}`;

/* ---------- Остатки ---------- */
function matches(p) {
  if (WF.name && !`${p.name} ${p.sku} ${p.specs}`.toLowerCase().includes(WF.name.toLowerCase())) return false;
  if (WF.type && p.category !== WF.type) return false;
  if (WF.place && !placesOf(p.id).some((s) => s.loc.toLowerCase().includes(WF.place.toLowerCase()))) return false;
  return true;
}

function stockRows() {
  const list = db.list("products").filter(matches);
  // Цена в фильтре не отсекает товары, а сортирует: сначала самые близкие к указанной
  if (WF.price) list.sort((a, b) => Math.abs((a.cost || 0) - Number(WF.price)) - Math.abs((b.cost || 0) - Number(WF.price)));
  if (!list.length) return empty("Ничего не нашлось", "Измените фильтры.");
  return `<div class="table-wrap"><table class="tbl stock-tbl">
    <thead><tr><th>Наименование</th><th>Тип</th><th>Места</th><th class="r">Остаток</th><th class="r">Мин.</th><th class="r">Цена</th></tr></thead>
    <tbody>${list.map((p) => {
      const total = qtyOf(p.id), low = isLow(p);
      return `<tr class="clickable${low ? " low" : ""}" data-act="product" data-id="${p.id}" tabindex="0">
        <td><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.specs)}</small></td>
        <td>${esc(categoryTitle(p.category))}</td>
        <td class="nowrap">${placesOf(p.id).map((s) => esc(s.loc)).join(", ") || `<span class="muted">нет на складе</span>`}</td>
        <td class="r num"><b>${amount(p, total)}</b>${low ? `<small class="bad">мало</small>` : ""}</td>
        <td class="r num muted">${num(p.min_qty)}</td>
        <td class="r num">${money(p.cost)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function stockTab() {
  const flt = (label, control) => `<label class="flt"><span>${esc(label)}</span>${control}</label>`;
  const active = Object.values(WF).some(Boolean);
  return `<form data-form="whFind" class="filterbar wh">
      ${flt("Название", `<input type="search" name="name" value="${esc(WF.name)}" placeholder="Название, артикул">`)}
      ${flt("Тип", `<select name="type">${options(CATEGORIES, WF.type, { empty: "Все типы" })}</select>`)}
      ${flt("Цена", `<input type="number" name="price" min="0" step="1" inputmode="numeric" value="${esc(WF.price)}">`)}
      ${flt("Место на складе", `<input type="search" name="place" value="${esc(WF.place)}" placeholder="Б-2-1">`)}
      <button class="btn" type="submit">Найти</button>
      <button class="btn" type="button" data-act="whReset">Сброс</button>
      <button class="btn primary" type="button" data-act="receive">Приём</button>
      <button class="btn primary" type="button" data-act="expense">Расход</button>
    </form>
    <div id="stockRows">${stockRows()}</div>`;
}

/* ---------- Карта склада ---------- */
function mapTab() {
  const used = LOCATIONS.filter((l) => contentsOf(l).length).length;
  return `<p class="lead">Место пишется как <b>линия-стеллаж-полка</b>: ${locChip("А-1-2")} — линия А, первый стеллаж, вторая полка.
      Занято ${used} из ${LOCATIONS.length} мест. Нажмите на полку, чтобы увидеть, что на ней лежит.</p>
    <div class="map">${LINES.map((line) => `<section class="map-line" aria-label="Линия ${line}">
      <h3>Линия ${line}</h3>
      <div class="map-scroll"><div class="racks">${Array.from({ length: RACKS }, (_, ri) => `<div class="rack"><span class="rack-name">Стеллаж ${ri + 1}</span>
        ${Array.from({ length: SHELVES }, (_, si) => {
          const loc = `${line}-${ri + 1}-${si + 1}`, n = contentsOf(loc).length;
          return `<button class="shelf${n ? " used" : ""}" data-act="cell" data-id="${loc}" title="${describeLocation(loc)}">
            <span>${loc}</span>${n ? `<i>${n}</i>` : ""}</button>`;
        }).join("")}</div>`).join("")}</div></div></section>`).join("")}</div>
    <p class="muted small">Цифра на полке — сколько разных товаров на ней лежит. Яркая полка занята, бледная свободна.</p>`;
}

function cellHtml(loc) {
  const items = contentsOf(loc);
  return `<header class="d-head"><p class="eyebrow">${describeLocation(loc)}</p><h2>Место ${esc(loc)}</h2></header>
    <section class="d-sec">${items.length ? `<div class="mini-list">${items.map((s) => {
      const p = product(s.product_id);
      return `<button class="mini-row" data-act="product" data-id="${p.id}"><span><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></span><span class="r num"><b>${amount(p, s.qty)}</b></span></button>`;
    }).join("")}</div>` : `<p class="muted">Полка пустая.</p>`}</section>`;
}

/* ---------- Закупка ---------- */
function buyTab() {
  const rows = db.list("products").map((p) => ({ p, qty: toBuy(p) })).filter((x) => x.qty > 0 && isLow(x.p))
    .sort((a, b) => a.p.category.localeCompare(b.p.category));
  if (!rows.length) return empty("Закупать нечего", "Всех позиций больше минимального остатка.");
  const total = rows.reduce((n, x) => n + x.qty * (x.p.cost || 0), 0);
  return `<p class="lead">Позиции ниже минимального остатка. Предлагаем докупить до двойного минимума.</p>
    <div class="table-wrap"><table class="tbl">
    <thead><tr><th>Наименование</th><th class="r">Остаток</th><th class="r">Мин.</th><th class="r">Купить</th><th class="r">Закупка</th></tr></thead>
    <tbody>${rows.map(({ p, qty }) => `<tr><td><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></td>
      <td class="r num${qtyOf(p.id) ? "" : " bad"}">${amount(p, qtyOf(p.id))}</td><td class="r num muted">${num(p.min_qty)}</td>
      <td class="r num"><b>${amount(p, qty)}</b></td><td class="r num">${money(qty * (p.cost || 0))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="4">Итого</td><td class="r num"><b>${money(total)}</b></td></tr></tfoot></table></div>`;
}

/* ---------- Журнал ---------- */
const KIND = { in: "Приём", move: "Перемещение", out: "Списание", fix: "Пересчёт", issue: "Расход на заказ" };
function moveRow(m, withProduct = true) {
  const p = product(m.product_id);
  const sign = m.kind === "in" || (m.kind === "fix" && m.delta > 0) ? "+" : m.kind === "move" ? "" : "−";
  const where = m.kind === "move" ? `${m.from} → ${m.to}` : m.to || m.from || "";
  return `<tr><td class="num nowrap">${dateTime(m.at)}</td><td><span class="kind k-${m.kind}">${KIND[m.kind]}</span></td>
    <td>${withProduct ? `<b>${esc(p?.name || "Удалённый товар")}</b><small>` : "<span>"}${m.request_id ? `заказ №${m.request_id}` : esc(m.note || "")}${withProduct ? "</small>" : "</span>"}</td>
    <td>${where.includes("→") ? where.split(" → ").map((l) => locChip(l)).join(" → ") : where ? locChip(where) : ""}</td><td class="r num"><b>${sign}${amount(p, m.qty)}</b></td><td class="muted">${esc(m.by || "")}</td></tr>`;
}
function logTab(filterProduct) {
  const list = db.list("moves").filter((m) => !filterProduct || m.product_id === filterProduct).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 150);
  if (!list.length) return empty("Движений пока нет");
  return `<div class="table-wrap"><table class="tbl log"><thead><tr><th>Когда</th><th>Операция</th><th>${filterProduct ? "Комментарий" : "Товар"}</th><th>Место</th><th class="r">Кол-во</th><th>Кто</th></tr></thead>
    <tbody>${list.map((m) => moveRow(m, !filterProduct)).join("")}</tbody></table></div>`;
}

function render(user) {
  me = user;
  const low = db.list("products").filter(isLow).length;
  const counts = { buy: low };
  if (!TABS.some(([id]) => id === tab)) tab = "stock";
  const body = { stock: stockTab, map: mapTab, buy: buyTab, log: () => logTab() }[tab]();
  return `${chips("tab", TABS.map(([id, label]) => [id, label, counts[id] || null]), tab).replace('class="chips"', 'class="chips tabs"')}
    <div class="tab-body">${body}</div>`;
}

/* ---------- Карточка товара ---------- */
function productHtml(id) {
  const p = product(id);
  if (!p) return empty("Товар удалён");
  const places = placesOf(id);
  return `<header class="d-head"><p class="eyebrow">${esc(categoryTitle(p.category))} · ${esc(p.sku)}</p><h2>${esc(p.name)}</h2>
      <p class="muted">${esc(p.specs)}</p></header>
    <section class="d-sec"><div class="kpis small">
      <div class="kpi${isLow(p) ? " bad" : ""}"><small>Остаток</small><b class="num">${amount(p, qtyOf(id))}</b></div>
      <div class="kpi"><small>Минимум</small><b class="num">${amount(p, p.min_qty)}</b></div>
      <div class="kpi"><small>Цена</small><b class="num">${money(p.cost)}</b></div></div></section>
    <section class="d-sec"><h3>Нынешние позиции на складе</h3>${places.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Место</th><th>Где</th><th class="r">Количество</th></tr></thead>
      <tbody>${places.map((s) => `<tr><td class="num"><b>${esc(s.loc)}</b></td><td class="muted">${describeLocation(s.loc)}</td><td class="r num">${amount(p, s.qty)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">Товара нет на складе.</p>`}
      <p class="muted small">Количество меняется только кнопками «Приём» и «Расход» в разделе «Склад».</p></section>
    <section class="d-sec"><h3>История приёма и расхода</h3>${logTab(id)}</section>`;
}

function openProduct(id) {
  id = Number(id);
  openDrawer(() => productHtml(id), {}, { live: true, wide: true });
}

/* ---------- Операции ---------- */
function locationOptions(selected, { onlyWith } = {}) {
  if (onlyWith) return options(placesOf(onlyWith).map((s) => ({ id: s.loc, title: `${s.loc} — ${num(s.qty)}` })), selected);
  return LINES.map((line) => `<optgroup label="Линия ${line}">${LOCATIONS.filter((l) => l.startsWith(`${line}-`)).map((l) => {
    const n = contentsOf(l).length;
    return `<option value="${l}"${l === selected ? " selected" : ""}>${l}${n ? ` · занято (${n})` : " · свободно"}</option>`;
  }).join("")}</optgroup>`).join("");
}

function productOptions(selected) {
  return `<option value="">Выберите товар</option>` + CATEGORIES.map((c) => `<optgroup label="${esc(c.title)}">${db.list("products").filter((p) => p.category === c.id)
    .map((p) => `<option value="${p.id}"${p.id === Number(selected) ? " selected" : ""}>${esc(p.name)} (${esc(p.sku)})</option>`).join("")}</optgroup>`).join("");
}

/** Где уже лежит товар — подсказка, куда класть при приёмке */
const suggestLoc = (productId) => placesOf(productId)[0]?.loc || LOCATIONS.find((l) => !contentsOf(l).length) || LOCATIONS[0];

function operationHtml(kind, o) {
  const p = product(o.productId);
  const title = { in: "Приём", move: "Перемещение", out: "Расход", fix: "Пересчёт" }[kind];
  return `<header class="d-head"><p class="eyebrow">${title}</p><h2>${p ? esc(p.name) : kind === "out" ? "Убрать товар со склада" : "Принять товар"}</h2></header>
    <form data-form="op">
      ${(kind === "in" || kind === "out") && !o.fixedProduct ? field("Товар", `<div class="field-row"><select name="product" required data-change="pickProduct">${productOptions(o.productId)}</select>
        ${kind === "in" ? `<button class="btn" type="button" data-act="newProduct">Новый товар</button>` : ""}</div>`, kind === "in" ? "Нет в списке — нажмите «Новый товар»" : "") : ""}
      ${kind === "in" ? field("Положить на место", `<select name="to" required>${locationOptions(o.to || (o.productId ? suggestLoc(o.productId) : LOCATIONS[0]))}</select>`,
        p && placesOf(p.id).length ? `Уже лежит: ${placesOf(p.id).map((s) => `${s.loc} (${num(s.qty)})`).join(", ")}` : "") : ""}
      ${kind === "move" ? `${field("Откуда", `<select name="from">${locationOptions(o.from, { onlyWith: o.productId })}</select>`)}
        ${field("Куда", `<select name="to" required>${locationOptions(o.to || LOCATIONS.find((l) => l !== o.from && !contentsOf(l).length))}</select>`)}` : ""}
      ${kind === "out" && o.productId ? (placesOf(o.productId).length ? field("С места", `<select name="from">${locationOptions(o.from, { onlyWith: o.productId })}</select>`) : `<p class="note warn">Этого товара нет на складе.</p>`) : ""}
      ${kind === "fix" ? `<p class="note">Место <b>${esc(o.loc)}</b>: по учёту ${amount(p, qtyAt(o.productId, o.loc))}. Впишите, сколько лежит на самом деле — разница попадёт в журнал.</p>` : ""}
      ${field(kind === "fix" ? "Фактически на месте" : "Количество", `<input name="qty" type="number" min="0" step="any" inputmode="decimal" required value="${o.qty ?? ""}" autofocus>`, p ? `в ${esc(p.unit)}` : "")}
      ${kind === "in" ? field("Цена за единицу, ₽", `<input name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${p?.cost ?? ""}">`, "Обновит цену в карточке товара") : ""}
      ${kind === "in" || kind === "out" ? field("Комментарий", `<input name="note" maxlength="200" placeholder="${kind === "out" ? "Куда и зачем: брак, возврат поставщику, на нужды офиса…" : "Поставщик, номер накладной"}"${kind === "out" ? " required" : ""}>`) : ""}
      <div class="form-actions"><button class="btn primary" type="submit">${{ in: "Принять", move: "Переместить", out: "Убрать со склада", fix: "Сохранить пересчёт" }[kind]}</button></div>
    </form>`;
}

function openOperation(kind, o = {}) {
  const state = { ...o, fixedProduct: Boolean(o.productId) };
  openDrawer(() => operationHtml(kind, state), {
    pickProduct(el) {
      state.productId = Number(el.value) || null;
      const form = el.closest("form");
      const qty = form.qty.value, note = form.note?.value;
      state.from = null;
      document.getElementById("drawerBody").innerHTML = operationHtml(kind, state);
      const fresh = document.querySelector("#drawerBody form");
      fresh.qty.value = qty;
      if (fresh.note) fresh.note.value = note || "";
    },
    newProduct: () => openProductForm(null),
    op(fd, form) {
      const productId = Number(fd.get("product") || state.productId);
      if (!productId) return formError(form, "Выберите товар");
      const qty = Number(String(fd.get("qty") || "").replace(",", "."));
      try {
        if (kind === "in") receive({ productId, loc: fd.get("to"), qty, cost: Number(fd.get("cost")) || 0, note: String(fd.get("note") || "").trim() }, me);
        if (kind === "move") move({ productId, from: fd.get("from"), to: fd.get("to"), qty }, me);
        if (kind === "out" && !fd.get("from")) return formError(form, "Этого товара нет на складе");
        if (kind === "out") writeOff({ productId, from: fd.get("from"), qty, note: String(fd.get("note") || "") }, me);
        let delta = 0;
        if (kind === "fix") delta = recount({ productId, loc: state.loc, qty }, me);
        const p = product(productId);
        toast({ in: `Принято: ${amount(p, qty)} → ${fd.get("to")}`, move: `Перемещено ${fd.get("from")} → ${fd.get("to")}`, out: `Убрано со склада: ${amount(p, qty)}`,
          fix: delta ? `Исправлено на ${delta > 0 ? "+" : ""}${num(delta)}` : "Расхождений нет" }[kind], "ok");
        openProduct(productId);
      } catch (error) { formError(form, error.message); }
    },
  });
}

/* ---------- Расход: материал со склада в «Расходы» заказа ---------- */
const expenseRequests = () => db.list("requests").filter((r) => ACTIVE_REQUESTS.includes(r.status)).sort((a, b) => b.id - a.id);

function expenseHtml(o) {
  const requests = expenseRequests();
  const request = db.find("requests", o.requestId);
  const places = o.productId ? placesOf(o.productId) : [];
  const p = product(o.productId);
  return `<header class="d-head"><p class="eyebrow">Добавить расход</p><h2>${request ? `Заказ №${request.id}` : "Материал в заказ"}</h2>
      ${request ? `<p class="muted">${esc(request.client)} · ${esc(request.address)}</p>` : ""}</header>
    <form data-form="expense">
      ${o.lockRequest ? "" : field("Заказ", `<select name="request" required data-change="pickExpense">${options(requests.map((r) => ({ id: r.id, title: `№${r.id} · ${r.client}` })), o.requestId, { empty: "Выберите заказ" })}</select>`)}
      ${field("Товар", `<select name="product" required data-change="pickExpense">${productOptions(o.productId)}</select>`)}
      ${o.productId ? field("Откуда берём", places.length ? `<select name="from" required>${options(places.map((s) => ({ id: s.loc, title: `${s.loc} — ${num(s.qty)} ${p.unit}` })), o.from || places[0].loc)}</select>`
        : `<p class="note warn">Этого товара нет на складе.</p>`) : ""}
      ${field("Количество", `<input name="qty" type="number" min="0" step="any" inputmode="decimal" required value="${o.qty ?? ""}" autofocus>`, p ? `в ${esc(p.unit)}${p.cost ? ` · цена ${money(p.cost)} за ${esc(p.unit)}` : ""}` : "")}
      ${field("Комментарий", `<input name="note" maxlength="200" value="${esc(o.note || "")}" placeholder="Для чего, кому передали, что с остатком">`)}
      <div class="form-actions"><button class="btn primary" type="submit"${o.productId && !places.length ? " disabled" : ""}>Выписать в расходы</button></div>
    </form>`;
}

export function openExpense(o = {}) {
  me = currentUser();
  const state = { requestId: o.requestId ? Number(o.requestId) : null, productId: null, from: null, qty: null, note: "", lockRequest: Boolean(o.requestId) };
  openDrawer(() => expenseHtml(state), {
    pickExpense(el) {
      const form = el.closest("form");
      if (form.request) state.requestId = Number(form.request.value) || null;
      const next = Number(form.product.value) || null;
      if (next !== state.productId) state.from = null;
      state.productId = next;
      state.qty = form.qty.value;
      state.note = form.note.value;
      document.getElementById("drawerBody").innerHTML = expenseHtml(state);
    },
    expense(fd, form) {
      try {
        const requestId = Number(fd.get("request") || state.requestId);
        const productId = Number(fd.get("product"));
        const qty = Number(String(fd.get("qty") || "").replace(",", "."));
        expense({ requestId, productId, from: fd.get("from"), qty, note: fd.get("note") }, me);
        toast(`Выписано в расходы заказа №${requestId}: ${product(productId).name}, ${num(qty)} ${product(productId).unit}`, "ok");
        closeDrawer();
      } catch (error) { formError(form, error.message); }
    },
  }, { wide: false });
}

function openProductForm(p) {
  openDrawer(() => `<header class="d-head"><h2>${p ? "Карточка товара" : "Новый товар"}</h2></header>
    <form data-form="save" class="grid2">
      <div class="span2">${field("Наименование", `<input name="name" required maxlength="160" value="${esc(p?.name || "")}" placeholder="Воздуховод круглый Ø315" autofocus>`)}</div>
      ${field("Артикул", `<input name="sku" required maxlength="40" value="${esc(p?.sku || "")}" placeholder="D-315">`)}
      ${field("Категория", `<select name="category">${options(CATEGORIES, p?.category)}</select>`)}
      <div class="span2">${field("Характеристики", `<input name="specs" maxlength="200" value="${esc(p?.specs || "")}" placeholder="Диаметр, толщина металла, производительность, напряжение">`)}</div>
      ${field("Единица", `<select name="unit">${options(UNITS, p?.unit || "шт.")}</select>`)}
      ${field("Минимальный остаток", `<input name="min_qty" type="number" min="0" step="any" value="${p?.min_qty ?? 0}">`, "Ниже — попадёт в «Закупку»")}
      ${field("Цена, ₽", `<input name="cost" type="number" min="0" step="0.01" value="${p?.cost ?? ""}">`)}
      <div class="form-actions span2"><button class="btn primary" type="submit">${p ? "Сохранить" : "Добавить товар"}</button>
        ${p && !qtyOf(p.id) ? `<button class="btn ghost danger" type="button" data-act="remove">Удалить товар</button>` : ""}</div>
    </form>`, {
    save(fd, form) {
      const values = { name: String(fd.get("name")).trim(), sku: String(fd.get("sku")).trim(), category: fd.get("category"), specs: String(fd.get("specs") || "").trim(),
        unit: fd.get("unit"), min_qty: Number(fd.get("min_qty")) || 0, cost: Number(fd.get("cost")) || 0 };
      if (!values.name || !values.sku) return formError(form, "Впишите наименование и артикул");
      if (db.list("products").some((x) => x.sku.toLowerCase() === values.sku.toLowerCase() && x.id !== p?.id)) return formError(form, "Такой артикул уже есть");
      if (p) { db.patch("products", p.id, values); toast("Карточка сохранена", "ok"); openProduct(p.id); }
      else { const created = db.insert("products", values); toast("Товар добавлен — примите его на место", "ok"); openOperation("in", { productId: created.id }); }
    },
    remove(el) {
      if (!armed(el, "Точно удалить?")) return;
      db.remove("products", p.id);
      closeDrawer();
      toast("Товар удалён");
    },
  }, { wide: true });
}

export default {
  title: () => "Склад",
  render,
  actions: {
    tab(el) { tab = el.dataset.id; rerender(); },
    whFind(fd) { for (const k of Object.keys(WF0)) WF[k] = String(fd.get(k) || "").trim(); rerender(); },
    whReset() { WF = { ...WF0 }; rerender(); },
    product: (el) => openProduct(el.dataset.id),
    receive: () => openOperation("in"),
    expense: () => openOperation("out"),
    cell(el) {
      const loc = el.dataset.id;
      openDrawer(() => cellHtml(loc), { product: (b) => openProduct(b.dataset.id) }, { live: true });
    },
  },
};

function rerender() { document.getElementById("view").innerHTML = render(me); }
