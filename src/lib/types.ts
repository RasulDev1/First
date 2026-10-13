// Таблицы «базы» CRM. Данные лежат в браузере (localStorage), структура повторяет supabase-crm.sql.

export type Role = "director" | "manager" | "warehouse" | "master";
export type StatusId = "new" | "assigned" | "measure" | "pricing" | "in_work" | "done" | "cancelled";

export interface Comment { at: string; by: string; text: string }
export interface HistoryItem { at: string; by: string; text: string }

export interface Staff {
  id: number; created_at: string; login: string; name: string; position: string; role: Role;
  master_id?: number; salt: string; password_hash: string; active: boolean;
}

export interface Master {
  id: number; created_at: string; name: string; phone: string; level: string; rate?: number;
  active: boolean; comments?: Comment[]; note?: string;
}

export interface Room { name: string; area: number; height: number; ac?: boolean }
export interface Route { name: string; diameter: number; length: number; bends: number }
export interface Survey {
  rooms: Room[]; routes: Route[]; photos: string[]; note: string;
  at?: string; by?: string; saved?: boolean;
}

export interface EstimateLine {
  id: string; kind: "mat" | "work"; product_id?: number; work?: string;
  name: string; unit: string; qty: number; cost: number; price: number;
}
export interface Estimate { lines: EstimateLine[]; at: string; by: string }

export interface Payment { sum: number; method: string; note?: string; at: string | null; by?: string }
export interface Expense { product_id: number; qty: number; loc: string | null; cost: number; note?: string; at: string; by: string }

export interface Request {
  id: number; created_at: string; client_id?: number | null; client: string; phone: string; address: string;
  object: string; service: string; source: string; note: string; status: StatusId;
  manager_id: number | null; master_id: number | null; visit_at: string | null; measured_at?: string | null;
  amount: number; items: unknown[]; comment: string; comments: Comment[]; history: HistoryItem[];
  expenses?: Expense[]; payments?: Payment[]; survey?: Survey; estimate?: Estimate;
  done_at?: string | null; declined_by?: string | null; [key: string]: unknown;
}

export interface Product {
  id: number; created_at: string; category: string; sku: string; name: string; specs: string;
  unit: string; cost: number; price: number; min_qty: number;
}

export interface StockRow { id: number; product_id: number; loc: string; qty: number }

export type MoveKind = "in" | "move" | "out" | "fix" | "issue";
export interface Move {
  id: number; at: string; by: string; kind: MoveKind; product_id: number;
  from?: string; to?: string; qty: number; cost?: number; note?: string; delta?: number; request_id?: number;
}

export interface Task {
  id: number; created_at: string; title: string; note: string; assignee_id: number; created_by: number;
  due: string; done_at: string | null; request_id: number | null; comments?: Comment[];
}

export interface Client { id: number; created_at: string; name: string; phone: string; note: string }
/** Правило автоматизации: когда случилось событие в заказе — кому и какую задачу поставить */
export interface AutoRule {
  id: string; name: string; on: boolean; trigger: "new" | StatusId; assignee: "manager" | "master" | "director";
  title: string; note: string; after_h: number;
}
export interface Settings { id: number; min_margin: number; rules?: AutoRule[] }

/** Сообщение внутреннего чата: to_id пустой — общий чат, иначе личное сообщение */
export interface Attachment { name: string; type: string; size: number; data: string }
export interface Message { id: number; created_at: string; from_id: number; to_id: number | null; text: string; files?: Attachment[] }

/** Запись журнала изменений: кто, когда и что поменял */
export interface AuditEntry { id: number; at: string; user: string; table?: TableName; action: "create" | "update" | "delete" | "system"; text: string }

export interface Tables {
  staff: Staff[]; masters: Master[]; requests: Request[]; products: Product[]; stock: StockRow[];
  moves: Move[]; tasks: Task[]; clients: Client[]; settings: Settings[]; messages: Message[];
}
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T][number];
export interface Data extends Tables { version?: number; audit?: AuditEntry[]; seq: Partial<Record<TableName, number>> }
