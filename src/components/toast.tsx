"use client";
// Короткое уведомление внизу экрана: toast("Сохранено"), toast("Ошибка", "bad").
import { useEffect, useState } from "react";
import { cx } from "./ui";

type Listener = (text: string, kind: string) => void;
let listener: Listener | null = null;
export function toast(text: string, kind: "" | "bad" = "") { listener?.(text, kind); }

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; kind: string; n: number } | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    listener = (text, kind) => { setMsg((m) => ({ text, kind, n: (m?.n ?? 0) + 1 })); setShow(true); };
    return () => { listener = null; };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div role="status" aria-live="polite"
      className={cx("fixed left-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] z-[80] -translate-x-1/2 max-w-[calc(100%-32px)] px-4.5 py-2.5 rounded-xl font-bold text-sm shadow-card pointer-events-none transition-[opacity,transform] duration-200",
        msg?.kind === "bad" ? "bg-bad text-white" : "bg-ink text-page", show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5")}>
      {msg?.text}
    </div>
  );
}
