"use client";
// «Клиенты» (руководитель и менеджер): база клиентов с поиском по имени и телефону, карточка клиента с историей заказов.
import { useState, type FormEvent, type ReactNode } from "react";
import { money, num, dateShort, formValue } from "@/lib/core";
import { db } from "@/lib/db";
import { digits, ordersOf, findByPhone } from "@/lib/clients";
import type { Client, Staff } from "@/lib/types";
import { AuditLog } from "@/components/audit-log";
import { Button, Chips, DHead, DSec, Empty, Field, FormError, Kpi, Kpis, StatusPill, Table, btnRow, rowClickable } from "@/components/ui";
import { openDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { openRequest, openNewOrder } from "./requests";
import type { View } from "./types";

interface Filter { name: string; phone: string }
let CF: Filter = { name: "", phone: "" }; // применяются кнопкой «Найти» и сохраняются между переходами

const done = (c: Client) => ordersOf(c).filter((r) => r.status === "done");
const doneSum = (c: Client) => done(c).reduce((n, r) => n + (r.amount || 0), 0);

function matches(c: Client, f: Filter) {
  if (f.name && !c.name.toLowerCase().includes(f.name.toLowerCase())) return false;
  if (f.phone && !digits(c.phone).includes(digits(f.phone)) && !c.phone.includes(f.phone)) return false;
  return true;
}

// Панель фильтров: поля и кнопки одной высоты, без скруглений
const fbar = "grid gap-2 items-end grid-cols-2 min-[701px]:grid-cols-[repeat(2,minmax(0,1fr))_repeat(3,minmax(0,150px))] [&_input]:h-[42px] [&_input]:min-h-[42px] [&_input]:px-2.5 [&_input]:py-0 [&_input]:text-sm [&_input]:rounded-lg [&_button]:w-full [&_button]:h-[42px] [&_button]:min-h-[42px] [&_button]:px-1.5 [&_button]:py-0 [&_button]:text-sm";
function Flt({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-medium tracking-[.05em] uppercase text-black truncate">{label}</span>
      {children}
    </label>
  );
}

function ClientsList() {
  const [filter, setFilter] = useState<Filter>(CF);
  const [formKey, setFormKey] = useState(0);
  const apply = (f: Filter) => { CF = f; setFilter(f); };
  const list = db.list("clients").filter((c) => matches(c, filter)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <form key={formKey} className={fbar} onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        apply({ name: formValue(fd, "name"), phone: formValue(fd, "phone") });
      }}>
        <Flt label="Имя"><input type="search" name="name" defaultValue={filter.name} placeholder="Имя или название" /></Flt>
        <Flt label="Номер телефона"><input type="search" name="phone" defaultValue={filter.phone} placeholder="+7 900…" /></Flt>
        <Button type="submit">Найти</Button>
        <Button onClick={() => { apply({ name: "", phone: "" }); setFormKey((k) => k + 1); }}>Сброс</Button>
        <Button variant="primary" onClick={() => openForm(null)}>Новый клиент</Button>
      </form>
      <Table resize>
        <thead><tr><th>Клиент</th><th>Телефон</th><th className="text-center!">Заказов</th><th className="text-center!">Сумма завершённых</th><th className="text-center!">Последний заказ</th></tr></thead>
        <tbody>
          {list.length ? list.map((c) => {
            const orders = ordersOf(c);
            return (
              <tr key={c.id} className={rowClickable} tabIndex={0} onClick={() => openClient(c.id)}>
                <td><b>{c.name}</b></td>
                <td className="tabular-nums whitespace-nowrap">{c.phone}</td>
                <td className="text-center tabular-nums">{orders.length}</td>
                <td className="text-center tabular-nums">{money(doneSum(c))}</td>
                <td className="text-center tabular-nums whitespace-nowrap">{orders[0] ? dateShort(orders[0].created_at) : "—"}</td>
              </tr>
            );
          }) : (
            <tr><td colSpan={5}>
              <Empty title="Клиентов нет">{filter.name || filter.phone ? "Попробуйте изменить поиск." : "Клиенты появляются вместе с заказами."}</Empty>
            </td></tr>
          )}
        </tbody>
      </Table>
    </>
  );
}

/* ---------- Карточка клиента ---------- */
function Detail({ id }: { id: number }) {
  const c = db.find("clients", id);
  const [tab, setTab] = useState("main");
  if (!c) return <Empty title="Клиент удалён" />;
  const orders = ordersOf(c);
  return (
    <>
      <DHead eyebrow={`Клиент · с ${dateShort(c.created_at)}`} title={c.name}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"><span className="tabular-nums">{c.phone}</span></div>
      </DHead>
      <Chips tabs items={[["main", "Основное"], ["log", "Журнал изменений"]]} active={tab} onChange={setTab} />
      {tab === "log" ? <DSec><AuditLog tables={["clients"]} rec={id} note="Все изменения этого клиента: кто, когда и что поменял." /></DSec> : <>
      <DSec>
        <Kpis small>
          <Kpi small label="Заказов" value={num(orders.length)} />
          <Kpi small label="Завершено на сумму" value={money(doneSum(c))} />
        </Kpis>
        <div className={btnRow}>
          <Button variant="primary" onClick={() => { const x = db.find("clients", id); if (x) openNewOrder(x); }}>Новый заказ</Button>
          <Button onClick={() => openForm(db.find("clients", id))}>Изменить данные</Button>
        </div>
        {c.note ? <p className="m-0 whitespace-pre-wrap">{c.note}</p> : null}
      </DSec>
      <DSec title="История заказов">
        {orders.length ? (
          <div className="flex flex-col">
            {orders.map((r) => (
              <button key={r.id} type="button" onClick={() => openRequest(r.id)}
                className="flex justify-between gap-3 px-1 py-3 border-0 border-b border-line last:border-b-0 bg-transparent text-left cursor-pointer hover:bg-surface-2">
                <span className="flex flex-col min-w-0">
                  <b>№{r.id} · {r.service}</b>
                  <small className="text-[12.5px] text-muted truncate">{r.address} · {dateShort(r.created_at)}</small>
                </span>
                <span className="flex flex-col items-end text-right flex-none gap-0.5">
                  <StatusPill id={r.status} />
                  <small className="text-[12.5px] text-muted">{r.amount ? money(r.amount) : ""}</small>
                </span>
              </button>
            ))}
          </div>
        ) : <p className="m-0 text-muted">Заказов пока нет.</p>}
      </DSec>
      </>}
    </>
  );
}

export function openClient(id: number) {
  openDrawer(() => <Detail id={id} />);
}

/* ---------- Форма клиента ---------- */
function ClientForm({ c }: { c: Client | null }) {
  const [error, setError] = useState("");
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = { name: formValue(fd, "name"), phone: formValue(fd, "phone"), note: formValue(fd, "note") };
    if (!values.name || digits(values.phone).length < 10) return setError("Впишите имя и телефон, не меньше 10 цифр");
    const twin = findByPhone(values.phone);
    if (twin && twin.id !== c?.id) return setError(`Клиент с таким телефоном уже есть: ${twin.name}`);
    if (c) {
      db.batch(() => {
        Object.assign(c, values);
        db.list("requests").filter((r) => r.client_id === c.id).forEach((r) => { r.client = values.name; r.phone = values.phone; });
      });
      toast("Сохранено");
      openClient(c.id);
    } else {
      const created = db.insert("clients", values);
      toast("Клиент добавлен");
      openClient(created.id);
    }
  };
  return (
    <>
      <DHead title={c ? "Данные клиента" : "Новый клиент"} />
      <form className="flex flex-col gap-3.5" onSubmit={save}>
        <Field label="Имя или название"><input name="name" required maxLength={120} defaultValue={c?.name || ""} autoFocus /></Field>
        <Field label="Телефон"><input name="phone" required type="tel" maxLength={30} defaultValue={c?.phone || ""} placeholder="+7 928 000-00-00" /></Field>
        <Field label="Заметка">
          <textarea name="note" rows={3} maxLength={1000} defaultValue={c?.note || ""} placeholder="Как удобно связываться, особенности объекта" />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}><Button variant="primary" type="submit">{c ? "Сохранить" : "Добавить"}</Button></div>
      </form>
    </>
  );
}

function openForm(c: Client | null) {
  openDrawer(() => <ClientForm c={c} />);
}

function Clients() {
  return <ClientsList />;
}

const view: View = { title: () => "Клиенты", Component: Clients };
export default view;
