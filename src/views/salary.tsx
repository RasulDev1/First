"use client";
// «Зарплата» (мастер и стажёр): сколько заработано в этом месяце, сумма заказов, число заказов и ставка.
import { money } from "@/lib/core";
import { db } from "@/lib/db";
import { payOf, rateOf } from "@/lib/pay";
import { statusAt } from "@/lib/orders";
import type { Staff } from "@/lib/types";
import { Kpi, Kpis, StatusPill } from "@/components/ui";
import { Earn, mine, visible } from "./myorders";
import type { View } from "./types";

function Salary({ user }: { user: Staff }) {
  const master = db.find("masters", user.master_id);
  const orders = mine(user).filter(visible).sort((a, b) => Date.parse(statusAt(b)) - Date.parse(statusAt(a)));
  const earned = orders.reduce((n, r) => n + payOf(r), 0);
  const total = orders.reduce((n, r) => n + (r.amount || 0), 0);
  return (
    <>
      <Kpis>
        <Kpi tone="accent" label="Заработано в этом месяце" value={money(earned)} sub={`${rateOf(master)}% от суммы заказов`} />
        <Kpi label="Сумма заказов" value={money(total)} sub="по всем вашим заказам за месяц" />
        <Kpi label="Заказы" value={String(orders.length)} sub="в работе и завершённые" />
        <Kpi label="Ваша ставка" value={`${rateOf(master)}%`} sub="от суммы заказа" />
      </Kpis>
      {orders.length ? (
        <div className="flex flex-col gap-2.5">
          <h3 className="m-0 text-[11px] font-medium tracking-[.05em] uppercase text-muted">По заказам</h3>
          {orders.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3.5 bg-surface border border-black/[.04] rounded-card shadow-card">
              <span className="flex flex-col gap-1 min-w-0">
                <b className="tabular-nums">№{r.id}</b>
                <StatusPill id={r.status} />
              </span>
              <b className="tabular-nums text-right"><Earn r={r} /></b>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

const view: View = { title: () => "Зарплата", Component: Salary };
export default view;
