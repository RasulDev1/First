// Замеры: помещения, трассы воздуховодов и фото с выезда. Данные лежат в заказе (order.survey) и идут в автосмету.
import type { Request, Staff, Survey } from "./types";

export const DIAMETERS = [100, 125, 160, 200, 250];
export const emptySurvey = (): Survey => ({ rooms: [], routes: [], photos: [], note: "" });
export const surveyOf = (r: Pick<Request, "survey">): Survey => r.survey || emptySurvey();
export const MAX_PHOTOS = 6;

/** Объём помещений, м³ */
export const volumeOf = (survey: Survey) => (survey.rooms || []).reduce((n, room) => n + room.area * room.height, 0);
export const lengthOf = (survey: Survey) => (survey.routes || []).reduce((n, route) => n + route.length, 0);
export const isEmpty = (survey: Survey) => !survey.rooms?.length && !survey.routes?.length && !survey.photos?.length;

/** Сжимает фото до ~720 px, чтобы они помещались в хранилище браузера */
export function shrinkPhoto(file: File, max = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось прочитать фото")); };
    img.src = url;
  });
}

export function touch(r: { survey?: Survey }, user: Pick<Staff, "name">) {
  const s = (r.survey ||= emptySurvey());
  s.at = new Date().toISOString();
  s.by = user.name;
  return s;
}
