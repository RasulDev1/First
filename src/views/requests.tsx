"use client";
// ЗАГЛУШКА: раздел переносится.
import type { View } from "./types";

export function openRequest(id: number) { void id; }
export function openNewOrder(client: { name: string; phone: string }) { void client; }
const view: View = { title: () => "Заказы", Component: () => <p>Раздел переносится.</p> };
export default view;
