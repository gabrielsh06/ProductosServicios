/* Pruebas funcionales de la capa vista (E05) con un navegador simulado (jsdom) contra el backend real.
   Preparación:   cd frontend/tests && npm i jsdom
   Backend:       cd backend && DATABASE_URL=sqlite:///e2e.db uvicorn app.adapters.entrada.api_contrato:app --port 3000
   Ejecución:     BASE=http://localhost:3000 node pruebas_vista.mjs
   Cada prueba imprime su código FV-xx y el resultado; el proceso termina con código 1 si alguna falla. */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3000";
const FRONT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];

async function cond(fn, ms = 4000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { if (await fn()) return true; } catch { /* reintentar */ } await esperar(50); }
  return false;
}
function registrar(codigo, descripcion, ok, detalle = "") {
  resultados.push({ codigo, descripcion, ok, detalle });
  console.log(`${ok ? "APROBADO " : "RECHAZADO"} ${codigo}  ${descripcion}${ok ? "" : "  -> " + detalle}`);
}

async function api(token, metodo, ruta, cuerpo) {
  const r = await fetch(BASE + "/api" + ruta, { method: metodo, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null) };
}

async function abrir(pagina, { token, tema } = {}) {
  const [archivo, hash] = pagina.split("#");
  const html = fs.readFileSync(path.join(FRONT, archivo), "utf8");
  const descargas = [];
  const dom = new JSDOM(html, {
    url: `${BASE}/${archivo}${hash ? "#" + hash : ""}`, runScripts: "dangerously", resources: "usable", pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, BASE), o);
      w.URL.createObjectURL = () => "blob:prueba"; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { if (this.download) descargas.push(this.download); };
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); this.dispatchEvent(new w.Event("show")); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
      w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
      if (token) w.sessionStorage.setItem("sistep.auth.session", JSON.stringify({ token, expiresAt: new Date(Date.now() + 36e5).toISOString(), user: { nombre: "Ana Castro", usuario: "acastro", rol: "operador" } }));
      if (tema) w.localStorage.setItem("sistep.tema", tema);
    },
  });
  dom.descargas = descargas;
  await new Promise((r) => dom.window.addEventListener("load", r));
  return dom;
}

const login = await api(null, "POST", "/auth/login", { usuario: "acastro", password: "Sistep2026!" });
const token = login.json.token;

/* ---------- Dashboard ---------- */
{
  const dom = await abrir("index.html", { token }); const d = dom.window.document;
  const filas = await cond(() => d.querySelectorAll("#alertsBody tr[data-id], #alertsBody tr").length > 3 && d.querySelector("#alertsBody .row-action"));
  registrar("FV-01", "Abrir el Dashboard: título, navegación y alertas visibles",
    filas && d.querySelector("h1.page-title")?.textContent.includes("Panel de Seguridad") && d.querySelectorAll("#sidebar .nav-link").length >= 5, "no se renderizó la tabla");

  // FV-09 / UX-05: Offline = texto + estado, no solo color
  await cond(() => d.querySelectorAll("#fleetList .fleet-item").length === 3);
  const item207 = d.querySelector('#fleetList [data-bus="BUS-207"]');
  registrar("FV-09a", "Unidad desconectada muestra el texto «Offline» (no solo color)", !!item207 && item207.textContent.includes("Offline") && item207.classList.contains("fleet-item--offline"), item207?.textContent);
  d.querySelector('[data-fleet-toggle="BUS-302"]').click();
  const cayo = await cond(() => d.querySelector('#fleetList [data-bus="BUS-302"]')?.textContent.includes("Offline"));
  const toastCaida = await cond(() => d.querySelector("#toastRegion")?.textContent.includes("BUS-302 perdió conexión"));
  registrar("FV-09b", "Simular caída de red: BUS-302 pasa a «Offline» y se avisa con toast", cayo && toastCaida, d.querySelector("#fleetSummary")?.textContent);
  d.querySelector('[data-fleet-toggle="BUS-302"]').click();
  await cond(() => !d.querySelector('#fleetList [data-bus="BUS-302"]')?.textContent.includes("Offline"));

  // FV-02 / UX-04: pánico con confirmación
  const antes = (await api(token, "GET", "/alertas")).json.length;
  d.getElementById("panicButton").click();
  const abierto = d.getElementById("panicDialog").hasAttribute("open");
  const focoSeguro = d.activeElement?.id === "panicCancel";
  const sinEnvio = (await api(token, "GET", "/alertas")).json.length === antes;
  d.getElementById("panicCancel").click();
  registrar("FV-02a", "Pánico presionado por error: pide confirmación, foco en «Cancelar» y no envía nada",
    abierto && focoSeguro && sinEnvio && !d.getElementById("panicDialog").hasAttribute("open"), `abierto=${abierto} foco=${d.activeElement?.id}`);
  d.getElementById("panicButton").click();
  d.getElementById("panicBus").value = "BUS-118";
  d.getElementById("panicForm").dispatchEvent(new dom.window.Event("submit", { cancelable: true, bubbles: true }));
  const creada = await cond(async () => (await api(token, "GET", "/alertas")).json.length === antes + 1);
  const toastPanico = await cond(() => d.querySelector("#toastRegion")?.textContent.includes("sin sonido"));
  registrar("FV-02b", "Confirmar pánico: se registra la alerta manual con GPS y toast «sin sonido»", creada && toastPanico);

  // FV-05: teclado — todo control interactivo del dashboard es alcanzable (sin tabindex negativo ni div clicables)
  const inter = [...d.querySelectorAll("main button, main a[href], main input, main select")];
  const malos = inter.filter((e) => e.tabIndex < 0 && !e.hidden && !e.closest("[hidden]"));
  const divs = [...d.querySelectorAll("main [onclick]")];
  registrar("FV-05", "Teclado: controles del dashboard enfocables (sin tabindex<0 ni onclick en div)", inter.length > 8 && malos.length === 0 && divs.length === 0, malos.map((e) => e.id || e.className).join(","));

  // Etiquetas (UI-05): todos los input/select de main tienen label o aria-label
  const sinEtiqueta = [...d.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((e) => !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby")));
  registrar("UI-05", "Todos los campos tienen etiqueta accesible (label / aria-label)", sinEtiqueta.length === 0, sinEtiqueta.map((e) => e.id || e.name).join(","));

  // FV-10: modo oscuro
  const sw = d.getElementById("themeToggle");
  const claroAntes = d.documentElement.getAttribute("data-theme") === "light";
  sw.click();
  const oscuro = d.documentElement.getAttribute("data-theme") === "dark" && sw.getAttribute("aria-checked") === "true" && dom.window.localStorage.getItem("sistep.tema") === "dark";
  sw.click();
  registrar("FV-10", "Modo oscuro: el alternador cambia data-theme, aria-checked y persiste la preferencia", claroAntes && oscuro && d.documentElement.getAttribute("data-theme") === "light");
  dom.window.close();
}

/* ---------- Tema guardado se aplica al cargar (sin parpadeo) ---------- */
{
  const dom = await abrir("index.html", { token, tema: "dark" });
  registrar("FV-10b", "Preferencia de tema guardada se aplica al abrir la página", dom.window.document.documentElement.getAttribute("data-theme") === "dark");
  dom.window.close();
}

/* ---------- Alertas: confirmación PNP y exportar evidencia ---------- */
{
  const dom = await abrir("index.html#alertas", { token }); const d = dom.window.document;
  await cond(() => d.querySelectorAll("#alertInbox [data-alert-id]").length >= 3);
  const id = d.querySelector("#alertInbox [data-alert-id]").dataset.alertId;

  d.getElementById("exportEvidenceButton").click();
  const bajo = await cond(() => dom.descargas.some((n) => n === `evidencia-${d.getElementById("alertDetailId").textContent}.pdf`));
  const toastExp = await cond(() => d.querySelector("#toastRegion")?.textContent.includes("exportada"));
  registrar("FV-08", "Exportar evidencia: un clic descarga evidencia-AL-xxx.pdf y muestra toast", bajo && toastExp, JSON.stringify(dom.descargas));

  const seleccion = d.getElementById("alertDetailId").textContent;
  const estadoAntes = (await api(token, "GET", "/alertas")).json.find((a) => a.id === seleccion).status;
  d.getElementById("notifyPnpButton").click();
  const modal = await cond(() => d.getElementById("confirmDialog").hasAttribute("open"));
  const sinCambio = (await api(token, "GET", "/alertas")).json.find((a) => a.id === seleccion).status === estadoAntes;
  d.getElementById("confirmCancel").click();
  await esperar(150);
  const sigue = (await api(token, "GET", "/alertas")).json.find((a) => a.id === seleccion).status === estadoAntes;
  registrar("UX-04a", "Derivar a la PNP abre modal de confirmación; Cancelar no cambia el estado", modal && sinCambio && sigue && d.activeElement !== null, estadoAntes);
  d.getElementById("notifyPnpButton").click();
  await cond(() => d.getElementById("confirmDialog").hasAttribute("open"));
  d.getElementById("confirmAccept").click();
  const derivada = await cond(async () => (await api(token, "GET", "/alertas")).json.find((a) => a.id === seleccion).status === "Derivado PNP");
  registrar("UX-04b", "Confirmar en el modal deriva la alerta (estado «Derivado PNP»)", derivada);
  dom.window.close();
}

/* ---------- Login (HU-06) ---------- */
{
  const dom = await abrir("login.html"); const d = dom.window.document;
  d.getElementById("usuario").value = "acastro"; d.getElementById("password").value = "incorrecta";
  d.getElementById("loginForm").dispatchEvent(new dom.window.Event("submit", { cancelable: true, bubbles: true }));
  const ok = await cond(() => !d.getElementById("loginAlert").hidden && d.getElementById("loginAlertTitle").textContent === "Credenciales inválidas");
  registrar("FV-07", "Login con contraseña incorrecta: «Credenciales inválidas» y conserva el usuario", ok && d.getElementById("usuario").value === "acastro", d.getElementById("loginAlertTitle").textContent);
  registrar("UI-05b", "Campos del login con <label> asociada", d.getElementById("usuario").labels.length > 0 && d.getElementById("password").labels.length > 0);
  dom.window.close();
}

/* ---------- Pantalla sin incidentes (CA-02.2): al final, porque archiva las alertas ---------- */
{
  const dash = (await api(token, "GET", "/dashboard")).json;
  for (const a of dash.alerts) await api(token, "DELETE", `/dashboard/alertas/${a.id}`);
  const dom = await abrir("index.html", { token }); const d = dom.window.document;
  const msg = await cond(() => d.getElementById("alertsBody").textContent.includes("No hay incidentes de seguridad recientes"));
  registrar("CA-02.2", "Sin alertas: la tabla muestra «No hay incidentes de seguridad recientes»", msg, d.getElementById("alertsBody").textContent.trim().slice(0, 80));
  dom.window.close();
}

const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} pruebas aprobadas`);
process.exit(fallos ? 1 : 0);
