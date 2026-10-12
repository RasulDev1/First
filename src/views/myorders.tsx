"use client";
// «Мои заказы» (мастер и стажёр): только свои заказы, статус и сколько мастер заработает в этом месяце.
// Мастер отмечает два шага: «Выехал на замеры» и «Завершён»; остальные статусы ставятся сами по действиям менеджера.
import { money, dateTime } from "@/lib/core";
import { ACTIVE_STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { payOf, rateOf } from "@/lib/pay";
import { statusAt, setStatus, log } from "@/lib/orders";
import { currentUser } from "@/lib/auth";
import type { Request, Staff, StatusId } from "@/lib/types";
import { ArmedButton, Button, DHead, DSec, Empty, Kpi, Kpis, Kv, StatusPill, Table, rowClickable } from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import type { View } from "./types";

const monthOf = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
const mine = (me: Staff) => db.list("requests").filter((r) => r.master_id === me.master_id);
const visible = (r: Request) => ACTIVE_STATUSES.includes(r.status) || (r.status === "done" && Boolean(r.done_at) && monthOf(r.done_at!));
const Earn = ({ r }: { r: Request }) => (r.amount ? <>{money(payOf(r))}</> : <span className="text-muted">цена не согласована</span>);

function step(me: Staff, id: number, from: StatusId, to: StatusId, text: string) {
  const r = mine(me).find((x) => x.id === id);
  if (!r || r.status !== from) return;
  setStatus(r, to, me.name);
  if (to === "measure") r.visit_at = new Date().toISOString();
  db.save();
  toast(text);
}

function Detail({ id }: { id: number }) {
  const me = currentUser();
  const r = me ? mine(me).find((x) => x.id === id) : undefined;
  if (!me || !r) return <Empty title="Заказ не найден" />;
  const hist = [...(r.history || [])].reverse().filter((h) => h.text.startsWith("Статус:") || h.text.startsWith("Заказ создан"));

  const decline = () => {
    const x = mine(me).find((o) => o.id === id);
    if (!x || !["assigned", "measure"].includes(x.status)) return;
    x.declined_by = me.name;
    x.master_id = null; x.visit_at = null; x.measured_at = null;
    setStatus(x, "new", me.name);
    log(x, "Мастер отказался от заказа", me.name);
    db.save();
    closeDrawer();
    toast("Вы отказались от заказа");
  };
  const measured = () => {
    const x = mine(me).find((o) => o.id === id);
    if (!x || x.status !== "measure" || x.measured_at) return;
    x.measured_at = new Date().toISOString();
    (x.history ||= []).push({ at: x.measured_at, by: me.name, text: "Мастер: замеры сделаны" });
    db.save();
    toast("Менеджер увидит, что замеры сделаны");
  };

  return (
    <>
      <DHead eyebrow={`Заказ №${r.id}`} title={r.address}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"><StatusPill id={r.status} /></div>
      </DHead>
      <DSec>
        <Kv items={[
          ["Услуга", <>{r.service}{r.object ? ` · ${r.object}` : ""}</>],
          ["Выезд", r.visit_at ? dateTime(r.visit_at) : "—"],
          ["Вы заработаете", <b key="e"><Earn r={r} /></b>, "tabular-nums"],
        ]} />
      </DSec>
      {r.status === "assigned" ? (
        <DSec><Button variant="primary" size="big" onClick={() => step(me, r.id, "assigned", "measure", "Выезд на замеры: время записано")}>Выехал на замеры</Button></DSec>
      ) : null}
      {["assigned", "measure"].includes(r.status) ? (
        <DSec><ArmedButton variant="danger" question="Точно отказаться?" onConfirm={decline}>Отказаться от заказа</ArmedButton></DSec>
      ) : null}
      {r.status === "measure" && !r.measured_at ? (
        <DSec><Button variant="primary" size="big" onClick={measured}>Замеры сделаны</Button></DSec>
      ) : null}
      {r.status === "in_work" ? (
        <DSec><ArmedButton variant="primary" size="big" question="Точно завершён?"
          onConfirm={() => step(me, r.id, "in_work", "done", "Заказ завершён")}>Завершён</ArmedButton></DSec>
      ) : null}
      <DSec title="Статусы">
        <ol className="list-none m-0 py-0 pr-0 pl-3.5 border-l-2 border-line flex flex-col gap-2.5">
          {hist.map((h, i) => (
            <li key={i} className="relative flex flex-col before:content-[''] before:absolute before:-left-5 before:top-[7px] before:size-2.5 before:rounded-full before:bg-surface before:border-2 before:border-brand">
              <b className="font-semibold">{h.text.replace("Статус: ", "")}</b>
              <small className="text-muted">{dateTime(h.at)}</small>
            </li>
          ))}
        </ol>
      </DSec>
    </>
  );
}

function MyOrders({ user }: { user: Staff }) {
  const master = db.find("masters", user.master_id);
  const orders = mine(user).filter(visible).sort((a, b) => Date.parse(statusAt(b)) - Date.parse(statusAt(a)));
  const earned = orders.filter((r) => r.status === "done").reduce((n, r) => n + payOf(r), 0);
  const expected = orders.filter((r) => r.status !== "done").reduce((n, r) => n + payOf(r), 0);
  return (
    <>
      <Kpis>
        <Kpi tone="accent" label="Заработано в этом месяце" value={money(earned)} sub="по завершённым заказам" />
        <Kpi label="Ожидается" value={money(expected)} sub="по заказам в работе" />
        <Kpi label="Ваша ставка" value={`${rateOf(master)}%`} sub="от суммы заказа" />
      </Kpis>
      {orders.length ? (
        <Table>
          <thead><tr><th>№</th><th>Адрес</th><th>Выезд</th><th>Статус заказа</th><th className="text-right!">Вы заработаете</th></tr></thead>
          <tbody>{orders.map((r) => (
            <tr key={r.id} className={rowClickable} onClick={() => openDrawer(() => <Detail id={r.id} />)}>
              <td className="tabular-nums"><b>№{r.id}</b></td>
              <td>{r.address}<small>{r.service}</small></td>
              <td className="tabular-nums whitespace-nowrap">{r.visit_at ? dateTime(r.visit_at) : <span className="text-muted">—</span>}</td>
              <td className="whitespace-nowrap"><StatusPill id={r.status} /></td>
              <td className="text-right tabular-nums whitespace-nowrap"><b><Earn r={r} /></b></td>
            </tr>
          ))}</tbody>
        </Table>
      ) : <Empty title="Заказов пока нет">Когда менеджер назначит вам заказ, он появится здесь.</Empty>}
    </>
  );
}

const view: View = { title: () => "Мои заказы", Component: MyOrders };
export default view;
