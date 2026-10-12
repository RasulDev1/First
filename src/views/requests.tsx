"use client";
// «Заказы» (менеджер и руководитель): единый список по порядку с сортировками, создание и удаление заказов, мастер, выезд, статусы,
// сумма договора, расходы со склада (их добавляет только складовщик) и история изменений.
// Складовщик видит заказы в урезанном виде и только выписывает материал в «Расходы».
import { useReducer, useRef, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { storage, money, dateTime, dateShort, localDay } from "@/lib/core";
import { STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { isWarehouse } from "@/lib/auth";
import { pushComment } from "@/lib/comments";
import { levelTitle, statusAt } from "@/lib/orders";
import { expenseTotal } from "@/lib/stock";
import type { Request, Staff } from "@/lib/types";
import { Button, CommentForm, CommentsList, Empty, IconButton, Kv, Options, StatusPill, Table, buttonClass, cx, rowClickable } from "@/components/ui";
import { openRequest, openCreate, openNewOrder, openPayment, saveAmount } from "./requests/card";
import { EstimateTab, openEstimate } from "./requests/estimate";
import { SurveyView } from "./requests/survey";
import {
  Expenses, GuardButton, HistoryList, OrderHistory, P, allowed, cityOf, inlineForm, masterName, muted, orderNo, save, sheetCols,
  staffName, streetOf, useGuard,
} from "./requests/shared";
import type { View } from "./types";

export { openRequest, openNewOrder };

/* ---------- Состояние раздела: живёт, пока открыта вкладка браузера ---------- */
type SortKey = "updated" | "id" | "created" | "done" | "phone" | "city" | "street" | "status";
const F0 = { created: "", done: "", phone: "", city: "", street: "", status: "" };
type Filters = typeof F0;
const ui = {
  sort: { key: "updated" as SortKey, dir: -1 }, // по умолчанию — по последней смене статуса, свежие сверху
  sel: null as number | null,                    // выбранный заказ: открыт в нижней панели
  tab: "main",                                   // вкладка нижней панели
  query: "",
  F: { ...F0 } as Filters,
  formKey: 0,
  sheetH: null as number | null,
};

function matches(r: Request) {
  const { F, query } = ui;
  const c = localDay(new Date(r.created_at)), d = r.done_at ? localDay(new Date(r.done_at)) : null;
  if (F.created && c !== F.created) return false;
  if (F.done && d !== F.done) return false;
  if (F.phone && !r.phone.replace(/\D/g, "").includes(F.phone.replace(/\D/g, "")) && !r.phone.includes(F.phone)) return false;
  if (F.city && !cityOf(r).toLowerCase().replace(/^г\.\s*/, "").includes(F.city.toLowerCase().replace(/^г\.\s*/, ""))) return false;
  if (F.street && !streetOf(r).toLowerCase().includes(F.street.toLowerCase())) return false;
  if (F.status && r.status !== F.status) return false;
  if (!query) return true;
  const hay = `${r.id} ${r.client} ${r.phone} ${r.address} ${r.service} ${masterName(r.master_id)}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

const sortValue: Record<SortKey, (r: Request) => number | string | null> = {
  updated: (r) => new Date(statusAt(r)).getTime(),
  id: (r) => r.id,
  created: (r) => new Date(r.created_at).getTime(),
  done: (r) => (r.done_at ? new Date(r.done_at).getTime() : null),
  phone: (r) => r.phone.replace(/\D/g, ""),
  city: (r) => cityOf(r).toLowerCase(),
  street: (r) => streetOf(r).toLowerCase(),
  status: (r) => STATUSES.findIndex((s) => s.id === r.status),
};

function sorted(list: Request[]) {
  const val = sortValue[ui.sort.key], dir = ui.sort.dir;
  return list.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // без значения — в конец
    return (x < y ? -1 : x > y ? 1 : 0) * dir || b.id - a.id;
  });
}

const COLS: [SortKey, string][] = [["id", "№"], ["created", "Дата оформления"], ["done", "Дата завершения"], ["phone", "Номер клиента"], ["city", "Город"], ["street", "Улица"], ["status", "Статус заказа"]];

/* ---------- Фильтры ---------- */
const fltBtn = "!w-full !h-[42px] !min-h-[42px] !px-1.5 !py-0 !text-sm";
const fltCtl = "!h-[42px] !min-h-[42px] !px-2.5 !py-0 !text-sm !rounded-none";
function Flt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11.5px] font-bold text-muted whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      {children}
    </label>
  );
}

/* ---------- Нижняя панель выбранного заказа ---------- */
const TABS: [string, string][] = [["main", "Основное"], ["survey", "Замеры"], ["estimate", "Смета"], ["pay", "Оплата"], ["exp", "Расходы"], ["hist", "История"]];
const clampH = (vh: number) => Math.round(Math.min(90, Math.max(15, vh)));

function SheetMain({ r, user }: { r: Request; user: Staff }) {
  const master = db.find("masters", r.master_id);
  const warehouse = isWarehouse(user);
  return (
    <>
      <Kv wide items={[
        ["Город", cityOf(r) || "—"],
        ["Улица", streetOf(r)],
        warehouse ? null : ["Клиент", r.client],
        warehouse ? null : ["Телефон", r.phone, "tabular-nums"],
        ["Услуга", `${r.service}${r.object ? ` · ${r.object}` : ""}`],
        ["Мастер", master ? `${master.name} · ${levelTitle(master)}` : <span className={muted}>не назначен</span>],
        ["Выезд", r.visit_at ? dateTime(r.visit_at) : "—"],
        warehouse ? null : ["Менеджер", r.manager_id ? staffName(r.manager_id) : "—"],
        ["Оформлен", `${dateTime(r.created_at)}${r.source ? ` · ${r.source}` : ""}`],
        r.done_at ? ["Завершён", dateTime(r.done_at)] : null,
        r.note ? ["Со слов клиента", r.note] : null,
      ]} />
      <div className="mt-4">
        <h4 className="m-0 mb-2 text-sm font-bold">Комментарии</h4>
        <CommentsList list={r.comments} />
        {warehouse ? null : <CommentForm stacked onSend={(text) => {
          if (!pushComment(r, text, user)) return false;
          save("Комментарий добавлен");
        }} />}
      </div>
    </>
  );
}

function SheetPay({ r, user, readOnly }: { r: Request; user: Staff; readOnly?: boolean }) {
  const g = useGuard(user);
  const paid = (r.payments || []).reduce((n, p) => n + p.sum, 0);
  const cost = expenseTotal(r);
  const amount = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("amount");
    if (!g.check(r)) return;
    saveAmount(r, value, user);
  };
  return (
    <div className={sheetCols}>
      <div>
        <Kv wide items={[
          ["Сумма договора", <b key="a">{money(r.amount || 0)}</b>, "tabular-nums"],
          ["Оплачено", money(paid), "tabular-nums"],
          ["Остаток", <b key="l">{money(Math.max(0, (r.amount || 0) - paid))}</b>, cx("tabular-nums", (r.amount || 0) - paid > 0 && "text-bad")],
          ["Материалы со склада", money(cost), "tabular-nums"],
          ["Прибыль", money((r.amount || 0) - cost), "tabular-nums"],
        ]} />
        {readOnly ? null : <form key={r.amount || 0} className={cx(inlineForm, "mt-2.5")} onSubmit={amount}>
          <input name="amount" type="number" min="0" step="100" inputMode="numeric" defaultValue={r.amount || ""} placeholder="Сумма договора" aria-label="Сумма договора, ₽" />
          <GuardButton g={g} type="submit">Сохранить сумму</GuardButton>
        </form>}
      </div>
      <div>
        {(r.payments || []).length ? (
          <HistoryList items={(r.payments || []).map((p, i) => ({ p, i })).reverse().map(({ p, i }) => ({
            key: i,
            main: <span><b className="font-semibold tabular-nums">{money(p.sum)}</b>{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>,
            sub: `${dateTime(p.at)}${p.by ? ` · ${p.by}` : ""}`,
          }))} />
        ) : <p className={cx(P, muted)}>Оплат пока не было.</p>}
        {r.status === "cancelled" || readOnly ? null : (
          <Button variant="primary" onClick={() => { if (allowed(r, user)) openPayment(r.id); }}>Внести оплату</Button>
        )}
      </div>
    </div>
  );
}

function Sheet({ r, user, onClose, onTab, spaceRef }: {
  r: Request; user: Staff; onClose: () => void; onTab: (id: string) => void; spaceRef: RefObject<HTMLDivElement | null>;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const warehouse = isWarehouse(user);
  // Склад (складовщик и закупщик) видит все вкладки, но замеры, смету и оплату — только для просмотра
  const tabs = TABS;
  if (!tabs.some(([id]) => id === ui.tab)) ui.tab = "main";
  const tab = ui.tab;
  const h = ui.sheetH ?? 40;

  // Высоту панели тянут за ручку сверху (мышь или палец); запоминаем в этом браузере
  const setH = (vh: number) => {
    ui.sheetH = clampH(vh);
    for (const el of [sheetRef.current, spaceRef.current]) if (el) el.style.height = `${ui.sheetH}vh`;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const moveTo = (ev: PointerEvent) => setH(((window.innerHeight - ev.clientY) / window.innerHeight) * 100);
    const stop = () => {
      grip.removeEventListener("pointermove", moveTo);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
      storage.set("sheetH", ui.sheetH);
    };
    grip.addEventListener("pointermove", moveTo);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  };

  const estOpen = () => { if (allowed(r, user)) openEstimate(r.id); };
  const body = tab === "survey" ? <SurveyView survey={r.survey || { rooms: [], routes: [], photos: [], note: "" }} />
    : tab === "estimate" ? <EstimateTab r={r} user={user} onOpen={estOpen} readOnly={warehouse} />
    : tab === "pay" ? <SheetPay r={r} user={user} readOnly={warehouse} />
    : tab === "exp" ? <Expenses r={r} button={user.position === "storekeeper"} />
    : tab === "hist" ? <OrderHistory r={r} />
    : <SheetMain r={r} user={user} />;

  return (
    <section ref={sheetRef} aria-label={`Заказ №${r.id}`} style={{ height: `${h}vh` }}
      className="fixed left-0 min-[901px]:left-[252px] right-0 bottom-0 z-25 min-h-[120px] flex flex-col bg-surface border-t-2 border-brand shadow-[0_-8px_24px_rgba(20,50,52,.12)]">
      <div role="separator" aria-orientation="horizontal" aria-label="Потяните, чтобы изменить высоту" tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          setH((ui.sheetH ?? 40) + (e.key === "ArrowUp" ? 5 : -5));
          storage.set("sheetH", ui.sheetH);
        }}
        className="group relative flex-none h-4 -mt-0.5 cursor-ns-resize touch-none outline-none">
        <span className="absolute left-1/2 top-[5px] w-12 h-[5px] -ml-6 rounded-[3px] bg-line group-hover:bg-brand group-focus-visible:bg-brand" />
      </div>
      <header className="flex items-center gap-x-3.5 gap-y-2.5 flex-wrap px-[clamp(16px,3vw,36px)] py-2 border-b border-line">
        {warehouse ? <b>Заказ №{r.id}</b> : <button type="button" className={orderNo} onClick={() => openRequest(r.id)}>Заказ №{r.id}</button>}
        <StatusPill id={r.status} />
        <nav className="flex gap-0.5 flex-wrap">
          {tabs.map(([id, title]) => (
            <button key={id} type="button" aria-pressed={id === tab} onClick={() => onTab(id)}
              className={cx("text-sm font-bold px-3 py-1.5 border-0 border-b-2 bg-transparent cursor-pointer", id === tab ? "text-brand-deep border-brand" : "text-muted border-transparent")}>
              {title}
            </button>
          ))}
        </nav>
        <span className="ml-auto flex gap-2 items-center"><IconButton aria-label="Закрыть" onClick={onClose} /></span>
      </header>
      <div className="flex-1 overflow-auto px-[clamp(16px,3vw,36px)] pt-3 pb-4 flex flex-col gap-3 [&>button]:self-start">{body}</div>
    </section>
  );
}

/* ---------- Раздел ---------- */
function Requests({ user }: { user: Staff }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const spaceRef = useRef<HTMLDivElement>(null);
  if (ui.sheetH == null) ui.sheetH = clampH(Number(storage.get("sheetH", 40)) || 40);
  if (ui.sel && !db.find("requests", ui.sel)) ui.sel = null;
  const warehouse = isWarehouse(user);
  const filtered = Boolean(ui.query) || Object.values(ui.F).some(Boolean);
  const list = sorted(db.list("requests").filter(matches));
  const cities = [...new Set(db.list("requests").map(cityOf).filter(Boolean))].sort();
  const selected = ui.sel != null ? db.find("requests", ui.sel) : null;

  const find = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    ui.query = String(fd.get("q") || "").trim();
    for (const k of Object.keys(F0) as (keyof Filters)[]) ui.F[k] = String(fd.get(k) || "").trim();
    refresh();
  };
  const reset = () => { ui.F = { ...F0 }; ui.query = ""; ui.formKey++; refresh(); };
  const sortBy = (key: SortKey) => {
    ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: key === "created" || key === "done" ? -1 : 1 };
    refresh();
  };

  return (
    <>
      <form key={ui.formKey} onSubmit={find}
        className="grid grid-cols-2 min-[701px]:grid-cols-5 min-[1500px]:grid-cols-10 items-end gap-2 mb-3.5">
        <Flt label="Поиск"><input type="search" name="q" placeholder="Заказ №" defaultValue={ui.query} className={fltCtl} /></Flt>
        <Flt label="Дата оформления"><input type="date" name="created" defaultValue={ui.F.created} className={fltCtl} /></Flt>
        <Flt label="Дата завершения"><input type="date" name="done" defaultValue={ui.F.done} className={fltCtl} /></Flt>
        <Flt label="Номер клиента"><input type="search" name="phone" defaultValue={ui.F.phone} placeholder="+7 900…" className={fltCtl} /></Flt>
        <Flt label="Город">
          <input type="search" name="city" defaultValue={ui.F.city} placeholder="Город" list="cityList" className={fltCtl} />
          <datalist id="cityList">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </Flt>
        <Flt label="Улица"><input type="search" name="street" defaultValue={ui.F.street} placeholder="Улица, дом" className={fltCtl} /></Flt>
        <Flt label="Статус заказа">
          <select name="status" defaultValue={ui.F.status} className={fltCtl}><Options list={STATUSES} empty="Все статусы" /></select>
        </Flt>
        <button type="submit" className={cx(buttonClass(), fltBtn)}>Найти</button>
        <button type="button" className={cx(buttonClass(), fltBtn)} onClick={reset}>Сбросить</button>
        {warehouse ? null : <button type="button" className={cx(buttonClass("primary"), fltBtn)} onClick={openCreate}>Создать заказ</button>}
      </form>

      <Table>
        <thead>
          <tr>{COLS.map(([key, title]) => (
            <th key={key}>
              <button type="button" onClick={() => sortBy(key)}
                className="bg-transparent border-0 p-0 cursor-pointer uppercase hover:text-ink">
                {title}{ui.sort.key === key ? (ui.sort.dir > 0 ? " ↑" : " ↓") : ""}
              </button>
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {list.length ? list.map((r) => (
            <tr key={r.id} className={cx(rowClickable, r.id === ui.sel && "[&>td]:bg-brand-soft")}
              onClick={() => { ui.sel = ui.sel === r.id ? null : r.id; refresh(); }}>
              <td className="tabular-nums">
                <button type="button" className={orderNo} aria-label={`Открыть карточку заказа №${r.id}`}
                  onClick={(e) => { e.stopPropagation(); openRequest(r.id); }}>№{r.id}</button>
              </td>
              <td className="tabular-nums whitespace-nowrap">{dateShort(r.created_at)}</td>
              <td className="tabular-nums whitespace-nowrap">{r.done_at ? dateShort(r.done_at) : <span className={muted}>—</span>}</td>
              <td><b className="tabular-nums whitespace-nowrap">{r.phone}</b><small>{r.client}</small></td>
              <td className="whitespace-nowrap">{cityOf(r)}</td>
              <td>{streetOf(r)}</td>
              <td className="whitespace-nowrap"><StatusPill id={r.status} /></td>
            </tr>
          )) : (
            <tr><td colSpan={7}>
              <Empty title="Заказов нет">{filtered ? "Попробуйте изменить фильтры." : "Здесь появятся заказы с сайта и те, что вы добавите сами."}</Empty>
            </td></tr>
          )}
        </tbody>
      </Table>

      {selected ? (
        <>
          <div ref={spaceRef} className="flex-none" style={{ height: `${ui.sheetH}vh` }} />
          <Sheet key={selected.id} r={selected} user={user} spaceRef={spaceRef}
            onClose={() => { ui.sel = null; refresh(); }} onTab={(id) => { ui.tab = id; refresh(); }} />
        </>
      ) : null}
    </>
  );
}

const view: View = { title: () => "Заказы", Component: Requests };
export default view;
