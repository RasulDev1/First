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
