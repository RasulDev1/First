"use client";
// «Главная»: что требует внимания сегодня — своё для каждой роли.
import type { ReactNode } from "react";
import { money, num, dateTime, localDay } from "@/lib/core";
import { db } from "@/lib/db";
import { isDirector, isManager, isWarehouse } from "@/lib/auth";
import { isLow, qtyOf, product, toBuy } from "@/lib/stock";
import type { Request, Staff, Task } from "@/lib/types";
import { Count, Kpi, Kpis, Loc, Panel, StatusPill, cx } from "@/components/ui";
import { go } from "@/components/nav";
import { openRequest } from "./requests";
import type { View } from "./types";

const DAY = 864e5;
const ACTIVE = ["assigned", "measure", "pricing", "in_work"];
const byTime = <K extends string>(key: K) => <T extends { [k in K]?: string | null }>(a: T, b: T) =>
  Date.parse(String(a[key])) - Date.parse(String(b[key]));

/** Строка короткого списка: слева главное, справа — время или статус */
function MiniRow({ main, sub, side, onClick }: { main: ReactNode; sub?: ReactNode; side?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("flex justify-between gap-3 px-1 py-3 border-0 border-b border-line/70 last:border-b-0 bg-transparent text-left", onClick && "cursor-pointer hover:bg-surface-2")}>
      <span className="flex flex-col min-w-0"><b>{main}</b>{sub ? <small className="text-[12.5px] text-muted truncate">{sub}</small> : null}</span>
      <span className="flex flex-col items-end text-right flex-none gap-0.5 text-[12.5px]">{side}</span>
    </Tag>
  );
}
const MiniList = ({ children }: { children: ReactNode }) => <div className="flex flex-col">{children}</div>;
const Muted = ({ children }: { children: ReactNode }) => <p className="m-0 text-muted">{children}</p>;

const ReqRow = ({ r, side }: { r: Request; side: ReactNode }) =>
  <MiniRow main={`№${r.id} · ${r.client}`} sub={`${r.service} · ${r.address}`} side={side} onClick={() => openRequest(r.id)} />;

const visitsOf = (list: Request[]) => {
  const today = localDay(new Date()), tomorrow = localDay(new Date(Date.now() + DAY));
  return list.filter((r) => ACTIVE.includes(r.status) && r.visit_at && [today, tomorrow].includes(localDay(new Date(r.visit_at))))
    .sort(byTime("visit_at"));
};

/** Когда выездов нет, вместо пустой карточки — одна спокойная строка */
const NoVisits = ({ title }: { title: string }) => (
  <p className="m-0 px-4 py-2.5 rounded-card bg-surface border border-black/[.04] text-sm text-muted"><b className="font-semibold text-heading">{title}:</b> выездов на сегодня и завтра нет.</p>
);

function VisitsPanel({ list, title }: { list: Request[]; title: string }) {
  const today = localDay(new Date());
  const visits = visitsOf(list);
  return (
    <Panel title={title}>
      {visits.length ? <MiniList>{visits.map((r) => (
        <ReqRow key={r.id} r={r} side={<>
          <b className="text-[15px]">{localDay(new Date(r.visit_at!)) === today ? "Сегодня" : "Завтра"} {new Date(r.visit_at!).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
          <small className="text-[12.5px] text-muted">{db.find("masters", r.master_id)?.name || ""}</small>
        </>} />
      ))}</MiniList> : <Muted>На сегодня и завтра выездов нет.</Muted>}
    </Panel>
  );
}

function TasksPanel({ list, title, user }: { list: Task[]; title: string; user: Staff }) {
  const open = list.filter((t) => !t.done_at).sort(byTime("due")).slice(0, 6);
  return (
    <Panel title={title}>
      {open.length ? <MiniList>{open.map((t) => {
        const late = Date.parse(t.due) < Date.now();
        return <MiniRow key={t.id} main={t.title} sub={isDirector(user) ? db.find("staff", t.assignee_id)?.name || "" : ""} onClick={() => go("tasks")}
          side={<small className={cx("text-[12.5px]", late ? "text-bad" : "text-muted")}>{late ? "Просрочено · " : ""}{dateTime(t.due)}</small>} />;
      })}</MiniList> : <Muted>Открытых задач нет.</Muted>}
    </Panel>
  );
}

function NewPanel({ requests }: { requests: Request[] }) {
  const fresh = requests.filter((r) => r.status === "new").sort(byTime("created_at"));
  return (
    <Panel title={<>Новые заказы {fresh.length ? <Count n={fresh.length} warn /> : null}</>}>
      {fresh.length ? <MiniList>{fresh.slice(0, 6).map((r) => (
        <ReqRow key={r.id} r={r} side={<><small className="text-[12.5px] text-muted">{dateTime(r.created_at)}</small><small className="text-[12.5px] text-muted">{r.source}</small></>} />
      ))}</MiniList> : <Muted>Все заказы разобраны.</Muted>}
    </Panel>
  );
}

function StockPanel() {
  const low = db.list("products").filter(isLow).sort((a, b) => qtyOf(a.id) / (a.min_qty || 1) - qtyOf(b.id) / (b.min_qty || 1));
  return (
    <Panel title={<>Заканчивается {low.length ? <Count n={low.length} warn /> : null}</>}>
      {low.length ? <MiniList>{low.slice(0, 7).map((p) => (
        <MiniRow key={p.id} main={p.name} sub={`${p.sku} · минимум ${num(p.min_qty)} ${p.unit}`} onClick={() => go("warehouse")}
          side={<><b className="text-[15px] tabular-nums text-bad">{num(qtyOf(p.id))} {p.unit}</b><small className="text-[12.5px] text-muted">купить {num(toBuy(p))}</small></>} />
      ))}</MiniList> : <Muted>Всего хватает.</Muted>}
    </Panel>
  );
}

/** Полоса «Требует внимания»: что директору нужно сделать сегодня, и кнопка к каждому делу */
function Attention() {
  const fresh = db.list("requests").filter((r) => r.status === "new" && !r.manager_id).length;
  const late = db.list("tasks").filter((t) => !t.done_at && Date.parse(t.due) < Date.now()).length;
  const empty = db.list("products").filter((p) => qtyOf(p.id) <= 0).length;
  const items: { n: number; label: string; act: string; to: string }[] = [
    { n: fresh, label: "Новые заказы без менеджера", act: "Назначить менеджера", to: "requests" },
    { n: late, label: "Просроченные задачи", act: "Открыть задачи", to: "tasks" },
    { n: empty, label: "Товары закончились", act: "Открыть склад", to: "warehouse" },
  ].filter((i) => i.n > 0);
  return (
    <Panel title="Требует вашего внимания сегодня">
      {items.length ? (
        <div className="grid grid-cols-1 min-[901px]:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {items.map((i) => (
            <div key={i.to} className="flex items-center gap-3 px-4 py-3 rounded-card bg-warn-soft/60 border border-warn/20">
              <b className="font-display text-[28px] leading-none tabular-nums text-warn">{i.n}</b>
              <span className="flex flex-col gap-1.5 min-w-0 items-start">
                <span className="text-sm font-medium text-heading leading-tight">{i.label}</span>
                <button type="button" onClick={() => go(i.to)} className="p-0 border-0 bg-transparent cursor-pointer text-[13px] font-semibold text-brand hover:underline underline-offset-2">{i.act} →</button>
              </span>
            </div>
          ))}
        </div>
      ) : <Muted>Всё под контролем: срочных дел нет.</Muted>}
    </Panel>
  );
}

const grid = "grid grid-cols-1 min-[901px]:grid-cols-2 gap-3.5";

function Home({ user }: { user: Staff }) {
  const requests = db.list("requests");
  const hello = <p className="m-0 text-ink-2 max-w-[70ch]">Здравствуйте, {user.name.split(" ")[0]}! Сегодня {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}.</p>;

  if (isWarehouse(user)) {
    const working = requests.filter((r) => ACTIVE.includes(r.status))
      .sort((a, b) => Date.parse(a.visit_at || a.created_at) - Date.parse(b.visit_at || b.created_at)).slice(0, 8);
    const moves = [...db.list("moves")].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 6);
    return (
      <>
        {hello}
        <div className={grid}>
          <StockPanel />
          <Panel title={<>Заказы в работе {working.length ? <Count n={working.length} /> : null}</>}>
            {working.length ? <MiniList>{working.map((r) => (
              <MiniRow key={r.id} main={`Заказ №${r.id}`} sub={`${db.find("masters", r.master_id)?.name || "мастер не назначен"} · ${r.address}`} onClick={() => openRequest(r.id)}
                side={<small className="text-[12.5px] text-muted">{r.visit_at ? `выезд ${dateTime(r.visit_at)}` : ""}</small>} />
            ))}</MiniList> : <Muted>Заказов в работе нет.</Muted>}
          </Panel>
          <Panel title="Последние движения">
            <MiniList>{moves.map((m) => (
              <MiniRow key={m.id} main={product(m.product_id)?.name || ""} sub={`${m.by} · ${dateTime(m.at)}`}
                side={<span className="flex items-center gap-1">{m.kind === "move" ? <><Loc code={m.from!} /> → <Loc code={m.to!} /></> : <Loc code={(m.to || m.from)!} />}</span>} />
            ))}</MiniList>
          </Panel>
        </div>
      </>
    );
  }

  const month = requests.filter((r) => Date.parse(r.created_at) >= Date.now() - 30 * DAY);
  const done = month.filter((r) => r.status === "done");
  const compact = isDirector(user); // у директора плитки — справка под полосой внимания, поэтому мельче
  const kpis = (
    <Kpis small={compact}>
      <Kpi small={compact} label="Новые заказы" value={requests.filter((r) => r.status === "new").length} />
      <Kpi small={compact} label="Заказы в работе" value={requests.filter((r) => ACTIVE.includes(r.status)).length} />
      <Kpi small={compact} label="Заказов за 30 дней" value={month.length} sub={`${done.length} выполнено`} />
      <Kpi small={compact} label="Продажи за 30 дней" value={money(done.reduce((n, r) => n + (r.amount || 0), 0))} sub="по выполненным" tone="accent" />
    </Kpis>
  );

  if (isManager(user)) {
    const mine = requests.filter((r) => r.manager_id === user.id);
    const working = mine.filter((r) => ACTIVE.includes(r.status)).slice(0, 6);
    return (
      <>
        {hello}{kpis}
        <div className={grid}>
          <NewPanel requests={requests} />
          <VisitsPanel list={mine} title="Мои выезды на сегодня и завтра" />
          <TasksPanel list={db.list("tasks").filter((t) => t.assignee_id === user.id)} title="Мои задачи" user={user} />
          <Panel title="Мои заказы в работе">
            {working.length ? <MiniList>{working.map((r) => <ReqRow key={r.id} r={r} side={<StatusPill id={r.status} />} />)}</MiniList> : <Muted>Нет заказов в работе.</Muted>}
          </Panel>
        </div>
      </>
    );
  }

  const visitsTitle = "Выезды мастеров сегодня и завтра";
  const noVisits = !visitsOf(requests).length;
  return (
    <>
      {hello}<Attention />{kpis}
      {noVisits ? <NoVisits title={visitsTitle} /> : null}
      <div className={grid}>
        <NewPanel requests={requests} />
        {noVisits ? null : <VisitsPanel list={requests} title={visitsTitle} />}
        <TasksPanel list={db.list("tasks")} title="Задачи менеджеров" user={user} />
        <StockPanel />
      </div>
    </>
  );
}

const view: View = { title: () => "Главная", Component: Home };
export default view;
