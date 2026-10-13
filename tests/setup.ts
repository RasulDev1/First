// Подставляет localStorage, чтобы логику базы можно было проверять в Node
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};
(globalThis as any).window ||= globalThis;
(globalThis as any).window.addEventListener ||= () => {};
