"use client";
// Автосмета: мастер из нескольких шагов в боковой панели и вкладка «Смета» в нижней панели заказа.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { money, num } from "@/lib/core";
import { MARKUP, WORKS } from "@/lib/config";
import { db } from "@/lib/db";
import { currentUser, isDirector } from "@/lib/auth";
import { surveyOf } from "@/lib/survey";
import { STEPS, buildEstimate, floorOf, lineSum, marginOf, materialLine, minMargin, setMinMargin, totals, workLine } from "@/lib/estimate";
import type { EstimateLine, Request, Staff } from "@/lib/types";
import { ArmedButton, Button, DHead, DSec, Empty, IconButton, Kv, Note, Table, btnRow, cx } from "@/components/ui";
import { closeDrawer, openDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { GuardButton, P, inlineForm, logBy, muted, save, sheetCols, small, thR, useGuard } from "./shared";

const pct = (n: number) => `${num(Math.round(n * 10) / 10)}%`;

/* ---------- Порог маржи (только руководитель) ---------- */
export function saveMargin(value: unknown, user: Staff) {
  if (!isDirector(user)) return;
  const v = setMinMargin(value);
  toast(`Нижний порог маржи: ${v}%`);
}

export function MarginForm({ user, className }: { user: Staff; className?: string }) {
  const m = minMargin();
  if (!isDirector(user)) return null;
  return (
    <form key={m} className={cx(inlineForm, className)} onSubmit={(e) => { e.preventDefault(); saveMargin(new FormData(e.currentTarget).get("m"), user); }}>
      <label>Нижний порог маржи, %<input name="m" type="number" min="0" max="90" step="1" defaultValue={m} /></label>
      <Button type="submit" className="self-end">Сохранить порог</Button>
    </form>
  );
}

/* ---------- Вкладка «Смета» в нижней панели ---------- */
export function EstimateTab({ r, user, onOpen, readOnly }: { r: Request; user: Staff; onOpen: () => void; readOnly?: boolean }) {
  const e = r.estimate, m = minMargin();
  const head = readOnly ? null : <div className={btnRow}><Button variant="primary" onClick={onOpen}>{e ? "Изменить смету" : "Составить автосмету"}</Button></div>;
  if (!e?.lines?.length) {
    return (
      <div className={sheetCols}>
        <div><p className={cx(P, muted)}>Сметы пока нет. Автосмета считает материалы и работы из вкладки «Замеры».</p>{head}</div>
        <div><MarginForm user={user} className="mt-2.5" /></div>
      </div>
    );
  }
  const t = totals(e.lines);
  return (
    <div className={sheetCols}>
      <div>
        <Table>
          <thead><tr><th>Позиция</th><th className={thR}>Кол-во</th><th className={thR}>Цена</th><th className={thR}>Сумма</th></tr></thead>
          <tbody>{e.lines.map((l) => (
            <tr key={l.id}><td>{l.name}</td><td className="text-right tabular-nums">{num(l.qty)} {l.unit}</td>
              <td className="text-right tabular-nums">{money(l.price)}</td><td className="text-right tabular-nums">{money(lineSum(l))}</td></tr>
          ))}</tbody>
        </Table>
      </div>
      <div>
        <Kv wide items={[
          ["Итого", <b key="t">{money(t.total)}</b>, "tabular-nums"],
          ["Прибыль", money(t.profit), "tabular-nums"],
          ["Процент", pct(t.margin), cx("tabular-nums", t.margin < m && "text-bad")],
        ]} />
        <p className={cx(P, muted, small)}>Смета от {new Date(e.at).toLocaleDateString("ru-RU")}{e.by ? `, ${e.by}` : ""}. Нижний порог {num(m)}%.</p>
        {head}
        <div><MarginForm user={user} className="mt-2.5" /></div>
      </div>
    </div>
  );
}

/* ---------- Мастер автосметы ---------- */
/** Поле числа: значение применяется по событию change (уход с поля, Enter, стрелки), как в старой версии */
function NumIn({ value, onCommit, step, inputMode, label }: { value: number; onCommit: (v: string) => number; step: string; inputMode: "decimal" | "numeric"; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(String(value));
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  useEffect(() => { setText(String(value)); }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = () => setText(String(commit.current(el.value)));
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, []);
  return (
    <input ref={ref} type="number" min="0" step={step} inputMode={inputMode} aria-label={label} value={text} onChange={(e) => setText(e.target.value)}
      className="!w-[90px] !min-h-0 text-right !px-2 !py-1.5 !rounded-none" />
  );
}

function LineRows({ lines, kind, onLine, onDel }: {
  lines: EstimateLine[]; kind: "mat" | "work"; onLine: (id: string, field: "qty" | "price", value: string) => number; onDel: (id: string) => void;
}) {
  const own = lines.filter((l) => l.kind === kind);
  if (!own.length) return <p className={cx(P, muted)}>Строк нет.</p>;
  return (
    <Table>
      <thead><tr><th>{kind === "mat" ? "Материал" : "Работа"}</th><th className={thR}>Кол-во</th>{kind === "mat" ? <th className={thR}>Закупка</th> : null}
        <th className={thR}>Цена</th><th className={thR}>Сумма</th><th className={thR}>Маржа</th><th /></tr></thead>
      <tbody>{own.map((l) => {
        const low = l.cost > 0 && l.price < floorOf(l.cost);
        return (
          <tr key={l.id} className={low ? "[&>td]:bg-bad-soft [&>td:first-child]:shadow-[inset_3px_0_0_var(--color-bad)]" : undefined}>
            <td>{l.name}<small>{l.unit}</small></td>
            <td className="text-right"><NumIn value={l.qty} step="0.1" inputMode="decimal" label="Количество" onCommit={(v) => onLine(l.id, "qty", v)} /></td>
            {kind === "mat" ? <td className="text-right tabular-nums">{money(l.cost)}</td> : null}
            <td className="text-right"><NumIn value={l.price} step="10" inputMode="numeric" label="Цена" onCommit={(v) => onLine(l.id, "price", v)} /></td>
            <td className="text-right tabular-nums">{money(lineSum(l))}</td>
            <td className="text-right tabular-nums">{l.cost > 0 ? `${num(Math.round(marginOf(l.price, l.cost)))}%` : "—"}</td>
            <td className="text-right"><IconButton aria-label="Убрать строку" onClick={() => onDel(l.id)} /></td>
          </tr>
        );
      })}</tbody>
    </Table>
  );
}

function Bar({ lines, user }: { lines: EstimateLine[]; user: Staff }) {
  const t = totals(lines), m = minMargin(), low = t.total > 0 && t.margin < m;
  const item = "flex flex-col text-xs opacity-95 [&>b]:text-lg [&>b]:tabular-nums";
  return (
    <div className={cx("sticky bottom-0 flex flex-wrap gap-x-6 gap-y-2 items-center px-4 py-3 text-white mt-4", low ? "bg-bad-deep" : "bg-brand-deep")}>
      <span className={item}>Итого<b>{money(t.total)}</b></span>
      <span className={item}>Прибыль<b>{money(t.profit)}</b></span>
      <span className={item}>Процент<b>{pct(t.margin)}</b></span>
      <small className="ml-auto">Нижний порог {num(m)}%{low ? (user.role === "director" ? ": цена ниже порога" : ": поднимите цены") : ""}</small>
    </div>
  );
}

function EstimateWizard({ id }: { id: number }) {
  const r = db.find("requests", id), user = currentUser();
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<EstimateLine[]>(() => structuredClone(r?.estimate?.lines || []));
  const g = useGuard(user ?? ({} as Staff));
  if (!r || !user) return <Empty title="Заказ удалён" />;
  const s = surveyOf(r);

  const next = () => {
    if (step === 0 && !lines.length) setLines(buildEstimate(r));
    setStep(Math.min(3, step + 1));
  };
  const onLine = (lineId: string, field: "qty" | "price", value: string) => {
    const l = lines.find((x) => x.id === lineId);
    const v = Math.max(0, Number(value) || 0);
    if (!l) return v;
    const changed = { ...l, [field]: v };
    const min = floorOf(changed.cost);
    if (field === "price" && changed.cost > 0 && v < min && !isDirector(user)) {
      changed.price = min;
      toast(`Ниже порога маржи ${minMargin()}%: цена не меньше ${money(min)}`, "bad");
    }
    setLines(lines.map((x) => (x.id === lineId ? changed : x)));
    return changed[field];
  };
  const onDel = (lineId: string) => setLines(lines.filter((l) => l.id !== lineId));
  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    const qty = Math.max(0.1, Number(fd.get("qty")) || 1);
    if (step === 1) { const p = db.find("products", Number(fd.get("item"))); if (p) setLines([...lines, materialLine(p, qty)]); }
    else { const w = WORKS.find((x) => x.id === fd.get("item")); if (w) setLines([...lines, workLine(w, qty)]); }
    form.reset();
  };
  const onSave = () => {
    if (!g.check(r)) return;
    const kept = lines.filter((l) => l.qty > 0);
    if (!isDirector(user) && kept.some((l) => l.cost > 0 && l.price < floorOf(l.cost))) { toast("Есть цены ниже порога маржи", "bad"); return; }
    const t = totals(kept);
    r.estimate = { lines: kept, at: new Date().toISOString(), by: user.name };
    r.amount = Math.round(t.total);
    logBy(r, `Смета: ${money(t.total)}, прибыль ${money(t.profit)} (${Math.round(t.margin)}%)`, user);
    save("Смета сохранена, сумма договора обновлена");
    closeDrawer();
  };

  let body;
  if (step === 0) {
    const vol = s.rooms.reduce((n, x) => n + x.area * x.height, 0), len = s.routes.reduce((n, x) => n + x.length, 0);
    body = (
      <DSec title="Данные замера">
        {s.rooms.length || s.routes.length ? (
          <>
            <Kv items={[
              ["Помещений", `${s.rooms.length}, объём ${num(Math.round(vol))} м³`],
              ["Кондиционеры", s.rooms.filter((x) => x.ac).length],
              ["Трасс", `${s.routes.length}, всего ${num(Math.round(len * 10) / 10)} м`],
              ["Фото", s.photos.length],
            ]} />
            <p className={cx(P, muted)}>Материалы подбираются по складу, работы — по прайсу. Дальше всё можно поправить.</p>
            <div className={btnRow}>
              <Button variant="primary" onClick={next}>{lines.length ? "Дальше" : "Рассчитать смету"}</Button>
              {lines.length ? <ArmedButton variant="danger" question="Ваши правки пропадут. Пересчитать?"
                onConfirm={() => { setLines(buildEstimate(r)); setStep(1); }}>Пересчитать из замера заново</ArmedButton> : null}
            </div>
          </>
        ) : (
          <>
            <p className={cx(P, muted)}>В замере пока нет помещений и трасс. Заполните вкладку «Замеры» или добавьте строки сметы вручную.</p>
            <Button onClick={next}>Добавить строки вручную</Button>
          </>
        )}
      </DSec>
    );
  } else if (step === 1 || step === 2) {
    const kind = step === 1 ? "mat" : "work";
    body = (
      <DSec title={kind === "mat" ? "Материалы" : "Работы"}>
        {kind === "work"
          ? <Note>Прайс работ ориентировочный: себестоимость работ пока не оценена, поэтому порог маржи на них не действует.</Note>
          : <p className={cx(P, muted, small)}>Цена не ниже закупки плюс порог {num(minMargin())}%. Наценка по умолчанию {MARKUP}%.</p>}
        <LineRows lines={lines} kind={kind} onLine={onLine} onDel={onDel} />
        <form key={step} className={inlineForm} onSubmit={onAdd}>
          {kind === "mat" ? (
            <select name="item" aria-label="Материал">{db.list("products").map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.cost)}</option>)}</select>
          ) : (
            <select name="item" aria-label="Работа">{WORKS.map((w) => <option key={w.id} value={w.id}>{w.name} · {money(w.price)}/{w.unit}</option>)}</select>
          )}
          <input name="qty" type="number" min="0.1" step="0.1" defaultValue="1" inputMode="decimal" aria-label="Количество" />
          <Button type="submit">{kind === "mat" ? "Добавить материал" : "Добавить работу"}</Button>
        </form>
        <div className={btnRow}><Button onClick={() => setStep(step - 1)}>Назад</Button><Button variant="primary" onClick={next}>Дальше</Button></div>
      </DSec>
    );
  } else {
    const t = totals(lines), bad = lines.filter((l) => l.cost > 0 && l.price < floorOf(l.cost));
    const sum = (kind: "mat" | "work") => money(lines.filter((l) => l.kind === kind).reduce((n, l) => n + lineSum(l), 0));
    body = (
      <DSec title="Итог">
        <Kv items={[
          ["Материалы", sum("mat"), "tabular-nums"],
          ["Работы", sum("work"), "tabular-nums"],
          ["Закупка материалов", money(t.cost), "tabular-nums"],
          ["Сумма договора сейчас", money(r.amount || 0), "tabular-nums"],
        ]} />
        {bad.length ? <Note tone="warn">Ниже порога {num(minMargin())}%: {bad.map((l) => l.name).join(", ")}.{user.role === "director" ? " Руководитель может сохранить так." : " Поднимите цены, чтобы сохранить."}</Note> : null}
        <MarginForm user={user} />
        <div className={btnRow}>
          <Button onClick={() => setStep(1)}>Назад</Button>
          <GuardButton g={g} variant="primary" disabled={!lines.length || (bad.length > 0 && user.role !== "director")} onClick={onSave}>
            Сохранить смету и поставить сумму договора</GuardButton>
        </div>
      </DSec>
    );
  }

  return (
    <>
      <DHead eyebrow={`Заказ №${r.id}`} title="Автосмета" />
      <nav className="flex gap-1.5 flex-wrap mt-1 mb-3">
        {STEPS.map(([sid, title], i) => (
          <button key={sid} type="button" aria-pressed={i === step} onClick={() => setStep(i)}
            className={cx("inline-flex gap-1.5 items-center border px-3 py-2 cursor-pointer", i === step ? "bg-brand-deep border-brand-deep text-white" : "bg-surface-2 border-surface-2 text-ink")}>
            <i className="not-italic font-bold">{i + 1}</i>{title}
          </button>
        ))}
      </nav>
      {body}
      {step > 0 ? <Bar lines={lines} user={user} /> : null}
    </>
  );
}

export function openEstimate(id: number) {
  openDrawer(() => <EstimateWizard id={id} />, { full: true });
}
