"use client";
// «Автоматизации» (руководитель): правила, которые сами ставят задачи при событиях в заказах.
import { pluralize } from "@/lib/core";
import { db } from "@/lib/db";
import { RULES } from "@/lib/automations";
import type { View } from "./types";

function Automations() {
  const toggle = (id: string, on: boolean) => {
    const s = db.list("settings")[0];
    db.patch("settings", s.id, { auto: { ...(s.auto || {}), [id]: on } });
  };
  const made = db.list("tasks").filter((t) => t.created_by === 0).length;
  return (
    <>
      <p className="m-0 text-ink-2 max-w-[70ch]">Правила сами ставят задачи, когда в заказе что-то происходит. Созданные задачи видны в разделе «Задачи», в карточке задачи в поле «Поставил» указано «Автоматизация». Повторно задача по тому же заказу не создаётся, пока прежняя не выполнена.</p>
      <div className="flex flex-col gap-2.5">
        {RULES.map((r) => {
          const on = db.list("settings")[0]?.auto?.[r.id] !== false;
          return (
            <label key={r.id} className="flex items-center gap-4 px-5 py-4 rounded-card border border-black/[.04] shadow-card bg-surface cursor-pointer">
              <input type="checkbox" checked={on} onChange={(e) => toggle(r.id, e.target.checked)} className="size-5 flex-none" />
              <span className="flex flex-col gap-0.5 min-w-0">
                <b>Если: {r.title.toLowerCase()}</b>
                <span className="text-sm text-ink-2">{r.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="m-0 text-sm text-muted">Автоматически создано {made} {pluralize(made, "задача", "задачи", "задач")}.</p>
    </>
  );
}


const view: View = { title: () => "Автоматизации", Component: Automations };
export default view;
