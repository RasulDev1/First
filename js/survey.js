// Замеры: помещения, трассы воздуховодов и фото с выезда. Данные лежат в заказе (order.survey) и идут в автосмету.
import { esc, num, dateTime } from "./core.js";
import { field } from "./ui.js";

export const DIAMETERS = [100, 125, 160, 200, 250];
export const emptySurvey = () => ({ rooms: [], routes: [], photos: [], note: "" });
export const surveyOf = (r) => r.survey || emptySurvey();
export const MAX_PHOTOS = 6;

/** Объём помещений, м³ */
export const volumeOf = (survey) => (survey.rooms || []).reduce((n, room) => n + room.area * room.height, 0);
export const lengthOf = (survey) => (survey.routes || []).reduce((n, route) => n + route.length, 0);
export const isEmpty = (survey) => !survey.rooms?.length && !survey.routes?.length && !survey.photos?.length;

export function surveyHtml(r, { edit = false } = {}) {
  const s = surveyOf(r);
  const input = (name, label, attrs = "") => field(label, `<input name="${name}" ${attrs}>`);
  return `<div class="sheet-cols survey">
    <div><h4>Помещения</h4>
      ${s.rooms.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Помещение</th><th class="r">Площадь</th><th class="r">Высота</th><th>Кондиционер</th><th></th></tr></thead>
        <tbody>${s.rooms.map((room, i) => `<tr><td>${esc(room.name)}</td><td class="r num">${num(room.area)} м²</td><td class="r num">${num(room.height)} м</td>
          <td>${room.ac ? "да" : "—"}</td><td class="r">${edit ? `<button type="button" class="icon-btn" data-act="surveyDel" data-kind="rooms" data-id="${i}" aria-label="Убрать">✕</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">Помещений нет.</p>`}
      ${edit ? `<form class="survey-form" data-form="surveyRoom">
        ${input("name", "Помещение", 'required maxlength="60" placeholder="Кухня"')}
        ${input("area", "Площадь, м²", 'type="number" min="1" step="0.1" required inputmode="decimal"')}
        ${input("height", "Высота, м", 'type="number" min="2" max="10" step="0.05" value="2.7" required inputmode="decimal"')}
        <label class="field acbox"><span class="field-label">Кондиционер</span><input type="checkbox" name="ac"></label>
        <button class="btn primary" type="submit">Добавить помещение</button></form>` : ""}</div>

    <div><h4>Трассы воздуховодов</h4>
      ${s.routes.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Трасса</th><th class="r">Ø, мм</th><th class="r">Длина</th><th class="r">Отводов</th><th></th></tr></thead>
        <tbody>${s.routes.map((route, i) => `<tr><td>${esc(route.name)}</td><td class="r num">${route.diameter}</td><td class="r num">${num(route.length)} м</td><td class="r num">${route.bends}</td>
          <td class="r">${edit ? `<button type="button" class="icon-btn" data-act="surveyDel" data-kind="routes" data-id="${i}" aria-label="Убрать">✕</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">Трасс нет.</p>`}
      ${edit ? `<form class="survey-form" data-form="surveyRoute">
        ${input("name", "Трасса", 'required maxlength="60" placeholder="Кухня → улица"')}
        ${field("Диаметр, мм", `<select name="diameter">${DIAMETERS.map((d) => `<option${d === 160 ? " selected" : ""}>${d}</option>`).join("")}</select>`)}
        ${input("length", "Длина, м", 'type="number" min="0.5" step="0.1" required inputmode="decimal"')}
        ${input("bends", "Отводов, шт.", 'type="number" min="0" step="1" value="2" inputmode="numeric"')}
        <button class="btn primary" type="submit">Добавить трассу</button></form>` : ""}</div>

    <div><h4>Фото и заметка</h4>
      <div class="photos">${s.photos.map((src, i) => `<figure><img src="${src}" alt="Фото замера ${i + 1}">${edit ? `<button type="button" class="icon-btn" data-act="surveyDelPhoto" data-id="${i}" aria-label="Убрать фото">✕</button>` : ""}</figure>`).join("")}</div>
      ${!edit ? (s.photos.length ? "" : `<p class="muted">Фото нет.</p>`) : s.photos.length < MAX_PHOTOS ? `<label class="btn file-btn">Добавить фото<input type="file" accept="image/*" multiple hidden data-change="surveyPhoto"></label>` : `<p class="muted small">Максимум ${MAX_PHOTOS} фото.</p>`}
      ${edit ? `<form class="survey-note" data-form="surveyNote"><textarea name="note" rows="3" maxlength="1000" placeholder="Что важно: перекрытия, высота потолка, подъезд">${esc(s.note || "")}</textarea>
        <button class="btn" type="submit">Сохранить заметку</button></form>` : s.note ? `<p class="prose">${esc(s.note)}</p>` : `<p class="muted">Заметки нет.</p>`}
      ${s.at ? `<p class="muted small">Последнее изменение: ${dateTime(s.at)}${s.by ? `, ${esc(s.by)}` : ""}</p>` : ""}</div>
  </div>`;
}

/** Сжимает фото до ~720 px, чтобы они помещались в хранилище браузера */
export function shrinkPhoto(file, max = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось прочитать фото")); };
    img.src = url;
  });
}

export function touch(r, user) {
  const s = (r.survey ||= emptySurvey());
  s.at = new Date().toISOString();
  s.by = user.name;
  return s;
}
