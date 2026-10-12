"use client";
// Форма заявки для сайта компании: клиент оставляет контакты, заявка появляется в CRM.
import { useRef, useState } from "react";
import { SERVICES, OBJECTS } from "@/lib/config";
import { formValue } from "@/lib/core";
import { db } from "@/lib/db";
import { ensureClient } from "@/lib/clients";
import { Button, Field, FormError, Note, Options, card, cx, formCol } from "@/components/ui";
import { Mark } from "@/components/mark";

/** crmHref — ссылка обратно в CRM: со страницы /zayavka/ это «../», внутри демо-страницы — «#requests» */
export default function RequestForm({ crmHref = "../#requests" }: { crmHref?: string }) {
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const value = (k: string) => formValue(fd, k);
    if (value("phone").replace(/\D/g, "").length < 10) { setError("Проверьте номер телефона: в нём должно быть не меньше 10 цифр"); return; }
    const client = ensureClient({ name: value("client"), phone: value("phone") });
    const created = db.insert("requests", {
      client_id: client.id, comments: [], client: value("client"), phone: value("phone"), address: value("address"), service: value("service"), object: value("object"), note: value("note"),
      source: "Сайт", status: "new", manager_id: null, master_id: null, visit_at: null, amount: 0, items: [], comment: "",
      history: [{ at: new Date().toISOString(), by: "", text: "Заказ с сайта" }],
    });
    setError("");
    form.reset();
    setSent(`Заявка №${created.id} принята. Менеджер перезвонит вам в рабочее время.`);
  };

  return (
    <>
      <div role="note" className="flex flex-wrap gap-x-3.5 gap-y-1.5 items-center justify-center px-4 py-1.5 bg-surface text-muted border-b border-line text-[13px]">
        <span><b>Демо-версия.</b> Заявка попадёт в CRM в этом же браузере.</span>
      </div>
      <main className="min-h-[calc(100vh-34px)] grid place-items-center px-4 py-8">
        <div className={cx(card, "w-full max-w-[420px] rounded-[20px] p-7 flex flex-col gap-4")}>
          <div className="size-[84px] -mt-1 mx-auto p-3 rounded-3xl bg-brand-soft"><Mark className="size-full block" /></div>
          <h1 className="font-display font-bold text-[22px] leading-tight text-center">Заявка на вентиляцию</h1>
          <p className="-mt-2 m-0 text-center text-muted">Оставьте телефон — менеджер перезвонит, уточнит задачу и согласует выезд мастера.</p>
          <form className={formCol} hidden={sent != null} onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
            <Field label="Как к вам обращаться"><input ref={nameRef} name="client" required maxLength={120} autoComplete="name" /></Field>
            <Field label="Телефон"><input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+7 928 000-00-00" /></Field>
            <Field label="Адрес объекта"><input name="address" required maxLength={200} autoComplete="street-address" placeholder="Город, улица, дом" /></Field>
            <Field label="Что нужно"><select name="service"><Options list={SERVICES} /></select></Field>
            <Field label="Объект"><select name="object"><Options list={OBJECTS} /></select></Field>
            <Field label="Комментарий"><textarea name="note" rows={3} maxLength={1000} placeholder="Площадь помещения, что не устраивает сейчас" /></Field>
            <FormError>{error}</FormError>
            <Button variant="primary" type="submit" block>Отправить заявку</Button>
          </form>
          {sent != null ? (
            <div className="flex flex-col gap-3.5">
              <Note tone="ok"><b>{sent}</b></Note>
              <Button block onClick={() => { setSent(null); requestAnimationFrame(() => nameRef.current?.focus()); }}>Оставить ещё одну заявку</Button>
            </div>
          ) : null}
          <p className="m-0 text-center text-[13px]"><a href={crmHref}>Открыть CRM для сотрудников →</a></p>
        </div>
      </main>
    </>
  );
}
