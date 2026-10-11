// «Склад» (закупщик, складовщик и руководитель): остатки по местам «линия.стеллаж.полка», карта склада,
// «Приём» и «Расход» (материал в расходы заказа), перемещение, списание, пересчёт, список закупки и журнал движений.
import { esc, money, num, dateTime, toast, armed } from "../core.js";
import { LINES, RACKS, SHELVES, CATEGORIES, UNITS } from "../config.js";
import { db } from "../db.js";
import { openDrawer, closeDrawer, field, options, empty, chips, formError } from "../ui.js";
import { currentUser } from "../auth.js";
import { LOCATIONS, describeLocation, categoryTitle, product, placesOf, qtyOf, qtyAt, contentsOf, isLow, toBuy,
  receive, move, writeOff, recount, expense, pendingItems, locChip, shelfOf, ACTIVE_REQUESTS } from "../stock.js";

let me = null;
let tab = "stock";      // stock · map · buy · log
let category = "all";
let lowOnly = false;
let query = "";

const TABS = [["stock", "Остатки"], ["map", "Карта склада"], ["buy", "Закупка"], ["log", "Журнал"]];
const amount = (p, n) => `${num(n)} ${esc(p?.unit || "")}`;
const waitingIssue = () => db.list("requests").filter((r) => ACTIVE_REQUESTS.includes(r.status) && pendingItems(r).length);

/* ---------- Остатки ---------- */
function matches(p) {
  if (category !== "all" && p.category !== category) return false;
  if (lowOnly && !isLow(p)) return false;
  if (!query) return true;
  const hay = `${p.sku} ${p.name} ${p.specs} ${placesOf(p.id).map((s) => s.loc).join(" ")}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

function stockRows() {
  const list = db.list("products").filter(matches);
  if (!list.length) return empty("Ничего не нашлось", "Измените поиск или категорию.");
  return `<div class="table-wrap"><table class="tbl stock-tbl">
    <thead><tr><th>Наименование</th><th>Места</th><th class="r">Остаток</th><th class="r">Мин.</th><th class="r">Цена</th></tr></thead>
    <tbody>${list.map((p) => {
      const total = qtyOf(p.id), low = isLow(p);
      return `<tr class="clickable${low ? " low" : ""}" data-act="product" data-id="${p.id}" tabindex="0">
        <td><b>${esc(p.name)}</b><small>${esc(p.sku)} · ${esc(p.specs)}</small></td>
        <td><span class="locs">${placesOf(p.id).map((s) => locChip(s.loc, `<i>${num(s.qty)}</i>`)).join("") || `<span class="muted">нет на складе</span>`}</span></td>
        <td class="r num"><b>${amount(p, total)}</b>${low ? `<small class="bad">мало</small>` : ""}</td>
        <td class="r num muted">${num(p.min_qty)}</td>
        <td class="r num">${money(p.price)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function stockTab() {
  const products = db.list("products");
  return `<div class="toolbar">
      <input class="search" type="search" id="whSearch" placeholder="Поиск: название, артикул, место (2.Б.А)" value="${esc(query)}" data-input="search" aria-label="Поиск по складу">
      <label class="toggle"><input type="checkbox" id="whLow" data-change="low"${lowOnly ? " checked" : ""}><span>Только заканчивается</span></label>
      <button class="btn primary" data-act="receive">Приём</button>
      <button class="btn primary" data-act="expense">Расход</button>
    </div>
    ${chips("category", [["all", "Все", products.length], ...CATEGORIES.map((c) => [c.id, c.title, products.filter((p) => p.category === c.id).length])], category)}
    <div id="stockRows">${stockRows()}</div>`;
}

/* ---------- Карта склада ---------- */
function mapTab() {
  const used = LOCATIONS.filter((l) => contentsOf(l).length).length;
  return `<p class="lead">Место пишется как <b>линия.стеллаж.полка</b>: ${locChip("1.А.З")} — первая линия, первый стеллаж, зелёная полка.
      Занято ${used} из ${LOCATIONS.length} мест. Нажмите на полку, чтобы увидеть, что на ней лежит.</p>
    <div class="legend">${SHELVES.map((sh) => `<span class="legend-item"><span class="dot sh-${sh.color}"></span>${sh.title} · ${sh.id}</span>`).join("")}</div>
    <div class="map">${Array.from({ length: LINES }, (_, li) => `<section class="map-line" aria-label="Линия ${li + 1}">
      <h3>Линия ${li + 1}</h3>
      <div class="map-scroll"><div class="racks">${RACKS.map((rack, ri) => `<div class="rack"><span class="rack-name">${rack}<small>${ri + 1}</small></span>
        ${SHELVES.map((shelf) => {
          const loc = `${li + 1}.${rack}.${shelf.id}`, n = contentsOf(loc).length;
          return `<button class="shelf sh-${shelf.color}${n ? " used" : ""}" data-act="cell" data-id="${loc}" title="${describeLocation(loc)}">
            <span>${shelf.id}</span>${n ? `<i>${n}</i>` : ""}</button>`;
        }).join("")}</div>`).join("")}</div></div></section>`).join("")}</div>
    <p class="muted small">Цифра на полке — сколько разных товаров на ней лежит. Яркая полка занята, бледная свободна.</p>`;
}

function cellHtml(loc) {
  const items = contentsOf(loc);
  return `<header class="d-head"><p class="eyebrow">${describeLocation(loc)}</p><h2>Место ${esc(loc)}</h2></header>
    <section class="d-sec">${items.length ? `<div class="mini-list">${items.map((s) => {
      const p = product(s.product_id);
      return `<button class="mini-row" data-act="product" data-id="${p.id}"><span><b>${esc(p.name)}</b><small>${esc(p.sku)}</small></span><span class="r num"><b>${amount(p, s.qty)}</b></span></button>`;
    }).join("")}</div>` : `<p class="muted">Полка пустая.</p>`}</section>
    <section class="d-sec"><button class="btn primary" data-act="receiveHere">Принять товар на это место</button></section>`;
}

/* ---------- Закупка ---------- */
function buyTab() {
  const needed = new Map(); // product_id → сколько нужно под заказы сверх остатка
  for (const r of waitingIssue()) for (const it of pendingItems(r)) needed.set(it.product_id, (needed.get(it.product_id) || 0) + it.qty);
  const rows = db.list("products").map((p) => {
    const forRequests = Math.max(0, (needed.get(p.id) || 0) - qtyOf(p.id));
    const qty = Math.max(toBuy(p), forRequests);
    return { p, qty, forRequests };
  }).filter((x) => x.qty > 0 && (isLow(x.p) || x.forRequests)).sort((a, b) => b.forRequests - a.forRequests || a.p.category.localeCompare(b.p.category));
  if (!rows.length) return empty("Закупать нечего", "Всех позиций больше минимального остатка.");
  const total = rows.reduce((n, x) => n + x.qty * (x.p.cost || 0), 0);
  return `<p class="lead">Позиции ниже минимального остатка и то, чего не хватает под заказы. Предлагаем докупить до двойного минимума.</p>
    <div class="table-wrap"><table class="tbl">
    <thead><tr><th>Наименование</th><th class="r">Остаток</th><th class="r">Мин.</th><th class="r">Купить</th><th class="r">Закупка</th><th></th></tr></thead>
    <tbody>${rows.map(({ p, qty, forRequests }) => `<tr><td><b>${esc(p.name)}</b><small>${esc(p.sku)}${forRequests ? ` · под заказы не хватает ${amount(p, forRequests)}` : ""}</small></td>
      <td class="r num${qtyOf(p.id) ? "" : " bad"}">${amount(p, qtyOf(p.id))}</td><td class="r num muted">${num(p.min_qty)}</td>
      <td class="r num"><b>${amount(p, qty)}</b></td><td class="r num">${money(qty * (p.cost || 0))}</td>
      <td class="r"><button class="btn sm" data-act="receiveBuy" data-id="${p.id}" data-qty="${qty}">Принять</button></td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="4">Итого по закупочным ценам</td><td class="r num"><b>${money(total)}</b></td><td></td></tr></tfoot></table></div>`;
}

/* ---------- Журнал ---------- */
const KIND = { in: "Приём", move: "Перемещение", out: "Списание", fix: "Пересчёт", issue: "Расход на заказ" };
function moveRow(m) {
  const p = product(m.product_id);
  const sign = m.kind === "in" || (m.kind === "fix" && m.delta > 0) ? "+" : m.kind === "move" ? "" : "−";
  const where = m.kind === "move" ? `${m.from} → ${m.to}` : m.to || m.from || "";
  return `<tr><td class="num nowrap">${dateTime(m.at)}</td><td><span class="kind k-${m.kind}">${KIND[m.kind]}</span></td>
    <td><b>${esc(p?.name || "Удалённый товар")}</b><small>${m.request_id ? `заказ №${m.request_id}` : esc(m.note || "")}</small></td>
    <td>${where.includes("→") ? where.split(" → ").map((l) => locChip(l)).join(" → ") : where ? locChip(where) : ""}</td><td class="r num"><b>${sign}${amount(p, m.qty)}</b></td><td class="muted">${esc(m.by || "")}</td></tr>`;
}
function logTab(filterProduct) {
  const list = db.list("moves").filter((m) => !filterProduct || m.product_id === filterProduct).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 150);
  if (!list.length) return empty("Движений пока нет");
  return `<div class="table-wrap"><table class="tbl log"><thead><tr><th>Когда</th><th>Операция</th><th>Товар</th><th>Место</th><th class="r">Кол-во</th><th>Кто</th></tr></thead>
    <tbody>${list.map(moveRow).join("")}</tbody></table></div>`;
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
      <div class="kpi"><small>Закупка / продажа</small><b class="num">${money(p.cost)} / ${money(p.price)}</b></div></div></section>
    <section class="d-sec"><h3>Где лежит</h3>${places.length ? `<div class="places">${places.map((s) => `<div class="place">
        ${locChip(s.loc, "", "big")}<span class="place-q num">${amount(p, s.qty)}</span>
        <span class="place-acts"><button class="link" data-act="moveFrom" data-id="${s.loc}">Переместить</button>
        <button class="link" data-act="writeOff" data-id="${s.loc}">Списать</button><button class="link" data-act="recount" data-id="${s.loc}">Пересчитать</button></span></div>`).join("")}</div>`
      : `<p class="muted">Товара нет на складе.</p>`}
      <div class="btn-row"><button class="btn primary" data-act="receiveThis">Принять</button><button class="btn" data-act="editProduct">Изменить карточку</button></div></section>
    <section class="d-sec"><h3>Движения</h3>${logTab(id)}</section>`;
}

function openProduct(id) {
  id = Number(id);
  openDrawer(() => productHtml(id), {
    receiveThis: () => openOperation("in", { productId: id }),
    moveFrom: (el) => openOperation("move", { productId: id, from: el.dataset.id }),
    writeOff: (el) => openOperation("out", { productId: id, from: el.dataset.id }),
    recount: (el) => openOperation("fix", { productId: id, loc: el.dataset.id }),
    editProduct: () => openProductForm(product(id)),
  }, { live: true, wide: true });
}

/* ---------- Операции ---------- */
function locationOptions(selected, { onlyWith } = {}) {
  const list = onlyWith ? placesOf(onlyWith).map((s) => s.loc) : LOCATIONS;
  if (onlyWith) return options(placesOf(onlyWith).map((s) => ({ id: s.loc, title: `${s.loc} · ${(shelfOf(s.loc)?.title || "").toLowerCase()} — ${num(s.qty)}` })), selected);
  return Array.from({ length: LINES }, (_, li) => `<optgroup label="Линия ${li + 1}">${list.filter((l) => l.startsWith(`${li + 1}.`)).map((l) => {
    const n = contentsOf(l).length;
    return `<option value="${l}"${l === selected ? " selected" : ""}>${l} · ${(shelfOf(l)?.title || "").toLowerCase()}${n ? ` · занято (${n})` : " · свободно"}</option>`;
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
      ${kind === "in" ? field("Закупочная цена за единицу, ₽", `<input name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${p?.cost ?? ""}">`, "Обновит закупочную цену в карточке товара") : ""}
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
  const pending = request ? pendingItems(request) : [];
  const places = o.productId ? placesOf(o.productId) : [];
  const p = product(o.productId);
  return `<header class="d-head"><p class="eyebrow">Добавить расход</p><h2>${request ? `Заказ №${request.id}` : "Материал в заказ"}</h2>
      ${request ? `<p class="muted">${esc(request.client)} · ${esc(request.address)}</p>` : ""}</header>
    <form data-form="expense">
      ${o.lockRequest ? "" : field("Заказ", `<select name="request" required data-change="pickExpense">${options(requests.map((r) => ({ id: r.id, title: `№${r.id} · ${r.client}` })), o.requestId, { empty: "Выберите заказ" })}</select>`)}
      ${pending.length ? `<div class="note">По плану менеджера осталось выписать:<br>${pending.map((it) => `<button type="button" class="link" data-act="planItem" data-id="${it.product_id}">${esc(product(it.product_id)?.name || "")} — ${num(it.qty)} ${esc(product(it.product_id)?.unit || "")}</button>`).join("<br>")}</div>` : ""}
      ${field("Товар", `<select name="product" required data-change="pickExpense">${productOptions(o.productId)}</select>`)}
      ${o.productId ? field("Откуда берём", places.length ? `<select name="from" required>${options(places.map((s) => ({ id: s.loc, title: `${s.loc} · ${(shelfOf(s.loc)?.title || "").toLowerCase()} — ${num(s.qty)} ${p.unit}` })), o.from || places[0].loc)}</select>`
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
    planItem(el) {
      const it = pendingItems(db.find("requests", state.requestId)).find((x) => x.product_id === Number(el.dataset.id));
      state.productId = it.product_id;
      state.qty = it.qty;
      state.note = document.querySelector("#drawerBody form")?.note.value || "";
      state.from = null;
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
      ${field("Закупочная цена, ₽", `<input name="cost" type="number" min="0" step="0.01" value="${p?.cost ?? ""}">`)}
      ${field("Цена продажи, ₽", `<input name="price" type="number" min="0" step="0.01" value="${p?.price ?? ""}">`)}
      <div class="form-actions span2"><button class="btn primary" type="submit">${p ? "Сохранить" : "Добавить товар"}</button>
        ${p && !qtyOf(p.id) ? `<button class="btn ghost danger" type="button" data-act="remove">Удалить товар</button>` : ""}</div>
    </form>`, {
    save(fd, form) {
      const values = { name: String(fd.get("name")).trim(), sku: String(fd.get("sku")).trim(), category: fd.get("category"), specs: String(fd.get("specs") || "").trim(),
        unit: fd.get("unit"), min_qty: Number(fd.get("min_qty")) || 0, cost: Number(fd.get("cost")) || 0, price: Number(fd.get("price")) || 0 };
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
    category(el) { category = el.dataset.id; rerender(); },
    low(el) { lowOnly = el.checked; rerender(); },
    search(el) { query = el.value.trim(); document.getElementById("stockRows").innerHTML = stockRows(); },
    product: (el) => openProduct(el.dataset.id),
    receive: () => openOperation("in"),
    expense: () => openOperation("out"),
    receiveBuy: (el) => openOperation("in", { productId: Number(el.dataset.id), qty: el.dataset.qty }),
    cell(el) {
      const loc = el.dataset.id;
      openDrawer(() => cellHtml(loc), { product: (b) => openProduct(b.dataset.id), receiveHere: () => openOperation("in", { to: loc }) }, { live: true });
    },
  },
};

function rerender() { document.getElementById("view").innerHTML = render(me); }
