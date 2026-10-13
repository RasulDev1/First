"use client";
// Смета заказа: считается сама из замеров, менеджер меняет только наценку (не ниже 25%).
// Таблица и поле наценки показываются в карточке заказа и во вкладке «Смета» нижней панели.
import { useState } from "react";
import { money, num } from "@/lib/core";
import { MIN_MARKUP } from "@/lib/config";
import { clampMarkup, estimateSums, markupFor, syncEstimate } from "@/lib/estimate";
import { expenseTotal } from "@/lib/stock";
import type { EstimateLine, Request, Staff } from "@/lib/types";
import { Button, Kv, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { P, logBy, muted, save, small } from "./shared";

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
    <label className="flex flex-col gap-1 text-[13px] text-black">Наценка, %
      <input type="number" min={MIN_MARKUP} max="300" step="1" inputMode="numeric" value={text} disabled={disabled} className="!flex-none !w-28"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </label>
  );
}

/** Смета: только суммы — материалы и работы по замерам, расходы заказа, сумма, наценка, итог. Списки позиций не показываются. */
export function EstimateTable({ lines, markup, expenses }: { lines: EstimateLine[]; markup: number; expenses: number }) {
  const t = estimateSums(lines, expenses, markup);
  return (
    <Kv wide items={[
      ["Материалы", money(t.mats), "tabular-nums"],
      ["Работы", money(t.works), "tabular-nums"],
      ["Расходы заказа", money(t.expenses), "tabular-nums"],
      ["Сумма", <b key="b">{money(t.base)}</b>, "tabular-nums"],
      [`Наценка ${t.markup}%`, `+ ${money(t.extra)}`, "tabular-nums"],
      ["Итого для клиента", <b key="t">{money(t.total)}</b>, "tabular-nums"],
    ]} />
  );
}

/* ---------- Вкладка «Смета» в нижней панели: суммы и наценка, новая наценка применяется кнопкой «Сохранить» ---------- */
export function EstimateTab({ r, user, readOnly }: { r: Request; user: Staff; readOnly?: boolean }) {
  const [markup, setMarkup] = useState(markupFor(r));
  const e = r.estimate;
  if (!e?.lines?.length) {
    return <p className={cx(P, muted)}>Сметы пока нет. Она появится сама, когда в заказе сохранены замеры.</p>;
  }
  const closed = readOnly || ["done", "cancelled"].includes(r.status);
  const apply = () => {
    if (markup === markupFor(r)) { toast("Изменений нет"); return; }
    if (!syncEstimate(r, user.name, markup)) return;
    logBy(r, `Смета: ${money(r.amount || 0)}, наценка ${markup}%`, user);
    save("Наценка сохранена");
  };
  return (
    <div className="flex flex-col gap-3">
      <EstimateTable lines={e.lines} markup={markup} expenses={expenseTotal(r)} />
      {closed ? null : (
        <div className="flex flex-row flex-wrap items-end gap-2">
          <MarkupInput value={markup} onChange={setMarkup} />
          <Button variant="primary" onClick={apply}>Сохранить</Button>
        </div>
      )}
      <p className={cx(P, muted, small)}>Смета от {new Date(e.at).toLocaleDateString("ru-RU")}{e.by ? `, ${e.by}` : ""}. Сумма от замеров и расходов заказа плюс наценка (не ниже {MIN_MARKUP}%). Новая наценка применяется кнопкой «Сохранить».</p>
    </div>
  );
}
