// Заказы: история, статусы и способы оплаты. Статус меняется сам по действиям в карточке и у мастера.
import { STATUSES, MASTER_LEVELS } from "./config";
import type { Master, Request, StatusId } from "./types";

export const PAY_METHODS = ["Наличные", "Перевод на карту", "Банковская карта", "По счёту (безнал)"];
export const requestTotal = (r: Request) => r.amount || 0;

/** Запись в историю заказа */
export function log(r: Request, text: string, by = "") {
  (r.history ||= []).push({ at: new Date().toISOString(), by, text });
}

/** Когда последний раз менялся статус: последняя запись «Статус: …» в истории, иначе дата оформления */
export function statusAt(r: Request) {
  const h = [...(r.history || [])].reverse().find((x) => x.text.startsWith("Статус:"));
  return h?.at || r.created_at;
}

/** Статус заказа меняется сам по действиям: назначили мастера → «Назначен Мастер», мастер выехал → «Выезд на замеры»,
 * менеджер сохранил замеры → «Согласование стоимости», внесена оплата → «В работе», мастер завершил → «Завершён». */
export function setStatus(r: Request, next: StatusId, by = "") {
  r.status = next;
  r.done_at = next === "done" ? new Date().toISOString() : null;
  log(r, `Статус: ${STATUSES.find((x) => x.id === next)!.title}`, by);
}

/** Какой статус у заказа по его данным (для возврата отменённого заказа) */
export const stageOf = (r: Request): StatusId =>
  r.done_at ? "done" : (r.payments || []).length ? "in_work" : r.survey?.saved ? "pricing" : r.master_id ? "assigned" : "new";

export const levelTitle = (m: Pick<Master, "level">) => MASTER_LEVELS.find((l) => l.id === m.level)?.title || "Мастер";
