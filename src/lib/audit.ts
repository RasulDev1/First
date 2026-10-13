// Журнал изменений: после каждого сохранения базы сравниваем её со снимком и записываем, что и кто поменял.
// Так журнал ловит любые правки, откуда бы они ни пришли (карточка заказа, склад, задачи, сотрудники).
import { STATUSES } from "./config";
import { dateTime, money } from "./core";
import { sumsOf } from "./estimate";
import type { AuditEntry, Data, Request, TableName } from "./types";

const AUDITED: TableName[] = ["requests", "clients", "products", "tasks", "staff", "masters", "settings"];
const MAX_ENTRIES = 1000;
type Rec = Record<string, unknown> & { id: number };
export type Snap = Map<string, string>;

export const snapshot = (d: Data): Snap => {
  const snap: Snap = new Map();
  for (const t of AUDITED) for (const r of d[t] as Rec[]) snap.set(`${t}:${r.id}`, JSON.stringify(r));
  return snap;
};

const LABELS: Record<string, string> = {
  client: "клиент", phone: "телефон", address: "адрес", object: "объект", service: "услуга", source: "источник", note: "заметка",
  status: "статус", manager_id: "менеджер", master_id: "мастер", visit_at: "выезд", measured_at: "замеры", amount: "сумма",
  comment: "комментарий", name: "название", sku: "артикул", specs: "характеристики", unit: "ед.", cost: "закупка", price: "цена",
  min_qty: "минимум", category: "категория", title: "заголовок", assignee_id: "исполнитель", due: "срок", level: "уровень",
  rate: "ставка", active: "доступ", position: "должность", login: "логин", role: "роль", min_margin: "наценка",
};
const BLOCKS: Record<string, string> = { survey: "замеры изменены", estimate: "смета изменена", payments: "оплата изменена", expenses: "расход материалов изменён", items: "позиции изменены", rules: "правила автоматизаций изменены" };
const SKIP = new Set(["id", "created_at", "history", "comments", "done_at", "declined_by", "client_id", "salt", "request_id", "created_by"]);
const DATES = new Set(["visit_at", "measured_at", "due"]);
const MONEY = new Set(["amount", "cost", "price", "rate"]);

const CREATED: Partial<Record<TableName, string>> = { tasks: "поставлена", products: "добавлен" };
const clip = (v: string) => (v.length > 40 ? v.slice(0, 40) + "…" : v);

function show(d: Data, key: string, v: unknown): string {
  if (v == null || v === "") return "пусто";
  if (key === "status") return STATUSES.find((s) => s.id === v)?.title || String(v);
  if (key === "manager_id" || key === "assignee_id") return d.staff.find((s) => s.id === v)?.name || "—";
  if (key === "master_id") return d.masters.find((m) => m.id === v)?.name || "—";
  if (DATES.has(key)) return dateTime(String(v));
  if (MONEY.has(key)) return money(v);
  if (typeof v === "boolean") return v ? "да" : "нет";
  return clip(String(v));
}

function title(d: Data, t: TableName, r: Rec): string {
  switch (t) {
    case "requests": return `Заказ №${r.id}${r.client ? ` (${clip(String(r.client))})` : ""}`;
    case "clients": return `Клиент «${r.name}»`;
    case "products": return `Товар «${clip(String(r.name))}»`;
    case "tasks": return `Задача «${clip(String(r.title))}»`;
    case "staff": return `Сотрудник «${r.name}»`;
    case "masters": return `Мастер «${r.name}»`;
    default: return "Настройки";
  }
}

const paid = (r: Rec) => ((r.payments as { sum: number }[] | undefined) || []).reduce((n, p) => n + (p.sum || 0), 0);

function changes(d: Data, before: Rec, after: Rec): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (SKIP.has(k)) continue;
    const a = JSON.stringify(before[k]), b = JSON.stringify(after[k]);
    if (a === b) continue;
    if (k === "password_hash") { out.push("пароль изменён"); continue; }
    if (k === "estimate") { out.push(`смета: ${before.estimate ? money(sumsOf(before as unknown as Request).total) : "нет"} → ${after.estimate ? money(sumsOf(after as unknown as Request).total) : "нет"}`); continue; }
    if (k === "payments") { out.push(`оплата: ${money(paid(before))} → ${money(paid(after))}`); continue; }
    if (BLOCKS[k]) { out.push(BLOCKS[k]); continue; }
    out.push(`${LABELS[k] || k}: ${show(d, k, before[k])} → ${show(d, k, after[k])}`);
  }
  return out;
}

export interface AuditEvents { created: Request[]; statusChanged: Request[] }

/** Сравнивает базу со снимком, дописывает записи в журнал и обновляет снимок */
export function recordChanges(d: Data, snap: Snap, user: string): AuditEvents {
  const events: AuditEvents = { created: [], statusChanged: [] };
  const entries: Omit<AuditEntry, "id">[] = [];
  const at = new Date().toISOString();
  const seen = new Set<string>();
  for (const t of AUDITED) {
    for (const r of d[t] as Rec[]) {
      const key = `${t}:${r.id}`;
      seen.add(key);
      const now = JSON.stringify(r), was = snap.get(key);
      if (was === now) continue;
      if (was == null) {
        entries.push({ at, user, table: t, rec: r.id, action: "create", text: `${title(d, t, r)}: ${CREATED[t] || "создан"}` });
        if (t === "requests") events.created.push(r as unknown as Request);
      } else {
        const before = JSON.parse(was) as Rec;
        const list = changes(d, before, r);
        if (list.length) entries.push({ at, user, table: t, rec: r.id, action: "update", text: `${title(d, t, r)}: ${list.join("; ")}` });
        if (t === "requests" && before.status !== r.status) events.statusChanged.push(r as unknown as Request);
      }
      snap.set(key, now);
    }
  }
  for (const key of [...snap.keys()]) {
    if (seen.has(key)) continue;
    const [t, id] = key.split(":");
    const old = JSON.parse(snap.get(key)!) as Rec;
    entries.push({ at, user, table: t as TableName, rec: Number(id), action: "delete", text: `${title(d, t as TableName, { ...old, id: Number(id) })}: удалён` });
    snap.delete(key);
  }
  if (entries.length) addEntries(d, entries);
  return events;
}

export function addEntries(d: Data, entries: Omit<AuditEntry, "id">[]) {
  const log = (d.audit ||= []);
  let id = log.reduce((m, e) => Math.max(m, e.id), 0);
  for (const e of entries) log.push({ id: ++id, ...e });
  if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
}
