// Настройки CRM. Меняйте здесь, остальной код трогать не нужно.

export const COMPANY = "CRM Вентиляция"; // название вашей компании

// Склад: 3 линии, в каждой 6 стеллажей, на каждом 3 полки трёх цветов.
// Место пишется как «линия.стеллаж.полка»: 1.А.З — первая линия, первый стеллаж, зелёная полка.
export const LINES = 3;
export const RACKS = ["А", "Б", "В", "Г", "Д", "Е"];
export const SHELVES = [
  { id: "З", title: "Зелёная", color: "g" },
  { id: "Ж", title: "Жёлтая", color: "y" },
  { id: "К", title: "Красная", color: "r" },
];

// Роли. «Закупщик» и «Складовщик» — одна роль с разными должностями: оба управляют складом.
export const ROLES = {
  director: { title: "Руководитель", sections: ["home", "requests", "masters", "tasks", "warehouse", "analytics", "staff"] },
  manager: { title: "Менеджер по продажам", sections: ["home", "requests", "masters", "tasks", "analytics"] },
  warehouse: { title: "Склад", sections: ["home", "requests", "warehouse"] },
};
export const POSITIONS = [
  { id: "director", role: "director", title: "Руководитель" },
  { id: "manager", role: "manager", title: "Менеджер по продажам" },
  { id: "buyer", role: "warehouse", title: "Закупщик" },
  { id: "storekeeper", role: "warehouse", title: "Складовщик" },
];

// Заявки на вентиляцию
export const STATUSES = [
  { id: "new", title: "Новая", hint: "Заявку оставили, менеджер ещё не взял" },
  { id: "assigned", title: "Мастер назначен", hint: "Выбран мастер и дата выезда" },
  { id: "in_work", title: "В работе", hint: "Мастер на объекте: замер или монтаж" },
  { id: "done", title: "Выполнена", hint: "Работы сданы клиенту" },
  { id: "cancelled", title: "Отменена", hint: "Клиент отказался или не дозвонились" },
];
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
