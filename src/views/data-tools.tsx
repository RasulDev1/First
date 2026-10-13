"use client";
// Вкладки «Копия и выгрузка» и «Автоматизации» в аналитике (руководитель): резервная копия, выгрузка в Excel, правила задач.
import { useRef, useState } from "react";
import { dateTime, dateShort, pluralize } from "@/lib/core";
import { CATEGORIES, STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { RULES } from "@/lib/automations";
import { placesOf, qtyOf } from "@/lib/stock";
import { Button, Panel } from "@/components/ui";
import { toast } from "@/components/toast";


function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

/** CSV с разделителем «;» и BOM — Excel в русской локали открывает такой файл сразу, с кириллицей и столбцами */
function csv(rows: (string | number)[][]) {
  const cell = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

const staffName = (id: unknown) => db.find("staff", id)?.name || "";
const masterName = (id: unknown) => db.find("masters", id)?.name || "";
const statusTitle = (id: string) => STATUSES.find((s) => s.id === id)?.title || id;

const EXPORTS: { id: string; title: string; hint: string; rows: () => (string | number)[][] }[] = [
  { id: "orders", title: "Заказы", hint: "Все заказы: клиент, адрес, статус, мастер, сумма.", rows: () => [
    ["№", "Дата", "Клиент", "Телефон", "Адрес", "Услуга", "Источник", "Статус", "Менеджер", "Мастер", "Выезд", "Сумма, ₽", "Завершён"],
    ...db.list("requests").map((r) => [r.id, dateShort(r.created_at), r.client, r.phone, r.address, r.service, r.source, statusTitle(r.status),
      staffName(r.manager_id), masterName(r.master_id), r.visit_at ? dateTime(r.visit_at) : "", r.amount || 0, r.done_at ? dateShort(r.done_at) : ""])] },
  { id: "clients", title: "Клиенты", hint: "Имя, телефон, число заказов и сумма завершённых.", rows: () => [
    ["Клиент", "Телефон", "Заказов", "Сумма завершённых, ₽", "Заметка"],
    ...db.list("clients").map((c) => {
      const orders = db.list("requests").filter((r) => r.client_id === c.id);
      return [c.name, c.phone, orders.length, orders.filter((r) => r.status === "done").reduce((n, r) => n + (r.amount || 0), 0), c.note || ""];
    })] },
  { id: "stock", title: "Склад", hint: "Остатки, места хранения, минимум и цены.", rows: () => [
    ["Артикул", "Наименование", "Категория", "Остаток", "Ед.", "Минимум", "Места", "Закупка, ₽", "Цена, ₽"],
    ...db.list("products").map((p) => [p.sku, p.name, CATEGORIES.find((c) => c.id === p.category)?.title || "", qtyOf(p.id), p.unit, p.min_qty,
      placesOf(p.id).map((s) => s.loc).join(", "), p.cost || 0, p.price || 0])] },
  { id: "moves", title: "Движения склада", hint: "Приход, расход, перемещения и выдача материалов.", rows: () => [
    ["Когда", "Кто", "Операция", "Товар", "Количество", "Откуда", "Куда", "Комментарий"],
    ...db.list("moves").map((m) => [dateTime(m.at), m.by, m.kind, db.find("products", m.product_id)?.name || "", m.qty, m.from || "", m.to || "", m.note || ""])] },
  { id: "tasks", title: "Задачи", hint: "Кому поставлены, сроки и выполнение.", rows: () => [
    ["Задача", "Исполнитель", "Срок", "Выполнено", "Заказ №"],
    ...db.list("tasks").map((t) => [t.title, staffName(t.assignee_id), dateTime(t.due), t.done_at ? dateTime(t.done_at) : "", t.request_id || ""])] },
];

export function ExportTab() {
  const file = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const restoreFile = async (f: File) => {
    try { setConfirm(await f.text()); } catch { toast("Не удалось прочитать файл"); }
  };
  return (
    <>
      <Panel title="Резервная копия">
        <p className="m-0 text-ink-2 max-w-[70ch]">Одним файлом сохраняются все данные CRM: заказы, клиенты, склад, сотрудники, задачи и журнал. Файл можно восстановить в любой момент.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => { download(`crm-backup-${stamp()}.json`, db.exportJson(), "application/json"); toast("Копия сохранена"); }}>Скачать резервную копию</Button>
          <Button onClick={() => file.current?.click()}>Восстановить из файла</Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restoreFile(f); }} />
        </div>
        {confirm != null ? (
          <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 rounded-card bg-warn-soft text-warn font-medium">
            <span className="flex-[1_1_260px]">Текущие данные будут заменены данными из файла. Продолжить?</span>
            <Button size="sm" variant="danger" onClick={() => {
              try { db.restore(confirm); toast("Данные восстановлены"); } catch (e) { toast((e as Error).message); }
              setConfirm(null);
            }}>Да, заменить</Button>
            <Button size="sm" onClick={() => setConfirm(null)}>Отмена</Button>
          </div>
        ) : null}
      </Panel>
      <Panel title="Выгрузка в Excel">
        <p className="m-0 text-ink-2 max-w-[70ch]">Файлы .csv открываются в Excel и Google Таблицах.</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
          {EXPORTS.map((x) => (
            <div key={x.id} className="px-4 py-3.5 rounded-card border border-line bg-surface flex flex-col gap-2">
              <b>{x.title}</b>
              <p className="m-0 text-sm text-muted flex-1">{x.hint}</p>
              <Button size="sm" onClick={() => { download(`${x.id}-${stamp()}.csv`, csv(x.rows()), "text/csv;charset=utf-8"); toast(`Выгружено: ${x.title}`); }}>Скачать .csv</Button>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function AutoTab() {
  const toggle = (id: string, on: boolean) => {
    const s = db.list("settings")[0];
    db.patch("settings", s.id, { auto: { ...(s.auto || {}), [id]: on } });
  };
  const made = db.list("tasks").filter((t) => t.created_by === 0).length;
  return (
    <>
      <p className="m-0 text-ink-2 max-w-[70ch]">Правила сами ставят задачи, когда в заказе что-то происходит. Созданные задачи видны в разделе «Задачи» с пометкой «Автоматизация». Повторно задача по тому же заказу не создаётся, пока прежняя не выполнена.</p>
      <div className="flex flex-col gap-2.5">
        {RULES.map((r) => {
          const on = db.list("settings")[0]?.auto?.[r.id] !== false;
          return (
            <label key={r.id} className="flex items-center gap-4 px-5 py-4 rounded-card border border-black/[.04] shadow-card bg-surface cursor-pointer">
              <input type="checkbox" checked={on} onChange={(e) => toggle(r.id, e.target.checked)} className="size-5 flex-none" />
              <span className="flex flex-col gap-0.5 min-w-0">
                <b>Если: {r.title.toLowerCase()}</b>
                <span className="text-sm text-ink-2">{r.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="m-0 text-sm text-muted">Автоматически создано {made} {pluralize(made, "задача", "задачи", "задач")}.</p>
    </>
  );
}

