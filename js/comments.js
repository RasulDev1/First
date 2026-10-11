// Переписка по заказу или задаче: короткие комментарии с автором и временем.
import { esc, dateTime } from "./core.js";

export const commentsHtml = (list = []) => list.length
  ? `<ol class="chat">${list.map((c) => `<li><div class="chat-head"><b>${esc(c.by)}</b><small>${dateTime(c.at)}</small></div><p>${esc(c.text)}</p></li>`).join("")}</ol>`
  : `<p class="muted">Комментариев пока нет.</p>`;

export const commentForm = (action = "comment") => `<form class="chat-form" data-form="${action}">
  <textarea name="text" rows="2" maxlength="1000" required placeholder="Написать комментарий"></textarea>
  <button class="btn primary" type="submit">Отправить</button></form>`;

/** Добавляет комментарий к записи (заказу или задаче); сохранение — на вызывающем */
export function pushComment(row, text, user) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  (row.comments ||= []).push({ at: new Date().toISOString(), by: user.name, text: clean });
  return true;
}
