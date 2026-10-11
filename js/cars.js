// Автомобили компании и защита от накладок: одна машина не может быть на двух выездах сразу.
import { db } from "./db.js";
import { CARS, VISIT_HOURS, ACTIVE_STATUSES } from "./config.js";

export const carTitle = (id) => CARS.find((c) => c.id === Number(id))?.title || "";

/** Заказ, с выездом которого пересекается выезд visitIso на этой машине (или null) */
export function carConflict(carId, visitIso, selfId) {
  if (!carId || !visitIso) return null;
  const start = new Date(visitIso).getTime(), len = VISIT_HOURS * 3600e3;
  return db.list("requests").find((r) => r.id !== selfId && r.car_id === Number(carId) && r.visit_at && ACTIVE_STATUSES.includes(r.status)
    && Math.abs(new Date(r.visit_at).getTime() - start) < len) || null;
}
