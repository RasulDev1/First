"use client";
// «Калькулятор»: быстрая прикидка стоимости вентиляции или кондиционера по площади, без выезда.
// Считает тем же способом, что автосмета: материалы по складу (закупка + наценка), работы по прайсу.
import { useState } from "react";
import { money, num } from "@/lib/core";
import { db } from "@/lib/db";
import { buildEstimate, totals, minMargin } from "@/lib/estimate";
import type { EstimateLine, Survey } from "@/lib/types";
import { Field, Kpi, Kpis, Table } from "@/components/ui";
import type { View } from "./types";

export type SystemId = "supply" | "exhaust" | "recup" | "ac";
export const SYSTEMS: readonly (readonly [SystemId, string])[] = [
  ["supply", "Приточная вентиляция"], ["exhaust", "Вытяжная вентиляция"],
  ["recup", "Приточно-вытяжная с рекуперацией"], ["ac", "Кондиционирование"],
];
export interface CalcInput { system: SystemId; area: number; rooms: number; height: number; rate: number }

// Значения формы живут, пока открыта вкладка, — как в прежней версии
const saved: { form: Record<keyof CalcInput, string> } = {
  form: { system: "supply", area: "60", rooms: "3", height: "2.7", rate: "3" },
};

const diameterFor = (flow: number) => (flow <= 150 ? 100 : flow <= 300 ? 125 : flow <= 600 ? 160 : flow <= 1000 ? 200 : 250);

/** Из площади и числа помещений собирает условный замер и считает смету */
export function calculate({ system, area, rooms, height, rate }: CalcInput) {
  const n = Math.max(1, Math.round(rooms)), each = area / n, volume = area * height;
  const survey: Survey = {
    rooms: Array.from({ length: n }, (_, i) => ({ name: `Помещение ${i + 1}`, area: Math.round(each * 10) / 10, height, ac: system === "ac" })),
    routes: [], photos: [], note: "",
  };
  const flow = (volume / n) * rate; // м³/ч на помещение
  if (system !== "ac") {
    const length = Math.round((4 + each * 0.2) * 2) / 2, diameter = diameterFor(flow);
    const lines = system === "recup" ? 2 : 1; // с рекуператором — приточные и вытяжные трассы
    for (let i = 0; i < n * lines; i++) survey.routes.push({ name: `Трасса ${i + 1}`, diameter, length, bends: 2 + Math.floor(length / 6) });
  }
  let lines: EstimateLine[] = buildEstimate({ survey }, db.list("products"));
  if (system === "recup") {
    // вместо канальных вентиляторов — приточно-вытяжная установка с рекуператором
    lines = lines.filter((l) => !/^Вентилятор канальный/.test(l.name));
    const unit = db.list("products").find((p) => p.sku === "PVU-350R");
    const works = lines.filter((l) => l.kind === "work");
    if (unit) {
      const qty = Math.max(1, Math.ceil((volume * rate) / 350));
      lines.unshift({ id: "unit", kind: "mat", product_id: unit.id, name: unit.name, unit: unit.unit, qty, cost: unit.cost, price: Math.round((unit.cost * 1.4) / 10) * 10 });
      const fan = works.find((w) => w.work === "fan");
      if (fan) fan.qty = qty;
    }
  }
  return { lines, flow: Math.round(flow * n), ...totals(lines) };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isSystem = (v: string): v is SystemId => SYSTEMS.some(([id]) => id === v);

function toInput(form: Record<keyof CalcInput, string>): CalcInput {
  const v = (k: keyof CalcInput) => Number(form[k]);
  return {
    system: isSystem(form.system) ? form.system : "supply",
    area: clamp(v("area") || 10, 10, 2000),
    rooms: clamp(v("rooms") || 1, 1, 30),
    height: clamp(v("height") || 2.7, 2, 8),
    rate: clamp(v("rate") || 3, 1, 20),
  };
}

const sum = (list: EstimateLine[]) => list.reduce((n, l) => n + l.qty * l.price, 0);

function LinesTable({ title, list }: { title: string; list: EstimateLine[] }) {
  return (
    <>
      <h4 className="mt-1 mb-0 text-sm font-semibold text-heading">{title} · {money(sum(list))}</h4>
      <Table>
        <thead><tr><th>Позиция</th><th className="text-right!">Кол-во</th><th className="text-right!">Цена</th><th className="text-right!">Сумма</th></tr></thead>
        <tbody>{list.map((l) => (
          <tr key={l.id}><td>{l.name}</td><td className="text-right tabular-nums">{num(l.qty)} {l.unit}</td>
            <td className="text-right tabular-nums">{money(l.price)}</td><td className="text-right tabular-nums">{money(l.qty * l.price)}</td></tr>
        ))}</tbody>
      </Table>
    </>
  );
}

function Result({ state }: { state: CalcInput }) {
  const r = calculate(state);
  const mats = r.lines.filter((l) => l.kind === "mat"), works = r.lines.filter((l) => l.kind === "work");
  const low = r.margin < minMargin();
  return (
    <div className="flex flex-col gap-3.5 min-w-0">
      <Kpis>
        <Kpi tone="accent" label="Ориентировочная стоимость" value={money(r.total)} sub={`вилка ${money(r.total * 0.9)} — ${money(r.total * 1.1)}`} />
        <Kpi label="Прибыль" value={money(r.profit)} sub="без учёта зарплат" />
        <Kpi label="Процент" value={`${num(Math.round(r.margin * 10) / 10)}%`} sub={`порог ${num(minMargin())}%`} tone={low ? "bad" : undefined} />
        {state.system === "ac" ? null : <Kpi label="Расход воздуха" value={`${num(r.flow)} м³/ч`} sub={`кратность ${state.rate}`} />}
      </Kpis>
      <LinesTable title="Материалы" list={mats} />
      <LinesTable title="Работы" list={works} />
      <p className="m-0 text-muted text-[13px]">Это прикидка без выезда: точную смету делают по замеру во вкладке «Смета» заказа. Цены работ ориентировочные.</p>
    </div>
  );
}

function Calc() {
  const [form, setFormState] = useState(saved.form);
  const set = (k: keyof CalcInput, v: string) => { const next = { ...form, [k]: v }; saved.form = next; setFormState(next); };
  const state = toInput(form);
  return (
    <div className="grid grid-cols-1 min-[901px]:grid-cols-[320px_minmax(0,1fr)] gap-5 items-start">
      <form className="bg-surface border border-black/[.04] rounded-card shadow-card p-6 flex flex-col gap-4 min-[901px]:sticky min-[901px]:top-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="Что считаем">
          <select name="system" value={form.system} onChange={(e) => set("system", e.target.value)}>
            {SYSTEMS.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select>
        </Field>
        <Field label="Общая площадь, м²">
          <input name="area" type="number" min={10} max={2000} step={1} inputMode="decimal" value={form.area} onChange={(e) => set("area", e.target.value)} />
        </Field>
        <Field label="Число помещений">
          <input name="rooms" type="number" min={1} max={30} step={1} inputMode="numeric" value={form.rooms} onChange={(e) => set("rooms", e.target.value)} />
        </Field>
        <Field label="Высота потолков, м">
          <input name="height" type="number" min={2} max={8} step={0.1} inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} />
        </Field>
        {state.system === "ac" ? null : (
          <Field label="Кратность воздухообмена, раз/ч" hint="Жильё 2–3, кухня и санузел до 10">
            <input name="rate" type="number" min={1} max={20} step={0.5} inputMode="decimal" value={form.rate} onChange={(e) => set("rate", e.target.value)} />
          </Field>
        )}
      </form>
      <Result state={state} />
    </div>
  );
}

const view: View = { title: () => "Калькулятор вентиляции", Component: Calc };
export default view;
