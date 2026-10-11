// Общие помощники: DOM, форматирование, хранилище, события, уведомления.

export const $ = (id) => document.getElementById(id);
export const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export const money = (rub) => Math.round(Number(rub) || 0).toLocaleString("ru-RU") + " ₽";
export const num = (n) => (Number(n) || 0).toLocaleString("ru-RU");
export const pluralize = (n, one, few, many) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

/** «12 октября, 14:30» */
export const dateTime = (iso) => iso ? new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";
/** «12.10.2026» */
export const dateShort = (iso) => iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";
const pad = (n) => String(n).padStart(2, "0");
/** Значение для <input type="datetime-local"> */
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Хранилище: ключи с приставкой; если localStorage недоступен (приватный режим), значения живут в памяти вкладки.
export const STORAGE_PREFIX = "ventcrm_";
const memory = new Map();
export const storage = {
  get(key, fallback) {
    if (memory.has(key)) return memory.get(key) ?? fallback;
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    memory.delete(key);
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
  },
};

// Простая шина событий между модулями: emit("db") → on("db", ...)
export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, handler) => document.addEventListener(name, handler);

let toastTimer;
export function toast(text, kind = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2200);
}

export function copyText(text, button) {
  const done = () => {
    const label = button.textContent;
    button.textContent = "Скопировано";
    setTimeout(() => (button.textContent = label), 1500);
  };
  const fallback = () => toast("Выделите и скопируйте текст вручную");
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
}

/** Кнопка, которая просит второе нажатие перед опасным действием (confirm() в части браузеров не работает) */
export function armed(button, question = "Точно?") {
  if (button.hasAttribute("data-armed")) return true;
  button.setAttribute("data-armed", "");
  button.dataset.label = button.textContent;
  button.textContent = question;
  setTimeout(() => { if (button.isConnected) { button.removeAttribute("data-armed"); button.textContent = button.dataset.label; } }, 4000);
  return false;
}
