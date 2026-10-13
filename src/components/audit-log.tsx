"use client";
// Журнал изменений: кто, когда и что поменял. Показывает записи только нужных разделов; доступен всем сотрудникам с доступом к карточке.
import { useState } from "react";
import { dateTime } from "@/lib/core";
import { db } from "@/lib/db";
import type { AuditEntry, TableName } from "@/lib/types";
import { Button, Empty, Table, cx } from "./ui";

const ACTION: Record<string, string> = { create: "bg-st-done-soft text-st-done", update: "bg-st-new-soft text-st-new", delete: "bg-bad-soft text-bad", system: "bg-surface-2 text-ink-2" };
const ACTION_TITLE: Record<string, string> = { create: "Создано", update: "Изменено", delete: "Удалено", system: "Система" };

/** rec — журнал одной записи (заказа, клиента, товара); extra — дополнительные строки, например движения товара */
export function AuditLog({ tables, note, rec, extra }: { tables: TableName[]; note: string; rec?: number; extra?: AuditEntry[] }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(60);
  const own = db.exportAudit().filter((e) => e.table && tables.includes(e.table) && (rec == null || e.rec === rec));
  const all = [...own, ...(extra || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id);
  const list = q ? all.filter((e) => (e.text + e.user).toLowerCase().includes(q.toLowerCase())) : all;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="m-0 text-ink-2 flex-[1_1_320px] max-w-[70ch]">{note}{rec == null ? " Хранятся последние 1000 записей." : ""}</p>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(60); }} placeholder="Поиск по журналу" className="w-full min-[561px]:w-[260px]" />
      </div>
      {list.length ? (
        <>
          {rec != null ? (
            // В карточке места мало: запись списком, время и автор сверху, что изменено ниже
            <ul className="m-0 p-0 list-none flex flex-col">
              {list.slice(0, shown).map((e) => (
                <li key={e.id} className="flex flex-col gap-1 py-3 border-b border-line/70 last:border-b-0">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
                    <span className={cx("px-2 py-0.5 rounded-[5px] text-xs font-medium", ACTION[e.action])}>{ACTION_TITLE[e.action]}</span>
                    <span className="tabular-nums">{dateTime(e.at)}</span><span>{e.user}</span>
                  </span>
                  <span className="wrap-anywhere text-heading">{e.text}</span>
                </li>
              ))}
            </ul>
          ) : (
          <Table>
            <thead><tr><th style={{ width: 150 }}>Когда</th><th style={{ width: 170 }}>Кто</th><th style={{ width: 120 }}>Действие</th><th>Что изменено</th></tr></thead>
            <tbody>{list.slice(0, shown).map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap tabular-nums">{dateTime(e.at)}</td>
                <td>{e.user}</td>
                <td><span className={cx("px-2 py-0.5 rounded-[5px] text-xs font-medium", ACTION[e.action])}>{ACTION_TITLE[e.action]}</span></td>
                <td className="wrap-anywhere">{e.text}</td>
              </tr>
            ))}</tbody>
          </Table>
          )}
          {list.length > shown ? <Button onClick={() => setShown(shown + 60)}>Показать ещё ({list.length - shown})</Button> : null}
        </>
      ) : <Empty title="Записей нет">{q ? "Измените поиск." : "Изменения появятся, как только кто-то что-то поменяет."}</Empty>}
    </>
  );
}

