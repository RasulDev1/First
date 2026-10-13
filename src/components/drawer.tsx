"use client";
// Выезжающая справа панель: карточки заказов, формы. Открывается из любого места: openDrawer(() => <Карточка />).
// Содержимое перерисовывается при каждом изменении базы, поэтому карточка всегда показывает свежие данные.
import { IconX } from "./icons";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useDb } from "@/lib/db";
import { cx } from "./ui";

export interface DrawerOptions { wide?: boolean; full?: boolean }
interface State { render: () => ReactNode; opts: DrawerOptions; key: number }

let state: State | null = null;
let counter = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function openDrawer(render: () => ReactNode, opts: DrawerOptions = {}) {
  state = { render, opts, key: ++counter };
  notify();
}
export function closeDrawer() {
  if (!state) return;
  state = null;
  notify();
}
export const isDrawerOpen = () => Boolean(state);
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useDrawer = () => useSyncExternalStore(subscribe, () => state, () => null);

export function DrawerHost() {
  useDb();
  const current = useDrawer();
  // Последнее содержимое держим, пока панель уезжает
  const [shown, setShown] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (current) {
      setShown(current);
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    }
    setOpen(false);
    const t = setTimeout(() => setShown(null), 220);
    return () => clearTimeout(t);
  }, [current]);
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", Boolean(current));
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current]);
  const view = current ?? shown;
  if (!view) return null;
  const { wide, full } = view.opts;
  return (
    <>
      {current ? <div className="fixed inset-0 z-40 bg-[rgba(10,25,26,.35)]" onClick={closeDrawer} /> : null}
      <aside aria-label="Карточка" id="drawer"
        className={cx("fixed top-0 right-0 bottom-0 z-50 bg-surface border-l border-black/[.04] shadow-[0_0_40px_rgba(15,23,42,.10)] overflow-y-auto overscroll-contain transition-transform duration-200 ease-out",
          "pt-[calc(env(safe-area-inset-top,0px)+22px)] pb-[calc(env(safe-area-inset-bottom,0px)+32px)] px-5 min-[561px]:px-8",
          full ? "w-full border-l-0 min-[561px]:px-[clamp(16px,4vw,48px)]" : wide ? "w-[min(680px,100%)]" : "w-[min(480px,100%)]",
          open && current ? "translate-x-0" : "translate-x-full")}>
        <button type="button" aria-label="Закрыть" onClick={closeDrawer}
          className={cx("z-10 size-9 grid place-items-center rounded-lg border-0 bg-surface-2 text-muted hover:text-heading cursor-pointer", full ? "fixed top-[calc(env(safe-area-inset-top,0px)+14px)] right-4" : "sticky top-0 float-right -mt-1.5 -mr-2 ml-2")}><IconX /></button>
        <div key={view.key} className={cx("flex flex-col gap-6", full && "w-full max-w-[960px] mx-auto")}>{view.render()}</div>
      </aside>
    </>
  );
}
