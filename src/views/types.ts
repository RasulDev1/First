import type { ReactNode } from "react";
import type { Staff } from "@/lib/types";

/** Раздел CRM: заголовок страницы и компонент. Компонент перерисовывается при любом изменении базы. */
export interface View {
  title: (user: Staff) => string;
  Component: (props: { user: Staff }) => ReactNode;
}
