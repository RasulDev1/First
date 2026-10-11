// «База» CRM прямо в браузере: таблицы как в supabase-crm.sql (сотрудники, мастера, заказы, товары, остатки по местам,
// движения склада, задачи). Данные лежат в localStorage — общие для всех вкладок этого браузера (crm и форма заявки);
// изменения из другой вкладки приходят через событие storage и перерисовывают экран.
import { STORAGE_PREFIX, emit } from "./core.js";
import { seed } from "./seed.js";

const DB_KEY = STORAGE_PREFIX + "db_v2";
const TABLES = ["staff", "masters", "requests", "products", "stock", "moves", "tasks"];

let data = null;
let broken = false; // localStorage недоступен или переполнен — работаем в памяти вкладки

function load() {
  if (data) return data;
  if (!broken) {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) data = JSON.parse(raw);
    } catch { broken = true; }
  }
  if (!data || !TABLES.every((t) => Array.isArray(data[t]))) { data = seed(); persist(); }
  return data;
}

function persist() {
  if (broken) return;
  try { localStorage.setItem(DB_KEY, JSON.stringify(data)); } catch { broken = true; }
}

function commit() {
  persist();
  emit("db");
}

window.addEventListener("storage", (e) => {
  if (e.key !== DB_KEY || !e.newValue) return;
  try { data = JSON.parse(e.newValue); emit("db"); } catch {}
});

const nextId = (table) => {
  const d = load();
  d.seq ||= {};
  d.seq[table] = Math.max(d.seq[table] || 0, ...d[table].map((r) => r.id || 0)) + 1;
  return d.seq[table];
};

export const db = {
  list: (table) => load()[table],
  find: (table, id) => load()[table].find((r) => r.id === Number(id)) || null,
  insert(table, row) {
    const record = { id: nextId(table), created_at: new Date().toISOString(), ...row };
    load()[table].push(record);
    commit();
    return record;
  },
  /** Несколько изменений одной записью в хранилище */
  batch(fn) { fn(); commit(); },
  insertQuiet(table, row) {
    const record = { id: nextId(table), created_at: new Date().toISOString(), ...row };
    load()[table].push(record);
    return record;
  },
  patch(table, id, changes) {
    const row = db.find(table, id);
    if (!row) return null;
    Object.assign(row, changes);
    commit();
    return row;
  },
  remove(table, id) {
    const d = load();
    d[table] = d[table].filter((r) => r.id !== Number(id));
    commit();
  },
  removeWhere(table, test) {
    const d = load();
    d[table] = d[table].filter((r) => !test(r));
  },
  reset() {
    data = seed();
    broken = false;
    commit();
  },
  get persistent() { load(); return !broken; },
};

/** Хеш пароля: пароль в открытом виде не хранится. В демо — FNV-1a с солью, в Supabase — crypt() из pgcrypto. */
export function hashPassword(password, salt) {
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
