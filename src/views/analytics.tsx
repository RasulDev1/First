"use client";
// «Аналитика» (руководитель): заказы, конверсия и выручка за период, источники, услуги,
// загрузка мастеров и результаты менеджеров. Руководитель дополнительно видит стоимость склада.
import { useState, type CSSProperties, type ReactNode } from "react";
import { money, num, pluralize, dateShort } from "@/lib/core";
import { STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { isDirector } from "@/lib/auth";
import { stockValue, isLow, purchases, product } from "@/lib/stock";
import { payOf, materialsOf, netOf } from "@/lib/pay";
import { bonusFor } from "@/lib/bonus";
import type { Request, Staff } from "@/lib/types";
import { Chips, Empty, Kpi, Kpis, Panel, STATUS_FILL, Table, cx, rowClickable } from "@/components/ui";
import { openBonus } from "./mystats";
import type { View } from "./types";

type Tab = "revenue" | "traffic" | "services" | "buy";
const savedPeriod: Record<Tab, number> = { revenue: 90, traffic: 90, services: 90, buy: 90 }; // дней; 0 — всё время (помним между переходами по разделам)
let savedTab: Tab = "revenue";

const DAY = 864e5;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ACTIVE = ["assigned", "measure", "pricing", "in_work"];

function weekStart(d: string | number | Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const dayMonth = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

/** Столбики по неделям: одна серия, подпись значения при наведении и у последнего столбика */
function Columns({ list, period, value, format, label }: { list: Request[]; period: number; value: (r: Request) => number; format: (v: number) => string; label: string }) {
  // Если заказов нет вовсе (всё время, пустой список) — считаем с текущей недели, чтобы график не ломался
  const firstAt = period ? Date.now() - period * DAY : list.length ? Math.min(...list.map((r) => Date.parse(r.created_at))) : Date.now();
  const first = weekStart(firstAt);
  const weeks: { from: Date; v: number }[] = [];
  for (const w = new Date(first); w <= new Date(); w.setDate(w.getDate() + 7)) weeks.push({ from: new Date(w), v: 0 });
  for (const r of list) {
    const i = Math.floor((weekStart(r.created_at).getTime() - first.getTime()) / (7 * DAY));
    if (weeks[i]) weeks[i].v += value(r);
  }
  const max = Math.max(1, ...weeks.map((w) => w.v));
  const step = Math.ceil(weeks.length / 7);
  const n = { "--n": weeks.length } as CSSProperties;
  const grid = "grid grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-[3px]";
  return (
    <figure aria-label={label} className="m-0 flex flex-col gap-1.5">
      <div style={n} className={cx(grid, "relative h-40 items-end border-b border-line bg-bottom bg-[repeating-linear-gradient(to_top,var(--color-line)_0_1px,transparent_1px_40px)]")}>
        {weeks.map((w, i) => {
          const first = i === 0, last = i === weeks.length - 1;
          return (
            <div key={i} tabIndex={0} className="group relative h-full flex items-end outline-offset-0">
              <span style={{ height: `${(w.v / max) * 100}%` }}
                className={cx("w-full min-h-[2px] rounded-t-[4px] transition-colors duration-150", last ? "bg-brand" : "bg-brand-light group-hover:bg-brand group-focus:bg-brand")} />
              <span className={cx("absolute bottom-[calc(100%+6px)] z-[3] whitespace-nowrap px-2 py-1 rounded-md bg-ink text-page text-xs pointer-events-none opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 group-focus:opacity-100",
                last ? "right-0" : first ? "left-0" : "left-1/2 -translate-x-1/2")}>
                Неделя с {dayMonth(w.from)}: <b>{format(w.v)}</b>
              </span>
            </div>
          );
        })}
      </div>
      <div style={n} className={cx(grid, "text-[11px] text-muted")}>
        {weeks.map((w, i) => <span key={i} className="whitespace-nowrap overflow-visible">{i % step === 0 ? dayMonth(w.from) : ""}</span>)}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>Последняя неделя: <b className="text-ink">{format(weeks[weeks.length - 1]?.v ?? 0)}</b></span>
        <span>Максимум: {format(max)}</span>
      </div>
    </figure>
  );
}

/** Горизонтальные полосы: подпись слева, значение справа текстом */
function Bars({ rows }: { rows: { label: string; v: number; fill?: string; extra?: ReactNode }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(70px,110px)_1fr_auto] min-[561px]:grid-cols-[minmax(90px,150px)_1fr_auto] gap-2.5 items-center text-sm">
          <span className="text-ink-2 truncate">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-surface-2 overflow-hidden">
            <span style={{ width: `${(r.v / max) * 100}%` }} className={cx("block h-full min-w-[2px] rounded-r-[4px]", r.fill ?? "bg-brand")} />
          </span>
          <span className="font-extrabold text-right flex flex-col items-end leading-tight tabular-nums">
            {num(r.v)}{r.extra ? <small className="font-medium text-[11.5px] text-muted">{r.extra}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Group { key: string | number; label: string; all: number; done: number; revenue: number; pay: number; active: number }

const wide = "min-[901px]:col-span-full";

/** Данные за период: заказы, выполненные и отменённые, выручка и расходы */
function stats(period: number) {
  const list = db.list("requests").filter((r) => !period || Date.parse(r.created_at) >= Date.now() - period * DAY);
  const done = list.filter((r) => r.status === "done");
  const cancelled = list.filter((r) => r.status === "cancelled");
  const revenue = done.reduce((n, r) => n + (r.amount || 0), 0);
  const materials = done.reduce((n, r) => n + materialsOf(r), 0), salaries = done.reduce((n, r) => n + payOf(r), 0);
  const group = (key: "source" | "service" | "master_id" | "manager_id", names?: (k: string | number) => string) => {
    const map = new Map<string | number, Group>();
    for (const r of list) {
      const k = r[key] ?? "—";
      let g = map.get(k);
      if (!g) { g = { key: k, label: names ? names(k) : String(k), all: 0, done: 0, revenue: 0, pay: 0, active: 0 }; map.set(k, g); }
      g.all++;
      if (r.status === "done") { g.done++; g.revenue += r.amount || 0; g.pay += payOf(r); }
      if (ACTIVE.includes(r.status)) g.active++;
    }
    return [...map.values()].sort((a, b) => b.all - a.all);
  };
  return { list, done, cancelled, closed: done.length + cancelled.length, revenue, materials, salaries, net: revenue - materials - salaries, group };
}

const TABS: readonly (readonly [Tab, string])[] = [["revenue", "Выручка"], ["traffic", "Трафик"], ["services", "Услуги"], ["buy", "Закуп"]];
const kpiGrid = "grid grid-cols-2 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-5 gap-3";
const cell = "text-right tabular-nums";

/** Кнопки периода: у каждой вкладки свой период */
function Period({ tab, period, set }: { tab: Tab; period: number; set: (p: number) => void }) {
  return <Chips items={[[30, "30 дней"], [90, "90 дней"], [365, "Год"], [0, "Всё время"]]} active={period} onChange={(id) => { savedPeriod[tab] = Number(id); set(Number(id)); }} />;
}

function Revenue({ director }: { director: boolean }) {
  const [period, set] = useState(savedPeriod.revenue);
  const { list, done, revenue, materials, salaries, net, group } = stats(period);
  const masters = group("master_id", (id) => db.find("masters", id)?.name || "Без мастера").filter((g) => g.label !== "Без мастера");
  const managers = group("manager_id", (id) => db.find("staff", id)?.name || "Не взята").filter((g) => g.label !== "Не взята");
  return (
    <>
      <Period tab="revenue" period={period} set={set} />
      <div className={kpiGrid}>
        <Kpi label="Продажи" value={money(revenue)} sub="по выполненным заказам" tone="accent" />
        <Kpi label="Средний чек" value={money(done.length ? revenue / done.length : 0)} sub={`${num(done.length)} ${pluralize(done.length, "заказ", "заказа", "заказов")}`} />
        {director ? (
          <>
            <Kpi label="Расход на материалы" value={money(materials)} sub="по закупочным ценам" />
            <Kpi label="Зарплаты мастеров" value={money(salaries)} sub="процент от заказов" />
            <Kpi label="Чистая выручка" value={money(net)} sub={`продажи − материалы − зарплаты (${pct(net, revenue)}%)`} tone="accent" />
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-1 min-[901px]:grid-cols-2 gap-3.5">
        <Panel title="Продажи по неделям создания заказа"><Columns list={done} period={period} value={(r) => r.amount || 0} format={money} label="Продажи по неделям" /></Panel>
        {director ? <Panel title="Чистая выручка по неделям создания заказа"><Columns list={done} period={period} value={netOf} format={money} label="Чистая выручка по неделям" /></Panel> : null}
        <Panel title="Мастера" className={wide}>
          <Table>
            <thead><tr><th>Мастер</th><th className="text-right">В работе</th><th className="text-right">Выполнено</th><th className="text-right">Продажи</th>{director ? <th className="text-right">Зарплата</th> : null}</tr></thead>
            <tbody>{masters.sort((a, b) => b.revenue - a.revenue).map((g) => (
              <tr key={g.key}><td>{g.label}</td><td className={cell}>{g.active}</td><td className={cell}>{g.done}</td>
                <td className={cell}>{money(g.revenue)}</td>{director ? <td className={cell}>{money(g.pay)}</td> : null}</tr>
            ))}</tbody>
          </Table>
        </Panel>
        <Panel title="Менеджеры" className={wide}>
          <Table>
            <thead><tr><th>Менеджер</th><th className="text-right">Взято</th><th className="text-right">Выполнено</th><th className="text-right">Продажи</th><th className="text-right">Зарплата за месяц</th></tr></thead>
            <tbody>{managers.sort((a, b) => b.revenue - a.revenue).map((g) => (
              <tr key={g.key} className={rowClickable} tabIndex={0} onClick={() => openBonus(Number(g.key))}
                onKeyDown={(e) => { if (e.key === "Enter") openBonus(Number(g.key)); }}>
                <td>{g.label}</td><td className={cell}>{g.all}</td><td className={cell}>{g.done}</td>
                <td className={cell}>{money(g.revenue)}</td><td className={cell}><b>{money(bonusFor(Number(g.key)).total)}</b></td>
              </tr>
            ))}</tbody>
          </Table>
          <p className="m-0 text-muted text-[13px]">Нажмите на менеджера, чтобы увидеть зарплату по причинам.</p>
        </Panel>
      </div>
      {list.length ? null : <Empty title="За этот период заказов нет">Выберите период побольше.</Empty>}
    </>
  );
}

function Traffic() {
  const [period, set] = useState(savedPeriod.traffic);
  const { list, done, cancelled, group } = stats(period);
  const sources = group("source");
  return (
    <>
      <Period tab="traffic" period={period} set={set} />
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
        <Kpi label="Заказов" value={num(list.length)} sub="всего за период" />
        <Kpi label="Ждут менеджера" value={num(list.filter((r) => r.status === "new").length)} sub={`${pct(list.filter((r) => r.status === "new").length, list.length)}% от заказов`} />
        <Kpi label="Выполнено" value={num(done.length)} sub={`${pct(done.length, list.length)}% от заказов`} />
        <Kpi label="Отказы" value={num(cancelled.length)} sub={`${pct(cancelled.length, list.length)}% от заказов`} />
      </div>
      <div className="grid grid-cols-1 min-[901px]:grid-cols-2 gap-3.5">
        <Panel title="Новые заказы по неделям" className={wide}><Columns list={list} period={period} value={() => 1} format={(v) => num(v)} label="Заказы по неделям" /></Panel>
        <Panel title="Где сейчас заказы">
          <Bars rows={STATUSES.map((s) => ({ label: s.title, v: list.filter((r) => r.status === s.id).length, fill: STATUS_FILL[s.id] }))} />
        </Panel>
        <Panel title="Откуда приходят клиенты">
          <Bars rows={sources.map((g) => ({ label: g.label, v: g.all, extra: `${pct(g.done, g.all)}% выполнено` }))} />
        </Panel>
      </div>
      {list.length ? null : <Empty title="За этот период заказов нет">Выберите период побольше.</Empty>}
    </>
  );
}

function Services() {
  const [period, set] = useState(savedPeriod.services);
  const { group } = stats(period);
  const services = group("service");
  return (
    <>
      <Period tab="services" period={period} set={set} />
      {services.length ? (
        <Panel title="Услуги">
          <Table>
            <thead><tr><th>Услуга</th><th className="text-right">Заказов</th><th className="text-right">Выполнено</th><th className="text-right">Продажи</th><th className="text-right">Средний чек</th></tr></thead>
            <tbody>{services.map((g) => (
              <tr key={g.key}><td>{g.label}</td><td className={cell}>{g.all}</td><td className={cell}>{g.done}</td>
                <td className={cell}>{money(g.revenue)}</td><td className={cell}>{money(g.done ? g.revenue / g.done : 0)}</td></tr>
            ))}</tbody>
          </Table>
        </Panel>
      ) : <Empty title="За этот период заказов нет">Выберите период побольше.</Empty>}
    </>
  );
}

function Buy() {
  const [period, set] = useState(savedPeriod.buy);
  const { materials } = stats(period);
  const bought = purchases(period ? Date.now() - period * DAY : 0);
  const sv = stockValue();
  const low = db.list("products").filter(isLow).length;
  return (
    <>
      <Period tab="buy" period={period} set={set} />
      <div className={kpiGrid}>
        <Kpi label="Закуплено товара" value={money(bought.sum)} sub={`${num(bought.list.length)} ${pluralize(bought.list.length, "позиция", "позиции", "позиций")}`} />
        <Kpi label="Расход на материалы" value={money(materials)} sub="по закупочным ценам" />
        <Kpi label="Стоимость остатков" value={money(sv.cost)} sub="склад сейчас" />
        <Kpi label="Ниже минимума" value={low} sub="позиций сейчас" tone={low ? "bad" : undefined} />
      </div>
      <Panel title="Закупленный товар">
        {bought.list.length ? (
          <Table>
            <thead><tr><th>Товар</th><th className="text-right">Принято</th><th className="text-right">Сумма закупки</th><th>Последняя приёмка</th></tr></thead>
            <tbody>{bought.list.slice(0, 15).map((b) => {
              const p = product(b.product_id);
              return <tr key={b.product_id}><td>{p?.name || "Удалённый товар"}<small>{p?.sku}</small></td><td className={cell}>{num(b.qty)} {p?.unit}</td>
                <td className={cell}>{money(b.sum)}</td><td className="whitespace-nowrap">{dateShort(b.last)}</td></tr>;
            })}</tbody>
            <tfoot><tr><td>Итого закуплено{bought.list.length > 15 ? ` (все ${bought.list.length} позиций, выше — 15 крупнейших)` : ""}</td><td /><td className={cell}><b>{money(bought.sum)}</b></td><td /></tr></tfoot>
          </Table>
        ) : <p className="m-0 text-muted">За этот период товар не принимали.</p>}
      </Panel>
    </>
  );
}

function Analytics({ user }: { user: Staff }) {
  const director = isDirector(user);
  const tabs = director ? TABS : TABS.filter(([id]) => id !== "buy");
  const [tab, setTabState] = useState<Tab>(tabs.some(([id]) => id === savedTab) ? savedTab : "revenue");
  const setTab = (t: string) => { savedTab = t as Tab; setTabState(t as Tab); };
  return (
    <>
      <Chips tabs items={tabs.map(([id, label]) => [id, label] as const)} active={tab} onChange={setTab} />
      {tab === "revenue" ? <Revenue director={director} /> : tab === "traffic" ? <Traffic /> : tab === "services" ? <Services /> : <Buy />}
    </>
  );
}

const view: View = { title: () => "Аналитика", Component: Analytics };
export default view;
