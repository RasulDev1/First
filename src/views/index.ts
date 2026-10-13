// Все разделы CRM. Какие разделы видит роль — в ROLES (lib/config.ts).
import type { View } from "./types";
import home from "./home";
import requests from "./requests";
import clients from "./clients";
import calc from "./calc";
import masters from "./masters";
import tasks from "./tasks";
import warehouse from "./warehouse";
import analytics from "./analytics";
import staff from "./staff";
import automations from "./automations";
import myorders from "./myorders";
import mystats from "./mystats";

export const VIEWS: Record<string, View> = { home, requests, clients, calc, masters, tasks, warehouse, analytics, automations, staff, myorders, mystats };
