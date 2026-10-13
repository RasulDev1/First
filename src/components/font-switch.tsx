"use client";
// Переключатель шрифта интерфейса: Inter или Geist Sans. Выбор хранится в браузере.
import { useEffect, useState } from "react";
import { cx } from "./ui";

const FONTS = [["inter", "Inter"], ["geist", "Geist Sans"]] as const;
type FontId = (typeof FONTS)[number][0];
const KEY = "ventcrm_font";

export function FontSwitch({ dark, className }: { dark?: boolean; className?: string }) {
  const [font, setFont] = useState<FontId>("inter");
  useEffect(() => {
    const cur = document.documentElement.dataset.font;
    if (cur === "geist" || cur === "inter") setFont(cur);
  }, []);
  const pick = (f: FontId) => {
    setFont(f);
    document.documentElement.dataset.font = f;
    try { localStorage.setItem(KEY, f); } catch { /* без сохранения */ }
  };
  return (
    <div role="group" aria-label="Шрифт" className={cx("flex flex-col gap-1.5", className)}>
      <span className={cx("text-[11px] font-medium tracking-[.05em] uppercase", dark ? "text-white/70" : "text-muted")}>Шрифт</span>
      <div className={cx("grid grid-cols-2 gap-1 p-1 rounded-lg", dark ? "bg-white/10" : "bg-surface-2")}>
        {FONTS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={font === id} onClick={() => pick(id)}
            style={{ fontFamily: id === "inter" ? "Inter, system-ui, sans-serif" : "Geist, system-ui, sans-serif" }}
            className={cx("px-2 py-1.5 rounded-md text-[13px] cursor-pointer border-0 transition-colors",
              font === id ? "bg-white text-[#1e3a8a] font-semibold shadow-sm" : dark ? "bg-transparent text-white hover:bg-white/10" : "bg-transparent text-ink-2 hover:bg-white")}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
