"use client";
// «Автоматизации» (руководитель): правила, которые сами ставят задачи при событиях в заказах. Правила можно менять, отключать и создавать новые.
import { useState, type FormEvent } from "react";
import { formValue, pluralize } from "@/lib/core";
import { STATUSES } from "@/lib/config";
import { db } from "@/lib/db";
import { ASSIGNEES, DEFAULT_RULES, normalizeRule } from "@/lib/automations";
import type { AutoRule } from "@/lib/types";
import { ArmedButton, Button, DHead, Field, FormError, Options, btnRow } from "@/components/ui";
import { closeDrawer, openDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import type { View } from "./types";

const TRIGGERS = [{ id: "new", title: "Поступила новая заявка" }, ...STATUSES.map((s) => ({ id: s.id, title: `Статус заказа стал «${s.title}»` }))];
const triggerTitle = (id: string) => TRIGGERS.find((t) => t.id === id)?.title || id;
const assigneeTitle = (id: string) => ASSIGNEES.find((a) => a.id === id)?.title || id;

const settings = () => db.list("settings")[0];
const saveRules = (rules: AutoRule[]) => { db.patch("settings", settings().id, { rules }); };

function RuleForm({ rule }: { rule: AutoRule | null }) {
  const [error, setError] = useState("");
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = {
      name: formValue(fd, "name"), trigger: formValue(fd, "trigger") as AutoRule["trigger"], assignee: formValue(fd, "assignee") as AutoRule["assignee"],
      title: formValue(fd, "title"), note: formValue(fd, "note"), after_min: Math.max(0, Math.round((Number(formValue(fd, "after")) || 0) * (formValue(fd, "unit") === "h" ? 60 : 1))),
    };
    if (!values.name || !values.title) return setError("Впишите название правила и текст задачи");
    const list = (settings()?.rules ?? DEFAULT_RULES).map(normalizeRule);
    saveRules(rule ? list.map((x) => (x.id === rule.id ? { ...x, ...values } : x)) : [...list, { id: `r-${Date.now().toString(36)}`, on: true, ...values }]);
    toast(rule ? "Правило сохранено" : "Правило создано");
    closeDrawer();
  };
  return (
    <>
      <DHead title={rule ? "Изменить правило" : "Новое правило"} />
      <form className="flex flex-col gap-3.5" onSubmit={save}>
        <Field label="Название правила"><input name="name" required maxLength={80} defaultValue={rule?.name || ""} autoFocus placeholder="Например, «Замеры сделаны»" /></Field>
        <Field label="Когда"><select name="trigger" defaultValue={rule?.trigger || "new"}><Options list={TRIGGERS} /></select></Field>
        <Field label="Кому поставить задачу"><select name="assignee" defaultValue={rule?.assignee || "manager"}><Options list={ASSIGNEES} /></select></Field>
        <Field label="Текст задачи" hint="Можно вставлять: {n} — номер заказа, {client} — клиент, {phone} — телефон, {address} — адрес.">
          <input name="title" required maxLength={160} defaultValue={rule?.title || ""} placeholder="Позвонить клиенту — заказ {n}" />
        </Field>
        <Field label="Пояснение к задаче"><textarea name="note" rows={2} maxLength={400} defaultValue={rule?.note || ""} placeholder="Клиент: {client}, {phone}." /></Field>
        <Field label="Срок выполнения" hint="Через сколько после события задача должна быть выполнена. Можно в минутах, например 15.">
          <span className="grid grid-cols-[1fr_130px] gap-2">
            <input name="after" type="number" min={0} max={43200} defaultValue={dur(rule?.after_min ?? 1440).n} />
            <select name="unit" defaultValue={dur(rule?.after_min ?? 1440).unit}><option value="m">минут</option><option value="h">часов</option></select>
          </span>
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}><Button variant="primary" type="submit">{rule ? "Сохранить" : "Создать"}</Button></div>
      </form>
    </>
  );
}

/** Минуты в удобные единицы: 120 → 2 часа, 45 → 45 минут */
const dur = (min: number) => (min >= 60 && min % 60 === 0 ? { n: min / 60, unit: "h" } : { n: min, unit: "m" });
const hours = (min: number) => {
  if (min === 0) return "сразу";
  const { n, unit } = dur(min);
  return `через ${n} ${unit === "h" ? pluralize(n, "час", "часа", "часов") : pluralize(n, "минуту", "минуты", "минут")}`;
};

function Automations() {
  const rules = (settings()?.rules ?? DEFAULT_RULES).map(normalizeRule);
  const made = db.list("tasks").filter((t) => t.created_by === 0).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="m-0 text-ink-2 max-w-[70ch] flex-[1_1_320px]">Правила сами ставят задачи, когда в заказе что-то происходит. Сотрудник видит такую задачу в «Задачах» и счётчик в меню. Пока прежняя задача по заказу не выполнена, такая же не создаётся повторно.</p>
        <Button variant="primary" onClick={() => openDrawer(() => <RuleForm rule={null} />)}>Новое правило</Button>
      </div>
      <div className="flex flex-col gap-2.5">
        {rules.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 rounded-card border border-black/[.04] shadow-card bg-surface">
            <label className="flex items-center gap-4 flex-[1_1_360px] min-w-0 cursor-pointer">
              <input type="checkbox" checked={r.on} onChange={(e) => saveRules(rules.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} className="size-5 flex-none" aria-label={`Правило «${r.name}» включено`} />
              <span className={r.on ? "flex flex-col gap-0.5 min-w-0" : "flex flex-col gap-0.5 min-w-0 opacity-55"}>
                <b>{r.name}</b>
                <span className="text-sm text-ink-2">Когда: {triggerTitle(r.trigger)}. {assigneeTitle(r.assignee)}: «{r.title}», {hours(r.after_min)}.</span>
              </span>
            </label>
            <div className={btnRow}>
              <Button size="sm" onClick={() => openDrawer(() => <RuleForm rule={r} />)}>Изменить</Button>
              <ArmedButton size="sm" question="Удалить?" onConfirm={() => { saveRules(rules.filter((x) => x.id !== r.id)); toast("Правило удалено"); }}>Удалить</ArmedButton>
            </div>
          </div>
        ))}
        {!rules.length ? <p className="m-0 text-muted">Правил нет. Создайте первое кнопкой «Новое правило».</p> : null}
      </div>
      <p className="m-0 text-sm text-muted">Автоматически создано {made} {pluralize(made, "задача", "задачи", "задач")}.</p>
    </>
  );
}

const view: View = { title: () => "Автоматизации", Component: Automations };
export default view;
