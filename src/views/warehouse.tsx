"use client";
// ЗАГЛУШКА: раздел переносится.
import type { View } from "./types";

export function openExpense(o: { requestId?: number } = {}) { void o; }
const view: View = { title: () => "Склад", Component: () => <p>Раздел переносится.</p> };
export default view;
