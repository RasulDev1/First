"use client";
// «Склад» (закупщик, складовщик и руководитель): остатки по местам «линия.стеллаж.полка», карта склада,
// «Приём» и «Расход» (материал в расходы заказа), перемещение, списание, пересчёт, список закупки и журнал движений.
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { money, num, dateTime, formValue } from "@/lib/core";
import { LINES, RACKS, SHELVES, CATEGORIES, UNITS } from "@/lib/config";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  LOCATIONS, describeLocation, categoryTitle, product, placesOf, qtyOf, qtyAt, contentsOf, isLow, toBuy,
  receive, move, writeOff, recount, expense, ACTIVE_REQUESTS,
} from "@/lib/stock";
import type { Move, MoveKind, Product } from "@/lib/types";
import {
  ArmedButton, Button, Chips, DHead, DSec, Empty, Field, FormError, Kpi, Kpis, Loc, Note, Options, Table,
  btnRow, cx, formCol, grid2, rowClickable,
} from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import type { View } from "./types";

/* ---------- Состояние раздела: живёт между переходами, как в прежней версии ---------- */
type Tab = "stock" | "map" | "buy" | "log" | "low";
const TABS: readonly (readonly [Tab, string])[] = [["stock", "Остатки"], ["map", "Карта склада"], ["buy", "Закупка"], ["log", "Журнал"], ["low", "Заканчиваются"]];
interface WhFilter { name: string; type: string; price: string; place: string }
const WF0: WhFilter = { name: "", type: "", price: "", place: "" };
const saved: { tab: Tab; wf: WhFilter } = { tab: "stock", wf: { ...WF0 } }; // фильтры остатков применяются кнопкой «Найти»

const amount = (p: Product | null | undefined, n: unknown) => `${num(n)} ${p?.unit || ""}`;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const R = "text-right tabular-nums";
const C = "text-center tabular-nums";
const TH_R = "text-right!";

/* ---------- Остатки ---------- */
function matches(p: Product, wf: WhFilter) {
  if (wf.name && !`${p.name} ${p.sku} ${p.specs}`.toLowerCase().includes(wf.name.toLowerCase())) return false;
  if (wf.type && p.category !== wf.type) return false;
  if (wf.place && !placesOf(p.id).some((s) => s.loc.toLowerCase().includes(wf.place.toLowerCase()))) return false;
  return true;
}

function StockRows({ wf }: { wf: WhFilter }) {
  const list = db.list("products").filter((p) => matches(p, wf));
  // Цена в фильтре не отсекает товары, а сортирует: сначала самые близкие к указанной
  if (wf.price) list.sort((a, b) => Math.abs((a.cost || 0) - Number(wf.price)) - Math.abs((b.cost || 0) - Number(wf.price)));
  if (!list.length) return <Empty title="Ничего не нашлось">Измените фильтры.</Empty>;
  return (
    <Table resize>
      <thead><tr><th>Наименование</th><th>Тип</th><th>Места</th><th className="text-center!">Остаток</th><th className="text-center!">Мин.</th><th className="text-center!">Цена</th></tr></thead>
      <tbody>{list.map((p) => {
        const total = qtyOf(p.id), low = isLow(p);
        const places = placesOf(p.id).map((s) => s.loc).join(", ");
        return (
          <tr key={p.id} tabIndex={0} onClick={() => openProduct(p.id)}
            className={cx(rowClickable, low && "[&>td]:bg-bad-soft/40")}>
            <td><b>{p.name}</b><small>{p.sku} · {p.specs}</small></td>
            <td>{categoryTitle(p.category)}</td>
            <td className="whitespace-nowrap">{places || <span className="text-muted">нет на складе</span>}</td>
            <td className={C}><b>{amount(p, total)}</b>{low ? <small className="text-bad! font-bold!">мало</small> : null}</td>
            <td className={cx(C, "text-muted")}>{num(p.min_qty)}</td>
            <td className={cx(C, "whitespace-nowrap")}>{money(p.cost)}</td>
          </tr>
        );
      })}</tbody>
    </Table>
  );
}

// Панель фильтров: поля и кнопки одной высоты, без скруглений
const fbar = cx("grid gap-2 items-end grid-cols-2 min-[701px]:grid-cols-4 min-[1200px]:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_repeat(4,minmax(0,.9fr))]",
  "[&_input]:h-[42px] [&_input]:min-h-[42px] [&_input]:px-2.5 [&_input]:py-0 [&_input]:text-sm [&_input]:rounded-lg",
  "[&_select]:h-[42px] [&_select]:min-h-[42px] [&_select]:px-2.5 [&_select]:py-0 [&_select]:text-sm [&_select]:rounded-lg",
  "[&_button]:w-full [&_button]:h-[42px] [&_button]:min-h-[42px] [&_button]:px-1.5 [&_button]:py-0 [&_button]:text-sm");
function Flt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-medium tracking-[.05em] uppercase text-muted truncate">{label}</span>
      {children}
    </label>
  );
}

function StockTab() {
  const [wf, setWfState] = useState<WhFilter>(saved.wf);
  const [formKey, setFormKey] = useState(0);
  const setWf = (next: WhFilter) => { saved.wf = next; setWfState(next); };
  const find = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setWf({ name: formValue(fd, "name"), type: formValue(fd, "type"), price: formValue(fd, "price"), place: formValue(fd, "place") });
  };
  return (
    <>
      <form key={formKey} className={fbar} onSubmit={find}>
        <Flt label="Название"><input type="search" name="name" defaultValue={wf.name} placeholder="Название, артикул" /></Flt>
        <Flt label="Тип"><select name="type" defaultValue={wf.type}><Options list={CATEGORIES} empty="Все типы" /></select></Flt>
        <Flt label="Цена"><input type="number" name="price" min={0} step={1} inputMode="numeric" defaultValue={wf.price} /></Flt>
        <Flt label="Место"><input type="search" name="place" defaultValue={wf.place} placeholder="Б-2-1" /></Flt>
        <Button type="submit">Найти</Button>
        <Button onClick={() => { setWf({ ...WF0 }); setFormKey((k) => k + 1); }}>Сброс</Button>
        <Button variant="primary" onClick={() => openOperation("in")}>Приём</Button>
        <Button variant="primary" onClick={() => openOperation("out")}>Расход</Button>
      </form>
      <div><StockRows wf={wf} /></div>
    </>
  );
}

/* ---------- Карта склада ---------- */
// Цвет полки — через переменную --c (как в прежней версии: основной синий)
const shelfStyle = { "--c": "var(--color-brand)" } as CSSProperties;
function MapTab() {
  const used = LOCATIONS.filter((l) => contentsOf(l).length).length;
  return (
    <>
      <p className="m-0 text-ink-2 max-w-[70ch]">Место пишется как <b>линия-стеллаж-полка</b>: <Loc code="А-1-2" /> — линия А, первый стеллаж, вторая полка.
        Занято {used} из {LOCATIONS.length} мест. Нажмите на полку, чтобы увидеть, что на ней лежит.</p>
      <div className="flex flex-col gap-3.5">{LINES.map((line) => (
        <section key={line} aria-label={`Линия ${line}`} className="bg-surface border border-black/[.04] rounded-card shadow-card px-5 py-5 flex flex-col gap-3">
          <h3 className="font-display text-sm font-semibold">Линия {line}</h3>
          <div className="overflow-x-auto pb-1">
            <div className="grid grid-cols-[repeat(6,minmax(64px,1fr))] gap-2.5 min-w-[420px]">
              {Array.from({ length: RACKS }, (_, ri) => (
                <div key={ri} className="flex flex-col gap-1">
                  <span className="flex justify-between items-baseline font-semibold text-[13px] px-0.5">Стеллаж {ri + 1}</span>
                  {Array.from({ length: SHELVES }, (_, si) => {
                    const loc = `${line}-${ri + 1}-${si + 1}`, n = contentsOf(loc).length;
                    return (
                      <button key={loc} type="button" title={describeLocation(loc)} style={shelfStyle} onClick={() => openCell(loc)}
                        className={cx("relative h-[38px] rounded-md border cursor-pointer flex items-center justify-between px-2 text-xs font-medium",
                          "hover:border-brand! hover:shadow-[0_0_0_2px_var(--color-brand-soft)]",
                          n ? "text-ink bg-[color-mix(in_srgb,var(--c)_42%,var(--color-surface))] border-(--c)"
                            : "text-ink-2 bg-[color-mix(in_srgb,var(--c)_9%,var(--color-surface))] border-[color-mix(in_srgb,var(--c)_45%,var(--color-line))]")}>
                        <span>{loc}</span>
                        {n ? <i className="not-italic font-semibold text-ink bg-surface rounded px-[5px] tabular-nums">{n}</i> : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}</div>
      <p className="m-0 text-muted text-[13px]">Цифра на полке — сколько разных товаров на ней лежит. Яркая полка занята, бледная свободна.</p>
    </>
  );
}

const miniRow = "flex justify-between gap-3 px-1 py-3 border-0 border-b border-line/70 last:border-b-0 bg-transparent text-left cursor-pointer hover:bg-surface-2";

function CellDetail({ loc }: { loc: string }) {
  const items = contentsOf(loc);
  return (
    <>
      <DHead eyebrow={describeLocation(loc)} title={`Место ${loc}`} />
      <DSec>
        {items.length ? (
          <div className="flex flex-col">{items.map((s) => {
            const p = product(s.product_id);
            if (!p) return null;
            return (
              <button key={s.id} type="button" className={miniRow} onClick={() => openProduct(p.id)}>
                <span className="flex flex-col min-w-0"><b>{p.name}</b><small className="text-[12.5px] text-muted truncate">{p.sku}</small></span>
                <span className="flex flex-col items-end text-right flex-none gap-0.5 tabular-nums"><b>{amount(p, s.qty)}</b></span>
              </button>
            );
          })}</div>
        ) : <p className="m-0 text-muted">Полка пустая.</p>}
      </DSec>
    </>
  );
}
function openCell(loc: string) { openDrawer(() => <CellDetail loc={loc} />); }

/* ---------- Закупка ---------- */
function BuyTab() {
  const rows = db.list("products").map((p) => ({ p, qty: toBuy(p) })).filter((x) => x.qty > 0 && isLow(x.p))
    .sort((a, b) => a.p.category.localeCompare(b.p.category));
  if (!rows.length) return <Empty title="Закупать нечего">Всех позиций больше минимального остатка.</Empty>;
  const total = rows.reduce((n, x) => n + x.qty * (x.p.cost || 0), 0);
  return (
    <>
      <p className="m-0 text-ink-2 max-w-[70ch]">Позиции ниже минимального остатка. Предлагаем докупить до двойного минимума.</p>
      <Table resize>
        <thead><tr><th>Наименование</th><th className="text-center!">Остаток</th><th className="text-center!">Мин.</th><th className={TH_R}>Купить</th><th className={TH_R}>Закупка</th></tr></thead>
        <tbody>{rows.map(({ p, qty }) => (
          <tr key={p.id}>
            <td><b>{p.name}</b><small>{p.sku}</small></td>
            <td className={cx(C, !qtyOf(p.id) && "text-bad")}>{amount(p, qtyOf(p.id))}</td>
            <td className={cx(C, "text-muted")}>{num(p.min_qty)}</td>
            <td className={R}><b>{amount(p, qty)}</b></td>
            <td className={R}>{money(qty * (p.cost || 0))}</td>
          </tr>
        ))}</tbody>
        <tfoot><tr><td colSpan={4}>Итого</td><td className={R}><b>{money(total)}</b></td></tr></tfoot>
      </Table>
    </>
  );
}

/* ---------- Заканчиваются ---------- */
function LowTab() {
  const rows = db.list("products").filter(isLow).sort((a, b) => qtyOf(a.id) - qtyOf(b.id));
  if (!rows.length) return <Empty title="Всё в достатке">Ни одна позиция не опустилась до минимального остатка.</Empty>;
  return (
    <>
      <p className="m-0 text-ink-2 max-w-[70ch]">Товары, которых осталось мало: остаток не больше минимального.</p>
      <Table resize>
        <thead><tr><th>Наименование</th><th className="text-center!">Остаток</th><th className="text-center!">Мин.</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} tabIndex={0} className="cursor-pointer" onClick={() => openProduct(p.id)}>
            <td><b>{p.name}</b><small>{p.sku}</small></td>
            <td className={cx(C, "text-bad font-semibold")}>{amount(p, qtyOf(p.id))}</td>
            <td className={cx(C, "text-muted")}>{num(p.min_qty)}</td>
          </tr>
        ))}</tbody>
      </Table>
    </>
  );
}

/* ---------- Журнал ---------- */
const KIND: Record<MoveKind, string> = { in: "Приём", move: "Перемещение", out: "Списание", fix: "Пересчёт", issue: "Расход на заказ" };
const KIND_CLASS: Record<MoveKind, string> = {
  in: "text-ok bg-ok-soft", move: "text-st-new bg-st-new-soft", out: "text-bad bg-bad-soft",
  fix: "text-warn bg-warn-soft", issue: "text-st-assigned bg-st-assigned-soft",
};

function MoveRow({ m, withProduct }: { m: Move; withProduct: boolean }) {
  const p = product(m.product_id);
  const sign = m.kind === "in" || (m.kind === "fix" && (m.delta || 0) > 0) ? "+" : m.kind === "move" ? "" : "−";
  const where = m.kind === "move" ? `${m.from} → ${m.to}` : m.to || m.from || "";
  const comment = m.request_id ? `заказ №${m.request_id}` : m.note || "";
  return (
    <tr>
      <td className="tabular-nums whitespace-nowrap">{dateTime(m.at)}</td>
      <td><span className={cx("text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap", KIND_CLASS[m.kind])}>{KIND[m.kind]}</span></td>
      <td>{withProduct ? <><b>{p?.name || "Удалённый товар"}</b><small>{comment}</small></> : <span>{comment}</span>}</td>
      <td>{where.includes("→")
        ? where.split(" → ").map((l, i) => <span key={i}>{i ? " → " : null}<Loc code={l} /></span>)
        : where ? <Loc code={where} /> : null}</td>
      <td className={R}><b>{sign}{amount(p, m.qty)}</b></td>
      <td className="text-muted">{m.by || ""}</td>
    </tr>
  );
}

function LogTable({ productId }: { productId?: number }) {
  const list = db.list("moves").filter((m) => !productId || m.product_id === productId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 150);
  if (!list.length) return <Empty title="Движений пока нет" />;
  return (
    <Table resize>
      <thead><tr><th>Когда</th><th>Операция</th><th>{productId ? "Комментарий" : "Товар"}</th><th>Место</th><th className={TH_R}>Кол-во</th><th>Кто</th></tr></thead>
      <tbody>{list.map((m) => <MoveRow key={m.id} m={m} withProduct={!productId} />)}</tbody>
    </Table>
  );
}

/* ---------- Раздел ---------- */
function Warehouse() {
  const [tab, setTabState] = useState<Tab>(saved.tab);
  const setTab = (id: string) => {
    const next = TABS.find(([t]) => t === id)?.[0] ?? "stock";
    saved.tab = next;
    setTabState(next);
  };
  const low = db.list("products").filter(isLow).length;
  const counts: Partial<Record<Tab, number>> = { buy: low, low };
  return (
    <>
      <Chips tabs items={TABS.map(([id, label]) => [id, label, counts[id] || undefined] as const)} active={tab} onChange={setTab} />
      <div className="flex flex-col gap-3.5">
        {tab === "stock" ? <StockTab /> : tab === "map" ? <MapTab /> : tab === "buy" ? <BuyTab /> : tab === "low" ? <LowTab /> : <LogTable />}
      </div>
    </>
  );
}

/* ---------- Карточка товара ---------- */
function ProductDetail({ id }: { id: number }) {
  const p = product(id);
  if (!p) return <Empty title="Товар удалён" />;
  const places = placesOf(id);
  return (
    <>
      <DHead eyebrow={`${categoryTitle(p.category)} · ${p.sku}`} title={p.name}>
        <p className="m-0 text-muted">{p.specs}</p>
      </DHead>
      <DSec>
        <Kpis small>
          <Kpi small label="Остаток" value={amount(p, qtyOf(id))} tone={isLow(p) ? "bad" : undefined} />
          <Kpi small label="Минимум" value={amount(p, p.min_qty)} />
          <Kpi small label="Цена" value={money(p.cost)} />
        </Kpis>
      </DSec>
      <DSec title="Нынешние позиции на складе">
        {places.length ? (
          <Table>
            <thead><tr><th>Место</th><th>Где</th><th className={TH_R}>Количество</th></tr></thead>
            <tbody>{places.map((s) => (
              <tr key={s.id}><td className="tabular-nums"><b>{s.loc}</b></td><td className="text-muted">{describeLocation(s.loc)}</td><td className={R}>{amount(p, s.qty)}</td></tr>
            ))}</tbody>
          </Table>
        ) : <p className="m-0 text-muted">Товара нет на складе.</p>}
        <p className="m-0 text-muted text-[13px]">Количество меняется только кнопками «Приём» и «Расход» в разделе «Склад».</p>
      </DSec>
      <DSec title="История приёма и расхода"><LogTable productId={id} /></DSec>
    </>
  );
}

function openProduct(id: number) {
  openDrawer(() => <ProductDetail id={Number(id)} />, { wide: true });
}

/* ---------- Операции ---------- */
/** Места для выбора: где лежит товар (с количеством) или все места по линиям с отметкой «занято/свободно» */
function LocationOptions({ onlyWith }: { onlyWith?: number | null }) {
  if (onlyWith) return <Options list={placesOf(onlyWith).map((s) => ({ id: s.loc, title: `${s.loc} — ${num(s.qty)}` }))} />;
  return (
    <>{LINES.map((line) => (
      <optgroup key={line} label={`Линия ${line}`}>
        {LOCATIONS.filter((l) => l.startsWith(`${line}-`)).map((l) => {
          const n = contentsOf(l).length;
          return <option key={l} value={l}>{l}{n ? ` · занято (${n})` : " · свободно"}</option>;
        })}
      </optgroup>
    ))}</>
  );
}

function ProductOptions() {
  return (
    <>
      <option value="">Выберите товар</option>
      {CATEGORIES.map((c) => (
        <optgroup key={c.id} label={c.title}>
          {db.list("products").filter((p) => p.category === c.id).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
        </optgroup>
      ))}
    </>
  );
}

/** Где уже лежит товар — подсказка, куда класть при приёмке */
const suggestLoc = (productId: number) => placesOf(productId)[0]?.loc || LOCATIONS.find((l) => !contentsOf(l).length) || LOCATIONS[0];
const parseQty = (v: string) => Number(String(v || "").replace(",", "."));

type OpKind = "in" | "move" | "out" | "fix";
interface OpInit { productId?: number | null; from?: string | null; to?: string | null; loc?: string; qty?: number | string | null }
const OP_TITLE: Record<OpKind, string> = { in: "Приём", move: "Перемещение", out: "Расход", fix: "Пересчёт" };
const OP_SUBMIT: Record<OpKind, string> = { in: "Принять", move: "Переместить", out: "Убрать со склада", fix: "Сохранить пересчёт" };

function Operation({ kind, init }: { kind: OpKind; init: OpInit }) {
  const fixedProduct = Boolean(init.productId);
  const [productId, setProductId] = useState<number | null>(init.productId ?? null);
  const p = product(productId);
  const firstFree = (from?: string | null) => LOCATIONS.find((l) => l !== from && !contentsOf(l).length) ?? LOCATIONS[0];
  const [from, setFrom] = useState<string>(init.from || "");
  const [to, setTo] = useState<string>(init.to || (kind === "move" ? firstFree(init.from) : productId ? suggestLoc(productId) : LOCATIONS[0]));
  const [qty, setQty] = useState(init.qty != null ? String(init.qty) : "");
  const [cost, setCost] = useState(p?.cost != null ? String(p.cost) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const places = productId ? placesOf(productId) : [];
  // «Откуда»: выбранное место, если товар ещё там лежит, иначе первое из мест товара
  const fromValue = places.some((s) => s.loc === from) ? from : places[0]?.loc || "";

  const pick = (value: string) => {
    const next = Number(value) || null;
    setProductId(next);
    setFrom("");
    setTo(next ? suggestLoc(next) : LOCATIONS[0]);
    const np = product(next);
    setCost(np?.cost != null ? String(np.cost) : "");
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!productId) return setError("Выберите товар");
    const q = parseQty(qty);
    const me = currentUser();
    try {
      if (kind === "in") receive({ productId, loc: to, qty: q, cost: Number(cost) || 0, note: note.trim() }, me);
      if (kind === "move") move({ productId, from: fromValue, to, qty: q }, me);
      if (kind === "out" && !fromValue) return setError("Этого товара нет на складе");
      if (kind === "out") writeOff({ productId, from: fromValue, qty: q, note }, me);
      let delta = 0;
      if (kind === "fix") delta = recount({ productId, loc: init.loc || "", qty: q }, me);
      const pp = product(productId);
      toast({
        in: `Принято: ${amount(pp, q)} → ${to}`, move: `Перемещено ${fromValue} → ${to}`, out: `Убрано со склада: ${amount(pp, q)}`,
        fix: delta ? `Исправлено на ${delta > 0 ? "+" : ""}${num(delta)}` : "Расхождений нет",
      }[kind]);
      openProduct(productId);
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <>
      <DHead eyebrow={OP_TITLE[kind]} title={p ? p.name : kind === "out" ? "Убрать товар со склада" : "Принять товар"} />
      <form className={formCol} onSubmit={submit}>
        {(kind === "in" || kind === "out") && !fixedProduct ? (
          <Field label="Товар" hint={kind === "in" ? "Нет в списке — нажмите «Новый товар»" : undefined}>
            <span className="flex gap-2">
              <select name="product" required value={productId ?? ""} onChange={(e) => pick(e.target.value)} className="flex-1 min-w-0"><ProductOptions /></select>
              {kind === "in" ? <Button className="flex-none" onClick={(e) => { e.preventDefault(); openProductForm(null); }}>Новый товар</Button> : null}
            </span>
          </Field>
        ) : null}
        {kind === "in" ? (
          <Field label="Положить на место" hint={p && placesOf(p.id).length ? `Уже лежит: ${placesOf(p.id).map((s) => `${s.loc} (${num(s.qty)})`).join(", ")}` : undefined}>
            <select name="to" required value={to} onChange={(e) => setTo(e.target.value)}><LocationOptions /></select>
          </Field>
        ) : null}
        {kind === "move" ? (
          <>
            <Field label="Откуда"><select name="from" value={fromValue} onChange={(e) => setFrom(e.target.value)}><LocationOptions onlyWith={productId} /></select></Field>
            <Field label="Куда"><select name="to" required value={to} onChange={(e) => setTo(e.target.value)}><LocationOptions /></select></Field>
          </>
        ) : null}
        {kind === "out" && productId ? (places.length ? (
          <Field label="С места"><select name="from" value={fromValue} onChange={(e) => setFrom(e.target.value)}><LocationOptions onlyWith={productId} /></select></Field>
        ) : <Note tone="warn">Этого товара нет на складе.</Note>) : null}
        {kind === "fix" ? (
          <Note>Место <b>{init.loc}</b>: по учёту {amount(p, qtyAt(productId, init.loc || ""))}. Впишите, сколько лежит на самом деле — разница попадёт в журнал.</Note>
        ) : null}
        <Field label={kind === "fix" ? "Фактически на месте" : "Количество"} hint={p ? `в ${p.unit}` : undefined}>
          <input name="qty" type="number" min={0} step="any" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        {kind === "in" ? (
          <Field label="Цена за единицу, ₽" hint="Обновит цену в карточке товара">
            <input name="cost" type="number" min={0} step={0.01} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
        ) : null}
        {kind === "in" || kind === "out" ? (
          <Field label="Комментарий">
            <input name="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} required={kind === "out"}
              placeholder={kind === "out" ? "Куда и зачем: брак, возврат поставщику, на нужды офиса…" : "Поставщик, номер накладной"} />
          </Field>
        ) : null}
        <FormError>{error}</FormError>
        <div className={btnRow}><Button variant="primary" type="submit">{OP_SUBMIT[kind]}</Button></div>
      </form>
    </>
  );
}

function openOperation(kind: OpKind, o: OpInit = {}) {
  openDrawer(() => <Operation kind={kind} init={o} />);
}

/* ---------- Расход: материал со склада в «Расходы» заказа ---------- */
const expenseRequests = () => db.list("requests").filter((r) => ACTIVE_REQUESTS.includes(r.status)).sort((a, b) => b.id - a.id);

function ExpenseForm({ initRequestId, lockRequest }: { initRequestId: number | null; lockRequest: boolean }) {
  const [requestId, setRequestId] = useState<number | null>(initRequestId);
  const [productId, setProductId] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const requests = expenseRequests();
  const request = db.find("requests", requestId);
  const places = productId ? placesOf(productId) : [];
  const p = product(productId);
  const fromValue = places.some((s) => s.loc === from) ? from : places[0]?.loc || "";

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const q = parseQty(qty);
      expense({ requestId, productId, from: fromValue, qty: q, note }, currentUser());
      const pp = product(productId);
      toast(`Выписано в расходы заказа №${requestId}: ${pp?.name}, ${num(q)} ${pp?.unit}`);
      closeDrawer();
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <>
      <DHead eyebrow="Добавить расход" title={request ? `Заказ №${request.id}` : "Материал в заказ"}>
        {request ? <p className="m-0 text-muted">{request.client} · {request.address}</p> : null}
      </DHead>
      <form className={formCol} onSubmit={submit}>
        {lockRequest ? null : (
          <Field label="Заказ">
            <select name="request" required value={requestId ?? ""} onChange={(e) => setRequestId(Number(e.target.value) || null)}>
              <Options list={requests.map((r) => ({ id: r.id, title: `№${r.id} · ${r.client}` }))} empty="Выберите заказ" />
            </select>
          </Field>
        )}
        <Field label="Товар">
          <select name="product" required value={productId ?? ""} onChange={(e) => {
            const next = Number(e.target.value) || null;
            if (next !== productId) setFrom("");
            setProductId(next);
          }}><ProductOptions /></select>
        </Field>
        {productId ? (places.length ? (
          <Field label="Откуда берём">
            <select name="from" required value={fromValue} onChange={(e) => setFrom(e.target.value)}>
              <Options list={places.map((s) => ({ id: s.loc, title: `${s.loc} — ${num(s.qty)} ${p?.unit || ""}` }))} />
            </select>
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Откуда берём</span>
            <Note tone="warn">Этого товара нет на складе.</Note>
          </div>
        )) : null}
        <Field label="Количество" hint={p ? `в ${p.unit}${p.cost ? ` · цена ${money(p.cost)} за ${p.unit}` : ""}` : undefined}>
          <input name="qty" type="number" min={0} step="any" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Комментарий">
          <input name="note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Для чего, кому передали, что с остатком" />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}>
          <Button variant="primary" type="submit" disabled={Boolean(productId) && !places.length}>Выписать в расходы</Button>
        </div>
      </form>
    </>
  );
}

/** Расход со склада в заказ; с requestId заказ закреплён и не выбирается */
export function openExpense(o: { requestId?: number } = {}) {
  const requestId = o.requestId ? Number(o.requestId) : null;
  openDrawer(() => <ExpenseForm initRequestId={requestId} lockRequest={Boolean(o.requestId)} />);
}

/* ---------- Новый товар / карточка товара ---------- */
function ProductForm({ p }: { p: Product | null }) {
  const [error, setError] = useState("");
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = {
      name: formValue(fd, "name"), sku: formValue(fd, "sku"), category: formValue(fd, "category"), specs: formValue(fd, "specs"),
      unit: formValue(fd, "unit"), min_qty: Number(fd.get("min_qty")) || 0, cost: Number(fd.get("cost")) || 0,
    };
    if (!values.name || !values.sku) return setError("Впишите наименование и артикул");
    if (db.list("products").some((x) => x.sku.toLowerCase() === values.sku.toLowerCase() && x.id !== p?.id)) return setError("Такой артикул уже есть");
    if (p) { db.patch("products", p.id, values); toast("Карточка сохранена"); openProduct(p.id); }
    else {
      const created = db.insert("products", { ...values, price: 0 });
      toast("Товар добавлен — примите его на место");
      openOperation("in", { productId: created.id });
    }
  };
  const remove = () => {
    if (!p) return;
    db.remove("products", p.id);
    closeDrawer();
    toast("Товар удалён");
  };
  return (
    <>
      <DHead title={p ? "Карточка товара" : "Новый товар"} />
      <form className={grid2} onSubmit={save}>
        <Field label="Наименование" className="col-span-full">
          <input name="name" required maxLength={160} defaultValue={p?.name || ""} placeholder="Воздуховод круглый Ø315" autoFocus />
        </Field>
        <Field label="Артикул"><input name="sku" required maxLength={40} defaultValue={p?.sku || ""} placeholder="D-315" /></Field>
        <Field label="Категория"><select name="category" defaultValue={p?.category}><Options list={CATEGORIES} /></select></Field>
        <Field label="Характеристики" className="col-span-full">
          <input name="specs" maxLength={200} defaultValue={p?.specs || ""} placeholder="Диаметр, толщина металла, производительность, напряжение" />
        </Field>
        <Field label="Единица"><select name="unit" defaultValue={p?.unit || "шт."}><Options list={UNITS} /></select></Field>
        <Field label="Минимальный остаток" hint="Ниже — попадёт в «Закупку»">
          <input name="min_qty" type="number" min={0} step="any" defaultValue={p?.min_qty ?? 0} />
        </Field>
        <Field label="Цена, ₽"><input name="cost" type="number" min={0} step={0.01} defaultValue={p?.cost ?? ""} /></Field>
        {error ? <div className="col-span-full"><FormError>{error}</FormError></div> : null}
        <div className={cx(btnRow, "col-span-full")}>
          <Button variant="primary" type="submit">{p ? "Сохранить" : "Добавить товар"}</Button>
          {p && !qtyOf(p.id) ? <ArmedButton variant="danger" question="Точно удалить?" onConfirm={remove}>Удалить товар</ArmedButton> : null}
        </div>
      </form>
    </>
  );
}

function openProductForm(p: Product | null) {
  openDrawer(() => <ProductForm p={p} />, { wide: true });
}

const view: View = { title: () => "Склад", Component: Warehouse };
export default view;
