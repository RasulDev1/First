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
export const IconCog = ic(<><path d="M10.23 4.61 L10.64 1.89 L13.36 1.89 L13.77 4.61 L15.97 5.52 L18.19 3.89 L20.11 5.81 L18.48 8.03 L19.39 10.23 L22.11 10.64 L22.11 13.36 L19.39 13.77 L18.48 15.97 L20.11 18.19 L18.19 20.11 L15.97 18.48 L13.77 19.39 L13.36 22.11 L10.64 22.11 L10.23 19.39 L8.03 18.48 L5.81 20.11 L3.89 18.19 L5.52 15.97 L4.61 13.77 L1.89 13.36 L1.89 10.64 L4.61 10.23 L5.52 8.03 L3.89 5.81 L5.81 3.89 L8.03 5.52z" /><circle cx="12" cy="12" r="3" /></>);
export const IconCheck = ic(<path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />);

export const IconPin = ic(<><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>);
export const IconDoc = ic(<><path d="M6.5 3.5h8l3.5 3.5v13.5h-11.5z" /><path pathLength={1} className="l1" d="M9.5 11h5.5" /><path pathLength={1} className="l2" d="M9.5 14h5.5" /><path pathLength={1} className="l3" d="M9.5 17h3.5" /></>);
export const IconCheckCircle = ic(<><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.8 2.8 5.2-5.8" /></>);
export const IconXCircle = ic(<><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>);
export const IconPencil = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`absolute left-0 top-0 !size-3 fill-none stroke-current stroke-[2] [stroke-linecap:round] [stroke-linejoin:round] ${className}`}><path d="M4 20l1-4L16 5l3 3L8 19z" /></svg>
);
export const IconSearch = ic(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>);
