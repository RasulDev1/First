"use client";
// Замеры: помещения, трассы воздуховодов, фото и заметка. В карточке заказа — черновик с правкой, во вкладке «Замеры» — тоже правка с кнопкой «Сохранить».
import { useState, type FormEvent } from "react";
import { num, dateTime, formValue } from "@/lib/core";
import { DIAMETERS, MAX_PHOTOS, shrinkPhoto } from "@/lib/survey";
import type { Survey } from "@/lib/types";
import { Button, Field, FormError, IconButton, Table, buttonClass, cx } from "@/components/ui";
import { toast } from "@/components/toast";
import { P, muted, sheetCols, small, thR } from "./shared";

/** Правка черновика: применяет изменение, если менеджеру можно; false — нельзя */
export type SurveyEdit = (fn: (s: Survey) => void) => boolean;

const h4 = "m-0 mb-1.5 text-sm font-semibold";
const surveyForm = "grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 items-end mt-2.5 [&>button]:col-span-full";

export function SurveyView({ survey: s, edit }: { survey: Survey; edit?: SurveyEdit }) {
  const [roomError, setRoomError] = useState("");
  const [routeError, setRouteError] = useState("");

  const addRoom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation(); // форма замеров лежит внутри формы карточки: не сохранять карточку целиком
    if (!edit) return;
    const form = e.currentTarget, fd = new FormData(form);
    const area = Number(fd.get("area")), height = Number(fd.get("height")), name = formValue(fd, "name");
    if (!name || !(area > 0) || !(height > 0)) { setRoomError("Заполните помещение, площадь и высоту"); return; }
    if (edit((d) => { d.rooms.push({ name, area, height, ac: fd.get("ac") === "on" }); })) { form.reset(); setRoomError(""); }
  };
  const addRoute = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation(); // форма замеров лежит внутри формы карточки: не сохранять карточку целиком
    if (!edit) return;
    const form = e.currentTarget, fd = new FormData(form);
    const length = Number(fd.get("length")), name = formValue(fd, "name");
    if (!name || !(length > 0)) { setRouteError("Заполните трассу и длину"); return; }
    const route = { name, diameter: Number(fd.get("diameter")), length, bends: Math.max(0, Math.round(Number(fd.get("bends")) || 0)) };
    if (edit((d) => { d.routes.push(route); })) { form.reset(); setRouteError(""); }
  };
  const addPhotos = async (input: HTMLInputElement) => {
    if (!edit) return;
    const files = [...(input.files || [])].slice(0, MAX_PHOTOS - s.photos.length);
    input.value = "";
    try {
      const shots: string[] = [];
      for (const f of files) shots.push(await shrinkPhoto(f));
      edit((d) => { d.photos.push(...shots.slice(0, MAX_PHOTOS - d.photos.length)); });
    } catch (error) { toast((error as Error).message, "bad"); }
  };

  return (
    <div className={sheetCols}>
      <div>
        <h4 className={h4}>Помещения</h4>
        {s.rooms.length ? (
          <Table>
            <thead><tr><th>Помещение</th><th className={thR}>Площадь</th><th className={thR}>Высота</th><th>Кондиционер</th><th /></tr></thead>
            <tbody>{s.rooms.map((room, i) => (
              <tr key={i}>
                <td>{room.name}</td><td className="text-right tabular-nums">{num(room.area)} м²</td><td className="text-right tabular-nums">{num(room.height)} м</td>
                <td>{room.ac ? "да" : "—"}</td>
                <td className="text-right">{edit ? <IconButton aria-label="Убрать" onClick={() => edit((d) => { d.rooms.splice(i, 1); })} /> : null}</td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <p className={cx(P, muted)}>Помещений нет.</p>}
        {edit ? (
          <form className={surveyForm} onSubmit={addRoom}>
            <Field label="Помещение"><input name="name" required maxLength={60} placeholder="Кухня" /></Field>
            <Field label="Площадь, м²"><input name="area" type="number" min="1" step="0.1" required inputMode="decimal" /></Field>
            <Field label="Высота, м"><input name="height" type="number" min="2" max="10" step="0.05" defaultValue="2.7" required inputMode="decimal" /></Field>
            <Field label="Кондиционер" className="items-start"><input type="checkbox" name="ac" className="size-[22px] min-h-0" /></Field>
            {roomError ? <div className="col-span-full"><FormError>{roomError}</FormError></div> : null}
            <Button variant="primary" type="submit">Добавить помещение</Button>
          </form>
        ) : null}
      </div>

      <div>
        <h4 className={h4}>Трассы воздуховодов</h4>
        {s.routes.length ? (
          <Table>
            <thead><tr><th>Трасса</th><th className={thR}>Ø, мм</th><th className={thR}>Длина</th><th className={thR}>Отводов</th><th /></tr></thead>
            <tbody>{s.routes.map((route, i) => (
              <tr key={i}>
                <td>{route.name}</td><td className="text-right tabular-nums">{route.diameter}</td><td className="text-right tabular-nums">{num(route.length)} м</td>
                <td className="text-right tabular-nums">{route.bends}</td>
                <td className="text-right">{edit ? <IconButton aria-label="Убрать" onClick={() => edit((d) => { d.routes.splice(i, 1); })} /> : null}</td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <p className={cx(P, muted)}>Трасс нет.</p>}
        {edit ? (
          <form className={surveyForm} onSubmit={addRoute}>
            <Field label="Трасса"><input name="name" required maxLength={60} placeholder="Кухня → улица" /></Field>
            <Field label="Диаметр, мм"><select name="diameter" defaultValue="160">{DIAMETERS.map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Длина, м"><input name="length" type="number" min="0.5" step="0.1" required inputMode="decimal" /></Field>
            <Field label="Отводов, шт."><input name="bends" type="number" min="0" step="1" defaultValue="2" inputMode="numeric" /></Field>
            {routeError ? <div className="col-span-full"><FormError>{routeError}</FormError></div> : null}
            <Button variant="primary" type="submit">Добавить трассу</Button>
          </form>
        ) : null}
      </div>

      <div>
        <h4 className={h4}>Фото и заметка</h4>
        <div className="flex flex-wrap gap-2 mb-2">
          {s.photos.map((src, i) => (
            <figure key={i} className="relative m-0 w-24 h-[72px]">
              <img src={src} alt={`Фото замера ${i + 1}`} className="size-full object-cover border border-line" />
              {edit ? <IconButton aria-label="Убрать фото" className="absolute top-0 right-0 !bg-surface !px-1.5 !py-0"
                onClick={() => edit((d) => { d.photos.splice(i, 1); })} /> : null}
            </figure>
          ))}
        </div>
        {!edit ? (s.photos.length ? null : <p className={cx(P, muted)}>Фото нет.</p>)
          : s.photos.length < MAX_PHOTOS ? (
            <label className={cx(buttonClass(), "cursor-pointer mb-2")}>Добавить фото
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.currentTarget)} /></label>
          ) : <p className={cx(P, muted, small)}>Максимум {MAX_PHOTOS} фото.</p>}
        {edit ? (
          <textarea name="note" rows={3} maxLength={1000} aria-label="Заметка" placeholder="Что важно: перекрытия, высота потолка, подъезд" className="w-full"
            value={s.note || ""} onChange={(e) => { const v = e.currentTarget.value; edit((d) => { d.note = v; }); }} />
        ) : s.note ? <p className="m-0 whitespace-pre-wrap">{s.note}</p> : <p className={cx(P, muted)}>Заметки нет.</p>}
        {s.at ? <p className={cx(P, muted, small)}>Последнее изменение: {dateTime(s.at)}{s.by ? `, ${s.by}` : ""}</p> : null}
      </div>
    </div>
  );
}
