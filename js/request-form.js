// Форма заявки для сайта компании: клиент оставляет контакты, заявка появляется в CRM.
import { $ } from "./core.js";
import { SERVICES, OBJECTS } from "./config.js";
import { db } from "./db.js";
import { ensureClient } from "./clients.js";

$("rfService").innerHTML = SERVICES.map((s) => `<option>${s}</option>`).join("");
$("rfObject").innerHTML = OBJECTS.map((s) => `<option>${s}</option>`).join("");

$("requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const value = (k) => String(fd.get(k) || "").trim();
  if (value("phone").replace(/\D/g, "").length < 10) { $("rfError").textContent = "Проверьте номер телефона: в нём должно быть не меньше 10 цифр"; return; }
  const client = ensureClient({ name: value("client"), phone: value("phone") });
  const created = db.insert("requests", {
    client_id: client.id, car_id: null, comments: [], client: value("client"), phone: value("phone"), address: value("address"), service: value("service"), object: value("object"), note: value("note"),
    source: "Сайт", status: "new", manager_id: null, master_id: null, visit_at: null, amount: 0, items: [], comment: "",
    history: [{ at: new Date().toISOString(), by: "", text: "Заказ с сайта" }],
  });
  $("rfError").textContent = "";
  e.currentTarget.reset();
  e.currentTarget.hidden = true;
  $("sentText").textContent = `Заявка №${created.id} принята. Менеджер перезвонит вам в рабочее время.`;
  $("sent").hidden = false;
});
$("again").addEventListener("click", () => { $("sent").hidden = true; $("requestForm").hidden = false; $("rfName").focus(); });
