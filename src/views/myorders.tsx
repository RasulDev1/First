"use client";
// «Мои заказы» (мастер и стажёр): только свои заказы, статус и сколько мастер заработает в этом месяце.
// Мастер отмечает два шага: «Выехал на замеры» и «Завершён»; остальные статусы ставятся сами по действиям менеджера.
import { money, dateTime } from "@/lib/core";
import { ACTIVE_STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { payOf } from "@/lib/pay";
import { statusAt, setStatus, log } from "@/lib/orders";
import { currentUser } from "@/lib/auth";
import type { Request, Staff, StatusId } from "@/lib/types";
import { ArmedButton, Button, DHead, DSec, Empty, Kv, StatusPill, Table, rowClickable } from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import type { View } from "./types";

const monthOf = (iso: string) => { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
export const mine = (me: Staff) => db.list("requests").filter((r) => r.master_id === me.master_id);
export const visible = (r: Request) => ACTIVE_STATUSES.includes(r.status) || (r.status === "done" && Boolean(r.done_at) && monthOf(r.done_at!));
export const Earn = ({ r }: { r: Request }) => (r.amount ? <>{money(payOf(r))}</> : <span className="text-muted">цена не согласована</span>);

const nextStep = (r: Request) => ({
  assigned: "Дальше: выехать на замеры",
  measure: r.measured_at ? "Менеджер оформляет смету" : "Дальше: сделать замеры",
  pricing: "Менеджер согласует стоимость",
  in_work: "Дальше: выполнить работы и завершить заказ",
  done: "Заказ завершён",
} as Partial<Record<StatusId, string>>)[r.status] ?? "";

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
        <b>{r.client}</b>
        {r.phone ? <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="block text-center no-underline rounded-card bg-brand text-white font-medium px-4 py-3.5">Позвонить {r.phone}</a> : null}
        <a href={`https://yandex.ru/maps/?text=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer"
          className="block text-center no-underline rounded-card bg-surface-2 text-ink font-medium px-4 py-3.5">Открыть адрес на карте</a>
      </DSec>
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
  const orders = mine(user).filter(visible).sort((a, b) => Date.parse(statusAt(b)) - Date.parse(statusAt(a)));
  return (
    <>
      {orders.length ? (
        <div className="flex flex-col gap-3">
          {orders.map((r) => (
            <button key={r.id} type="button" onClick={() => openDrawer(() => <Detail id={r.id} />)}
              className="text-left flex flex-col gap-2 p-5 bg-surface border border-black/[.04] rounded-card shadow-card cursor-pointer hover:shadow-[0_6px_12px_-2px_rgba(0,0,0,.08)]">
              <span className="flex items-center justify-between gap-2"><b className="text-lg tabular-nums">№{r.id}</b><StatusPill id={r.status} /></span>
              <b className="text-base">{r.address}</b>
              <span className="text-ink-2">{r.service}</span>
              <span className="text-brand font-semibold">{nextStep(r)}</span>
              <span className="flex items-center justify-between gap-2 pt-3 border-t border-line/70 text-sm text-ink-2">
                <span>{r.visit_at ? `Выезд: ${dateTime(r.visit_at)}` : "Выезд не отмечен"}</span>
                <b className="text-ink tabular-nums"><Earn r={r} /></b>
              </span>
            </button>
          ))}
        </div>
      ) : <Empty title="Заказов пока нет">Когда менеджер назначит вам заказ, он появится здесь.</Empty>}
    </>
  );
}

const view: View = { title: () => "Мои заказы", Component: MyOrders };
export default view;
