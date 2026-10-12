"use client";
// Номер заказа: нажатие открывает карточку, правая кнопка мыши у руководителя показывает «Отменить заказ» и «Удалить заказ».
import { useEffect, useState, type ReactNode } from "react";
import { db } from "@/lib/db";
import { isDirector } from "@/lib/auth";
import { log, setStatus } from "@/lib/orders";
import type { Staff } from "@/lib/types";
import { Button, DHead, Field, FormError, btnRow, formCol } from "@/components/ui";
import { openDrawer, closeDrawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { formValue } from "@/lib/core";
import { orderNo } from "./shared";

type Kind = "cancel" | "delete";

function ReasonForm({ id, kind, user }: { id: number; kind: Kind; user: Staff }) {
  const [error, setError] = useState("");
  const r = db.find("requests", id);
  if (!r) return null;
  const cancel = kind === "cancel";
  const submit = (fd: FormData) => {
    const reason = formValue(fd, "reason");
    if (!reason) return setError("Напишите причину");
    if (cancel) {
      setStatus(r, "cancelled", user.name);
      log(r, `Причина отмены: ${reason}`, user.name);
      db.save();
      closeDrawer();
      toast("Заказ отменён");
    } else {
      db.remove("requests", id);
      closeDrawer();
      toast(`Заказ №${id} удалён. Причина: ${reason}`);
    }
  };
  return (
    <>
      <DHead eyebrow={`Заказ №${id}`} title={cancel ? "Отменить заказ" : "Удалить заказ"} />
      <form className={formCol} onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }}>
        <Field label={cancel ? "Причина отмены" : "Причина удаления"} hint={cancel ? "Причина запишется в историю заказа." : "Удалённый заказ вернуть нельзя."}>
          <textarea name="reason" rows={3} maxLength={500} required autoFocus />
        </Field>
        <FormError>{error}</FormError>
        <div className={btnRow}>
          <Button variant="danger" type="submit">{cancel ? "Подтвердить отмену" : "Подтвердить удаление"}</Button>
          <Button onClick={closeDrawer}>Назад</Button>
        </div>
      </form>
    </>
  );
}

export function OrderNo({ id, user, onOpen, label, children }: { id: number; user: Staff; onOpen: () => void; label?: string; children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const director = isDirector(user);
  const status = db.find("requests", id)?.status;
  useEffect(() => {
    if (!at) return;
    const off = () => setAt(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") off(); };
    window.addEventListener("click", off);
    window.addEventListener("scroll", off, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("click", off); window.removeEventListener("scroll", off, true); window.removeEventListener("keydown", key); };
  }, [at]);
  const act = (kind: Kind) => { setAt(null); openDrawer(() => <ReasonForm id={id} kind={kind} user={user} />); };
  return (
    <>
      <button type="button" className={orderNo} aria-label={label}
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        onContextMenu={director ? (e) => { e.preventDefault(); e.stopPropagation(); setAt({ x: e.clientX, y: e.clientY }); } : undefined}>{children}</button>
      {at ? (
        <div role="menu" style={{ left: at.x + 8, top: at.y }} onClick={(e) => e.stopPropagation()}
          className="fixed z-60 flex gap-2 p-2 bg-surface border border-line rounded-card shadow-[0_8px_24px_rgba(20,50,52,.18)] cursor-default">
          {status !== "done" && status !== "cancelled" ? <Button size="sm" variant="danger" onClick={() => act("cancel")}>Отменить заказ</Button> : null}
          <Button size="sm" variant="danger" onClick={() => act("delete")}>Удалить заказ</Button>
        </div>
      ) : null}
    </>
  );
}
