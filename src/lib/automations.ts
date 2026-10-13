// Автоматизации: правила «если случилось X, поставить задачу». Срабатывают сами при смене статуса заказа или новой заявке.
// Включать и выключать правила может руководитель в разделе «Данные».
import type { Data, Request, Task } from "./types";
import type { AuditEvents } from "./audit";

export const RULES: { id: string; title: string; hint: string }[] = [
  { id: "new", title: "Новая заявка", hint: "Менеджеру ставится задача обработать заявку в течение двух часов." },
  { id: "assigned", title: "Назначен мастер", hint: "Мастеру ставится задача подтвердить выезд к дате замера." },
  { id: "pricing", title: "Согласование стоимости", hint: "Менеджеру ставится задача согласовать стоимость с клиентом на следующий день." },
  { id: "done", title: "Заказ завершён", hint: "Менеджеру ставится задача позвонить клиенту и попросить отзыв через три дня." },
];

const HOUR = 36e5, DAY = 24 * HOUR;
export const autoOn = (d: Data, id: string) => d.settings[0]?.auto?.[id] !== false;
type NewTask = Omit<Task, "id" | "created_at">;

/** Задачи, которые нужно создать по событиям; дубли открытых задач пропускаются */
export function automationTasks(d: Data, ev: AuditEvents): NewTask[] {
  const out: NewTask[] = [];
  const active = d.staff.filter((s) => s.active);
  const manager = (r: Request) => active.find((s) => s.id === r.manager_id) || active.find((s) => s.role === "manager") || active.find((s) => s.role === "director");
  const add = (title: string, r: Request, assigneeId: number | undefined, due: number, note: string) => {
    if (!assigneeId || d.tasks.some((t) => !t.done_at && t.title === title) || out.some((t) => t.title === title)) return;
    out.push({ title, note: `Создано автоматически. ${note}`, assignee_id: assigneeId, created_by: 0, due: new Date(due).toISOString(), done_at: null, request_id: r.id });
  };
  const now = Date.now();
  if (autoOn(d, "new")) for (const r of ev.created) {
    if (r.status === "new") add(`Обработать новую заявку №${r.id}`, r, manager(r)?.id, now + 2 * HOUR, `Клиент: ${r.client}, ${r.phone}.`);
  }
  for (const r of ev.statusChanged) {
    if (r.status === "assigned" && autoOn(d, "assigned")) {
      const m = active.find((s) => s.master_id && s.master_id === r.master_id) || manager(r);
      add(`Подтвердить выезд — заказ №${r.id}`, r, m?.id, r.visit_at ? Date.parse(r.visit_at) - 2 * HOUR : now + DAY, `Адрес: ${r.address}.`);
    }
    if (r.status === "pricing" && autoOn(d, "pricing")) add(`Согласовать стоимость с клиентом — заказ №${r.id}`, r, manager(r)?.id, now + DAY, `Клиент: ${r.client}, ${r.phone}.`);
    if (r.status === "done" && autoOn(d, "done")) add(`Позвонить клиенту и попросить отзыв — заказ №${r.id}`, r, manager(r)?.id, now + 3 * DAY, `Клиент: ${r.client}, ${r.phone}.`);
  }
  return out;
}
