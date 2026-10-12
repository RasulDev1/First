// Иконки одного набора: контурные, линия 1,5px, скруглённые концы (как в меню).
const base = "size-4 flex-none fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]";
export const IconX = ({ className = "" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconPlus = ({ className = "" }: { className?: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d="M12 5v14M5 12h14" /></svg>;
export const IconArrow = ({ up, className = "" }: { up?: boolean; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`}><path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} /></svg>
);
