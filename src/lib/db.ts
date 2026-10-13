// «База» CRM прямо в браузере: таблицы как в supabase-crm.sql (сотрудники, мастера, заказы, товары, остатки по местам,
// движения склада, задачи, клиенты). Данные лежат в localStorage — общие для всех вкладок этого браузера (CRM и форма заявки);
// изменения из другой вкладки приходят через событие storage и перерисовывают экран.
import { useSyncExternalStore } from "react";
import { STORAGE_PREFIX, storage } from "./core";
import { addEntries, recordChanges, snapshot, type Snap } from "./audit";
import { automationTasks } from "./automations";
import { seed } from "./seed";
import type { Data, Row, TableName } from "./types";

const DB_KEY = STORAGE_PREFIX + "db_v15";
const TABLES: TableName[] = ["staff", "masters", "requests", "products", "stock", "moves", "tasks", "clients", "settings"];

let data: Data | null = null;
let broken = false; // localStorage недоступен или переполнен — работаем в памяти вкладки
let version = 0;
let snap: Snap | null = null; // снимок базы для журнала изменений
const listeners = new Set<() => void>();

function load(): Data {
  if (data) return data;
  if (!broken) {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) data = JSON.parse(raw) as Data;
    } catch { broken = true; }
  }
  if (!data || !TABLES.every((t) => Array.isArray(data![t]))) { data = seed(); persist(); }
  snap ||= snapshot(data);
  return data;
}

function persist() {
  if (broken || !data) return;
  try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch { broken = true; }
}

function notify() {
  version++;
  listeners.forEach((fn) => fn());
}

/** Кто сейчас работает: берём из сессии, чтобы журнал не зависел от экранов */
function actorName(d: Data) {
  const session = storage.get<{ id: number } | null>("session", null);
  return d.staff.find((s) => s.id === session?.id)?.name || "Форма заявки";
}

function audit() {
  const d = load();
  const events = recordChanges(d, snap!, actorName(d));
  const tasks = automationTasks(d, events);
  if (!tasks.length) return;
  for (const t of tasks) db.insertQuiet("tasks", t);
  recordChanges(d, snap!, "Автоматизация");
}

function commit() {
  audit();
  persist();
  notify();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== DB_KEY || !e.newValue) return;
    try { data = JSON.parse(e.newValue) as Data; snap = snapshot(data); notify(); } catch {}
  });
}

const nextId = (table: TableName) => {
  const d = load();
  d.seq ||= {};
  d.seq[table] = Math.max(d.seq[table] || 0, ...(d[table] as { id: number }[]).map((r) => r.id || 0)) + 1;
  return d.seq[table]!;
};

type NewRow<T extends TableName> = Omit<Row<T>, "id" | "created_at"> & Partial<Pick<Row<T>, "id">>;

export const db = {
  list: <T extends TableName>(table: T) => load()[table] as Row<T>[],
  find: <T extends TableName>(table: T, id: unknown) =>
    ((load()[table] as Row<T>[]).find((r) => r.id === Number(id)) ?? null) as Row<T> | null,
  insert<T extends TableName>(table: T, row: NewRow<T>): Row<T> {
    const record = db.insertQuiet(table, row);
    commit();
    return record;
  },
  /** Несколько изменений одной записью в хранилище */
  batch(fn: () => void) { fn(); commit(); },
  insertQuiet<T extends TableName>(table: T, row: NewRow<T>): Row<T> {
    const record = { id: nextId(table), created_at: new Date().toISOString(), ...row } as unknown as Row<T>;
    (load()[table] as Row<T>[]).push(record);
    return record;
  },
  patch<T extends TableName>(table: T, id: unknown, changes: Partial<Row<T>>) {
    const row = db.find(table, id);
    if (!row) return null;
    Object.assign(row, changes);
    commit();
    return row;
  },
  remove(table: TableName, id: unknown) {
    const d = load();
    (d[table] as { id: number }[]) = (d[table] as { id: number }[]).filter((r) => r.id !== Number(id));
    commit();
  },
  removeWhere<T extends TableName>(table: T, test: (row: Row<T>) => boolean) {
    const d = load();
    (d[table] as Row<T>[]) = (d[table] as Row<T>[]).filter((r) => !test(r));
  },
  /** Сохранить изменения, сделанные прямо в объектах записей */
  save() { commit(); },
  reset() {
    data = seed();
    snap = snapshot(data);
    broken = false;
    commit();
  },
  exportAudit: () => load().audit || [],
  /** Вся база одним JSON-файлом: резервная копия */
  exportJson: () => JSON.stringify(load(), null, 1),
  /** Восстановление из резервной копии; бросает ошибку, если файл не похож на копию */
  restore(json: string) {
    let next: Data;
    try { next = JSON.parse(json) as Data; } catch { throw new Error("Файл не читается: это не резервная копия CRM."); }
    if (!next || typeof next !== "object" || !TABLES.every((t) => Array.isArray(next[t]))) throw new Error("В файле нет данных CRM.");
    data = next;
    snap = snapshot(data);
    addEntries(data, [{ at: new Date().toISOString(), user: actorName(data), action: "system", text: "Данные восстановлены из резервной копии" }]);
    commit();
  },
  get persistent() { load(); return !broken; },
};

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Подписка компонента на любые изменения базы; возвращает номер версии данных */
export const useDb = () => useSyncExternalStore(subscribe, () => version, () => -1);

/** Хеш пароля: пароль в открытом виде не хранится. В демо — FNV-1a с солью, в Supabase — crypt() из pgcrypto. */
export function hashPassword(password: string, salt: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const text = `${salt}:${password}:ventcrm`;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (c + round), 2246822519) >>> 0;
    }
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
export const newSalt = () => Math.random().toString(36).slice(2, 10);
