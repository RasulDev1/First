"use client";
// «Заказы» (менеджер и руководитель): единый список по порядку с сортировками, создание и удаление заказов, мастер, выезд, статусы,
// стоимость работы, расходы со склада (их добавляет только складовщик) и история изменений.
// Складовщик видит заказы в урезанном виде и только выписывает материал в «Расходы».
import { useReducer, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { storage, money, dateTime, dateShort, localDay } from "@/lib/core";
import { STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { isDirector, isWarehouse } from "@/lib/auth";
import { pushComment } from "@/lib/comments";
import { levelTitle, statusAt } from "@/lib/orders";
import { expenseTotal } from "@/lib/stock";
import type { Request, Staff } from "@/lib/types";
import { AuditLog } from "@/components/audit-log";
import { Button, Chips, CommentForm, CommentsList, Empty, IconButton, Kv, Options, StatusPill, Table, buttonClass, cx } from "@/components/ui";
import { openRequest, openCreate, openNewOrder, openPayment, saveAmount } from "./requests/card";
import { EstimateTab } from "./requests/estimate";
import { SurveyView } from "./requests/survey";
import {
  Expenses, GuardButton, HistoryList, OrderHistory, P, allowed, cityOf, inlineForm, masterName, muted, orderNo, save, sheetCols,
  staffName, streetOf, useGuard,
} from "./requests/shared";
import { IconArrow, IconCalendar, IconPhone, IconPin, IconPlus, IconSearch } from "@/components/icons";
import { OrderNo } from "./requests/order-no";
import type { View } from "./types";

export { openRequest, openNewOrder };

/* ---------- Состояние раздела: живёт, пока открыта вкладка браузера ---------- */
type SortKey = "updated" | "id" | "created" | "done" | "phone" | "city" | "street" | "status";
const F0 = { created: "", done: "", phone: "", city: "", street: "", status: "" };
type Filters = typeof F0;
/** «13.10.2026» → «2026-10-13»; пока дата набрана не целиком — пусто (фильтр не действует) */
const isoFromRu = (v: string) => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ""; };
/** Подставляет точки при наборе: 13102026 → 13.10.2026 */
const maskDate = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("."); };
const DateField = ({ name, value }: { name: string; value: string }) => (
  <input type="text" inputMode="numeric" name={name} defaultValue={value} placeholder="дд.мм.гггг" maxLength={10} autoComplete="off" className={`${fltIn} !text-[13px]`}
    onChange={(e) => { e.currentTarget.value = maskDate(e.currentTarget.value); }} />
);
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
  const fc = isoFromRu(F.created), fd = isoFromRu(F.done);
  if (fc && c !== fc) return false;
  if (fd && d !== fd) return false;
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

/** Дата, номер клиента, имя, город, улица — один цвет, включая вложенный текст и иконки (у них свои цвета, их перебиваем) */
const CELLS = "[&>td:nth-child(n+2):nth-child(-n+6)]:!text-[#000612] [&>td:nth-child(n+2):nth-child(-n+6)_*]:!text-[#000612]";
const LEFT: SortKey[] = ["phone", "city", "street"];
const COLS: [SortKey, string][] = [["id", "№"], ["created", "Дата оформления"], ["done", "Дата завершения"], ["phone", "Номер клиента"], ["city", "Город"], ["street", "Улица"], ["status", "Статус заказа"]];

/* ---------- Фильтры ---------- */
const fltBtn = "!h-[42px] !min-h-[42px] !px-5 !py-0 !text-sm";
const fltCtl = "!h-[42px] !min-h-[42px] !px-3 !py-0 !text-sm";
const fltIn = `${fltCtl} !pl-9`;
function Flt({ label, span, icon, children }: { label: string; span: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1.5 min-w-0", span)}>
      <span className="text-[11px] font-medium tracking-[.05em] uppercase text-[#051C42] whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      {icon ? (
        <span className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280] [&_svg]:size-4">{icon}</span>
          {children}
        </span>
      ) : children}
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
        <h4 className="m-0 mb-2 text-sm font-semibold">Комментарии</h4>
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
          ["Стоимость работы", <b key="a">{money(r.amount || 0)}</b>, "tabular-nums"],
          ["Оплачено", money(paid), "tabular-nums"],
          ["Остаток", <b key="l">{money(Math.max(0, (r.amount || 0) - paid))}</b>, cx("tabular-nums", (r.amount || 0) - paid > 0 && "text-bad")],
          ["Материалы со склада", money(cost), "tabular-nums"],
          ["Прибыль", money((r.amount || 0) - cost), "tabular-nums"],
        ]} />
        {readOnly ? null : <form key={r.amount || 0} className={cx(inlineForm, "mt-2.5")} onSubmit={amount}>
          <input name="amount" type="number" min="0" step="100" inputMode="numeric" defaultValue={r.amount || ""} placeholder="Стоимость работы" aria-label="Стоимость работы, ₽" />
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
  const tabs: [string, string][] = isDirector(user) ? [...TABS, ["log", "Журнал изменений"]] : TABS;
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

  const body = tab === "survey" ? <SurveyView survey={r.survey || { rooms: [], routes: [], photos: [], note: "" }} />
    : tab === "estimate" ? <EstimateTab r={r} user={user} readOnly={warehouse} />
    : tab === "pay" ? <SheetPay r={r} user={user} readOnly={warehouse} />
    : tab === "exp" ? <Expenses r={r} button={user.position === "storekeeper"} />
    : tab === "hist" ? <OrderHistory r={r} />
    : tab === "log" ? <AuditLog tables={["requests"]} rec={r.id} note="Все изменения этого заказа: кто, когда и что поменял." />
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
        <OrderNo id={r.id} user={user} onOpen={() => openRequest(r.id)}>Заказ №{r.id}</OrderNo>
        <StatusPill id={r.status} />
        <nav className="flex gap-0.5 flex-wrap">
          {tabs.map(([id, title]) => (
            <button key={id} type="button" aria-pressed={id === tab} onClick={() => onTab(id)}
              className={cx("text-sm font-medium px-3 py-1.5 border-0 border-b-2 bg-transparent cursor-pointer", id === tab ? "text-brand-deep border-brand" : "text-muted border-transparent")}>
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
function RequestsList({ user }: { user: Staff }) {
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
        className="grid grid-cols-2 min-[1000px]:grid-cols-12 items-end gap-x-3 gap-y-4 mb-5">
        <Flt span="min-[1000px]:col-span-4" label="Поиск" icon={<IconSearch />}><input type="search" name="q" placeholder="Заказ №" defaultValue={ui.query} className={fltIn} /></Flt>
        <Flt span="min-[1000px]:col-span-2 order-4" label="Дата оформления" icon={<IconCalendar />}><DateField name="created" value={ui.F.created} /></Flt>
        <Flt span="min-[1000px]:col-span-2 order-5" label="Дата завершения" icon={<IconCalendar />}><DateField name="done" value={ui.F.done} /></Flt>
        <Flt span="min-[1000px]:col-span-3" label="Номер клиента" icon={<IconPhone />}><input type="search" name="phone" defaultValue={ui.F.phone} placeholder="+7 900…" className={fltIn} /></Flt>
        <Flt span="min-[1000px]:col-span-2" label="Город" icon={<IconPin />}>
          <input type="search" name="city" defaultValue={ui.F.city} placeholder="Город" list="cityList" className={fltIn} />
          <datalist id="cityList">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </Flt>
        <Flt span="min-[1000px]:col-span-3 order-6" label="Улица" icon={<IconPin />}><input type="search" name="street" defaultValue={ui.F.street} placeholder="Улица, дом" className={fltIn} /></Flt>
        <Flt span="min-[1000px]:col-span-3" label="Статус заказа">
          <select name="status" defaultValue={ui.F.status} className={fltCtl}><Options list={STATUSES} empty="Все статусы" /></select>
        </Flt>
        <div className="col-span-full min-[1000px]:col-span-5 order-7 flex items-center gap-4">
          <button type="submit" className={cx(buttonClass(), fltBtn, "!bg-brand !border-brand !text-white hover:!bg-brand-deep hover:!border-brand-deep")}>Найти</button>
          <button type="button" className="bg-transparent border-0 p-0 text-sm text-muted cursor-pointer hover:text-heading hover:underline" onClick={reset}>Сбросить</button>
          {warehouse ? null : <button type="button" className={cx(buttonClass("primary"), fltBtn, "ml-auto gap-2")} onClick={openCreate}><IconPlus />Создать заказ</button>}
        </div>
      </form>

      <Table resize center widths={[7, 14, 14, 18, 10, 19, 18]}>
        <thead>
          <tr>{COLS.map(([key, title]) => (
            <th key={key}>
              <button type="button" onClick={() => sortBy(key)}
                className="bg-transparent border-0 p-0 cursor-pointer uppercase hover:text-ink">
                {title}{ui.sort.key === key ? <IconArrow up={ui.sort.dir > 0} className="inline size-3 ml-1 -mt-0.5" /> : null}
              </button>
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {list.length ? list.map((r) => (
            <tr key={r.id} className={cx(CELLS, r.id === ui.sel && "[&>td]:bg-brand-soft")}
              onClick={() => { ui.sel = ui.sel === r.id ? null : r.id; refresh(); }}>
              <td className="tabular-nums">
                <OrderNo id={r.id} user={user} label={`Открыть карточку заказа №${r.id}`} onOpen={() => openRequest(r.id)}>№{r.id}</OrderNo>
              </td>
              <td className="tabular-nums whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><IconCalendar className="size-3.5 text-muted" />{dateShort(r.created_at)}</span></td>
              <td className="tabular-nums whitespace-nowrap">{r.done_at ? <span className="inline-flex items-center gap-1.5"><IconCalendar className="size-3.5 text-muted" />{dateShort(r.done_at)}</span> : <span className={muted}>—</span>}</td>
              <td style={{ textAlign: "left" }}><b className="flex items-center gap-1.5 tabular-nums whitespace-nowrap font-medium text-heading"><IconPhone className="size-3.5 text-muted" />{r.phone}</b><small className="pl-5">{r.client}</small></td>
              <td className="whitespace-nowrap" style={{ textAlign: "left" }}>{cityOf(r)}</td>
              <td style={{ textAlign: "left" }}>{streetOf(r)}</td>
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

function Requests({ user }: { user: Staff }) {
  return <RequestsList user={user} />;
}

const view: View = { title: () => "Заказы", Component: Requests };
export default view;
