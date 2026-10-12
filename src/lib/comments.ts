// Переписка по заказу, задаче или мастеру: короткие комментарии с автором и временем.
import type { Comment, Staff } from "./types";

/** Добавляет комментарий к записи; сохранение — на вызывающем */
export function pushComment(row: { comments?: Comment[] }, text: unknown, user: Pick<Staff, "name">) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  (row.comments ||= []).push({ at: new Date().toISOString(), by: user.name, text: clean });
  return true;
}
