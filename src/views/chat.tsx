"use client";
// «Чат» — внутренняя переписка сотрудников: общий чат и личные сообщения. Доступен всем ролям, в том числе мастерам с телефона.
import { useEffect, useRef, useState } from "react";
import { storage } from "@/lib/core";
import { db } from "@/lib/db";
import { positionTitle } from "@/lib/auth";
import type { Message, Staff } from "@/lib/types";
import { cx } from "@/components/ui";
import type { View } from "./types";

const READ_KEY = "chat_read";
const ALL = "all";
type Seen = Record<string, string>; // чат → время последнего прочитанного сообщения

const seenOf = (user: Staff) => storage.get<Record<string, Seen>>(READ_KEY, {})[user.id] || {};
const convOf = (m: Message, me: number) => (m.to_id == null ? ALL : m.from_id === me ? String(m.to_id) : String(m.from_id));
const inConv = (m: Message, me: number, conv: string) =>
  conv === ALL ? m.to_id == null : (m.from_id === me && String(m.to_id) === conv) || (m.to_id === me && String(m.from_id) === conv);

/** Сколько непрочитанных сообщений от других: по всем чатам или по одному */
export function unreadCount(user: Staff, conv?: string) {
  const seen = seenOf(user);
  return db.list("messages").filter((m) => {
    if (m.from_id === user.id) return false;
    if (m.to_id != null && m.to_id !== user.id) return false;
    const c = convOf(m, user.id);
    return (conv == null || c === conv) && m.created_at > (seen[c] || "");
  }).length;
}

function markRead(user: Staff, conv: string) {
  const last = db.list("messages").filter((m) => inConv(m, user.id, conv)).reduce((t, m) => (m.created_at > t ? m.created_at : t), "");
  const all = storage.get<Record<string, Seen>>(READ_KEY, {});
  const mine = all[user.id] || {};
  if (!last || mine[conv] === last) return;
  storage.set(READ_KEY, { ...all, [user.id]: { ...mine, [conv]: last } });
  db.touch();
}

const clockOf = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayOf = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Сегодня";
  if (same(d, new Date(today.getTime() - 864e5))) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
};
const initials = (name: string) => name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

function Avatar({ name, group }: { name: string; group?: boolean }) {
  return (
    <span className={cx("grid place-items-center flex-none size-9 rounded-full text-xs font-semibold", group ? "bg-brand text-white" : "bg-brand-soft text-brand-deep")}>
      {group ? "#" : initials(name)}
    </span>
  );
}

function Chat({ user }: { user: Staff }) {
  const people = db.list("staff").filter((s) => s.active && s.id !== user.id);
  const [conv, setConv] = useState<string | null>(null); // на телефоне сначала список чатов
  const [wide, setWide] = useState(true);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 800px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const current = conv ?? (wide ? ALL : null);
  const list = current ? db.list("messages").filter((m) => inConv(m, user.id, current)).sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];
  const unreadHere = current ? unreadCount(user, current) : 0;
  useEffect(() => { if (current && unreadHere) markRead(user, current); });
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length, current]);

  const send = () => {
    const body = text.trim();
    if (!body || !current) return;
    db.insert("messages", { from_id: user.id, to_id: current === ALL ? null : Number(current), text: body.slice(0, 2000) });
    setText("");
  };
  const nameOf = (id: number) => db.find("staff", id)?.name || "Сотрудник";
  const last = (c: string) => db.list("messages").filter((m) => inConv(m, user.id, c)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const convs: { id: string; title: string; sub: string; group?: boolean }[] = [
    { id: ALL, title: "Общий чат", sub: "Все сотрудники", group: true },
    ...people.map((p) => ({ id: String(p.id), title: p.name, sub: positionTitle(p) })),
  ];
  const currentInfo = convs.find((c) => c.id === current);

  const Sidebar = (
    <div className={cx("flex flex-col gap-1 min-w-0", wide ? "w-[280px] flex-none" : "w-full")}>
      {convs.map((c) => {
        const n = unreadCount(user, c.id), m = last(c.id), on = c.id === current;
        return (
          <button key={c.id} type="button" onClick={() => setConv(c.id)}
            className={cx("flex items-center gap-3 px-3 py-2.5 rounded-lg border-0 text-left cursor-pointer w-full", on && wide ? "bg-brand-soft" : "bg-transparent hover:bg-surface-2")}>
            <Avatar name={c.title} group={c.group} />
            <span className="flex flex-col min-w-0 flex-1">
              <b className="truncate text-[14px]">{c.title}</b>
              <span className="truncate text-xs text-muted">{m ? `${m.from_id === user.id ? "Вы: " : c.group ? `${nameOf(m.from_id).split(" ")[0]}: ` : ""}${m.text}` : c.sub}</span>
            </span>
            {n ? <i className="not-italic min-w-[22px] px-[7px] py-px rounded-full bg-brand text-white text-xs font-medium text-center">{n}</i> : null}
          </button>
        );
      })}
    </div>
  );

  const Dialog = (
    <div className="flex flex-col min-w-0 flex-1 rounded-card bg-surface shadow-card border border-black/[.04] h-[calc(100vh-190px)] min-h-[360px]">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        {!wide ? <button type="button" onClick={() => setConv(null)} className="border-0 bg-transparent text-brand text-[15px] cursor-pointer px-1" aria-label="К списку чатов">←</button> : null}
        {currentInfo ? <Avatar name={currentInfo.title} group={currentInfo.group} /> : null}
        <span className="flex flex-col min-w-0"><b className="truncate">{currentInfo?.title}</b><span className="text-xs text-muted truncate">{currentInfo?.sub}</span></span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1.5">
        {list.length ? list.map((m, i) => {
          const mine = m.from_id === user.id, prev = list[i - 1];
          const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
          const showName = !mine && current === ALL && (!prev || prev.from_id !== m.from_id || newDay);
          return (
            <div key={m.id} className="flex flex-col">
              {newDay ? <span className="self-center my-2 px-2.5 py-0.5 rounded-full bg-surface-2 text-xs text-muted">{dayOf(m.created_at)}</span> : null}
              {showName ? <span className="text-xs text-muted mb-0.5 ml-1">{nameOf(m.from_id)}</span> : null}
              <div className={cx("max-w-[82%] px-3 py-2 rounded-2xl whitespace-pre-wrap wrap-anywhere text-[14px] leading-snug",
                mine ? "self-end bg-brand text-white rounded-br-md" : "self-start bg-surface-2 rounded-bl-md")}>
                {m.text}
                <span className={cx("block text-[11px] mt-0.5 text-right tabular-nums", mine ? "text-white/70" : "text-muted")}>{clockOf(m.created_at)}</span>
              </div>
            </div>
          );
        }) : <p className="m-auto text-muted text-sm">Сообщений пока нет. Напишите первым.</p>}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2 p-3 border-t border-line" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" maxLength={2000} aria-label="Сообщение"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className="flex-1 resize-none max-h-32 min-h-[42px]" />
        <button type="submit" disabled={!text.trim()} className="px-4 min-h-[42px] rounded-lg border-0 bg-brand text-white font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default">Отправить</button>
      </form>
    </div>
  );

  return wide ? <div className="flex gap-4 items-start">{Sidebar}{Dialog}</div> : current ? Dialog : Sidebar;
}

const view: View = { title: () => "Чат", Component: Chat };
export default view;
