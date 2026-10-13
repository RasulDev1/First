"use client";
// Смета заказа: считается сама из замеров, менеджер меняет только наценку (не ниже 25%).
// Таблица и поле наценки показываются в карточке заказа и во вкладке «Смета» нижней панели.
import { useState } from "react";
import { money, num } from "@/lib/core";
import { MIN_MARKUP } from "@/lib/config";
import { clampMarkup, lineSum, markupFor, markupOf, syncEstimate, totals } from "@/lib/estimate";
import type { EstimateLine, Request, Staff } from "@/lib/types";
import { Button, Kv, Table, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { P, allowed, inlineForm, logBy, muted, save, small, thR } from "./shared";

const pct = (n: number) => `${num(Math.round(n * 10) / 10)}%`;

/** Поле «Наценка, %»: меньше 25% не опускается; значение лежит у владельца (карточка или вкладка) */
export function MarkupInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const raw = Number(text);
    const v = clampMarkup(text);
    if (text.trim() !== "" && raw < MIN_MARKUP) toast(`Наценка не ниже ${MIN_MARKUP}%`, "bad");
    setText(String(v));
    onChange(v);
  };
  return (
    <label className="flex flex-col gap-1 text-[13px]">Наценка на материалы, %
      <input type="number" min={MIN_MARKUP} max="300" step="1" inputMode="numeric" value={text} disabled={disabled} className="!flex-none !w-28"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </label>
  );
}

/** Таблица сметы с итогами; строки только для чтения */
export function EstimateTable({ lines, markup }: { lines: EstimateLine[]; markup: number }) {
  const t = totals(lines), mats = lines.filter((l) => l.kind === "mat"), works = lines.filter((l) => l.kind === "work");
  const sum = (ls: EstimateLine[]) => ls.reduce((n, l) => n + lineSum(l), 0);
  const rows = (ls: EstimateLine[], title: string) => ls.length ? (
    <>
      <tr><th colSpan={4} className="text-left! pt-3">{title}</th></tr>
      {ls.map((l) => (
        <tr key={l.id}><td>{l.name}</td><td className="text-right tabular-nums">{num(l.qty)} {l.unit}</td>
          <td className="text-right tabular-nums">{money(l.price)}</td><td className="text-right tabular-nums">{money(lineSum(l))}</td></tr>
      ))}
    </>
  ) : null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Table>
          <thead><tr><th>Позиция</th><th className={thR}>Кол-во</th><th className={thR}>Цена</th><th className={thR}>Сумма</th></tr></thead>
          <tbody>{rows(mats, "Материалы")}{rows(works, "Работы")}</tbody>
        </Table>
      </div>
      <div>
        <Kv wide items={[
          ["Материалы", money(sum(mats)), "tabular-nums"],
          ["Работы", money(sum(works)), "tabular-nums"],
          ["Итого", <b key="t">{money(t.total)}</b>, "tabular-nums"],
          ["Закупка материалов", money(t.cost), "tabular-nums"],
          ["Прибыль", money(t.profit), "tabular-nums"],
          ["Наценка на материалы", pct(markupOf(sum(mats), t.cost)), cx("tabular-nums", markup < MIN_MARKUP && "text-bad")],
        ]} />
      </div>
    </div>
  );
}

/* ---------- Вкладка «Смета» в нижней панели ---------- */
export function EstimateTab({ r, user, readOnly }: { r: Request; user: Staff; readOnly?: boolean }) {
  const e = r.estimate;
  if (!e?.lines?.length) {
    return <p className={cx(P, muted)}>Сметы пока нет. Она появится сама, когда в заказе сохранены замеры.</p>;
  }
  const m = markupFor(r);
  const setMarkup = (v: number) => {
    if (v === m || !allowed(r, user)) return;
    if (!syncEstimate(r, user.name, v)) return;
    logBy(r, `Наценка: ${v}%, смета ${money(r.amount || 0)}`, user);
    save(`Наценка ${v}%, стоимость работы ${money(r.amount || 0)}`);
  };
  return (
    <div className="flex flex-col gap-3">
      <EstimateTable lines={e.lines} markup={m} />
      {readOnly ? null : <div className={inlineForm}><MarkupInput key={m} value={m} onChange={setMarkup} /></div>}
      <p className={cx(P, muted, small)}>Смета от {new Date(e.at).toLocaleDateString("ru-RU")}{e.by ? `, ${e.by}` : ""}. Считается из замеров сама, цена материалов — закупка плюс наценка (не ниже {MIN_MARKUP}%).</p>
    </div>
  );
}
