// «Калькулятор»: быстрая прикидка стоимости вентиляции или кондиционера по площади, без выезда.
// Считает тем же способом, что автосмета: материалы по складу (закупка + наценка), работы по прайсу.
import { esc, money, num } from "../core.js";
import { db } from "../db.js";
import { field } from "../ui.js";
import { buildEstimate, totals, minMargin } from "../estimate.js";

export const SYSTEMS = [
  ["supply", "Приточная вентиляция"], ["exhaust", "Вытяжная вентиляция"],
  ["recup", "Приточно-вытяжная с рекуперацией"], ["ac", "Кондиционирование"],
];
const state = { system: "supply", area: 60, rooms: 3, height: 2.7, rate: 3 };

const diameterFor = (flow) => (flow <= 150 ? 100 : flow <= 300 ? 125 : flow <= 600 ? 160 : flow <= 1000 ? 200 : 250);

/** Из площади и числа помещений собирает условный замер и считает смету */
export function calculate({ system, area, rooms, height, rate }) {
  const n = Math.max(1, Math.round(rooms)), each = area / n, volume = area * height;
  const survey = { rooms: Array.from({ length: n }, (_, i) => ({ name: `Помещение ${i + 1}`, area: Math.round(each * 10) / 10, height, ac: system === "ac" })), routes: [], photos: [] };
  const flow = (volume / n) * rate; // м³/ч на помещение
  if (system !== "ac") {
    const length = Math.round((4 + each * 0.2) * 2) / 2, diameter = diameterFor(flow);
    const lines = system === "recup" ? 2 : 1; // с рекуператором — приточные и вытяжные трассы
    for (let i = 0; i < n * lines; i++) survey.routes.push({ name: `Трасса ${i + 1}`, diameter, length, bends: 2 + Math.floor(length / 6) });
  }
  let lines = buildEstimate({ survey }, db.list("products"));
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

function resultHtml() {
  const r = calculate(state);
  const mats = r.lines.filter((l) => l.kind === "mat"), works = r.lines.filter((l) => l.kind === "work");
  const sum = (list) => list.reduce((n, l) => n + l.qty * l.price, 0);
  const table = (title, list) => `<h4>${title} · ${money(sum(list))}</h4><div class="table-wrap"><table class="tbl"><thead><tr><th>Позиция</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th></tr></thead><tbody>
    ${list.map((l) => `<tr><td>${esc(l.name)}</td><td class="r num">${num(l.qty)} ${esc(l.unit)}</td><td class="r num">${money(l.price)}</td><td class="r num">${money(l.qty * l.price)}</td></tr>`).join("")}</tbody></table></div>`;
  const low = r.margin < minMargin();
  return `<div class="kpis"><div class="kpi accent"><small>Ориентировочная стоимость</small><b class="num">${money(r.total)}</b><span>вилка ${money(r.total * 0.9)} — ${money(r.total * 1.1)}</span></div>
      <div class="kpi"><small>Прибыль</small><b class="num">${money(r.profit)}</b><span>без учёта зарплат</span></div>
      <div class="kpi"><small>Процент</small><b class="num ${low ? "bad" : ""}">${num(Math.round(r.margin * 10) / 10)}%</b><span>порог ${num(minMargin())}%</span></div>
      ${state.system === "ac" ? "" : `<div class="kpi"><small>Расход воздуха</small><b class="num">${num(r.flow)} м³/ч</b><span>кратность ${state.rate}</span></div>`}</div>
    ${table("Материалы", mats)}${table("Работы", works)}
    <p class="muted small">Это прикидка без выезда: точную смету делают по замеру во вкладке «Смета» заказа. Цены работ ориентировочные.</p>`;
}

function render() {
  const s = state;
  return `<div class="calc"><form class="calc-form" data-form="noop" onsubmit="return false">
      ${field("Что считаем", `<select name="system" data-change="calc">${SYSTEMS.map(([id, t]) => `<option value="${id}"${id === s.system ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`)}
      ${field("Общая площадь, м²", `<input name="area" type="number" min="10" max="2000" step="1" value="${s.area}" data-input="calc" inputmode="decimal">`)}
      ${field("Число помещений", `<input name="rooms" type="number" min="1" max="30" step="1" value="${s.rooms}" data-input="calc" inputmode="numeric">`)}
      ${field("Высота потолков, м", `<input name="height" type="number" min="2" max="8" step="0.1" value="${s.height}" data-input="calc" inputmode="decimal">`)}
      <label class="field calc-rate"${s.system === "ac" ? " hidden" : ""}><span class="field-label">Кратность воздухообмена, раз/ч</span>
        <input name="rate" type="number" min="1" max="20" step="0.5" value="${s.rate}" data-input="calc" inputmode="decimal">
        <span class="field-hint">Жильё 2–3, кухня и санузел до 10</span></label>
    </form><div class="calc-out" id="calcOut">${resultHtml()}</div></div>`;
}

export default {
  title: () => "Калькулятор вентиляции",
  render,
  actions: {
    calc(el) {
      const form = el.closest("form"), v = (n) => Number(form[n].value);
      state.system = form.system.value;
      state.area = Math.min(2000, Math.max(10, v("area") || 10));
      state.rooms = Math.min(30, Math.max(1, v("rooms") || 1));
      state.height = Math.min(8, Math.max(2, v("height") || 2.7));
      state.rate = Math.min(20, Math.max(1, v("rate") || 3));
      document.getElementById("calcOut").innerHTML = resultHtml();
      form.querySelector(".calc-rate").hidden = state.system === "ac";
    },
  },
};
