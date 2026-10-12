"use client";
// Карточка заказа в боковой панели, форма нового заказа и данных клиента, внесение оплаты.
import { useState, type FormEvent } from "react";
import { money, dateTime, copyText, formValue } from "@/lib/core";
import { OBJECTS, SERVICES, SOURCES } from "@/lib/config";
import { db } from "@/lib/db";
import { currentUser, isDirector, isWarehouse } from "@/lib/auth";
import { ensureClient, findByPhone } from "@/lib/clients";
import { pushComment } from "@/lib/comments";
import { minAmount, minMargin } from "@/lib/estimate";
import { emptySurvey, touch } from "@/lib/survey";
import { PAY_METHODS, levelTitle, setStatus, stageOf } from "@/lib/orders";
import type { Request, Staff, Survey } from "@/lib/types";
import {
  ArmedButton, Button, CommentForm, CommentsList, DHead, DSec, Empty, Field, FormError, Kv, Note, Options, StatusPill,
  cx, formCol, grid2,
} from "@/components/ui";
import { closeDrawer, openDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { openClient } from "../clients";
import { SurveyView } from "./survey";
import { Expenses, GuardButton, P, allowed, inlineForm, logBy, masterName, muted, orderNo, save, cityOf, streetOf, small, staffName, useGuard } from "./shared";

/** Менеджер не может поставить сумму ниже порога маржи (закупка / (1 − порог)); руководитель может */
export function amountAllowed(r: Request, amount: number, user: Staff) {
  if (isDirector(user) || !(amount > 0)) return true;
  const min = minAmount(r);
  if (amount >= min) return true;
  toast(`Ниже порога маржи ${minMargin()}%: сумма не меньше ${money(min)}`, "bad");
  return false;
}

/** Сохраняет стоимость работы; false — не сохранили */
export function saveAmount(r: Request, value: unknown, user: Staff) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount === (r.amount || 0) || !amountAllowed(r, amount, user)) return;
  r.amount = amount;
  logBy(r, `Стоимость работы: ${money(amount)}`, user);
  save("Сумма сохранена");
}

/* ---------- Замеры: черновик в карточке ---------- */
const surveyKey = (sv: Survey = emptySurvey()) => JSON.stringify([sv.rooms, sv.routes, sv.photos, (sv.note || "").trim()]);
const surveyOpen = (r: Request) => !r.survey?.saved && r.status !== "cancelled";

/* ---------- Складовщик: заказ без цен и контактов ---------- */
function WarehouseCard({ r, user }: { r: Request; user: Staff }) {
  const master = db.find("masters", r.master_id);
  return (
    <>
      <DHead eyebrow={`Заказ №${r.id} · ${dateTime(r.created_at)}`} title={r.client}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm"><StatusPill id={r.status} /></div>
      </DHead>
      <DSec>
        <Kv items={[
          ["Адрес", r.address], ["Услуга", r.service],
          ["Мастер", master ? `${master.name} · ${levelTitle(master)}` : "Не назначен"],
          r.visit_at ? ["Выезд", dateTime(r.visit_at)] : null,
        ]} />
      </DSec>
      <DSec title="Расходы"><Expenses r={r} button={user.position === "storekeeper"} /></DSec>
    </>
  );
}

/* ---------- Карточка заказа ---------- */
function CopyPhone({ phone }: { phone: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="bg-transparent border-0 p-0 text-brand font-medium cursor-pointer text-[13px] hover:underline"
      onClick={async () => {
        if (await copyText(phone)) { setDone(true); setTimeout(() => setDone(false), 1500); }
        else toast("Выделите и скопируйте текст вручную");
      }}>{done ? "Скопировано" : "Скопировать"}</button>
  );
}

const bareCity = (r: Request) => cityOf(r).replace(/^г\.\s*/, "");
const joinAddress = (city: string, street: string) => (city ? `г. ${city.replace(/^г\.\s*/, "")}, ${street}` : street);
const big = "[&_input]:text-lg [&_input]:min-h-12 [&_input]:font-semibold [&_input]:text-heading";
/** Замеры и стоимость работы появляются, когда мастер сделал замеры (стадия согласования стоимости) */
const pricingStage = (r: Request) => ["pricing", "in_work", "done"].includes(r.status) || (r.status === "measure" && Boolean(r.measured_at));

function OrderCard({ id }: { id: number }) {
  const user = currentUser();
  const r0 = db.find("requests", id);
  const [draft, setDraft] = useState<Survey>(() => structuredClone(r0?.survey || emptySurvey()));
  const [error, setError] = useState("");
  const gSave = useGuard(user ?? ({} as Staff));
  if (!user) return null;
  const r = r0;
  if (!r) return <Empty title="Заказ удалён" />;
  if (isWarehouse(user)) return <WarehouseCard r={r} user={user} />;
  const client = (r.client_id ? db.find("clients", r.client_id) : null) || findByPhone(r.phone);

  const masters = db.list("masters").filter((m) => m.active || m.id === r.master_id);
  const managers = db.list("staff").filter((s) => s.active && (s.role === "manager" || s.role === "director"));
  const closed = ["done", "cancelled"].includes(r.status);
  const master = db.find("masters", r.master_id);
  const pricing = pricingStage(r);
  const showSurvey = pricing && surveyOpen(r);
  const surveyDirty = surveyKey(draft) !== surveyKey(r.survey);

  const editSurvey = (fn: (s: Survey) => void) => {
    if (!allowed(r, user)) return false;
    setDraft((prev) => {
      const next = structuredClone(prev);
      touch({ survey: next }, user);
      fn(next);
      return next;
    });
    return true;
  };
  const take = () => {
    r.manager_id = user.id;
    logBy(r, "Менеджер взял заказ", user);
    save("Заказ ваш: выберите мастера и сохраните");
  };
  const setManager = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const managerId = Number(new FormData(e.currentTarget).get("manager")) || null;
    if (managerId === r.manager_id) return;
    r.manager_id = managerId;
    logBy(r, managerId ? `Ответственный менеджер: ${staffName(managerId)}` : "Менеджер снят", user);
    save("Менеджер назначен");
  };
  const restore = () => { if (!isDirector(user)) return; setStatus(r, stageOf(r), user.name); save("Заказ возвращён в работу"); };

  /** Одна кнопка «Сохранить»: данные клиента и адрес, мастер, стоимость работы и замеры */
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = {
      city: formValue(fd, "city"), street: formValue(fd, "street"), phone: formValue(fd, "phone"), client: formValue(fd, "client"),
      object: formValue(fd, "object"), service: formValue(fd, "service"),
    };
    const address = joinAddress(v.city, v.street);
    const masterId = Number(fd.get("master")) || null;
    const amountRaw = fd.get("amount");
    const amount = amountRaw == null ? (r.amount || 0) : Math.max(0, Math.round(Number(amountRaw) || 0));
    const changed = v.client !== r.client || v.phone !== r.phone || address !== r.address || v.object !== (r.object || "") || v.service !== r.service;
    const assigning = !r.master_id && masterId != null;
    const amountChanged = amount !== (r.amount || 0);
    const surveyChanged = showSurvey && (surveyDirty || !r.survey?.saved) && (draft.rooms.length > 0 || draft.routes.length > 0 || draft.photos.length > 0 || Boolean(draft.note?.trim()));
    if (!changed && !assigning && !amountChanged && !surveyChanged) { toast("Изменений нет"); return; }
    if (!v.client || !v.phone || !v.street) { setError("Заполните имя, телефон и адрес"); return; }
    if (amountChanged && !amountAllowed(r, amount, user)) return;
    if (!gSave.check(r)) return;
    setError("");
    if (changed) {
      Object.assign(r, { client: v.client, phone: v.phone, address, object: v.object, service: v.service });
      r.client_id = ensureClient({ name: v.client, phone: v.phone }).id;
      logBy(r, "Изменены данные клиента", user);
    }
    if (assigning) {
      r.declined_by = null;
      r.master_id = masterId;
      logBy(r, `Назначен мастер: ${db.find("masters", masterId)?.name ?? ""}`, user);
      if (!r.manager_id) r.manager_id = user.id;
      if (r.status === "new") setStatus(r, "assigned", user.name);
    }
    if (surveyChanged) {
      r.survey = { ...structuredClone(draft), note: (draft.note || "").trim(), saved: true };
      setDraft(structuredClone(r.survey));
      logBy(r, "Замеры сохранены", user);
      if (["assigned", "measure"].includes(r.status)) setStatus(r, "pricing", user.name);
    }
    if (amountChanged) {
      r.amount = amount;
      logBy(r, `Стоимость работы: ${money(amount)}`, user);
    }
    save(assigning ? "Сохранено, мастер назначен" : "Сохранено");
  };

  return (
    <>
      <DHead eyebrow={`Заказ №${r.id} · ${r.source || ""} · ${dateTime(r.created_at)}`} title={r.client}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <StatusPill id={r.status} />
          <span className={muted}>{r.manager_id ? `Менеджер: ${staffName(r.manager_id)}` : "Менеджер не назначен"}</span>
        </div>
      </DHead>

      {r.status === "new" && !r.manager_id ? (
        <DSec callout>
          <p className="m-0"><b>Заказ создан.</b> Возьмите его, позвоните клиенту, выберите мастера и нажмите «Сохранить».</p>
          <Button variant="primary" onClick={take}>Взять заказ</Button>
        </DSec>
      ) : null}
      {r.status === "measure" && r.measured_at && !r.survey?.saved ? (
        <DSec callout><p className="m-0"><b>Мастер сделал замеры</b> ({dateTime(r.measured_at)}). Впишите замеры и стоимость работы и нажмите «Сохранить».</p></DSec>
      ) : null}

      <form key={`${r.id}-${r.status}-${r.master_id ?? 0}`} onSubmit={submit} className="flex flex-col gap-0">
        <DSec>
          <div className={cx(grid2, big)}>
            <Field label="Город"><input name="city" maxLength={60} defaultValue={bareCity(r)} placeholder="Город" /></Field>
            <Field label="Адрес"><input name="street" required maxLength={160} defaultValue={streetOf(r)} placeholder="Улица, дом, квартира" /></Field>
            <Field label="Телефон" hint={client ? <button type="button" className={orderNo} onClick={() => openClient(client.id)}>Карточка клиента</button> : undefined}>
              <span className="flex gap-2 items-center"><input name="phone" required type="tel" maxLength={30} defaultValue={r.phone} className="tabular-nums" /><CopyPhone phone={r.phone} /></span>
            </Field>
            <Field label="Имя"><input name="client" required maxLength={120} defaultValue={r.client} placeholder="Имя и фамилия" /></Field>
            <Field label="Объект"><select name="object" defaultValue={r.object || OBJECTS[0]}><Options list={OBJECTS} /></select></Field>
            <Field label="Услуга"><select name="service" defaultValue={r.service || SERVICES[0]}><Options list={SERVICES} /></select></Field>
          </div>
          {r.note ? <p className={cx(P, muted)}>Со слов клиента: {r.note}</p> : null}
        </DSec>

        <DSec title="Мастер">
          {r.master_id ? (
            <>
              <p className={P}><b>{masterName(r.master_id)}</b> · {master ? levelTitle(master) : ""}</p>
              <p className={cx(P, muted, small)}>Переназначить мастера можно только после того, как он откажется от заказа в «Мои заказы».</p>
            </>
          ) : (
            <>
              {r.declined_by ? <Note tone="warn">{r.declined_by} отказался от заказа. Выберите другого мастера.</Note> : null}
              <Field label="Мастер" hint="Мастер назначится после нажатия «Сохранить» и увидит заказ у себя в «Мои заказы».">
                <select name="master" defaultValue="" disabled={closed}>
                  <Options list={masters.map((m) => ({ id: m.id, title: `${m.name} · ${levelTitle(m)}` }))} empty="Выберите мастера" />
                </select>
              </Field>
            </>
          )}
        </DSec>

        {pricing ? (
          <DSec title="Стоимость работы">
            <div className={inlineForm}>
              <input name="amount" type="number" min="0" step="100" inputMode="numeric" defaultValue={r.amount || ""} placeholder="0" aria-label="Стоимость работы, ₽" />
              <span className={muted}>₽</span>
            </div>
            <p className={cx(P, muted, small)}>Работы и оборудование для клиента. По выполненным заказам сумма идёт в выручку в «Аналитике».</p>
          </DSec>
        ) : null}

        {showSurvey ? <DSec title="Замеры"><SurveyView survey={draft} edit={editSurvey} /></DSec> : null}

        <FormError>{error}</FormError>
        {closed ? null : (
          <div className="sticky bottom-0 z-2 flex justify-end py-3 bg-linear-to-t from-surface from-70% to-transparent">
            <GuardButton g={gSave} variant="primary" size="big" type="submit">Сохранить</GuardButton>
          </div>
        )}
      </form>

      {isDirector(user) ? (
        <DSec title="Ответственный менеджер">
          <form key={r.manager_id ?? "none"} className={inlineForm} onSubmit={setManager}>
            <select name="manager" aria-label="Менеджер" defaultValue={r.manager_id ?? ""}>
              <Options list={managers.map((s) => ({ id: s.id, title: s.name }))} empty="Не назначен" />
            </select>
            <Button type="submit">Назначить</Button>
          </form>
          {r.status === "cancelled" ? <Button onClick={restore}>Вернуть заказ в работу</Button> : null}
        </DSec>
      ) : null}

      <DSec title="Расходы"><Expenses r={r} /></DSec>

      <DSec title="Комментарии">
        <CommentsList list={r.comments} />
        <CommentForm onSend={(text) => {
          const cur = db.find("requests", id);
          if (!cur || !pushComment(cur, text, user)) return false;
          save("Комментарий добавлен");
        }} />
      </DSec>
    </>
  );
}

export function openRequest(id: number) {
  const n = Number(id);
  openDrawer(() => <OrderCard id={n} />, { full: true });
}

/* ---------- Новый заказ и правка данных клиента ---------- */
function OrderForm({ id, pre }: { id: number | null; pre?: { name?: string; phone?: string } }) {
  const user = currentUser();
  const r = id != null ? db.find("requests", id) : null;
  const [client, setClient] = useState(r?.client || pre?.name || "");
  const [phone, setPhone] = useState(r?.phone || pre?.phone || "");
  const [hint, setHint] = useState(pre?.phone ? "Клиент из базы" : "");
  const [error, setError] = useState("");
  const g = useGuard(user ?? ({} as Staff));
  if (!user) return null;
  if (id != null && !r) return <Empty title="Заказ удалён" />;

  const onPhone = (value: string) => {
    setPhone(value);
    const c = findByPhone(value);
    if (c && !r && !client.trim()) setClient(c.name);
    setHint(c ? `Клиент из базы: ${c.name}, заказов ${db.list("requests").filter((x) => x.client_id === c.id).length}` : "");
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!g.check(r)) return;
    const v = {
      client: formValue(fd, "client"), phone: formValue(fd, "phone"), address: joinAddress(formValue(fd, "city"), formValue(fd, "street")), object: formValue(fd, "object"),
      service: formValue(fd, "service"), source: formValue(fd, "source"), note: formValue(fd, "note"),
    };
    if (!v.client || !v.phone || !formValue(fd, "street")) { setError("Заполните имя, телефон и адрес"); return; }
    setError("");
    if (r) {
      Object.assign(r, v);
      r.client_id = ensureClient({ name: v.client, phone: v.phone }).id;
      logBy(r, "Изменены данные клиента", user);
      save("Сохранено");
      openRequest(r.id);
    } else {
      const c = ensureClient({ name: v.client, phone: v.phone });
      const created = db.insert("requests", {
        ...v, client_id: c.id, comments: [], status: "new", manager_id: user.id, master_id: null, visit_at: null, amount: 0, items: [], comment: "",
        history: [{ at: new Date().toISOString(), by: user.name, text: "Заказ завёл менеджер" }],
      });
      toast(`Заказ №${created.id} создан`);
      openRequest(created.id);
    }
  };

  return (
    <>
      <DHead eyebrow={r ? `Заказ №${r.id}` : "Звонок или обращение"} title={r ? "Данные клиента" : "Новый заказ"} />
      <form className={grid2} onSubmit={submit}>
        <Field label="Имя">
          <input name="client" required maxLength={120} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Имя и фамилия" autoFocus />
        </Field>
        <Field label="Телефон" hint={r ? undefined : <span>{hint}</span>}>
          <input name="phone" required type="tel" maxLength={30} value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="+7 928 000-00-00" />
        </Field>
        <Field label="Город"><input name="city" maxLength={60} defaultValue={r ? bareCity(r) : ""} placeholder="Город" /></Field>
        <Field label="Адрес"><input name="street" required maxLength={160} defaultValue={r ? streetOf(r) : ""} placeholder="Улица, дом, квартира" /></Field>
        <Field label="Объект"><select name="object" defaultValue={r?.object || OBJECTS[0]}><Options list={OBJECTS} /></select></Field>
        <Field label="Услуга"><select name="service" defaultValue={r?.service || SERVICES[0]}><Options list={SERVICES} /></select></Field>
        <Field label="Откуда узнали"><select name="source" defaultValue={r?.source || "Звонок"}><Options list={SOURCES} /></select></Field>
        <Field label="Что нужно клиенту" className="col-span-full">
          <textarea name="note" rows={3} maxLength={1000} placeholder="Площадь, что не устраивает, удобное время" defaultValue={r?.note || ""} />
        </Field>
        {error ? <div className="col-span-full"><FormError>{error}</FormError></div> : null}
        <div className="col-span-full flex flex-wrap gap-2">
          <GuardButton g={g} variant="primary" type="submit">{r ? "Сохранить" : "Создать заказ"}</GuardButton>
          <Button onClick={() => (r ? openRequest(r.id) : closeDrawer())}>Отмена</Button>
        </div>
      </form>
    </>
  );
}

function openForm(id: number | null, pre?: { name?: string; phone?: string }) {
  openDrawer(() => <OrderForm id={id} pre={pre} />, { wide: true });
}
export const openCreate = () => openForm(null);

/** Новый заказ для клиента из базы (кнопка в карточке клиента) */
export function openNewOrder(client: { name: string; phone: string }) {
  openForm(null, { name: client.name, phone: client.phone });
}

/* ---------- Оплата ---------- */
function PaymentForm({ id }: { id: number }) {
  const user = currentUser();
  const r0 = db.find("requests", id);
  const [left] = useState(() => (r0 ? Math.max(0, (r0.amount || 0) - (r0.payments || []).reduce((n, p) => n + p.sum, 0)) : 0));
  const [error, setError] = useState("");
  if (!user) return null;
  if (!r0) return <Empty title="Заказ удалён" />;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget), r = db.find("requests", id);
    const sum = Math.round(Number(fd.get("sum")) || 0);
    if (!r) return;
    if (!(sum > 0)) { setError("Впишите сумму"); return; }
    if (!allowed(r, user)) return;
    const method = String(fd.get("method"));
    (r.payments ||= []).push({ sum, method, note: "", at: new Date().toISOString(), by: user.name });
    logBy(r, `Оплата: ${money(sum)} (${method})`, user);
    if (r.status === "pricing") setStatus(r, "in_work", user.name);
    save("Оплата внесена");
    closeDrawer();
  };
  return (
    <>
      <DHead eyebrow={`Заказ №${r0.id}`} title="Внести оплату" />
      <form className={formCol} onSubmit={submit}>
        <Field label="Как оплатили"><select name="method" defaultValue={PAY_METHODS[0]}><Options list={PAY_METHODS} /></select></Field>
        <Field label="Сколько, ₽" hint={left ? `Остаток по договору: ${money(left)}` : undefined}>
          <input name="sum" type="number" min="1" step="1" inputMode="numeric" required defaultValue={left || ""} autoFocus />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex flex-wrap gap-2"><Button variant="primary" size="big" type="submit">Оплатить</Button></div>
      </form>
    </>
  );
}

export function openPayment(id: number) {
  if (!db.find("requests", id)) return;
  openDrawer(() => <PaymentForm id={id} />);
}
