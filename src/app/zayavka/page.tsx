// Форма заявки для сайта компании: открывается по адресу zayavka/, заявка попадает в CRM в этом же браузере.
import type { Metadata } from "next";
import RequestForm from "./request-form";

export const metadata: Metadata = {
  title: "Заявка на вентиляцию",
  icons: { icon: "../img/mark.svg" },
};

export default function Page() {
  return <RequestForm />;
}
