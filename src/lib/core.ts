// Общие помощники: форматирование, хранилище браузера, копирование.

export const money = (rub: unknown) => Math.round(Number(rub) || 0).toLocaleString("ru-RU") + " ₽";
export const num = (n: unknown) => (Number(n) || 0).toLocaleString("ru-RU");
export const pluralize = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** «12 октября, 14:30» */
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";
/** «12.10.2026» */
export const dateShort = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "—");
const pad = (n: number) => String(n).padStart(2, "0");
/** Значение для <input type="datetime-local"> */
export const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const time = (iso: string) => new Date(iso).getTime();

// Хранилище: ключи с приставкой; если localStorage недоступен (приватный режим), значения живут в памяти вкладки.
export const STORAGE_PREFIX = "ventcrm_";
const memory = new Map<string, unknown>();
export const storage = {
  get<T>(key: string, fallback: T): T {
    if (memory.has(key)) return (memory.get(key) as T) ?? fallback;
    try { return (JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? "null") as T) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown) {
    memory.set(key, value);
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch {}
  },
  remove(key: string) {
    memory.delete(key);
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
  },
};

/** Копирует текст; возвращает true, если получилось */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Значение поля формы строкой без пробелов по краям */
export const formValue = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
