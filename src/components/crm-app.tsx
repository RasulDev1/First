"use client";
// CRM: вход сотрудника, меню по роли и разделы. Раздел хранится в адресе после #.
import { useEffect, useState } from "react";
import { COMPANY, ROLES } from "@/lib/config";
import { db, useDb } from "@/lib/db";
import { login, logout, currentUser, can, positionTitle, isWarehouse } from "@/lib/auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/seed";
import { isLow } from "@/lib/stock";
import type { Staff } from "@/lib/types";
import { VIEWS } from "@/views";
import { ArmedButton, Button, FormError, Field, cx, card } from "./ui";
import { DrawerHost, closeDrawer } from "./drawer";
import { ToastHost, toast } from "./toast";
import { Mark } from "./mark";
import { go } from "./nav";
import RequestForm from "@/app/zayavka/request-form";

// В демо-сборке (одна страница) форма заявки открывается по #zayavka, в обычной — отдельной страницей /zayavka/
const FORM_HREF = process.env.NEXT_PUBLIC_DEMO ? "#zayavka" : "zayavka/";

const NAV: [string, string, string][] = [
  ["home", "Главная", "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["requests", "Заказы", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["clients", "Клиенты", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6"],
  ["calc", "Калькулятор", "M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"],
  ["masters", "Мастера", "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  ["tasks", "Задачи", "M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M12 20h8"],
  ["warehouse", "Склад", "M3 21V8l9-5 9 5v13M7 21v-8h10v8M7 17h10"],
  ["analytics", "Аналитика", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ["mystats", "Моя статистика", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ["myorders", "Мои заказы", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["staff", "Сотрудники", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6"],
];

function badge(id: string, user: Staff) {
  if (id === "requests") return isWarehouse(user) ? 0 : db.list("requests").filter((r) => r.status === "new").length;
  if (id === "tasks") {
    const now = Date.now();
    return db.list("tasks").filter((t) => !t.done_at && (user.role === "director" || t.assignee_id === user.id) && Date.parse(t.due) <= now).length;
  }
  if (id === "warehouse") return db.list("products").filter(isLow).length;
  return 0;
}

const sectionOf = (user: Staff) => {
  const id = window.location.hash.slice(1);
  return VIEWS[id] && can(user, id) ? id : ROLES[user.role].sections[0];
};

export default function CrmApp() {
  useDb();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [section, setSection] = useState("home");
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => {
    const check = () => setFormOpen(window.location.hash === "#zayavka");
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  useEffect(() => {
    const u = currentUser();
    setUserId(u?.id ?? null);
    if (u) setSection(sectionOf(u));
    setReady(true);
  }, []);

  // Пользователя перечитываем при каждом изменении базы: если его отключили — выходим
  const user = ready && userId != null ? currentUser() : null;
  useEffect(() => {
    if (ready && userId != null && !user) { setUserId(null); closeDrawer(); toast("Ваш аккаунт отключён"); }
  }, [ready, userId, user]);

  useEffect(() => {
    if (!user) return;
    const onHash = () => { closeDrawer(); setSection(sectionOf(user)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [user]);

  const view = user ? VIEWS[can(user, section) ? section : ROLES[user.role].sections[0]] : null;
  useEffect(() => {
    document.title = user && view ? `${view.title(user)} · ${COMPANY} CRM` : `Вход · ${COMPANY} CRM`;
  });

  if (!ready) return null;
  if (formOpen) return <RequestForm crmHref="#requests" />;

  const signIn = (u: Staff) => {
    setUserId(u.id);
    toast(`Вы вошли: ${u.name}`);
    window.history.replaceState(null, "", "#home");
    setSection(sectionOf(u));
  };

  return (
    <>
      <DemoBar onReset={() => {
        db.reset();
        toast("Демо-данные восстановлены");
        const u = currentUser();
        setUserId(u?.id ?? null);
        if (u) go("home");
      }} />
      {user && view ? (
        <div className="grid min-h-[calc(100vh-34px)] grid-cols-1 min-[901px]:grid-cols-[252px_minmax(0,1fr)]">
          <Sidebar user={user} section={section} onLogout={() => {
            logout();
            setUserId(null);
            closeDrawer();
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }} />
          <div className="min-w-0 px-4 pt-4.5 pb-10 min-[901px]:px-[clamp(16px,3vw,36px)] min-[901px]:pt-6 min-[901px]:pb-12 flex flex-col gap-4.5">
            <header><h1 className="font-display font-bold text-[clamp(20px,2.4vw,26px)] leading-tight tracking-tight">{view.title(user)}</h1></header>
            <div className="flex flex-col gap-4 min-w-0"><view.Component user={user} /></div>
          </div>
        </div>
      ) : (
        <Login onLogin={signIn} />
      )}
      <DrawerHost />
      <ToastHost />
    </>
  );
}

function DemoBar({ onReset }: { onReset: () => void }) {
  const [persistent, setPersistent] = useState(true);
  useEffect(() => setPersistent(db.persistent), []);
  return (
    <div role="note" className="flex flex-wrap gap-x-3.5 gap-y-1.5 items-center justify-center px-4 py-1.5 bg-surface text-muted border-b border-line text-[13px]">
      <span><b>Демо-версия.</b> Данные хранятся только в этом браузере.</span>
      {!persistent ? <span>Браузер не даёт сохранять данные: после перезагрузки всё вернётся к началу.</span> : null}
      <ArmedButton question="Сбросить все данные?" onConfirm={onReset}
        className="!min-h-0 !px-3 !py-0.5 !text-xs !bg-transparent !border-current text-ink-2 data-[armed]:!bg-bad data-[armed]:!border-bad data-[armed]:!text-white">Сбросить демо</ArmedButton>
    </div>
  );
}

function Sidebar({ user, section, onLogout }: { user: Staff; section: string; onLogout: () => void }) {
  return (
    <aside className="sticky top-0 z-30 flex flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-surface border-b border-line
      min-[901px]:h-[calc(100vh-34px)] min-[901px]:flex-col min-[901px]:flex-nowrap min-[901px]:items-stretch min-[901px]:gap-5 min-[901px]:px-3.5 min-[901px]:py-5 min-[901px]:border-b-0 min-[901px]:border-r">
      <a href="#home" aria-label={`${COMPANY} — главная`} className="flex items-center gap-2.5 no-underline text-heading px-1.5">
        <Mark className="size-[34px] min-[901px]:size-[42px] flex-none" />
        <span className="font-display font-bold text-base leading-[1.05] tracking-wide flex flex-col">
          CRM<b className="text-sm bg-linear-135 from-brand-light via-brand to-brand-deep bg-clip-text text-transparent">Вентиляция</b>
        </span>
      </a>
      <nav aria-label="Разделы" className="order-3 w-full flex flex-row gap-0.5 overflow-x-auto -mx-1 [scrollbar-width:none] min-[901px]:order-none min-[901px]:mx-0 min-[901px]:flex-col">
        {NAV.filter(([id]) => can(user, id)).map(([id, label, path]) => {
          const n = badge(id, user), current = id === section;
          return (
            <a key={id} href={`#${id}`} aria-current={current ? "page" : undefined}
              className={cx("flex-none flex items-center gap-1.5 px-2.5 py-[7px] text-sm min-[901px]:gap-3 min-[901px]:px-3 min-[901px]:py-2.5 min-[901px]:text-[15px] no-underline font-bold transition-colors duration-150",
                current ? "bg-brand/14 text-brand" : "text-muted hover:bg-brand/9 hover:text-brand-deep active:bg-brand/18")}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[17px] min-[901px]:size-5 flex-none fill-none stroke-current stroke-[1.8] [stroke-linecap:round] [stroke-linejoin:round]"><path d={path} /></svg>
              <span>{label}</span>
              {n ? <i className={cx("ml-auto min-w-[22px] px-[7px] py-px rounded-full not-italic text-xs font-bold leading-normal text-center",
                id === "requests" && !isWarehouse(user) ? "bg-brand text-white" : "bg-warn-soft text-warn")}>{n}</i> : null}
            </a>
          );
        })}
      </nav>
      <div className="ml-auto flex flex-row items-center gap-2.5 min-[901px]:mt-auto min-[901px]:ml-0 min-[901px]:flex-col min-[901px]:items-stretch min-[901px]:p-3 min-[901px]:bg-surface min-[901px]:border min-[901px]:border-line min-[901px]:rounded-card">
        <div className="hidden min-[561px]:flex flex-col min-w-0">
          <span className="font-extrabold text-heading wrap-anywhere text-[13px] min-[901px]:text-[15px]">{user.name}</span>
          <span className="self-start mt-0.5 px-2.5 py-px rounded-full bg-brand-soft text-brand-deep text-xs font-bold">{positionTitle(user)}</span>
        </div>
        <ArmedButton size="sm" question="Точно выйти?" onConfirm={onLogout}>Выйти</ArmedButton>
      </div>
    </aside>
  );
}

function Login({ onLogin }: { onLogin: (u: Staff) => void }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const submit = (loginName: string, password: string) => {
    try {
      const u = login(loginName, password);
      setError("");
      setPass("");
      onLogin(u);
    } catch (e) {
      setError((e as Error).message);
      setPass("");
    }
  };
  return (
    <main className="min-h-[calc(100vh-34px)] grid place-items-center px-4 py-8">
      <div className={cx(card, "w-full max-w-[420px] rounded-[20px] p-7 flex flex-col gap-4")}>
        <div className="size-[84px] -mt-1 mx-auto p-3 rounded-3xl bg-brand-soft"><Mark className="size-full block" /></div>
        <h1 className="font-display font-bold text-[22px] leading-tight text-center">Вход в CRM</h1>
        <p className="-mt-2 m-0 text-center text-muted">Логин и пароль выдаёт руководитель.</p>
        <form className="flex flex-col gap-3.5" autoComplete="on" onSubmit={(e) => { e.preventDefault(); submit(name, pass); }}>
          <Field label="Логин"><input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus
            value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Пароль"><input name="password" type="password" autoComplete="current-password" required
            value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
          <FormError>{error}</FormError>
          <Button variant="primary" type="submit" block>Войти</Button>
        </form>
        <div className="border-t border-dashed border-line pt-3.5 flex flex-col gap-2">
          <p className="m-0 text-xs font-bold tracking-wider uppercase text-muted">Войти в демо как</p>
          <div className="grid grid-cols-1 min-[561px]:grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => {
              const s = db.list("staff").find((x) => x.login === a.login);
              return s ? (
                <button key={a.login} type="button" onClick={() => { setName(a.login); submit(a.login, DEMO_PASSWORD); }}
                  className="flex flex-col items-start px-2.5 py-2 border border-line bg-surface-2 cursor-pointer text-left hover:border-brand">
                  <b className="text-[13px]">{positionTitle(s)}</b><span className="text-xs text-muted">{a.login}</span>
                </button>
              ) : null;
            })}
          </div>
          <p className="m-0 text-muted text-[13px]">Пароль у всех демо-аккаунтов: <b className="tabular-nums">{DEMO_PASSWORD}</b></p>
        </div>
        <p className="m-0 text-center text-[13px]"><a href={FORM_HREF}>Форма заявки для сайта →</a></p>
      </div>
    </main>
  );
}
