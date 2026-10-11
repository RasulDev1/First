// Демо-данные: сотрудники, мастера, оборудование с местами на складе, заказы за три месяца и задачи.
// Даты считаются от сегодняшнего дня, поэтому демо всегда выглядит «живым». Кнопка «Сбросить демо» возвращает эти данные.
import { LOCATIONS } from "./stock.js";
import { SERVICES, OBJECTS, SOURCES } from "./config.js";
import { hashPassword } from "./db.js";
import { buildEstimate, totals } from "./estimate.js";

// Детерминированный генератор: при каждом сбросе одинаковые данные
function rng(seedValue) {
  let s = seedValue;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296);
}

const DEMO_PASSWORD = "12345678";

export const DEMO_ACCOUNTS = [
  { login: "director", name: "Руслан Ахмадов", position: "director" },
  { login: "manager", name: "Мадина Исаева", position: "manager" },
  { login: "manager2", name: "Ислам Дудаев", position: "manager" },
  { login: "buyer", name: "Ибрагим Магомадов", position: "buyer" },
  { login: "sklad", name: "Ахмед Сулейманов", position: "storekeeper" },
  { login: "master", name: "Шамиль Абдулаев", position: "master", master_id: 1 },
  { login: "trainee", name: "Ризван Тагиров", position: "trainee", master_id: 5 },
];
export { DEMO_PASSWORD };

const ROLE_OF = { director: "director", manager: "manager", buyer: "warehouse", storekeeper: "warehouse", master: "master", trainee: "master" };

// [категория, артикул, название, характеристики, ед., закупка, продажа, минимум]
const PRODUCTS = [
  ["equipment", "VK-100", "Вентилятор канальный ВКК 100", "Ø100, 270 м³/ч, 230 В", "шт.", 3900, 6200, 4],
  ["equipment", "VK-160", "Вентилятор канальный ВКК 160", "Ø160, 560 м³/ч, 230 В", "шт.", 6400, 9800, 4],
  ["equipment", "VK-200", "Вентилятор канальный ВКК 200", "Ø200, 830 м³/ч, 230 В", "шт.", 8100, 12400, 3],
  ["equipment", "VKP-5025", "Вентилятор канальный прямоугольный 500×250", "2 150 м³/ч, 380 В", "шт.", 21500, 31900, 2],
  ["equipment", "PU-500", "Приточная установка 500 м³/ч с электронагревом", "Нагреватель 6 кВт, фильтр G4, автоматика", "шт.", 68000, 96000, 1],
  ["equipment", "PVU-350R", "Приточно-вытяжная установка с рекуператором 350 м³/ч", "Пластинчатый рекуператор, КПД 85%", "шт.", 112000, 158000, 1],
  ["equipment", "VKR-4", "Вентилятор крышный ВКР 4", "Ø400, 3 200 м³/ч, 380 В", "шт.", 27500, 39800, 1],
  ["equipment", "BV-100", "Вентилятор вытяжной бытовой 100", "Ø100, обратный клапан, таймер", "шт.", 1450, 2600, 8],
  ["ducts", "D-100", "Воздуховод круглый Ø100", "Оцинковка 0,5 мм, спирально-навивной", "м", 210, 380, 30],
  ["ducts", "D-125", "Воздуховод круглый Ø125", "Оцинковка 0,5 мм, спирально-навивной", "м", 260, 450, 30],
  ["ducts", "D-160", "Воздуховод круглый Ø160", "Оцинковка 0,5 мм, спирально-навивной", "м", 330, 560, 40],
  ["ducts", "D-200", "Воздуховод круглый Ø200", "Оцинковка 0,5 мм, спирально-навивной", "м", 410, 690, 30],
  ["ducts", "D-250", "Воздуховод круглый Ø250", "Оцинковка 0,55 мм, спирально-навивной", "м", 540, 890, 20],
  ["ducts", "DP-3015", "Воздуховод прямоугольный 300×150", "Оцинковка 0,55 мм, шина 20", "м", 780, 1250, 20],
  ["ducts", "DP-4020", "Воздуховод прямоугольный 400×200", "Оцинковка 0,7 мм, шина 20", "м", 1080, 1690, 15],
  ["ducts", "GA-160", "Воздуховод гибкий алюминиевый Ø160", "Гофра, 3 м в растянутом виде", "шт.", 340, 620, 15],
  ["ducts", "GI-200", "Воздуховод гибкий изолированный Ø200", "Изоляция 25 мм, 10 м", "шт.", 2100, 3400, 5],
  ["fittings", "O90-125", "Отвод 90° Ø125", "Оцинковка 0,5 мм", "шт.", 230, 420, 20],
  ["fittings", "O90-160", "Отвод 90° Ø160", "Оцинковка 0,5 мм", "шт.", 290, 520, 25],
  ["fittings", "O90-200", "Отвод 90° Ø200", "Оцинковка 0,5 мм", "шт.", 380, 680, 20],
  ["fittings", "T-160", "Тройник Ø160/160", "Оцинковка 0,5 мм", "шт.", 450, 790, 15],
  ["fittings", "P-200-160", "Переход Ø200→Ø160", "Оцинковка 0,5 мм", "шт.", 310, 560, 12],
  ["fittings", "N-160", "Ниппель Ø160", "Соединительный, оцинковка", "шт.", 120, 230, 40],
  ["fittings", "M-200", "Муфта Ø200", "Соединительная, оцинковка", "шт.", 150, 280, 30],
  ["fittings", "Z-160", "Заглушка Ø160", "Оцинковка 0,5 мм", "шт.", 95, 190, 20],
  ["fittings", "VR-3015", "Врезка прямоугольная 300×150 / Ø125", "Оцинковка 0,55 мм", "шт.", 420, 760, 10],
  ["grilles", "DPU-125", "Диффузор ДПУ-М 125", "Металл, белый RAL 9016", "шт.", 290, 540, 20],
  ["grilles", "AMN-3015", "Решётка вентиляционная АМН 300×150", "Алюминий, регулируемые жалюзи", "шт.", 520, 940, 15],
  ["grilles", "RN-4020", "Решётка наружная 400×200", "Оцинковка, с сеткой", "шт.", 780, 1350, 6],
  ["valves", "KO-160", "Клапан обратный Ø160", "Лепестковый, оцинковка", "шт.", 480, 860, 10],
  ["valves", "KV-200", "Клапан воздушный Ø200 с электроприводом", "Привод 230 В, 5 Нм", "шт.", 5400, 8200, 3],
  ["valves", "PULT-1", "Пульт управления вентиляцией", "Настенный, таймер и 3 скорости", "шт.", 3600, 5900, 3],
  ["filters", "FK-160", "Фильтр кассетный Ø160 G4", "Корпус оцинковка, кассета G4", "шт.", 1650, 2800, 6],
  ["filters", "SH-160", "Шумоглушитель Ø160 L=600", "Минвата 50 мм", "шт.", 1950, 3300, 6],
  ["materials", "H-160", "Хомут Ø160 с резиновым уплотнителем", "Шпилька М8", "шт.", 85, 160, 50],
  ["materials", "SH-M8", "Шпилька резьбовая М8, 1 м", "Оцинкованная", "шт.", 45, 90, 100],
  ["materials", "LA-50", "Лента алюминиевая самоклеящаяся", "50 мм × 50 м", "шт.", 290, 520, 15],
  ["materials", "KF-13", "Изоляция K-Flex Air 13 мм", "Рулон с самоклеящимся слоем", "м²", 420, 720, 20],
  ["ac", "SPL-09", "Сплит-система 9 (до 25 м²)", "2,6 кВт, инвертор, настенная", "шт.", 21000, 0, 2],
  ["ac", "SPL-12", "Сплит-система 12 (до 35 м²)", "3,5 кВт, инвертор, настенная", "шт.", 26500, 0, 2],
  ["ac", "SPL-18", "Сплит-система 18 (до 50 м²)", "5,3 кВт, инвертор, настенная", "шт.", 38000, 0, 1],
  ["ac", "CU-14", "Трасса медная с изоляцией", "Пара труб 1/4 и 3/8, в изоляции", "м", 780, 0, 20],
  ["ac", "DR-16", "Дренажная трубка Ø16", "Гибкая, для отвода конденсата", "м", 90, 0, 30],
  ["ac", "BR-50", "Кронштейн наружного блока", "Усиленный, до 80 кг", "шт.", 650, 0, 6],
];

const CLIENTS = ["Зарема Мусаева", "ООО «Северный двор»", "Хасан Умаров", "Петимат Эльмурзаева", "Кафе «Тандыр»", "ИП Байсаров", "Милана Гадаева",
  "ООО «Грозстрой»", "Магомед Алиев", "Ресторан «Нохчийн»", "Тимур Гериев", "Хава Исмаилова", "ТЦ «Беркат-Плаза»", "Айшат Берсанова",
  "Пекарня «Хлебный дом»", "Аслан Хадизов", "ООО «ТехноСклад»", "Луиза Арсанова", "Стоматология «Дента»", "Зелимхан Висаитов",
  "Аминат Окуева", "Ризван Тагиров", "Раиса Юсупова", "Мовсар Эдильсултанов"];
const CITIES = ["г. Город", "г. Город", "г. Заречный", "г. Северный"];
const STREETS = ["ул. Ленина", "ул. Мира", "ул. Садовая", "пр. Победы", "ул. Школьная", "ул. Центральная", "ул. Заводская", "ул. Парковая"];
const NOTE_BY_SERVICE = {
  "Монтаж приточной вентиляции": "Офис на 12 человек, душно, хотят приток с подогревом.",
  "Монтаж вытяжной вентиляции": "Подвал и санузлы, сырость и запах, нужна вытяжка.",
  "Приточно-вытяжная с рекуперацией": "Частный дом 160 м², хотят рекуператор, чтобы не терять тепло зимой.",
  "Вентиляция кухни / ресторана": "Кухня 40 м², сильный запах, нужна вытяжка над плитами.",
  "Обслуживание и чистка": "Система шумит и плохо тянет, просят почистить воздуховоды и заменить фильтры.",
  "Ремонт оборудования": "Не работает приточная установка, на пульте ошибка.",
  "Проектирование и замер": "Нужен замер и смета до конца месяца.",
  "Монтаж кондиционера": "Нужен кондиционер в спальню и гостиную, квартира после ремонта.",
  "Обслуживание кондиционера": "Кондиционер плохо охлаждает и капает, нужна чистка и проверка фреона.",
};
const NOTES = ["Нужна вентиляция в квартире после ремонта, душно в спальне.", "Кухня 40 м², сильный запах, нужна вытяжка над плитами.",
  "Офис на 12 человек, хотят приток с подогревом.", "Старая система шумит, просят посмотреть и почистить.",
  "Частный дом 160 м², хотят рекуператор.", "Подвал склада, сырость, нужна вытяжка.", "Не работает приточная установка, ошибка на пульте.",
  "Нужен замер и смета до конца месяца."];
const MASTERS = [
  ["Шамиль Абдулаев", "+7 900 000-11-21", "master"],
  ["Адам Хамзатов", "+7 900 000-34-56", "master"],
  ["Рамзан Эдилов", "+7 900 000-22-17", "master"],
  ["Бислан Цуев", "+7 900 000-90-12", "master"],
  ["Ризван Тагиров", "+7 900 000-48-03", "trainee"],
  ["Умар Дадаев", "+7 900 000-67-45", "trainee"],
];
const TASKS = [
  ["Перезвонить клиентам с новыми заказами за выходные", 0, 0],
  ["Подготовить коммерческое предложение для ресторана", 1, 1],
  ["Согласовать дату монтажа рекуператора с клиентом", 0, 2],
  ["Собрать отзывы по выполненным заказам за месяц", 1, 4],
  ["Уточнить у склада наличие воздуховодов Ø250 под объект", 0, -1],
  ["Отчёт по заказам с Авито за неделю", 1, -3, true],
];

export function seed() {
  const rand = rng(95);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const now = Date.now(), DAY = 864e5;
  const iso = (ms) => new Date(ms).toISOString();
  const past = (ms) => iso(Math.min(ms, now - 15 * 60e3)); // события заказа не могут быть в будущем

  const staff = DEMO_ACCOUNTS.map((a, i) => {
    const salt = `s${i + 1}demo`;
    return { id: i + 1, created_at: iso(now - 200 * DAY), login: a.login, name: a.name, position: a.position, role: ROLE_OF[a.position], ...(a.master_id ? { master_id: a.master_id } : {}),
      salt, password_hash: hashPassword(DEMO_PASSWORD, salt), active: true };
  });
  const managers = staff.filter((s) => s.role === "manager");
  const masters = MASTERS.map(([name, phone, level], i) => ({ id: i + 1, created_at: iso(now - 180 * DAY), name, phone, level, rate: level === "trainee" ? 10 : 20, active: true, comments: [] }));

  const products = PRODUCTS.map(([category, sku, name, specs, unit, cost, price, min], i) =>
    ({ id: i + 1, created_at: iso(now - 120 * DAY), category, sku, name, specs, unit, cost, price, min_qty: min }));

  // Раскладываем товары по местам: категория — своя зона склада, крупное оборудование на нижних полках
  const stock = [], moves = [];
  const allPlaces = LOCATIONS;
  const ZONE = { equipment: 0, ducts: 12, fittings: 24, grilles: 30, valves: 33, filters: 36, materials: 39, ac: 48 }; // индекс первого места зоны
  const used = new Map();
  const SHARED = ["fittings", "grilles", "filters", "materials", "ac"]; // мелочь лежит по 2–3 позиции на полке
  products.forEach((p) => {
    const start = ZONE[p.category];
    const count = used.get(p.category) || 0;
    const offset = SHARED.includes(p.category) ? Math.floor(count / 2) : count;
    const places = p.price > 20000 || SHARED.includes(p.category) ? 1 : rand() < 0.35 ? 2 : 1;
    used.set(p.category, count + places);
    // Пара позиций специально под минимумом — чтобы в «Закупке» было что показать
    const low = ["VK-200", "PU-500", "D-250", "KV-200", "FK-160"].includes(p.sku);
    for (let k = 0; k < places; k++) {
      const loc = allPlaces[(start + offset + k) % allPlaces.length];
      const base = p.unit === "м" ? 40 + Math.floor(rand() * 80) : Math.max(1, Math.round(p.min_qty * (1.2 + rand() * 2)));
      const qty = low ? Math.max(0, Math.floor(p.min_qty * 0.5)) : base;
      if (!qty) continue;
      stock.push({ id: stock.length + 1, product_id: p.id, loc, qty });
      moves.push({ id: moves.length + 1, at: iso(now - (20 + rand() * 60) * DAY), by: DEMO_ACCOUNTS[3].name, kind: "in", product_id: p.id, to: loc, qty, note: "Начальная приёмка" });
    }
  });

  // База клиентов: часть клиентов обращалась несколько раз
  const clients = CLIENTS.map((name, i) => ({ id: i + 1, created_at: iso(now - (30 + rand() * 150) * DAY), name,
    phone: `+7 900 ${100 + Math.floor(rand() * 899)}-${10 + Math.floor(rand() * 89)}-${10 + Math.floor(rand() * 89)}`, note: "" }));
  const bySku = (sku) => products.find((p) => p.sku === sku).id;
  // Заказы за 90 дней: свежие — новые и в работе, старые — в основном выполнены
  const requests = [];
  for (let i = 0; i < 46; i++) {
    const age = Math.floor((i / 46) * 90 + rand() * 2);
    const created = now - age * DAY - Math.floor(rand() * 9) * 3600e3;
    const service = pick(SERVICES);
    // Свежие заказы — на разных этапах, чтобы в демо были все статусы; старые в основном выполнены
    const FRESH = ["new", "new", "assigned", "measure", "new", "pricing", "in_work", "pricing", "assigned", "in_work", "measure", "in_work"];
    const status = i < FRESH.length ? FRESH[i] : i === 15 || i === 27 ? "cancelled" : rand() < 0.88 ? "done" : "in_work";
    const manager = status === "new" ? null : pick(managers);
    const master = ["assigned", "measure", "pricing", "in_work", "done"].includes(status) ? pick(masters) : null;
    const big = /рекуперац|ресторан|приточной/i.test(service);
    const amount = ["cancelled", "new", "assigned", "measure"].includes(status) ? 0
      : Math.round(((big ? 90000 : 18000) + rand() * (big ? 260000 : 60000)) / 500) * 500;
    const used = master && /Монтаж (при|вы)|рекуперац|кухни/i.test(service) ? [
      { product_id: bySku(pick(["VK-160", "VK-200", "BV-100", "VK-100"])), qty: 1 },
      { product_id: bySku(pick(["D-160", "D-125", "D-200"])), qty: 6 + Math.floor(rand() * 12) },
      { product_id: bySku(pick(["O90-160", "O90-125"])), qty: 2 + Math.floor(rand() * 4) },
      { product_id: bySku("H-160"), qty: 6 },
    ].map((it) => ({ ...it, price: products[it.product_id - 1].price })) : [];
    const history = [{ at: past(created), by: "", text: "Заказ создан" }];
    if (manager) history.push({ at: past(created + 2 * 3600e3), by: manager.name, text: "Менеджер взял заказ" });
    if (master) history.push({ at: past(created + 3 * 3600e3), by: manager.name, text: `Назначен мастер: ${master.name}` });
    if (master) history.push({ at: past(created + 3 * 3600e3), by: manager.name, text: "Статус: Назначен Мастер" });
    if (status === "measure") history.push({ at: past(created + DAY), by: manager.name, text: "Статус: Выезд на замеры" });
    if (status === "pricing") history.push({ at: past(created + DAY), by: manager.name, text: "Статус: Согласование стоимости" });
    if (status === "in_work") history.push({ at: past(created + DAY), by: manager.name, text: "Статус: В работе" });
    if (status === "done") history.push({ at: past(created + 4 * DAY), by: manager.name, text: "Статус: Завершён" });
    if (status === "cancelled") history.push({ at: past(created + DAY), by: manager?.name || "", text: "Статус: Отменён" });
    const visit = master ? created + (1 + Math.floor(rand() * 3)) * DAY : null;
    const visitIso = visit ? iso(new Date(visit).setHours(10 + Math.floor(rand() * 7), 0, 0, 0)) : null;
    // Машина на выезд: первая, у которой нет накладки по времени
    const client = pick(clients);
    requests.push({
      id: 1000 + 46 - i, created_at: iso(created), client_id: client.id, client: client.name, phone: client.phone,
      address: `${pick(CITIES)}, ${pick(STREETS)}, ${1 + Math.floor(rand() * 180)}`, object: pick(OBJECTS), service, source: pick(SOURCES),
      note: NOTE_BY_SERVICE[service] || pick(NOTES), status, manager_id: manager?.id || null, master_id: master?.id || null,
      visit_at: visitIso,
      amount, items: [], comment: "", comments: [], history,
      expenses: (status === "done" ? used : status === "in_work" ? used.slice(0, 2) : []).map((it) => ({ product_id: it.product_id, qty: it.qty,
        loc: stock.find((x) => x.product_id === it.product_id)?.loc || null, cost: products[it.product_id - 1].cost, at: past(created + 2 * DAY), by: DEMO_ACCOUNTS[4].name })),
      done_at: status === "done" ? past(created + 4 * DAY) : null,
    });
  }
  requests.sort((a, b) => a.id - b.id);

  // Замеры, сметы, оплаты: у заказов, где замер уже сделан, всё связано между собой — смета считается из замера, сумма договора равна смете,
  // расходы со склада идут по материалам сметы
  const ROOMS = ["Кухня", "Гостиная", "Санузел", "Спальня", "Кабинет", "Зал", "Цех"], AC_ROOMS = ["Спальня", "Гостиная", "Кабинет", "Зал"];
  const SURVEY_NOTES = ["Перекрытия бетонные, выход на улицу через стену.", "Потолок подвесной, место под воздуховод есть.", "Подъезд со двора, парковка рядом.", "Клиент просит закончить до выходных."];
  const round05 = (n) => Math.round(n * 2) / 2;
  for (const r of requests) {
    if (!["pricing", "in_work", "done"].includes(r.status) || !r.master_id) continue;
    const ac = /кондиционер/i.test(r.service), at = Date.parse(r.created_at) + DAY;
    const rooms = Array.from({ length: ac ? 1 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3) }, (_, i) => ({
      name: ac ? AC_ROOMS[(i + r.id) % AC_ROOMS.length] : ROOMS[(i + r.id) % ROOMS.length], area: Math.round(12 + rand() * 28), height: 2.7, ac }));
    const routes = ac ? [] : rooms.map((room) => ({ name: `${room.name} → улица`, diameter: pick([125, 160, 200]), length: round05(4 + rand() * 10), bends: 1 + Math.floor(rand() * 4) }));
    r.survey = { rooms, routes, photos: [], note: pick(SURVEY_NOTES), at: past(at), by: staff.find((x) => x.id === r.manager_id)?.name || "", saved: true };
    r.history.push({ at: past(at), by: r.survey.by, text: "Замеры сохранены" });
    const lines = buildEstimate(r, products);
    if (!lines.length) continue;
    const sum = totals(lines);
    r.estimate = { lines, at: past(at + 3600e3), by: r.survey.by };
    r.amount = Math.round(sum.total / 100) * 100;
    r.history.push({ at: past(at + 3600e3), by: r.survey.by, text: `Смета: ${Math.round(sum.total).toLocaleString("ru-RU")} ₽` });
    const spend = r.status === "done" ? lines.filter((l) => l.kind === "mat") : r.status === "in_work" ? lines.filter((l) => l.kind === "mat").slice(0, 3) : [];
    r.expenses = spend.map((l) => ({ product_id: l.product_id, qty: Math.ceil(l.qty), loc: stock.find((x) => x.product_id === l.product_id)?.loc || null, cost: l.cost,
      at: past(at + DAY), by: DEMO_ACCOUNTS[4].name }));
  }
  // Оплаты: завершённые оплачены полностью, в работе — предоплата 50%
  for (const r of requests) {
    if (!r.amount) continue;
    const by = staff.find((x) => x.id === r.manager_id)?.name || "";
    if (r.status === "done") r.payments = [{ sum: Math.round(r.amount / 2), method: pick(["Наличные", "Перевод на карту", "Банковская карта"]), note: "Предоплата", at: past(Date.parse(r.created_at) + 2 * DAY), by },
      { sum: r.amount - Math.round(r.amount / 2), method: pick(["Наличные", "Перевод на карту", "Банковская карта"]), note: "Остаток после монтажа", at: r.done_at, by }];
    else if (r.status === "in_work") r.payments = [{ sum: Math.round(r.amount / 2), method: pick(["Наличные", "Перевод на карту", "Банковская карта"]), note: "Предоплата", at: past(Date.parse(r.created_at) + 2 * DAY), by }];
  }
  // Чтобы у демо-мастера и демо-стажёра (аккаунты master и trainee) были заказы в работе
  [1, 5].forEach((masterId, i) => {
    const r = requests.filter((x) => ["in_work", "pricing", "measure", "assigned"].includes(x.status) && x.master_id)[i];
    if (!r) return;
    const old = masters.find((m) => m.id === r.master_id).name;
    r.master_id = masterId;
    r.history.forEach((h) => { h.text = h.text.replace(old, masters[masterId - 1].name); });
  });

  const director = staff[0];
  const tasks = TASKS.map(([title, mi, days, done], i) => {
    const due = new Date(now + days * DAY); due.setHours(12 + (i % 5), 0, 0, 0);
    return { id: i + 1, created_at: iso(now - 3 * DAY), title, note: "", assignee_id: managers[mi].id, created_by: director.id,
      due: due.toISOString(), done_at: done ? iso(now - 2 * DAY) : null, request_id: null };
  });
  tasks[1].request_id = requests.find((r) => /ресторан/i.test(r.service) && r.status !== "done")?.id || null;

  // Пара живых комментариев, чтобы переписка по заказу и задаче не была пустой
  const some = requests.filter((r) => r.manager_id && r.status !== "cancelled").slice(-3);
  if (some[0]) some[0].comments.push({ at: past(now - 2 * DAY), by: managers[0].name, text: "Клиент просит приехать после 15:00, по утрам никого нет." });
  if (some[1]) some[1].comments.push({ at: past(now - DAY), by: managers[1].name, text: "Договорились о замере, клиент попросил позвонить за час." },
    { at: past(now - 20 * 3600e3), by: staff[0].name, text: "Проверь смету: цены не ниже порога, потом согласуй с клиентом." });
  masters[0].comments.push({ at: past(now - 5 * DAY), by: staff[0].name, text: "Аккуратно работает, клиенты довольны. Можно ставить на сложные объекты." });
  masters[1].comments.push({ at: past(now - 9 * DAY), by: managers[0].name, text: "Просил не назначать выезды раньше десяти." });
  tasks[0].comments = [{ at: past(now - DAY), by: staff[0].name, text: "Начни с тех, кто оставил заявку в выходные." }];

  return { version: 1, staff, masters, products, stock, moves, requests, tasks, clients, settings: [{ id: 1, min_margin: 25 }], seq: {} };
}
