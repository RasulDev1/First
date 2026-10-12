"use client";
// «Мастера»: мастера и стажёры. Менеджер выбирает их в заказе; здесь — контакты, загрузка и ближайшие выезды.
// Добавляет мастеров, задаёт их ставку и логин с паролем только руководитель; мастер входит и видит свои заказы.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { money, dateTime, copyText, pluralize, formValue } from "@/lib/core";
import { db, hashPassword, newSalt } from "@/lib/db";
import { isDirector } from "@/lib/auth";
import { rateOf } from "@/lib/pay";
import { levelTitle } from "@/lib/orders";
import { pushComment } from "@/lib/comments";
import { MASTER_LEVELS } from "@/lib/config";
import type { Master, Staff } from "@/lib/types";
import {
  ArmedButton, Button, CommentForm, CommentsList, DHead, DSec, Empty, Field, FormError, Kpi, Kpis, LinkButton, Note, Options, StatusPill,
  btnRow, cx, formCol,
} from "@/components/ui";
import { openDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { openRequest } from "./requests";
import type { View } from "./types";

const ACTIVE = ["assigned", "measure", "pricing", "in_work"];

function statsOf(m: Master) {
  const list = db.list("requests").filter((r) => r.master_id === m.id);
  const active = list.filter((r) => ACTIVE.includes(r.status));
  const done = list.filter((r) => r.status === "done");
  return {
    active, done, revenue: done.reduce((n, r) => n + (r.amount || 0), 0),
    next: active.filter((r) => r.visit_at && Date.parse(r.visit_at) >= Date.now() - 864e5).sort((a, b) => Date.parse(a.visit_at!) - Date.parse(b.visit_at!)),
  };
}

const accountOf = (m: Master) => db.list("staff").find((s) => s.master_id === m.id);

/** Кнопка-ссылка «Скопировать …»: после копирования полторы секунды пишет «Скопировано» */
function CopyLink({ text, children }: { text: () => string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <LinkButton onClick={async () => {
      if (!(await copyText(text()))) { toast("Выделите и скопируйте текст вручную"); return; }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }}>{copied ? "Скопировано" : children}</LinkButton>
  );
}

/** Строка короткого списка: слева главное, справа — время или статус */
function MiniRow({ main, sub, side, onClick }: { main: ReactNode; sub?: ReactNode; side?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex justify-between gap-3 px-1 py-[9px] border-0 border-b border-line last:border-b-0 bg-transparent text-left cursor-pointer hover:bg-surface-2">
      <span className="flex flex-col min-w-0"><b>{main}</b>{sub ? <small className="text-[12.5px] text-muted truncate">{sub}</small> : null}</span>
      <span className="flex flex-col items-end text-right flex-none gap-0.5 text-[12.5px]">{side}</span>
    </button>
  );
}
const Muted = ({ children }: { children: ReactNode }) => <p className="m-0 text-muted">{children}</p>;
const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("");

function MasterCard({ m, user }: { m: Master; user: Staff }) {
  const s = statsOf(m);
  return (
    <button type="button" onClick={() => openMaster(m.id, user)}
      className={cx("grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5 text-left cursor-pointer px-4 py-3.5 bg-surface border border-line shadow-card hover:border-brand", !m.active && "opacity-60")}>
      <span aria-hidden="true" className="size-11 rounded-full grid place-items-center bg-linear-135 from-brand-light via-brand via-55% to-brand-deep text-white font-extrabold">{initials(m.name)}</span>
      <span className="flex flex-col min-w-0">
        <b>{m.name}</b>
        <small className="text-muted text-[13px]">{levelTitle(m)}{m.active ? "" : " · не работает"}</small>
        <small className="text-muted text-[13px] tabular-nums">{m.phone}</small>
      </span>
      <span className="col-span-full grid grid-cols-2 gap-2">
        {([[s.active.length, "в работе"], [s.done.length, "выполнено"]] as const).map(([n, label]) => (
          <span key={label} className="flex flex-col px-2.5 py-1.5 rounded-lg bg-surface-2">
            <b className="text-lg tabular-nums">{n}</b><small className="text-xs text-muted">{label}</small>
          </span>
        ))}
      </span>
      {s.next[0]
        ? <span className="col-span-full text-[13px] font-semibold">Ближайший выезд: {dateTime(s.next[0].visit_at)} · №{s.next[0].id}</span>
        : <span className="col-span-full text-[13px] font-semibold text-muted">Свободен</span>}
    </button>
  );
}

function Masters({ user }: { user: Staff }) {
  const list = [...db.list("masters")].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <p className="m-0 text-ink-2 max-w-[70ch] flex-[1_1_320px]">Менеджер назначает мастера в заказе. Мастер входит в CRM и видит только свои заказы.</p>
        {isDirector(user) ? <Button variant="primary" onClick={() => openForm(null, user)}>Добавить мастера или стажёра</Button> : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
        {list.length ? list.map((m) => <MasterCard key={m.id} m={m} user={user} />)
          : <Empty title="Мастеров пока нет">Добавьте первого мастера, чтобы назначать его на заказы.</Empty>}
      </div>
    </>
  );
}

function MasterDetail({ id, user }: { id: number; user: Staff }) {
  const m = db.find("masters", id);
  if (!m) return <Empty title="Мастер удалён" />;
  const s = statsOf(m);
  const acc = accountOf(m);
  const director = isDirector(user);
  const busy = s.active.length;
  const toggle = () => {
    db.patch("masters", id, { active: !m.active });
    if (acc) db.patch("staff", acc.id, { active: m.active });
    toast(m.active ? "Мастер снова доступен" : "Мастер отключён");
  };
  return (
    <>
      <DHead eyebrow={levelTitle(m)} title={m.name}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="tabular-nums">{m.phone}</span>
          <CopyLink text={() => db.find("masters", id)?.phone || ""}>Скопировать телефон</CopyLink>
        </div>
        {director ? (
          <p className="m-0 text-muted text-[13px]">
            {acc ? <>Логин: <b>{acc.login}</b></> : "Аккаунта нет — мастер не может войти"} · зарплата {rateOf(m)}% от суммы заказа
          </p>
        ) : null}
      </DHead>
      <DSec>
        <Kpis small>
          <Kpi small label="В работе" value={s.active.length} />
          <Kpi small label="Выполнено" value={s.done.length} />
          <Kpi small label="Выручка по его заказам" value={money(s.revenue)} />
        </Kpis>
      </DSec>
      <DSec title="Выезды">
        {s.active.length ? (
          <div className="flex flex-col">
            {[...s.active].sort((a, b) => Date.parse(a.visit_at || "1970-01-01") - Date.parse(b.visit_at || "1970-01-01")).map((r) => (
              <MiniRow key={r.id} main={`№${r.id} · ${r.client}`} sub={r.address} onClick={() => openRequest(r.id)}
                side={<><StatusPill id={r.status} /><small className="text-[12.5px] text-muted">{dateTime(r.visit_at)}</small></>} />
            ))}
          </div>
        ) : <Muted>Активных заказов нет.</Muted>}
      </DSec>
      <DSec title={`Выполненные заказы (${s.done.length})`}>
        {s.done.length ? (
          <div className="flex flex-col">
            {[...s.done].sort((a, b) => Date.parse(b.done_at || "1970-01-01") - Date.parse(a.done_at || "1970-01-01")).map((r) => (
              <MiniRow key={r.id} main={`№${r.id} · ${r.client}`} sub={r.address} onClick={() => openRequest(r.id)}
                side={<><b className="text-[15px] tabular-nums">{money(r.amount || 0)}</b><small className="text-[12.5px] text-muted">{r.done_at ? dateTime(r.done_at) : ""}</small></>} />
            ))}
          </div>
        ) : <Muted>Выполненных заказов пока нет.</Muted>}
      </DSec>
      <DSec title="Комментарии о мастере">
        <CommentsList list={m.comments} />
        <CommentForm onSend={(text) => {
          if (!pushComment(m, text, user)) return false;
          db.patch("masters", id, { comments: m.comments });
          toast("Комментарий добавлен");
        }} />
      </DSec>
      {director ? (
        <DSec className={btnRow}>
          <Button onClick={() => openForm(db.find("masters", id), user)}>Изменить</Button>
          {m.active && busy
            ? <ArmedButton variant="danger" question={`У мастера ${busy} ${pluralize(busy, "заказ", "заказа", "заказов")} в работе. Всё равно?`} onConfirm={toggle}>Больше не работает</ArmedButton>
            : <Button variant={m.active ? "danger" : "secondary"} onClick={toggle}>{m.active ? "Больше не работает" : "Снова работает"}</Button>}
        </DSec>
      ) : null}
      {!m.active ? <p className="m-0 text-muted text-[13px]">Неработающего мастера нельзя выбрать в новом заказе; история его заказов сохраняется.</p> : null}
    </>
  );
}

function openMaster(id: number, user: Staff) {
  openDrawer(() => <MasterDetail id={id} user={user} />);
}

function MasterForm({ id, user }: { id: number | null; user: Staff }) {
  const [error, setError] = useState("");
  const m = id != null ? db.find("masters", id) : null;
  const acc = m ? accountOf(m) : undefined;
  const save = (fd: FormData) => {
    const values = { name: formValue(fd, "name"), phone: formValue(fd, "phone"), level: formValue(fd, "level"), rate: Math.min(100, Math.max(0, Number(fd.get("rate")) || 0)) };
    if (!values.name || !values.phone) return setError("Впишите ФИО и телефон");
    const login = formValue(fd, "login").toLowerCase(), password = String(fd.get("password") || "");
    const wantsAccount = !acc && Boolean(login || password);
    if (wantsAccount || (acc && password)) {
      if (password.length < 8) return setError("Пароль — не короче 8 символов");
      if (!acc) {
        if (!/^[a-z0-9._-]{3,32}$/.test(login)) return setError("Логин: 3–32 символа — латинские буквы, цифры, точка, дефис или _");
        if (db.list("staff").some((x) => x.login === login)) return setError("Такой логин уже занят");
      }
    }
    setError("");
    const saved = m ? (db.patch("masters", m.id, values), m) : db.insert("masters", { ...values, active: true });
    const position = values.level === "trainee" ? "trainee" : "master";
    if (acc) {
      const changes: Partial<Staff> = { name: values.name, position };
      if (password) { changes.salt = newSalt(); changes.password_hash = hashPassword(password, changes.salt); }
      db.patch("staff", acc.id, changes);
    } else if (wantsAccount) {
      const salt = newSalt();
      db.insert("staff", { login, name: values.name, position, role: "master", master_id: saved.id, salt, password_hash: hashPassword(password, salt), active: true });
    }
    toast(m ? "Сохранено" : "Мастер добавлен");
    openMaster(saved.id, user);
  };
  return (
    <>
      <DHead title={m ? "Изменить" : "Новый мастер или стажёр"} />
      <form className={formCol} onSubmit={(e) => { e.preventDefault(); save(new FormData(e.currentTarget)); }}>
        <Field label="ФИО"><input name="name" required maxLength={80} defaultValue={m?.name || ""} autoFocus /></Field>
        <Field label="Телефон"><input name="phone" required type="tel" maxLength={30} defaultValue={m?.phone || ""} placeholder="+7 928 000-00-00" /></Field>
        <Field label="Кто"><select name="level" defaultValue={m?.level || "master"}><Options list={MASTER_LEVELS} /></select></Field>
        <Field label="Зарплата, % от суммы заказа" hint="Мастер увидит, сколько заработает с каждого заказа">
          <input name="rate" type="number" min={0} max={100} step={0.5} inputMode="decimal" required defaultValue={m ? rateOf(m) : 20} />
        </Field>
        {acc ? <Note>Логин: <b>{acc.login}</b></Note> : (
          <Field label="Логин для входа" hint="Латинские буквы, цифры, точка, дефис или _">
            <input name="login" required={!m} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="например, petrov" />
          </Field>
        )}
        <Field label={acc ? "Новый пароль" : "Пароль"} hint="Не короче 8 символов. Передайте его мастеру лично.">
          <input name="password" type="text" autoComplete="new-password" autoCapitalize="none" spellCheck={false}
            placeholder={acc ? "Оставьте пустым, чтобы не менять" : undefined} required={!acc && !m} />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}><Button variant="primary" type="submit">{m ? "Сохранить" : "Добавить"}</Button></div>
      </form>
    </>
  );
}

function openForm(m: Master | null, user: Staff) {
  if (!isDirector(user)) return;
  const id = m?.id ?? null;
  openDrawer(() => <MasterForm id={id} user={user} />);
}

const view: View = { title: () => "Мастера и стажёры", Component: Masters };
export default view;
