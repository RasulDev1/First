import "./setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { login, can } from "../src/lib/auth";
import { ROLES, SERVICES } from "../src/lib/config";
import { seed, DEMO_PASSWORD } from "../src/lib/seed";
import { rateOf, payOf, netOf } from "../src/lib/pay";
import { DEFAULT_RULES, normalizeRule, rulesOf, automationTasks } from "../src/lib/automations";
import { snapshot, recordChanges } from "../src/lib/audit";
import { marginOf, markupOf, floorOf, totals, minMargin, setMinMargin } from "../src/lib/estimate";
import { isLow, toBuy, qtyOf } from "../src/lib/stock";
import { stageOf } from "../src/lib/orders";

beforeEach(() => db.reset());

test("вход: верный пароль пускает, неверный и неизвестный логин нет", () => {
  assert.equal(login("director", DEMO_PASSWORD).role, "director");
  assert.throws(() => login("director", "wrong"), /Неверный/);
  assert.throws(() => login("nobody", DEMO_PASSWORD), /Неверный/);
  assert.equal(login("  DIRECTOR ", DEMO_PASSWORD).login, "director");
});

test("права: мастер видит только свои разделы, руководитель всё", () => {
  const m = login("master", DEMO_PASSWORD), d = login("director", DEMO_PASSWORD);
  assert.deepEqual(ROLES.master.sections, ["myorders", "chat", "salary"]);
  assert.ok(can(m, "salary") && can(m, "chat"));
  assert.ok(!can(m, "clients") && !can(m, "staff") && !can(m, "automations"));
  for (const s of ROLES.director.sections) assert.ok(can(d, s), s);
  assert.ok(!can(null, "home"));
});

test("услуги: «Проектирование и замер» убрано", () => {
  assert.ok(!JSON.stringify(SERVICES).includes("Проектирование и замер"));
});

test("зарплата мастера: ставка по умолчанию 20% / 10% стажёр, личная ставка важнее", () => {
  const master = db.list("masters").find((x) => x.level === "master")!;
  const trainee = db.list("masters").find((x) => x.level === "trainee")!;
  assert.equal(rateOf(master) , Number(master.rate ?? 20));
  assert.equal(rateOf({ ...trainee, rate: undefined } as any), 10);
  assert.equal(rateOf({ ...master, rate: 35 } as any), 35);
  const r = { ...db.list("requests")[0], master_id: master.id, amount: 100000, expenses: [{ qty: 2, cost: 1000 }] } as any;
  const pay = payOf(r);
  assert.equal(pay, Math.round(100000 * rateOf(master) / 100));
  assert.equal(netOf(r), 100000 - 2000 - pay);
});

test("смета: маржа, нижняя граница цены и итоги", () => {
  assert.equal(marginOf(0, 100), 0);
  assert.equal(Math.round(marginOf(200, 100)), 50);
  assert.equal(floorOf(0), 0);
  assert.equal(floorOf(100, 25), 125);
  assert.equal(floorOf(100), 125, "по умолчанию наценка 25%");
  assert.equal(markupOf(125, 100), 25);
  assert.equal(markupOf(100, 0), 0);
  const t = totals([{ qty: 2, price: 100, cost: 60 } as any, { qty: 1, price: 50, cost: 20 } as any]);
  assert.equal(t.total, 250);
  assert.equal(t.cost, 140);
  assert.equal(t.profit, 110);
});

test("склад: low-stock и количество к закупке", () => {
  const p = db.list("products")[0];
  db.patch("products", p.id, { min_qty: 1e6 });
  const fresh = db.find("products", p.id)!;
  assert.ok(isLow(fresh));
  assert.equal(toBuy(fresh), 2e6 - qtyOf(p.id));
  db.patch("products", p.id, { min_qty: 0 });
  assert.equal(isLow(db.find("products", p.id)!), qtyOf(p.id) <= 0);
});

test("статус заказа выводится из данных", () => {
  const base: any = { done_at: null, payments: [], survey: null, master_id: null };
  assert.equal(stageOf(base), "new");
  assert.equal(stageOf({ ...base, master_id: 1 }), "assigned");
  assert.equal(stageOf({ ...base, master_id: 1, survey: { saved: true } }), "pricing");
  assert.equal(stageOf({ ...base, payments: [{}] }), "in_work");
  assert.equal(stageOf({ ...base, done_at: "x" }), "done");
});

test("журнал: создание, изменение и удаление попадают в аудит", () => {
  const n0 = db.exportAudit().length;
  const c = db.insert("clients", { name: "Тест Тестов", phone: "+7 900 000-00-00" } as any);
  db.patch("clients", c.id, { name: "Тест Иванов" });
  db.remove("clients", c.id);
  const log = db.exportAudit().slice(n0).filter((e) => e.table === "clients");
  assert.deepEqual(log.map((e) => e.action), ["create", "update", "delete"]);
  assert.match(log[1].text, /Тест/);
});

test("журнал: без изменений записей нет; лимит 1000", () => {
  const d = seed(); const snap = snapshot(d);
  recordChanges(d, snap, "t");
  assert.equal((d.audit || []).length, 0);
  for (let i = 0; i < 1100; i++) { d.clients.push({ id: 9000 + i, name: "c" + i, phone: "" } as any); }
  recordChanges(d, snap, "t");
  assert.ok(d.audit!.length <= 1000);
});

test("автоматизации: правила по умолчанию и перевод часов в минуты", () => {
  assert.equal(DEFAULT_RULES.length, 4);
  assert.equal(normalizeRule({ ...DEFAULT_RULES[0], after_min: undefined as any, after_h: 2 } as any).after_min, 120);
  assert.equal(normalizeRule({ ...DEFAULT_RULES[0], after_min: 5 }).after_min, 5);
  assert.equal(rulesOf(seed()).length >= 4, true);
});

test("автоматизации: новая заявка создаёт задачу один раз, срок в минутах", () => {
  const d = seed();
  d.settings[0].rules = [{ id: "x", name: "Тест", on: true, trigger: "new", assignee: "director", title: "Звонок {n} {client}", note: "{phone}", after_min: 30 }];
  const req = { id: 777, status: "new", client: "Ольга", phone: "+7 1", address: "ул. 1" } as any;
  const t0 = Date.now();
  const out = automationTasks(d, { created: [req], statusChanged: [] });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Звонок №777 Ольга");
  assert.equal(out[0].created_by, 0);
  assert.equal(d.staff.find((s) => s.id === out[0].assignee_id)!.role, "director");
  const mins = (new Date(out[0].due!).getTime() - t0) / 6e4;
  assert.ok(mins >= 29.9 && mins < 31, String(mins));
  d.tasks.push({ id: 1, title: out[0].title, done_at: null } as any);
  assert.equal(automationTasks(d, { created: [req], statusChanged: [] }).length, 0, "дубль открытой задачи");
  d.settings[0].rules![0].on = false;
  d.tasks.length = 0;
  assert.equal(automationTasks(d, { created: [req], statusChanged: [] }).length, 0, "выключенное правило");
});

test("автоматизации через базу: новая заявка → задача менеджеру", () => {
  const n = db.list("tasks").length;
  db.insert("requests", { client: "Авто Тест", phone: "1", address: "а", status: "new", service: "x" } as any);
  const added = db.list("tasks").slice(n);
  assert.ok(added.length > 0 && added.every((t) => t.created_by === 0));
});

test("резервная копия: экспорт → изменение → восстановление", () => {
  const json = db.exportJson();
  const c = db.list("clients").length;
  db.insert("clients", { name: "Лишний", phone: "" } as any);
  assert.equal(db.list("clients").length, c + 1);
  db.restore(json);
  assert.equal(db.list("clients").length, c);
  assert.throws(() => db.restore("не json"), /не читается/);
  assert.throws(() => db.restore("{}"), /нет данных/);
});

test("чат: сообщения хранятся в базе", () => {
  const n = db.list("messages").length;
  db.insert("messages", { from_id: 1, to_id: null, text: "привет" } as any);
  assert.equal(db.list("messages").length, n + 1);
});

test("наценка: меньше 25% не сохраняется, больше можно", () => {
  assert.equal(setMinMargin(10), 25);
  assert.equal(minMargin(), 25);
  assert.equal(setMinMargin("abc"), 25);
  assert.equal(setMinMargin(40), 40);
  assert.equal(minMargin(), 40);
  assert.equal(floorOf(100), 140);
  assert.equal(setMinMargin(9999), 300);
});
