import type { ReactNode } from "react";
// Иконки одного набора: контурные, линия 1,5px, скруглённые концы (как в меню).
const base = "size-4 flex-none fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]";
export const IconX = ({ className = "" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconPlus = ({ className = "" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d="M12 5v14M5 12h14" /></svg>;
export const IconArrow = ({ up, className = "" }: { up?: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} /></svg>
);
export const IconCalendar = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></svg>
);
export const IconPhone = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d="M5 4.5h3.2l1.6 4-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4 1.6V18a1.5 1.5 0 0 1-1.6 1.5A14.5 14.5 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5z" /></svg>
);
const ic = (d: ReactNode) => ({ className = "" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}>{d}</svg>;
export const IconSpark = ic(<path d="M12 2.5l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" />);
export const IconUser = ic(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5" /></>);
export const IconRuler = ic(<><rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(-35 12 12)" /><path d="M8.5 14l1.2-1M11 11.8l1.2-1M13.5 9.6l1.2-1" /></>);
export const IconReceipt = ic(<path d="M6 3.5h12v17l-2.5-1.6-2 1.6-1.5-1.6-1.5 1.6-2-1.6L6 20.5zM9 8.5h6M9 12h6" />);
export const IconCog = ic(<><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18" /></>);
export const IconCheck = ic(<path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />);

/** Круг прогресса: доля заполнения 0…1 (1 — закрашенный круг с галочкой) */
export function IconProgress({ f, className = "" }: { f: number; className?: string }) {
  const a = f * Math.PI * 2, x = 12 + 5.5 * Math.sin(a), y = 12 - 5.5 * Math.cos(a);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}>
      {f >= 1 ? <><circle cx="12" cy="12" r="9.25" className="fill-current" /><path d="M7.8 12.4l3 3 5.4-6" className="stroke-white" /></> : <>
        <circle cx="12" cy="12" r="9" />
        {f > 0 ? <path className="fill-current stroke-none" d={`M12 12V6.5A5.5 5.5 0 ${f > .5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z`} /> : null}
      </>}
    </svg>
  );
}
/** Мигающая точка «ждёт внимания» */
export const IconPing = ({ className = "" }: { className?: string }) => (
  <span aria-hidden="true" className={`relative inline-flex size-3.5 items-center justify-center ${className}`}>
    <span className="absolute inline-flex size-2.5 rounded-full bg-current opacity-40 animate-ping" />
    <span className="relative inline-flex size-1.5 rounded-full bg-current" />
  </span>
);
