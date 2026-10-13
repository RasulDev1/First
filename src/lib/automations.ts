// Автоматизации: правила «когда в заказе что-то случилось, поставить задачу». Срабатывают сами при новой заявке или смене статуса.
// Руководитель меняет правила и создаёт новые в разделе «Автоматизации»; до первой правки действуют правила по умолчанию.
import type { AutoRule, Data, Request, Task } from "./types";
import type { AuditEvents } from "./audit";

export const DEFAULT_RULES: AutoRule[] = [
  { id: "r-new", name: "Новая заявка", on: true, trigger: "new", assignee: "manager", title: "Обработать новую заявку {n}",
    note: "Клиент: {client}, {phone}.", after_h: 2 },
  { id: "r-assigned", name: "Назначен мастер", on: true, trigger: "assigned", assignee: "master", title: "Подтвердить выезд — заказ {n}",
    note: "Адрес: {address}.", after_h: 24 },
  { id: "r-pricing", name: "Согласование стоимости", on: true, trigger: "pricing", assignee: "manager", title: "Согласовать стоимость с клиентом — заказ {n}",
    note: "Клиент: {client}, {phone}.", after_h: 24 },
  { id: "r-done", name: "Заказ завершён", on: true, trigger: "done", assignee: "manager", title: "Позвонить клиенту и попросить отзыв — заказ {n}",
    note: "Клиент: {client}, {phone}.", after_h: 72 },
];

export const ASSIGNEES: { id: AutoRule["assignee"]; title: string }[] = [
  { id: "manager", title: "Менеджеру заказа" },
  { id: "master", title: "Мастеру заказа" },
  { id: "director", title: "Руководителю" },
];

export const rulesOf = (d: Data): AutoRule[] => d.settings[0]?.rules ?? DEFAULT_RULES;

const fill = (text: string, r: Request) => text
  .replaceAll("{n}", `№${r.id}`).replaceAll("{client}", r.client || "").replaceAll("{phone}", r.phone || "").replaceAll("{address}", r.address || "");

type NewTask = Omit<Task, "id" | "created_at">;

/** Задачи, которые нужно создать по событиям; дубли открытых задач пропускаются */
export function automationTasks(d: Data, ev: AuditEvents): NewTask[] {
  const out: NewTask[] = [];
  const active = d.staff.filter((s) => s.active);
  const who = (rule: AutoRule, r: Request) => {
    const manager = active.find((s) => s.id === r.manager_id) || active.find((s) => s.role === "manager");
    const director = active.find((s) => s.role === "director");
    if (rule.assignee === "director") return director;
    if (rule.assignee === "master") return active.find((s) => s.master_id && s.master_id === r.master_id) || manager || director;
    return manager || director;
  };
  const now = Date.now();
  const rules = rulesOf(d).filter((x) => x.on);
  const fire = (rule: AutoRule, r: Request) => {
    const title = fill(rule.title, r), to = who(rule, r);
    if (!title.trim() || !to || d.tasks.some((t) => !t.done_at && t.title === title) || out.some((t) => t.title === title)) return;
    out.push({
      title, note: `Создано автоматически (${rule.name}). ${fill(rule.note || "", r)}`.trim(), assignee_id: to.id, created_by: 0,
      due: new Date(now + Math.max(0, rule.after_h) * 36e5).toISOString(), done_at: null, request_id: r.id,
    });
  };
  for (const r of ev.created) if (r.status === "new") rules.filter((x) => x.trigger === "new").forEach((x) => fire(x, r));
  for (const r of ev.statusChanged) rules.filter((x) => x.trigger === r.status).forEach((x) => fire(x, r));
  return out;
}
