"use client";
// «Моя статистика» (менеджер): оформленные им заказы и их сумма, плюс кнопка «Зарплата» с разбивкой по причинам.
import { useState } from "react";
import { money, num, dateShort } from "@/lib/core";
import { db } from "@/lib/db";
import { bonusFor } from "@/lib/bonus";
import type { Request, Staff } from "@/lib/types";
import { Button, Chips, DHead, DSec, Empty, Kpi, Kpis, StatusPill, Table, rowClickable } from "@/components/ui";
import { openDrawer } from "@/components/drawer";
import { openRequest } from "./requests";
import type { View } from "./types";

let savedPeriod = 30; // дней; 0 — всё время (помним между переходами по разделам)

const MONTH = () => new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

function BonusCard({ managerId }: { managerId: number }) {
  const m = db.find("staff", managerId);
  const { rows, total } = bonusFor(managerId);
  return (
    <>
      <DHead eyebrow={`Зарплата за ${MONTH()}`} title={m?.name || "Менеджер"} />
      <DSec>
        <Table center>
          <thead><tr><th>Причина</th><th>Сумма</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.earned ? undefined : "[&_td]:text-muted"}>
                <td style={{ textAlign: "left" }}><b>{r.title}</b><small>{r.rule}</small></td>
                <td className="tabular-nums">
                  {r.earned ? <b>{money(r.amount)}</b> : <span className="text-muted">{r.bonus ? `+${money(r.bonus)} при выполнении` : "—"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td style={{ textAlign: "left" }}>Итого к выплате</td><td className="tabular-nums"><b>{money(total)}</b></td></tr></tfoot>
        </Table>
        <p className="m-0 text-muted text-[13px]">Считается по заказам, завершённым в этом месяце. Размеры оклада и надбавок настраиваются в файле src/lib/bonus.ts.</p>
      </DSec>
    </>
  );
}

/** Окно «Премия»: из чего складывается выплата менеджеру за текущий месяц */
export function openBonus(managerId: number) {
  openDrawer(() => <BonusCard managerId={managerId} />);
}

function MyStats({ user }: { user: Staff }) {
  const [period, setPeriodState] = useState(savedPeriod);
  const setPeriod = (p: number) => { savedPeriod = p; setPeriodState(p); };
  const since = period ? Date.now() - period * 864e5 : 0;
  const list = db.list("requests").filter((r) => r.manager_id === user.id && Date.parse(r.created_at) >= since).sort((a, b) => b.id - a.id);
  const done = list.filter((r) => r.status === "done");
  const sum = (rs: Request[]) => rs.reduce((n, r) => n + (r.amount || 0), 0);
  const placed = list.filter((r) => r.status !== "cancelled");
  const { total } = bonusFor(user.id);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <Chips items={[[30, "30 дней"], [90, "90 дней"], [0, "Всё время"]]} active={period} onChange={(id) => setPeriod(Number(id))} />
        <Button variant="primary" className="ml-auto" onClick={() => openBonus(user.id)}>Премия</Button>
      </div>
      <Kpis>
        <Kpi label="Оформлено заказов" value={num(list.length)} sub={`${num(done.length)} завершено`} />
        <Kpi label="Сумма оформленных" value={money(sum(placed))} sub="без отменённых" tone="accent" />
        <Kpi label="Сумма завершённых" value={money(sum(done))} sub={`${num(done.length)} заказов`} />
        <Kpi label={`Зарплата за ${MONTH()}`} value={money(total)} sub="нажмите «Премия», чтобы увидеть из чего" />
      </Kpis>
      {list.length ? (
        <Table resize center widths={[10, 18, 32, 24, 16]}>
          <thead><tr><th>№</th><th>Оформлен</th><th>Клиент</th><th>Статус заказа</th><th>Сумма</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={rowClickable} onClick={() => openRequest(r.id)}>
                <td className="tabular-nums"><b>№{r.id}</b></td>
                <td className="tabular-nums whitespace-nowrap">{dateShort(r.created_at)}</td>
                <td style={{ textAlign: "left" }}>{r.client}<small>{r.service}</small></td>
                <td className="whitespace-nowrap"><StatusPill id={r.status} /></td>
                <td className="tabular-nums">{r.amount ? money(r.amount) : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <Empty title="Заказов пока нет">Здесь появятся заказы, которые вы взяли или оформили.</Empty>}
    </>
  );
}

const view: View = { title: () => "Моя статистика", Component: MyStats };
export default view;
