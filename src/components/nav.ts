// Переход между разделами CRM: раздел живёт в адресе после # (#home, #requests …).
export function go(section: string) {
  if (typeof window === "undefined") return;
  if (window.location.hash.slice(1) === section) return;
  window.location.hash = section;
}
