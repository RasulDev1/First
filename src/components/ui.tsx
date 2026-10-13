"use client";
// Общие элементы интерфейса CRM на Tailwind: кнопки, поля, статусы, чипы, плитки, панели, таблицы, разделы карточки.
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { STATUSES } from "@/lib/config";
import { IconCheck, IconCheckCircle, IconXCircle, IconCog, IconDoc, IconPencil, IconPin, IconReceipt, IconRuler, IconSpark, IconUser, IconX } from "./icons";
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
      <span className="text-[13px] font-medium text-black">{label}</span>
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
// Цвета статусов по этапам: старт, подготовка, работа, архив
const PILL: Record<string, string> = {
  new: "bg-[#eff6ff] text-[#1e40af]",
  assigned: "bg-[#fff7ed] text-[#b45309]", measure: "bg-[#fff7ed] text-[#b45309]", pricing: "bg-[#fff7ed] text-[#b45309]",
  in_work: "bg-[#f5f3ff] text-[#5b21b6]",
  done: "bg-[#f0fdf4] text-[#166534]", cancelled: "bg-[#f9fafb] text-[#6b7280]",
};
const PILL_ICON: Record<string, ReactNode> = {
  new: <IconSpark />, assigned: <IconUser />, measure: <IconRuler />, pricing: <IconReceipt />,
  in_work: <IconCog />, done: <IconCheck />, cancelled: <IconX />,
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
function statusIcon(id: string): ReactNode {
    if (id === "new") return <IconSpark className="live-twinkle" />;
    if (id === "assigned") return (
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <i className="live-wave absolute inset-0 rounded-full border border-current" />
        <i className="live-wave w2 absolute inset-0 rounded-full border border-current" />
        <IconUser className="relative" />
      </span>
    );
    if (id === "measure") return (
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <IconPin className="live-hop" />
        <i className="live-hop-shadow absolute -bottom-0.5 left-1/2 -ml-[3px] h-[2px] w-[6px] rounded-full bg-current" />
      </span>
    );
    if (id === "pricing") return (
      <span className="relative inline-flex size-3.5 items-center justify-center">
        <IconDoc className="live-lines" />
        <IconPencil className="live-pencil" />
      </span>
    );
    if (id === "in_work") return <IconCog className="animate-spin-slow" />;
    if (id === "done") return (
      <span className="live-done relative inline-flex size-3.5 items-center justify-center">
        <IconCheckCircle />
        {[["-7px", "-7px"], ["7px", "-7px"], ["-8px", "4px"], ["8px", "4px"]].map(([x, y]) => (
          <i key={x + y} className="absolute left-1/2 top-1/2 -ml-px -mt-px size-[3px] rounded-full bg-current" style={{ "--dx": x, "--dy": y } as React.CSSProperties} />
        ))}
      </span>
    );
    if (id === "cancelled") return <IconXCircle className="live-shake" />;
  return PILL_ICON[id] ?? PILL_ICON.cancelled;
}
export function StatusPill({ id }: { id: StatusId | string }) {
  return (
    <span className={cx("group inline-flex items-center justify-center gap-1.5 self-start w-max px-2.5 py-1 rounded-[5px] text-xs font-medium whitespace-nowrap", PILL[id] ?? PILL.cancelled, id === "cancelled" && "live-fade")}>
      <span className="inline-flex items-center [&_svg]:block [&_svg]:size-3.5 [&_svg]:stroke-[1.75]">{statusIcon(id)}</span>{id === "pricing" ? <span className="text-center leading-tight">Согласование<br />стоимости</span> : statusTitle(id)}
    </span>
  );
}

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
export function Table({ className, center, widths, resize, children }: { className?: string; center?: boolean; widths?: number[]; resize?: boolean; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const tbl = useRef<HTMLTableElement>(null);
  const [cols, setCols] = useState<number[] | null>(null);
  const touched = useRef(false);
  // Первый показ: измеряем естественную ширину колонок и дальше ведём их в пикселях
  useLayoutEffect(() => {
    if (!resize || cols || !tbl.current) return;
    const ths = Array.from(tbl.current.querySelectorAll("thead th"));
    if (ths.length) setCols(ths.map((th) => (th as HTMLElement).offsetWidth));
  });
  // Без ручной правки таблица подстраивается под ширину окна
  useEffect(() => {
    const el = wrap.current;
    if (!resize || !el || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) { w = el.clientWidth; if (!touched.current) setCols(null); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [resize]);
  // Ручки изменения ширины в каждом заголовке
  useEffect(() => {
    const t = tbl.current;
    if (!resize || !t || !cols) return;
    t.querySelectorAll("thead th").forEach((th) => {
      if (th.querySelector(":scope > [data-resize]")) return;
      const h = document.createElement("span");
      h.setAttribute("data-resize", "");
      h.setAttribute("role", "separator");
      h.setAttribute("aria-orientation", "vertical");
      h.title = "Потяните, чтобы изменить ширину";
      h.className = "absolute top-0 -right-[5px] z-10 h-full w-[11px] cursor-col-resize touch-none after:content-[''] after:absolute after:top-[22%] after:bottom-[22%] after:left-[5px] after:w-px after:bg-[#cbd5e1] hover:after:bg-[#2563eb] hover:after:w-[2px] hover:after:left-[4.5px]";
      h.addEventListener("click", (e) => e.stopPropagation());
      h.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const all = Array.from(t.querySelectorAll("thead th"));
        const start = e.clientX, base = all.map((x) => (x as HTMLElement).offsetWidth), idx = all.indexOf(th);
        h.setPointerCapture(e.pointerId);
        touched.current = true;
        const move = (ev: PointerEvent) => {
          const next = idx + 1 < base.length;
          let d = Math.max(ev.clientX - start, 56 - base[idx]);
          if (next) d = Math.min(d, base[idx + 1] - 56);
          setCols(base.map((w, j) => (j === idx ? w + d : next && j === idx + 1 ? w - d : w)));
        };
        const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
        h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
      });
      (th as HTMLElement).appendChild(h);
    });
  });
  return (
    <div ref={wrap} className={cx(card, "overflow-x-auto", className)}>
      <table ref={tbl} style={cols ? { width: cols.reduce((a, b) => a + b, 0), tableLayout: "fixed" } : undefined}
        className={cx(cols ? "max-w-none" : "w-full", "border-collapse text-sm", center && "[&_td]:text-center", widths && !cols && "table-fixed min-w-[900px]", widths && "[&_th]:!whitespace-normal [&_th]:leading-snug [&_td]:px-3 [&_th]:px-3",
        cols && "[&_td]:overflow-hidden [&_td]:text-ellipsis [&_th]:overflow-hidden [&_th]:text-ellipsis",
        resize && "[&_th]:relative",
        (center ? "[&_th]:text-center" : "[&_th]:text-left"), "[&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-[.08em] [&_th]:uppercase [&_th]:!text-black [&_th_*]:!text-black [&_th]:px-4 [&_th]:py-3.5 [&_th]:border-b [&_th]:border-[#e2e8f0] [&_th]:whitespace-nowrap [&_th]:align-bottom",
        "[&_td]:px-4 [&_td]:py-4.5 [&_td]:border-b [&_td]:border-line/70 [&_td]:align-middle",
        "[&_tbody_tr:last-child_td]:border-b-0 [&_tfoot_td]:border-t [&_tfoot_td]:border-b-0 [&_tfoot_td]:bg-surface-2 [&_tfoot_td]:font-semibold",
        "[&_tbody_td]:transition-colors [&_tbody_td]:duration-200 [&_tbody_tr:hover_td]:bg-[#f6f8fc]",
        "[&_td_small]:block [&_td_small]:text-xs [&_td_small]:text-muted [&_td_small]:font-medium [&_td_small]:mt-0.5")}>
        {cols ? <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
          : widths ? <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup> : null}
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
      {eyebrow ? <p className="m-0 text-[11px] font-medium tracking-[.05em] uppercase text-black">{eyebrow}</p> : null}
      <h2 className="font-display text-[22px] font-semibold leading-tight wrap-anywhere text-black">{title}</h2>
      {children}
    </header>
  );
}
export function DSec({ title, callout, className, children }: { title?: ReactNode; callout?: boolean; className?: string; children: ReactNode }) {
  return (
    <section className={cx("flex flex-col gap-2.5", callout ? "p-5 rounded-card bg-surface-2" : "pt-6 border-t border-line/70", className)}>
      {title ? <h3 className="text-[11px] font-medium tracking-[.05em] uppercase text-black">{title}</h3> : null}
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
