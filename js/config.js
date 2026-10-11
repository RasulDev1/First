// Настройки CRM. Меняйте здесь, остальной код трогать не нужно.

export const COMPANY = "CRM Вентиляция"; // название вашей компании

// Склад: 3 линии (буквы), в каждой 6 стеллажей, на каждом 3 полки.
// Место пишется как «линия-стеллаж-полка»: А-1-2 — линия А, первый стеллаж, вторая полка.
export const LINES = ["А", "Б", "В"];
export const RACKS = 6;
export const SHELVES = 3;

// Роли. «Закупщик» и «Складовщик» — одна роль с разными должностями: оба управляют складом.
export const ROLES = {
  director: { title: "Руководитель", sections: ["home", "requests", "masters", "tasks", "warehouse", "analytics", "staff"] },
  manager: { title: "Менеджер по продажам", sections: ["home", "requests", "masters", "tasks", "mystats"] },
  warehouse: { title: "Склад", sections: ["home", "requests", "warehouse"] },
  master: { title: "Мастер", sections: ["myorders"] },
};
export const POSITIONS = [
  { id: "director", role: "director", title: "Руководитель" },
  { id: "manager", role: "manager", title: "Менеджер по продажам" },
  { id: "buyer", role: "warehouse", title: "Закупщик" },
  { id: "storekeeper", role: "warehouse", title: "Складовщик" },
  { id: "master", role: "master", title: "Мастер" },
  { id: "trainee", role: "master", title: "Стажёр" },
];

// Заказы на вентиляцию
export const STATUSES = [
  { id: "new", title: "Создана", hint: "Заказ поступил, менеджер ещё не взял" },
  { id: "assigned", title: "Назначен Мастер", hint: "Выбран мастер и дата выезда" },
  { id: "measure", title: "Выезд на замеры", hint: "Мастер выехал на объект делать замеры" },
  { id: "pricing", title: "Согласование стоимости", hint: "Стоимость обсуждается с клиентом" },
  { id: "in_work", title: "В работе", hint: "Идёт монтаж" },
  { id: "done", title: "Завершён", hint: "Работы сданы клиенту" },
  { id: "cancelled", title: "Отменён", hint: "Клиент отказался или не дозвонились" },
];
export const ACTIVE_STATUSES = ["new", "assigned", "measure", "pricing", "in_work"];
export const SERVICES = ["Монтаж приточной вентиляции", "Монтаж вытяжной вентиляции", "Приточно-вытяжная с рекуперацией",
  "Вентиляция кухни / ресторана", "Обслуживание и чистка", "Ремонт оборудования", "Проектирование и замер"];
export const OBJECTS = ["Квартира", "Частный дом", "Офис", "Ресторан / кафе", "Магазин", "Производство / склад"];
export const SOURCES = ["Сайт", "Звонок", "Авито", "Рекомендация", "2ГИС", "Повторный клиент"];

// Склад
export const CATEGORIES = [
  { id: "equipment", title: "Вентиляционное оборудование" },
  { id: "ducts", title: "Воздуховоды" },
  { id: "fittings", title: "Фасонные изделия" },
  { id: "grilles", title: "Решётки и диффузоры" },
  { id: "valves", title: "Клапаны и автоматика" },
  { id: "filters", title: "Фильтры и шумоглушители" },
  { id: "materials", title: "Крепёж и расходники" },
];
export const UNITS = ["шт.", "м", "м²", "уп."];

// Мастера: все занимаются монтажом вентиляции, различаются только уровнем
export const MASTER_LEVELS = [
  { id: "master", title: "Мастер" },
  { id: "trainee", title: "Стажёр" },
];
