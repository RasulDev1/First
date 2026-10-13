"use client";
// Общие элементы интерфейса CRM на Tailwind: кнопки, поля, статусы, чипы, плитки, панели, таблицы, разделы карточки.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STATUSES } from "@/lib/config";
import { IconX } from "./icons";
import type { Comment, StatusId } from "@/lib/types";
import { dateTime } from "@/lib/core";

export const cx = (...list: (string | false | null | undefined)[]) => list.filter(Boolean).join(" ");

/* ---------- Кнопки ---------- */
// Все кнопки CRM с прямыми углами. Второстепенная — по умолчанию, главная — синяя, опасная — красная.
const BTN = {
  base: "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium border cursor-pointer transition-[background-color,border-color,transform] duration-150 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed",
  secondary: "bg-surface-2 border-surface-2 text-ink hover:bg-line hover:border-line disabled:hover:bg-surface-2",
  primary: "bg-brand border-brand text-white hover:bg-brand-deep hover:border-brand-deep disabled:hover:bg-brand disabled:hover:border-brand",
  danger: "bg-bad border-bad text-white hover:bg-bad-deep hover:border-bad-deep",
  md: "min-h-10 px-4 py-2",
  sm: "min-h-8 px-3 py-1 text-[13px]",
  big: "min-h-[52px] px-9 text-base disabled:opacity-45",
};
export type ButtonVariant = "secondary" | "primary" | "danger";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: "md" | "sm" | "big"; block?: boolean;
}
export function Button({ variant = "secondary", size = "md", block, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(BTN.base, BTN[variant], BTN[size], block && "w-full", className)} {...rest} />;
}
/** Классы кнопки — для <label> или <a>, которые должны выглядеть как кнопка */
export const buttonClass = (variant: ButtonVariant = "secondary", size: "md" | "sm" | "big" = "md") => cx(BTN.base, BTN[variant], BTN[size]);

/** Текстовая кнопка-ссылка */
export function LinkButton({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("bg-transparent border-0 p-0 text-brand font-medium cursor-pointer text-[13px] hover:underline", className)} {...rest} />;
}

/** Маленькая кнопка ✕ (убрать строку, фото) */
export function IconButton({ className, type = "button", children = <IconX />, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("bg-transparent border-0 text-muted cursor-pointer px-2 py-1 rounded-md hover:text-bad hover:bg-bad-soft", className)} {...rest}>{children}</button>;
}

/** Кнопка опасного действия: первое нажатие спрашивает «Точно?», второе — выполняет (confirm() в части браузеров не работает) */
export function ArmedButton({ question = "Точно?", onConfirm, variant = "secondary", children, ...rest }: Omit<ButtonProps, "onClick"> & { question?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button {...rest} variant={armed ? "danger" : variant} data-armed={armed || undefined} onClick={() => {
      if (armed) { clearTimeout(timer.current); setArmed(false); onConfirm(); return; }
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
    }}>{armed ? question : children}</Button>
  );
}

/* ---------- Поля ---------- */
export function Field({ label, hint, className, children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1.5 min-w-0", className)}>
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <small className="text-xs text-muted">{hint}</small> : null}
    </label>
  );
}
export function FormError({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="m-0 text-bad text-[13px] font-semibold">{children}</p> : null;
}
/** Опции для <select> из списка строк или объектов {id, title|name} */
export function Options({ list, empty }: { list: readonly (string | number | { id: string | number; title?: string; name?: string })[]; empty?: string }) {
  return (
    <>
      {empty != null ? <option value="">{empty}</option> : null}
      {list.map((o) => {
        const [value, label] = typeof o === "object" ? [o.id, o.title ?? o.name] : [o, o];
        return <option key={String(value)} value={value}>{label}</option>;
      })}
    </>
  );
}
/** Сетка полей формы в две колонки (на телефоне — одна) */
export const grid2 = "grid grid-cols-1 min-[561px]:grid-cols-2 gap-3.5";
export const formCol = "flex flex-col gap-3.5";

/* ---------- Статусы и метки ---------- */
const PILL: Record<string, string> = {
  new: "text-st-new bg-st-new/10", assigned: "text-st-assigned bg-st-assigned/10", measure: "text-st-measure bg-st-measure/10",
  pricing: "text-st-pricing bg-st-pricing/10", in_work: "text-st-in_work bg-st-in_work/10", done: "text-st-done bg-st-done/10",
  cancelled: "text-st-cancelled bg-st-cancelled/10",
};
/** Цвет заливки статуса — для полос графиков */
export const STATUS_FILL: Record<string, string> = {
  new: "bg-st-new", assigned: "bg-st-assigned", measure: "bg-st-measure", pricing: "bg-st-pricing",
  in_work: "bg-st-in_work", done: "bg-st-done", cancelled: "bg-st-cancelled",
};
export const statusTitle = (id: string) => STATUSES.find((s) => s.id === id)?.title || id;
export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center self-start w-max px-2.5 py-px rounded-full text-[11px] font-medium whitespace-nowrap before:content-[''] before:size-1.5 before:rounded-full before:bg-current before:mr-1.5", className)}>
      {children}
    </span>
  );
}
export const StatusPill = ({ id }: { id: StatusId | string }) => <Pill className={PILL[id] ?? PILL.cancelled}>{statusTitle(id)}</Pill>;

/** Место на складе «А-1-2» */
export function Loc({ code, children, big, className }: { code: string; children?: ReactNode; big?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 px-2 py-px rounded-md bg-brand-soft text-brand-deep font-semibold tabular-nums tracking-wide whitespace-nowrap",
      big ? "text-base px-2.5 py-1" : "text-[13px]", className)}>
      {code}{children}
    </span>
  );
}

/** Счётчик рядом с заголовком */
export function Count({ n, warn }: { n: number; warn?: boolean }) {
  return <i className={cx("not-italic font-body text-xs font-medium px-2 py-px rounded-full align-[2px]", warn ? "bg-warn-soft text-warn" : "bg-brand text-white")}>{n}</i>;
}

/* ---------- Чипы-фильтры и вкладки ---------- */
export type ChipItem = readonly [id: string | number, label: ReactNode, count?: number];
export function Chips({ items, active, onChange, tabs }: { items: readonly ChipItem[]; active: string | number; onChange: (id: string) => void; tabs?: boolean }) {
  return (
    <div role="tablist" className={cx("flex overflow-x-auto pb-0.5", tabs ? "gap-0 border-b border-line" : "gap-1.5")}>
      {items.map(([id, label, count]) => {
        const on = String(id) === String(active);
        return (
          <button key={String(id)} type="button" aria-pressed={on} onClick={() => onChange(String(id))}
            className={cx("flex-none inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer",
              tabs ? cx("px-3.5 py-2.5 border-0 border-b-2 bg-transparent", on ? "text-brand-deep border-brand" : "text-ink-2 border-transparent")
                : cx("px-3 py-1.5 border rounded-lg", on ? "bg-brand border-brand text-white" : "bg-surface border-black/[.06] text-ink-2"))}>
            {label}
            {count != null ? <i className={cx("not-italic tabular-nums", on ? (tabs ? "text-brand-deep" : "text-page/75") : "text-muted")}>{count}</i> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Переключатель-сегменты: общая подложка и белая плашка, которая плавно переезжает на выбранный пункт */
export function Segmented({ items, active, onChange }: { items: readonly (readonly [string | number, string])[]; active: string | number; onChange: (id: string) => void }) {
  const i = Math.max(0, items.findIndex(([id]) => String(id) === String(active)));
  return (
    <div role="tablist" className="relative inline-grid grid-flow-col auto-cols-fr self-start p-1 rounded-lg bg-surface-2 max-w-full overflow-x-auto">
      <span aria-hidden="true" style={{ width: `calc(100% / ${items.length})`, transform: `translateX(${i * 100}%)` }}
        className="absolute inset-y-1 left-0 rounded-md bg-surface shadow-[0_1px_3px_rgba(15,23,42,.12)] transition-transform duration-200 ease-out motion-reduce:transition-none" />
      {items.map(([id, label]) => (
        <button key={String(id)} type="button" aria-pressed={String(id) === String(active)} onClick={() => onChange(String(id))}
          className={cx("relative z-1 px-4 py-1.5 text-[13px] font-medium whitespace-nowrap border-0 bg-transparent cursor-pointer transition-colors duration-150",
            String(id) === String(active) ? "text-heading" : "text-muted hover:text-ink")}>{label}</button>
      ))}
    </div>
  );
}

/* ---------- Блоки ---------- */
export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="py-10 px-6 text-center rounded-card bg-surface-2/70 text-ink-2">
      <b>{title}</b>
      {children ? <p className="mt-1.5 mb-0 text-muted">{children}</p> : null}
    </div>
  );
}
export function Note({ tone, className, children }: { tone?: "warn" | "ok"; className?: string; children: ReactNode }) {
  return <p className={cx("m-0 px-4 py-3 rounded-lg text-sm", tone === "warn" ? "bg-warn-soft text-warn" : tone === "ok" ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2", className)}>{children}</p>;
}
export const card = "bg-surface border border-black/[.04] rounded-card shadow-card";
export function Panel({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx(card, "p-5 sm:p-6 flex flex-col gap-4 min-w-0", className)}>
      {title || actions ? (
        <div className="flex items-center justify-between gap-2.5">
          {title ? <h3 className="font-display text-sm font-semibold leading-tight">{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------- Плитки с числами ---------- */
export function Kpis({ small, children }: { small?: boolean; children: ReactNode }) {
  return <div className={cx("grid", small ? "grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2" : "grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3")}>{children}</div>;
}
export function Kpi({ label, value, sub, tone, subTone, small, onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "accent" | "bad"; subTone?: "ok" | "warn"; small?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={cx("flex flex-col gap-1 min-w-0 text-left",
      small ? "px-3 py-2.5 rounded-card bg-surface-2" : "p-6 gap-1.5 rounded-card bg-surface border border-black/[.04] shadow-card",
      onClick && "cursor-pointer hover:border-brand")}>
      <small className="text-[11px] font-medium tracking-[.05em] uppercase text-muted">{label}</small>
      <b className={cx("font-display font-medium leading-tight whitespace-nowrap tabular-nums text-heading", small ? "text-lg" : "text-[22px] sm:text-[26px]", tone === "bad" && "text-bad")}>{value}</b>
      {sub ? (
        <span className={cx("text-[11px] leading-snug",
          subTone === "ok" ? "self-start mt-1 px-3 py-1 rounded-full whitespace-nowrap bg-ok-soft text-ok font-medium"
            : subTone === "warn" ? "self-start mt-1 px-3 py-1 rounded-full whitespace-nowrap bg-warn-soft text-warn font-medium" : "text-muted")}>{sub}</span>
      ) : null}
    </Tag>
  );
}

/* ---------- Таблица ---------- */
// <Table> оборачивает <table>: заголовки, строки, итоговая строка в <tfoot>. Числа справа — className="text-right tabular-nums".
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx(card, "overflow-x-auto", className)}>
      <table className={cx("w-full border-collapse text-sm",
        "[&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-[.05em] [&_th]:uppercase [&_th]:text-[#94a3b8] [&_th]:px-4 [&_th]:py-3.5 [&_th]:border-b [&_th]:border-[#e2e8f0] [&_th]:whitespace-nowrap [&_th]:align-bottom",
        "[&_td]:px-4 [&_td]:py-4.5 [&_td]:border-b [&_td]:border-line/70 [&_td]:align-top",
        "[&_tbody_tr:last-child_td]:border-b-0 [&_tfoot_td]:border-t [&_tfoot_td]:border-b-0 [&_tfoot_td]:bg-surface-2 [&_tfoot_td]:font-semibold",
        "[&_tbody_td]:transition-colors [&_tbody_td]:duration-200 [&_tbody_tr:hover_td]:bg-[#f6f8fc]",
        "[&_td_small]:block [&_td_small]:text-xs [&_td_small]:text-muted [&_td_small]:font-medium [&_td_small]:mt-0.5")}>
        {children}
      </table>
    </div>
  );
}
/** Классы строки таблицы, по которой можно нажать */
export const rowClickable = "cursor-pointer hover:[&_td]:bg-surface-2";

/* ---------- Разделы карточки в боковой панели ---------- */
export function DHead({ eyebrow, title, children }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1.5 pr-9">
      {eyebrow ? <p className="m-0 text-[11px] font-medium tracking-[.05em] uppercase text-muted">{eyebrow}</p> : null}
      <h2 className="font-display text-[22px] font-semibold leading-tight wrap-anywhere">{title}</h2>
      {children}
    </header>
  );
}
export function DSec({ title, callout, className, children }: { title?: ReactNode; callout?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={cx("flex flex-col gap-2.5", callout ? "p-5 rounded-card bg-surface-2" : "pt-6 border-t border-line/70", className)}>
      {title ? <h3 className="text-[11px] font-medium tracking-[.05em] uppercase text-muted">{title}</h3> : null}
      {children}
    </section>
  );
}
export type KvItem = readonly [label: ReactNode, value: ReactNode, className?: string] | false | null | undefined;
/** Список «название — значение» */
export function Kv({ items, wide }: { items: readonly KvItem[]; wide?: boolean }) {
  return (
    <dl className={cx("grid m-0 gap-x-3.5 gap-y-2 grid-cols-1",
      wide ? "min-[561px]:grid-cols-[max-content_1fr] min-[1100px]:grid-cols-[max-content_1fr_max-content_1fr] min-[561px]:gap-x-4.5" : "min-[561px]:grid-cols-[140px_minmax(0,1fr)]")}>
      {items.filter((x): x is Exclude<KvItem, false | null | undefined> => Boolean(x)).map(([label, value, cls], i) => (
        <div key={i} className="contents">
          <dt className="text-muted text-sm">{label}</dt>
          <dd className={cx("m-0 wrap-anywhere max-[560px]:mb-2", cls)}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export const btnRow = "flex flex-wrap gap-2";
export const eyebrow = "m-0 text-[11px] font-medium tracking-[.05em] uppercase text-muted";

/* ---------- Комментарии ---------- */
export function CommentsList({ list = [] }: { list?: Comment[] }) {
  if (!list.length) return <p className="m-0 text-muted">Комментариев пока нет.</p>;
  return (
    <ol className="list-none m-0 mb-2.5 p-0 flex flex-col gap-2">
      {list.map((c, i) => (
        <li key={i} className="bg-surface-2 border-l-3 border-brand px-3 py-2">
          <div className="flex justify-between gap-3 items-baseline"><b>{c.by}</b><small className="text-muted text-xs">{dateTime(c.at)}</small></div>
          <p className="mt-0.5 mb-0 whitespace-pre-wrap wrap-anywhere">{c.text}</p>
        </li>
      ))}
    </ol>
  );
}
/** Форма комментария; stacked — кнопка снизу справа под полем */
export function CommentForm({ onSend, stacked, label = "Отправить" }: { onSend: (text: string) => boolean | void; stacked?: boolean; label?: string }) {
  const [text, setText] = useState("");
  return (
    <form className={cx("flex gap-2", stacked ? "flex-col items-stretch mt-2.5" : "items-end")}
      onSubmit={(e) => { e.preventDefault(); if (text.trim() && onSend(text.trim()) !== false) setText(""); }}>
      <textarea name="text" rows={2} maxLength={1000} required placeholder="Написать комментарий" value={text}
        onChange={(e) => setText(e.target.value)} className="flex-1 min-w-0" />
      <Button variant="primary" type="submit" className={stacked ? "self-end" : undefined}>{label}</Button>
    </form>
  );
}
