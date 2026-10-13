"use client";
// «Задачи»: задания менеджерам со сроком. Ставит задачи только руководитель; менеджер видит свои и отмечает выполнение с комментарием; вернуть задачу в работу может только руководитель.
import { useState } from "react";
import { dateTime, toLocalInput, localDay, formValue } from "@/lib/core";
import { db } from "@/lib/db";
import { isDirector } from "@/lib/auth";
import { pushComment } from "@/lib/comments";
import { ACTIVE_STATUSES } from "@/lib/config";
import type { Staff, Task } from "@/lib/types";
import {
  ArmedButton, Button, Chips, CommentForm, CommentsList, DHead, DSec, Empty, Field, FormError, Kv, LinkButton, Options, btnRow, cx, formCol,
} from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { openRequest } from "./requests";
import type { View } from "./types";

let who = "all"; // руководитель: all или id менеджера (помним между переходами по разделам)

const managers = () => db.list("staff").filter((s) => s.active && s.role === "manager");
const staffName = (id: unknown) => (id === 0 ? "Автоматизация" : db.find("staff", id)?.name || "—");
const isLate = (t: Task) => !t.done_at && Date.parse(t.due) < Date.now();

function groups(list: Task[]) {
  const today = localDay(new Date()), tomorrow = localDay(new Date(Date.now() + 864e5));
  const open = list.filter((t) => !t.done_at).sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
  const out = new Map<string, Task[]>();
  const add = (title: string, t: Task) => {
    const items = out.get(title);
    if (items) items.push(t); else out.set(title, [t]);
  };
  for (const t of open) {
    const d = localDay(new Date(t.due));
    if (isLate(t)) add("Просрочено", t);
    else if (d === today) add("Сегодня", t);
    else if (d === tomorrow) add("Завтра", t);
    else add(new Date(t.due).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase()), t);
  }
  const done = list.filter((t) => t.done_at).sort((a, b) => Date.parse(b.done_at!) - Date.parse(a.done_at!)).slice(0, 20);
  if (done.length) out.set("Выполнено", done);
  return [...out];
}

/** Выполнение и возврат в работу — только с комментарием; возвращает задачу в работу один руководитель */
function toggle(id: number, user: Staff) {
  const t = db.find("tasks", id);
  if (!t) return;
  if (!isDirector(user) && (t.assignee_id !== user.id || t.done_at)) return;
  openDrawer(() => <ConfirmForm id={id} user={user} />);
}

function ConfirmForm({ id, user }: { id: number; user: Staff }) {
  const [error, setError] = useState("");
  const t = db.find("tasks", id);
  if (!t) return <Empty title="Задача удалена" />;
  const restore = Boolean(t.done_at);
  const save = (fd: FormData) => {
    const text = formValue(fd, "comment");
    if (!text) return setError(restore ? "Напишите, почему задача возвращается в работу" : "Напишите, что именно сделано");
    pushComment(t, `${restore ? "Возвращена в работу" : "Выполнено"}: ${text}`, user);
    db.patch("tasks", id, { done_at: restore ? null : new Date().toISOString(), comments: t.comments });
    toast(restore ? "Задача снова в работе" : "Задача выполнена");
    openTask(id, user);
  };
  return (
    <>
      <DHead eyebrow={restore ? "Вернуть в работу" : "Подтверждение"} title={t.title} />
      <form className={formCol} onSubmit={(e) => { e.preventDefault(); save(new FormData(e.currentTarget)); }}>
        <Field label={restore ? "Почему возвращаете" : "Что сделано"} hint="Комментарий обязателен, он останется в переписке задачи.">
          <textarea name="comment" rows={4} maxLength={1000} autoFocus required />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}>
          <Button variant="primary" type="submit">{restore ? "Вернуть в работу" : "Подтвердить выполнение"}</Button>
          <Button onClick={() => openTask(id, user)}>Назад</Button>
        </div>
      </form>
    </>
  );
}

function TaskRow({ t, user }: { t: Task; user: Staff }) {
  const done = Boolean(t.done_at);
  return (
    <div className={cx("flex items-start gap-3 px-5 py-4 bg-surface border rounded-card shadow-card", isLate(t) ? "border-bad/60" : "border-black/[.04]")}>
      <button type="button" onClick={() => openTask(t.id, user)}
        className="flex-1 min-w-0 flex flex-col bg-transparent border-0 p-0 text-left cursor-pointer">
        <b className={cx(done && "line-through text-muted")}>{t.title}</b>
        <small className="text-muted text-[13px]">
          {done ? `Выполнено ${dateTime(t.done_at)}` : `Срок: ${dateTime(t.due)}`}{isDirector(user) ? ` · ${staffName(t.assignee_id)}` : ""}{t.request_id ? ` · заказ №${t.request_id}` : ""}
        </small>
      </button>
    </div>
  );
}

function Tasks({ user }: { user: Staff }) {
  const [filter, setFilter] = useState(who);
  const director = isDirector(user);
  const list = db.list("tasks").filter((t) => director ? filter === "all" || t.assignee_id === Number(filter) : t.assignee_id === user.id);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="m-0 text-ink-2 max-w-[70ch] flex-[1_1_320px]">
          {director ? "Задания менеджерам со сроком. Менеджер видит свои задачи и отмечает выполнение с комментарием; вернуть задачу в работу может только руководитель." : "Задания от руководителя. Когда сделаете, отметьте задачу и напишите комментарий."}
        </p>
        {director ? <Button variant="primary" onClick={() => openForm(null, user)}>Поставить задачу</Button> : null}
      </div>
      {director ? (
        <Chips active={filter} onChange={(id) => { who = id; setFilter(id); }}
          items={[["all", "Все менеджеры"], ...managers().map((m) => [m.id, m.name, db.list("tasks").filter((t) => t.assignee_id === m.id && !t.done_at).length] as const)]} />
      ) : null}
      {list.length ? groups(list).map(([title, items]) => (
        <section key={title} className="flex flex-col gap-1.5">
          <h3 className={cx("text-[11px] font-medium tracking-[.05em] uppercase flex gap-2 items-center", title === "Просрочено" ? "text-bad" : "text-muted")}>
            {title}<i className="not-italic text-ink-2">{items.length}</i>
          </h3>
          {items.map((t) => <TaskRow key={t.id} t={t} user={user} />)}
        </section>
      )) : <Empty title="Задач нет">{director ? "Поставьте задачу менеджеру — он увидит её у себя." : "Когда руководитель поставит задачу, она появится здесь."}</Empty>}
    </>
  );
}

function TaskDetail({ id, user }: { id: number; user: Staff }) {
  const t = db.find("tasks", id);
  if (!t) return <Empty title="Задача удалена" />;
  const requestId = t.request_id;
  return (
    <>
      <DHead eyebrow={t.done_at ? "Выполнена" : isLate(t) ? "Просрочена" : "В работе"} title={t.title} />
      <DSec>
        <Kv items={[
          ["Кому", staffName(t.assignee_id)],
          ["Срок", dateTime(t.due)],
          ["Поставил", `${staffName(t.created_by)}, ${dateTime(t.created_at)}`],
          t.done_at ? ["Выполнена", dateTime(t.done_at)] : null,
          requestId ? ["Заказ", <LinkButton key="r" onClick={() => openRequest(requestId)}>№{requestId} · {db.find("requests", requestId)?.client || ""}</LinkButton>] : null,
        ]} />
        {t.note ? <p className="m-0 whitespace-pre-wrap">{t.note}</p> : null}
      </DSec>
      <DSec title="Комментарии">
        <CommentsList list={t.comments} />
        <CommentForm onSend={(text) => {
          if (!pushComment(t, text, user)) return false;
          db.patch("tasks", id, { comments: t.comments });
          toast("Комментарий добавлен");
        }} />
      </DSec>
      <DSec className={btnRow}>
        {!t.done_at || isDirector(user) ? <Button variant="primary" onClick={() => toggle(id, user)}>{t.done_at ? "Вернуть в работу" : "Выполнено"}</Button> : null}
        {isDirector(user) ? <>
          <Button onClick={() => openForm(db.find("tasks", id), user)}>Изменить</Button>
          <ArmedButton variant="danger" question="Точно удалить?" onConfirm={() => { db.remove("tasks", id); closeDrawer(); toast("Задача удалена"); }}>Удалить</ArmedButton>
        </> : null}
      </DSec>
    </>
  );
}

function openTask(id: number, user: Staff) {
  openDrawer(() => <TaskDetail id={id} user={user} />);
}

function TaskForm({ id, user, defaultAssignee }: { id: number | null; user: Staff; defaultAssignee: string }) {
  const [error, setError] = useState("");
  const t = id != null ? db.find("tasks", id) : null;
  // Срок по умолчанию: сегодня в 18:00, а если уже 17 часов или позже — завтра в 18:00
  const [due] = useState(() => t?.due || new Date(new Date().setHours(18, 0, 0, 0) + (new Date().getHours() >= 17 ? 864e5 : 0)).toISOString());
  const reqs = [...db.list("requests")].sort((a, b) => b.id - a.id)
    .map((r) => ({ id: r.id, title: `№${r.id} · ${r.client}${ACTIVE_STATUSES.includes(r.status) ? "" : " (закрыт)"}` }));
  const save = (fd: FormData) => {
    const values = {
      title: formValue(fd, "title"), assignee_id: Number(fd.get("assignee")) || null, due: formValue(fd, "due"),
      request_id: Number(fd.get("request_no")) || Number(fd.get("request")) || null, note: formValue(fd, "note"),
    };
    if (!values.title) return setError("Напишите, что сделать");
    if (!values.assignee_id) return setError("Выберите менеджера");
    if (!values.due) return setError("Укажите срок");
    if (values.request_id && !db.find("requests", values.request_id)) return setError(`Заказа №${values.request_id} нет`);
    setError("");
    const row = { ...values, assignee_id: values.assignee_id, due: new Date(values.due).toISOString() };
    if (t) { db.patch("tasks", t.id, row); toast("Задача изменена"); openTask(t.id, user); }
    else { db.insert("tasks", { ...row, created_by: user.id, done_at: null }); toast(`Задача поставлена: ${staffName(row.assignee_id)}`); closeDrawer(); }
  };
  return (
    <>
      <DHead title={t ? "Изменить задачу" : "Задача менеджеру"} />
      <form className={formCol} onSubmit={(e) => { e.preventDefault(); save(new FormData(e.currentTarget)); }}>
        <Field label="Что сделать"><input name="title" required maxLength={200} defaultValue={t?.title || ""} placeholder="Перезвонить клиенту по заказу №1040" autoFocus /></Field>
        <Field label="Менеджер">
          <select name="assignee" required defaultValue={String(t?.assignee_id ?? defaultAssignee)}>
            <Options list={managers().map((m) => ({ id: m.id, title: m.name }))} empty="Выберите менеджера" />
          </select>
        </Field>
        <Field label="Срок"><input name="due" type="datetime-local" required defaultValue={toLocalInput(due)} /></Field>
        <Field label="По заказу" hint="Любой заказ из списка">
          <select name="request" defaultValue={t?.request_id ? String(t.request_id) : ""}><Options list={reqs} empty="Без заказа" /></select>
        </Field>
        <Field label="Или впишите номер заказа вручную" hint="Если впишете номер, он важнее списка">
          <input name="request_no" type="number" min={1} step={1} inputMode="numeric" placeholder="Например, 1040" />
        </Field>
        <Field label="Подробности"><textarea name="note" rows={3} maxLength={1000} defaultValue={t?.note || ""} /></Field>
        <FormError>{error}</FormError>
        <div className={btnRow}><Button variant="primary" type="submit">{t ? "Сохранить" : "Поставить задачу"}</Button></div>
      </form>
    </>
  );
}

function openForm(t: Task | null, user: Staff) {
  const id = t?.id ?? null;
  const defaultAssignee = who !== "all" ? who : "";
  openDrawer(() => <TaskForm id={id} user={user} defaultAssignee={defaultAssignee} />);
}

const view: View = { title: (user) => (isDirector(user) ? "Задачи менеджерам" : "Мои задачи"), Component: Tasks };
export default view;
