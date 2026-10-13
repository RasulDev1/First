import type { Role, StatusId } from "./types";

// Настройки CRM. Меняйте здесь, остальной код трогать не нужно.

export const COMPANY = "CRM Вентиляция"; // название вашей компании

// Склад: 3 линии (буквы), в каждой 6 стеллажей, на каждом 3 полки.
// Место пишется как «линия-стеллаж-полка»: А-1-2 — линия А, первый стеллаж, вторая полка.
export const LINES = ["А", "Б", "В"];
export const RACKS = 6;
export const SHELVES = 3;

// Роли. «Закупщик» и «Складовщик» — одна роль с разными должностями: оба управляют складом.
export const ROLES: Record<Role, { title: string; sections: string[] }> = {
  director: { title: "Руководитель", sections: ["home", "requests", "clients", "calc", "masters", "tasks", "chat", "warehouse", "analytics", "automations", "staff"] },
  manager: { title: "Менеджер по продажам", sections: ["home", "requests", "clients", "calc", "tasks", "chat", "mystats"] },
  warehouse: { title: "Склад", sections: ["home", "requests", "chat", "warehouse"] },
  master: { title: "Мастер", sections: ["myorders", "chat", "salary"] },
};
export const POSITIONS: { id: string; role: Role; title: string }[] = [
  { id: "director", role: "director", title: "Руководитель" },
  { id: "manager", role: "manager", title: "Менеджер по продажам" },
  { id: "buyer", role: "warehouse", title: "Закупщик" },
  { id: "storekeeper", role: "warehouse", title: "Складовщик" },
  { id: "master", role: "master", title: "Мастер" },
  { id: "trainee", role: "master", title: "Стажёр" },
];

// Заказы на вентиляцию
export const STATUSES: { id: StatusId; title: string; hint: string }[] = [
  { id: "new", title: "Создана", hint: "Заказ поступил, менеджер ещё не взял" },
  { id: "assigned", title: "Назначен Мастер", hint: "Выбран мастер и дата выезда" },
  { id: "measure", title: "Выезд на замеры", hint: "Мастер выехал на объект делать замеры" },
  { id: "pricing", title: "Согласование стоимости", hint: "Стоимость обсуждается с клиентом" },
  { id: "in_work", title: "В работе", hint: "Идёт монтаж" },
  { id: "done", title: "Завершён", hint: "Работы сданы клиенту" },
  { id: "cancelled", title: "Отменён", hint: "Клиент отказался или не дозвонились" },
];
export const ACTIVE_STATUSES: StatusId[] = ["new", "assigned", "measure", "pricing", "in_work"];
export const SERVICES = ["Монтаж приточной вентиляции", "Монтаж вытяжной вентиляции", "Приточно-вытяжная с рекуперацией",
  "Вентиляция кухни / ресторана", "Монтаж кондиционера", "Обслуживание кондиционера", "Обслуживание и чистка", "Ремонт оборудования"];

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
  { id: "ac", title: "Кондиционирование" },
];
export const UNITS = ["шт.", "м", "м²", "уп."];

// Мастера: все занимаются монтажом вентиляции, различаются только уровнем
export const MASTER_LEVELS = [
  { id: "master", title: "Мастер" },
  { id: "trainee", title: "Стажёр" },
];

// Автосмета. Закупочные цены берутся из склада, цена для клиента = закупка + наценка.
export const MARKUP = 40;      // наценка по умолчанию, %
export const MIN_MARKUP = 25;  // наценка не ниже, % (руководитель может поднять в автосмете)
// Прайс работ. Цены ориентировочные: работы пока не оценены, поэтому себестоимость работ принята за 0.
export const WORKS = [
  { id: "visit", name: "Выезд и замер", unit: "шт.", price: 1500 },
  { id: "duct", name: "Монтаж воздуховода", unit: "м", price: 450 },
  { id: "bend", name: "Монтаж отвода и фасонных частей", unit: "шт.", price: 300 },
  { id: "grille", name: "Монтаж решётки или диффузора", unit: "шт.", price: 600 },
  { id: "fan", name: "Монтаж вентилятора", unit: "шт.", price: 4000 },
  { id: "start", name: "Пусконаладка", unit: "шт.", price: 3000 },
  { id: "ac", name: "Монтаж кондиционера", unit: "шт.", price: 9000 },
  { id: "ac_route", name: "Прокладка трассы кондиционера", unit: "м", price: 700 },
];
