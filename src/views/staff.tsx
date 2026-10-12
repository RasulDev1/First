"use client";
// «Сотрудники» (только руководитель): аккаунты, должности и роли. Пароль хранится только в виде хеша — его можно задать заново.
import { useEffect, useRef, useState } from "react";
import { dateShort, copyText, formValue } from "@/lib/core";
import { POSITIONS, ROLES } from "@/lib/config";
import { db, hashPassword, newSalt } from "@/lib/db";
import { positionTitle } from "@/lib/auth";
import type { Role, Staff } from "@/lib/types";
import { ArmedButton, Button, DHead, Field, FormError, Options, Pill, Table, btnRow, cx, formCol, rowClickable } from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import type { View } from "./types";

const ACCESS: Record<Role, string> = {
  director: "Все разделы. Назначает роли и ставит задачи.",
  manager: "Заказы, клиенты, задачи, своя статистика и зарплата.",
  master: "Только свои заказы и заработок.",
  warehouse: "Склад и выдача материалов под заказ. Заказы только смотрит.",
};
const loginLink = () => window.location.href.split(/[?#]/)[0];
const activeDirectors = () => db.list("staff").filter((s) => s.active && s.role === "director");
const positionIndex = (s: Staff) => POSITIONS.findIndex((p) => p.id === s.position);

/** Кнопка «Скопировать …»: после копирования полторы секунды пишет «Скопировано» */
function CopyButton({ text, children }: { text: () => string; children: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button size="sm" onClick={async () => {
      if (!(await copyText(text()))) { toast("Выделите и скопируйте текст вручную"); return; }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }}>{copied ? "Скопировано" : children}</Button>
  );
}

function StaffView({ user }: { user: Staff }) {
  const list = db.list("staff").filter((s) => s.role !== "master")
    .sort((a, b) => Number(b.active) - Number(a.active) || positionIndex(a) - positionIndex(b));
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="m-0 text-ink-2 max-w-[70ch] flex-[1_1_320px]">Сотрудник входит по ссылке своим логином и паролем и видит только разделы своей роли.</p>
        <Button variant="primary" onClick={() => openForm(null, user)}>Добавить сотрудника</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-3.5 py-2.5 rounded-card bg-brand-soft text-brand-deep font-bold">
        <span className="tabular-nums wrap-anywhere min-w-0 flex-[1_1_240px]">{loginLink()}</span>
        <CopyButton text={loginLink}>Скопировать ссылку для входа</CopyButton>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {(Object.entries(ROLES) as [Role, (typeof ROLES)[Role]][]).map(([id, r]) => (
          <div key={id} className="px-3.5 py-3 rounded-card border border-line bg-surface flex flex-col gap-1">
            <b>{id === "warehouse" ? "Закупщик и складовщик" : id === "master" ? "Мастер и стажёр" : r.title}</b>
            <p className="m-0 text-sm text-ink-2">{ACCESS[id]}</p>
          </div>
        ))}
      </div>
      <Table>
        <thead><tr><th>Сотрудник</th><th>Должность</th><th>Логин</th><th>С нами с</th><th></th></tr></thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id} tabIndex={0} className={cx(rowClickable, !s.active && "[&_td]:text-muted")}
              onClick={() => openForm(s, user)} onKeyDown={(e) => { if (e.key === "Enter") openForm(s, user); }}>
              <td><b>{s.name}{s.id === user.id ? " (вы)" : ""}</b></td>
              <td>{positionTitle(s)}</td>
              <td className="tabular-nums">{s.login}</td>
              <td className="tabular-nums">{dateShort(s.created_at)}</td>
              <td className="text-right">{s.active ? null : <Pill className="text-st-cancelled bg-st-cancelled-soft">Отключён</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

function StaffForm({ id, user }: { id: number | null; user: Staff }) {
  const [error, setError] = useState("");
  const s = id != null ? db.find("staff", id) : null;
  const self = s != null && s.id === user.id;
  const save = (fd: FormData) => {
    const name = formValue(fd, "name"), password = String(fd.get("password") || "");
    const position = s && self ? s.position : formValue(fd, "position");
    const role = POSITIONS.find((p) => p.id === position)?.role;
    if (!role) return;
    if (!name) return setError("Впишите ФИО");
    if ((!s || password) && password.length < 8) return setError("Пароль — не короче 8 символов");
    if (s?.role === "director" && role !== "director" && activeDirectors().length < 2) return setError("Это единственный руководитель — сначала назначьте другого");
    if (s) {
      const changes: Partial<Staff> = { name, position, role };
      if (password) { changes.salt = newSalt(); changes.password_hash = hashPassword(password, changes.salt); }
      setError("");
      db.patch("staff", s.id, changes);
      toast(password ? "Сохранено, пароль изменён" : "Сохранено");
    } else {
      const login = formValue(fd, "login").toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(login)) return setError("Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или _");
      if (db.list("staff").some((x) => x.login === login)) return setError("Такой логин уже занят");
      setError("");
      const salt = newSalt();
      db.insert("staff", { login, name, position, role, salt, password_hash: hashPassword(password, salt), active: true });
      toast(`${name} может входить: логин ${login}`);
    }
    closeDrawer();
  };
  const toggle = () => {
    if (!s) return;
    db.patch("staff", s.id, { active: !s.active });
    toast(s.active ? "Доступ возвращён" : "Доступ отключён — сотрудник больше не войдёт");
    closeDrawer();
  };
  const onlyDirector = Boolean(s?.active && s.role === "director" && activeDirectors().length < 2);
  return (
    <>
      <DHead eyebrow={s ? `Логин ${s.login}` : "Новый аккаунт"} title={s ? s.name : "Новый сотрудник"} />
      <form className={formCol} onSubmit={(e) => { e.preventDefault(); save(new FormData(e.currentTarget)); }}>
        <Field label="ФИО"><input name="name" required maxLength={80} defaultValue={s?.name || ""} placeholder="Фамилия Имя Отчество" autoFocus /></Field>
        <Field label="Должность" hint={self ? "Свою роль руководитель поменять не может — так CRM не останется без руководителя." : "От должности зависит, какие разделы видит сотрудник."}>
          <select name="position" disabled={self} defaultValue={s?.position || "manager"}><Options list={POSITIONS.filter((p) => p.role !== "master")} /></select>
        </Field>
        {s ? null : (
          <Field label="Логин" hint="Латинские буквы, цифры, точка, дефис или _">
            <input name="login" required maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="например, petrov" />
          </Field>
        )}
        <Field label={s ? "Новый пароль" : "Пароль"} hint="Не короче 8 символов. Передайте его сотруднику лично.">
          <input name="password" type="text" autoComplete="new-password" autoCapitalize="none" spellCheck={false}
            placeholder={s ? "Оставьте пустым, чтобы не менять" : undefined} required={!s} />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}>
          <Button variant="primary" type="submit">{s ? "Сохранить" : "Добавить"}</Button>
          {s && !self ? (
            !s.active ? <Button onClick={toggle}>Вернуть доступ</Button>
              : onlyDirector ? <Button variant="danger" onClick={() => toast("Нельзя отключить единственного руководителя", "bad")}>Отключить доступ</Button>
                : <ArmedButton variant="danger" question="Точно отключить?" onConfirm={toggle}>Отключить доступ</ArmedButton>
          ) : null}
        </div>
      </form>
    </>
  );
}

function openForm(s: Staff | null, user: Staff) {
  const id = s?.id ?? null;
  openDrawer(() => <StaffForm id={id} user={user} />);
}

const view: View = { title: () => "Сотрудники и роли", Component: StaffView };
export default view;
