"use client";
// Всплывающее окно справа вверху: когда сотруднику поставили новую задачу (вручную или автоматизацией), она появляется на экране сама.
import { useEffect, useState } from "react";
import { dateTime, storage } from "@/lib/core";
import { db, useDb } from "@/lib/db";
import type { Staff, Task } from "@/lib/types";
import { go } from "./nav";
import { cx } from "./ui";

const KEY = "task_seen"; // userId → самый большой номер задачи, о которой уже сказали
const SHOW_MS = 20000;

export function TaskPopups({ user }: { user: Staff }) {
  useDb();
  const [shown, setShown] = useState<Task[]>([]);
  const mine = db.list("tasks").filter((t) => t.assignee_id === user.id && !t.done_at);
  const top = mine.reduce((m, t) => Math.max(m, t.id), 0);
  const fresh = (seen: number) => mine.filter((t) => t.id > seen && t.created_by !== user.id);

  useEffect(() => {
    const all = storage.get<Record<string, number>>(KEY, {});
    const seen = all[user.id];
    if (seen == null) { storage.set(KEY, { ...all, [user.id]: top }); return; } // первый вход: старые задачи не показываем
    const news = fresh(seen);
    if (!news.length && top <= seen) return;
    storage.set(KEY, { ...all, [user.id]: Math.max(top, seen) });
    if (news.length) setShown((cur) => [...cur, ...news.filter((n) => !cur.some((c) => c.id === n.id))]);
  }, [top, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shown.length) return;
    const t = setTimeout(() => setShown((cur) => cur.slice(1)), SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown.length) return null;
  const close = (id: number) => setShown((cur) => cur.filter((t) => t.id !== id));
  return (
    <div role="region" aria-live="polite" aria-label="Новые задачи" className="fixed z-[90] top-3 right-3 left-3 sm:left-auto sm:w-[360px] flex flex-col gap-2.5 pointer-events-none">
      {shown.slice(-3).map((t) => (
        <div key={t.id} className={cx("pointer-events-auto rounded-card bg-surface shadow-[0_10px_30px_-8px_rgba(15,23,42,.35)] border border-black/[.06] border-l-4 border-l-brand p-4 flex flex-col gap-2 animate-[toast-in_.25s_ease-out]")}>
          <div className="flex items-start gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-medium tracking-[.05em] uppercase text-muted">{t.created_by === 0 ? "Новая задача · автоматизация" : "Новая задача"}</span>
              <b className="block mt-0.5 leading-snug wrap-anywhere">{t.title}</b>
            </span>
            <button type="button" aria-label="Закрыть" onClick={() => close(t.id)} className="border-0 bg-transparent text-muted text-xl leading-none cursor-pointer px-1">×</button>
          </div>
          <span className="text-sm text-ink-2">Срок: {dateTime(t.due)}</span>
          <button type="button" onClick={() => { close(t.id); go("tasks"); }} className="self-start px-3.5 py-1.5 rounded-lg border-0 bg-brand text-white text-sm font-medium cursor-pointer">Открыть задачи</button>
        </div>
      ))}
    </div>
  );
}
