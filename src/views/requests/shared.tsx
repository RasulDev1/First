"use client";
// Общее для раздела «Заказы»: адрес, права менеджера, расходы, история, мелкие стили.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { money, num, dateTime } from "@/lib/core";
import { isDirector } from "@/lib/auth";
import { log } from "@/lib/orders";
import { product, expenseTotal } from "@/lib/stock";
import type { HistoryItem, Request, Staff } from "@/lib/types";
import { Button, Loc, StatusPill, Table, cx, type ButtonProps } from "@/components/ui";
import { toast } from "@/components/toast";
import { openExpense } from "../warehouse";

export const staffName = (id: unknown) => db.find("staff", id)?.name || "";
export const masterName = (id: unknown) => db.find("masters", id)?.name || "";

// Адрес хранится строкой «г. Грозный, ул. Мира, 5»: город — до первой запятой, остальное — улица и дом
export const cityOf = (r: Request) => (r.address.includes(",") ? r.address.split(",")[0].trim() : "");
export const streetOf = (r: Request) => (r.address.includes(",") ? r.address.slice(r.address.indexOf(",") + 1).trim() : r.address);

/** Запись в историю от имени сотрудника */
export const logBy = (r: Request, text: string, user: Pick<Staff, "name">) => log(r, text, user.name);

/** Сохранить изменения в записях и показать уведомление */
export function save(text?: string) {
  db.save();
  if (text) toast(text);
}

/* ---------- Права менеджера ---------- */
/** Менеджер меняет только свои заказы. Руководитель — без ограничений. */
export function allowed(r: Request | null | undefined, user: Staff) {
  if (!r || isDirector(user)) return true;
  if (r.manager_id !== user.id) { toast(r.manager_id ? "Менеджер меняет только свои заказы" : "Сначала возьмите заказ", "bad"); return false; }
  return true;
}

export const CONFIRM = "Подтвердить изменение?";
export interface Guard { armed: boolean; check: (r: Request | null | undefined, confirm?: boolean) => boolean }

/** Проверка allow() с подтверждением: менеджер нажимает кнопку второй раз («Подтвердить изменение?») */
export function useGuard(user: Staff): Guard {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const check = (r: Request | null | undefined, confirm = true) => {
    if (!r || isDirector(user)) return true;
    if (!allowed(r, user)) return false;
    if (!confirm) return true;
    if (armed) { clearTimeout(timer.current); setArmed(false); return true; }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 4000);
    return false;
  };
  return { armed, check };
}

/** Кнопка, которая показывает «Подтвердить изменение?», пока ждёт второго нажатия */
export function GuardButton({ g, variant = "secondary", children, ...rest }: ButtonProps & { g: Guard }) {
  return (
    <Button {...rest} variant={g.armed ? "danger" : variant} data-armed={g.armed || undefined}>
      {g.armed ? CONFIRM : children}
    </Button>
  );
}

/* ---------- Стили ---------- */
/** Абзац с обычными отступами браузера (как в старой вёрстке) */
export const P = "my-[1em]";
export const muted = "text-muted";
export const small = "text-[13px]";
/** Строка формы: поля и кнопка в ряд */
export const inlineForm = "flex flex-row flex-wrap items-center gap-2 [&_select]:flex-[1_1_240px] [&_select]:w-auto [&_input]:flex-[0_1_140px] [&_input]:w-auto [&_label]:flex [&_label]:flex-col [&_label]:gap-1 [&_label]:text-[13px] [&_label]:text-black";
/** Колонки нижней панели */
export const sheetCols = "grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]";
/** Номер заказа — ссылка на карточку */
export const orderNo = "bg-transparent border-0 p-0 text-heading font-medium cursor-pointer no-underline hover:underline hover:text-brand underline-offset-3 text-[length:inherit]";
/** Заголовок колонки справа (перебивает выравнивание <Table>) */
export const thR = "!text-right";

/* ---------- История ---------- */
const historyList = "list-none m-0 p-0 pl-3.5 border-l-2 border-line flex flex-col gap-2.5";
const historyItem = "relative flex flex-col before:content-[''] before:absolute before:-left-5 before:top-[7px] before:size-2.5 before:rounded-full before:bg-surface before:border-2 before:border-brand";

export function HistoryList({ items }: { items: { key: string | number; main: ReactNode; sub: ReactNode }[] }) {
  return (
    <ol className={historyList}>
      {items.map((x) => <li key={x.key} className={historyItem}>{x.main}<small className="text-muted">{x.sub}</small></li>)}
    </ol>
  );
}

export function OrderHistory({ r }: { r: Request }) {
  const list: (HistoryItem & { i: number })[] = (r.history || []).map((h, i) => ({ ...h, i })).reverse();
  if (!list.length) return <p className={cx(P, muted)}>Изменений нет.</p>;
  return (
    <HistoryList items={list.map((h) => {
      const st = h.text.startsWith("Статус:") ? STATUSES.find((x) => x.title === h.text.slice(7).trim()) : undefined;
      return { key: h.i, main: st ? <StatusPill id={st.id} /> : <b className="font-semibold">{h.text}</b>, sub: `${dateTime(h.at)}${h.by ? ` · ${h.by}` : ""}` };
    })} />
  );
}

/* ---------- Расходы ---------- */
/** «Расходы»: материалы, выписанные со склада под заказ, по себестоимости */
export function Expenses({ r, button = false, buttonClassName }: { r: Request; button?: boolean; buttonClassName?: string }) {
  const list = r.expenses || [];
  const open = r.status !== "cancelled"; // добавить расход можно и в завершённый заказ: вдруг забыли
  return (
    <>
      {list.length ? (
        <Table>
          <thead><tr><th>Материал</th><th>Место</th><th className={thR}>Кол-во</th><th className={thR}>Цена</th><th className={thR}>Сумма</th><th>Когда</th></tr></thead>
          <tbody>
            {list.map((e, i) => {
              const p = product(e.product_id);
              return (
                <tr key={i}>
                  <td>{p?.name || "Удалённый товар"}{e.note ? <small className="!text-ink-2 !font-semibold italic">{e.note}</small> : null}{e.by ? <small>{e.by}</small> : null}</td>
                  <td>{e.loc ? <Loc code={e.loc} /> : null}</td>
                  <td className="text-right tabular-nums">{num(e.qty)} {p?.unit || ""}</td>
                  <td className="text-right tabular-nums">{money(e.cost)}</td>
                  <td className="text-right tabular-nums">{money(e.qty * e.cost)}</td>
                  <td className="tabular-nums whitespace-nowrap">{dateTime(e.at)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={4}>Итого расходы</td><td className="text-right tabular-nums"><b>{money(expenseTotal(r))}</b></td><td /></tr></tfoot>
        </Table>
      ) : <p className={cx(P, muted)}>Со склада пока ничего не выписано.</p>}
      {button && open ? <Button variant="primary" className={buttonClassName} onClick={() => openExpense({ requestId: r.id })}>Добавить расход</Button> : null}
    </>
  );
}
