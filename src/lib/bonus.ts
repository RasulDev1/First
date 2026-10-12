// Премия менеджера за месяц: оклад и надбавки. Размеры меняются здесь; считается по заказам, завершённым в этом месяце.
import { db } from "./db";

export const BONUS = {
  salary: 40000,        // оклад в месяц
  salesPercent: 3,      // % от суммы завершённых заказов
  perOrder: 1000,       // за каждый завершённый заказ
  repeatClient: 500,    // за завершённый заказ повторного клиента
  planSales: 1500000,   // план продаж на месяц
  planBonus: 15000,     // за выполнение плана
  noCancelMin: 5,       // заказов за месяц, начиная с которых работает бонус «без отказов»
  noCancelBonus: 5000,  // за месяц без отменённых заказов
};

const sameMonth = (iso: string, now: Date) => { const d = new Date(iso); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };

/** Заказы менеджера за текущий месяц: завершённые в этом месяце и отменённые */
export function monthOrders(managerId: number, now = new Date()) {
  const own = db.list("requests").filter((r) => r.manager_id === managerId);
  return {
    done: own.filter((r) => r.status === "done" && r.done_at != null && sameMonth(r.done_at, now)),
    cancelled: own.filter((r) => r.status === "cancelled" && sameMonth(r.created_at, now)),
    taken: own.filter((r) => sameMonth(r.created_at, now)),
  };
}

/** [{ id, title, rule, amount, earned }] и итог */
export interface BonusRow { id: string; title: string; rule: string; amount: number; earned: boolean; bonus?: number }

export function bonusFor(managerId: number, now = new Date()) {
  const { done, cancelled, taken } = monthOrders(managerId, now);
  const sales = done.reduce((n, r) => n + (r.amount || 0), 0);
  const repeat = done.filter((r) => r.source === "Повторный клиент").length;
  const money = (n: number) => n.toLocaleString("ru-RU");
  const rows: BonusRow[] = [
    { id: "salary", title: "Оклад", rule: "Фиксированная часть за месяц", amount: BONUS.salary, earned: true },
    { id: "percent", title: "Процент от продаж", rule: `${BONUS.salesPercent}% от ${money(sales)} ₽ по завершённым заказам`, amount: Math.round((sales * BONUS.salesPercent) / 100), earned: sales > 0 },
    { id: "orders", title: "За каждый завершённый заказ", rule: `${money(BONUS.perOrder)} ₽ × ${done.length}`, amount: BONUS.perOrder * done.length, earned: done.length > 0 },
    { id: "repeat", title: "За повторных клиентов", rule: `${money(BONUS.repeatClient)} ₽ × ${repeat} завершённых заказов повторных клиентов`, amount: BONUS.repeatClient * repeat, earned: repeat > 0 },
    { id: "plan", title: "За выполнение плана продаж", rule: `План ${money(BONUS.planSales)} ₽ в месяц, сейчас ${money(sales)} ₽`, amount: sales >= BONUS.planSales ? BONUS.planBonus : 0, earned: sales >= BONUS.planSales, bonus: BONUS.planBonus },
    { id: "nocancel", title: "За месяц без отказов", rule: `Не меньше ${BONUS.noCancelMin} заказов и ни одной отмены, сейчас ${taken.length} заказов, отмен ${cancelled.length}`,
      amount: taken.length >= BONUS.noCancelMin && !cancelled.length ? BONUS.noCancelBonus : 0, earned: taken.length >= BONUS.noCancelMin && !cancelled.length, bonus: BONUS.noCancelBonus },
  ];
  return { rows, total: rows.reduce((n, r) => n + r.amount, 0), sales };
}
