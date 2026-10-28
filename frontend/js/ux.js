"use strict";

/* ==========================================================================
   SISTEP · Interacciones UX de la Guía 11
   - SistepUi.confirm(): modal de confirmación accesible (UX-04, Heurística 5 de Nielsen).
   - Panel de flota con estado «Offline» (HU-09 / UX-05) y actualización periódica (UX-06).
   - Botón de pánico con confirmación y envío silencioso (HU-03).
   ========================================================================== */
(function () {
  const REFRESCO_MS = 15000;

  // Coordenadas DEMO de cada unidad (en producción las envía la unidad Edge AI con su GPS).
  const GPS_DEMO = {
    "BUS-302": [-12.0911, -77.023],
    "BUS-118": [-12.085, -77.034],
    "BUS-207": [-12.0464, -77.0428]
  };
  const GPS_LIMA = [-12.0464, -77.0428];

  const byId = (id) => document.getElementById(id);
  const esc = (valor) => String(valor).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (mensaje, variante) => (typeof window.showToast === "function" ? window.showToast(mensaje, variante) : undefined);

  /* ---------------------------------------------------------------- confirmación */
  function confirmar(opciones) {
    const dialogo = byId("confirmDialog");

    if (!dialogo || typeof dialogo.showModal !== "function") {
      // Sin <dialog> (navegador antiguo): se usa el confirm nativo para no perder la protección.
      return Promise.resolve(window.confirm(`${opciones.title}\n\n${opciones.message}`));
    }

    byId("confirmTitle").textContent = opciones.title || "Confirmar acción";
    byId("confirmMessage").textContent = opciones.message || "";
    const detalle = byId("confirmDetail");
    detalle.hidden = !opciones.detail;
    detalle.textContent = opciones.detail || "";
    byId("confirmAccept").textContent = opciones.confirmLabel || "Confirmar";
    byId("confirmCancel").textContent = opciones.cancelLabel || "Cancelar";

    return new Promise((resolve) => {
      let resultado = false;
      const aceptar = () => { resultado = true; dialogo.close(); };
      const cancelar = () => dialogo.close();

      byId("confirmAccept").addEventListener("click", aceptar, { once: true });
      dialogo.querySelectorAll("[data-confirm-cancel]").forEach((b) => b.addEventListener("click", cancelar, { once: true }));
      dialogo.addEventListener("close", () => {
        byId("confirmAccept").removeEventListener("click", aceptar);
        dialogo.querySelectorAll("[data-confirm-cancel]").forEach((b) => b.removeEventListener("click", cancelar));
        resolve(resultado);          // Esc o clic fuera = cancelar (resultado queda en false)
      }, { once: true });

      dialogo.showModal();
      byId("confirmCancel").focus(); // el foco inicial va a la opción SEGURA
    });
  }

  window.SistepUi = { confirm: confirmar };

  /* ---------------------------------------------------------------- flota (HU-09) */
  const flota = { unidades: [], estadoPrevio: new Map(), cargado: false };

  function textoSenal(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) { return "Sin datos de señal"; }
    const min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (min < 1) { return "Señal hace instantes"; }
    if (min < 60) { return `Última señal hace ${min} min`; }
    return `Última señal hace ${Math.round(min / 60)} h`;
  }

  function dibujarFlota() {
    const lista = byId("fleetList");
    const resumen = byId("fleetSummary");
    if (!lista || !resumen) { return; }

    if (!flota.unidades.length) {
      lista.innerHTML = '<li class="fleet-empty">No hay unidades registradas. Agrégalas en Configuración.</li>';
      resumen.textContent = "Sin unidades registradas.";
      return;
    }

    const offline = flota.unidades.filter((u) => u.status === "offline").length;
    resumen.textContent = offline === 0
      ? `${flota.unidades.length} unidades en línea.`
      : `${flota.unidades.length - offline} en línea · ${offline} Offline.`;

    // UX-05: estado = punto de color + TEXTO («Offline» / «En línea»), nunca solo color.
    lista.innerHTML = flota.unidades.map((u) => {
      const off = u.status === "offline";
      const insignia = off
        ? '<span class="badge badge--danger"><svg class="icon" aria-hidden="true" style="width:13px;height:13px"><use href="#icon-wifi-off"></use></svg>Offline</span>'
        : '<span class="badge fleet-item__badge-online"><span class="badge__dot" aria-hidden="true"></span>En línea</span>';
      return `<li class="fleet-item${off ? " fleet-item--offline" : ""}" data-bus="${esc(u.bus)}">
        <span class="fleet-item__dot" aria-hidden="true"></span>
        <span class="fleet-item__plate">${esc(u.bus)}</span>
        ${insignia}
        <p class="fleet-item__meta">${esc(u.model)} · ${esc(textoSenal(u.lastSignal))}</p>
      </li>`;
    }).join("");

    const demo = byId("fleetDemoActions");
    if (demo) {
      demo.innerHTML = flota.unidades.map((u) => {
        const off = u.status === "offline";
        return `<button class="button button--sm" type="button" data-fleet-toggle="${esc(u.bus)}" data-online="${off}">
          ${off ? "Restablecer red" : "Simular caída de red"} · ${esc(u.bus)}</button>`;
      }).join("");
    }
  }

  function avisarCambios() {
    // UX-06: cuando una unidad cambia de estado se avisa con un toast (además del texto en el panel).
    flota.unidades.forEach((u) => {
      const previo = flota.estadoPrevio.get(u.bus);
      if (flota.cargado && previo && previo !== u.status) {
        if (u.status === "offline") {
          toast(`${u.bus} perdió conexión (Offline).`, "danger");
        } else {
          toast(`${u.bus} recuperó la conexión.`, "success");
        }
      }
      flota.estadoPrevio.set(u.bus, u.status);
    });
    flota.cargado = true;
  }

  async function cargarFlota() {
    try {
      const datos = await SistepApi.getFlota();
      flota.unidades = datos.units;
      avisarCambios();
      dibujarFlota();
    } catch (error) {
      const resumen = byId("fleetSummary");
      if (resumen) { resumen.textContent = "No se pudo consultar el estado de la flota."; }
    }
  }

  async function alternarRed(bus, online) {
    try {
      await SistepApi.cambiarEstadoFlota(bus, online);
      await cargarFlota();
    } catch (error) {
      toast(error.message, "danger");
    }
  }

  /* ---------------------------------------------------------------- pánico (HU-03) */
  function abrirPanico() {
    const dialogo = byId("panicDialog");
    const select = byId("panicBus");
    const error = byId("panicError");
    if (!dialogo || !select) { return; }

    const disponibles = flota.unidades.filter((u) => u.status === "online");
    const opciones = disponibles.length ? disponibles : flota.unidades;
    select.innerHTML = opciones.map((u) => `<option value="${esc(u.bus)}">${esc(u.bus)}${u.status === "offline" ? " (Offline)" : ""}</option>`).join("");
    error.hidden = true;
    byId("panicAccept").disabled = !opciones.length;

    if (!opciones.length) {
      error.textContent = "No hay unidades registradas para enviar la alerta.";
      error.hidden = false;
    }

    dialogo.showModal();
    byId("panicCancel").focus();   // foco inicial en «Cancelar»: evita enviar por accidente con Enter
  }

  async function enviarPanico(evento) {
    evento.preventDefault();
    const dialogo = byId("panicDialog");
    const bus = byId("panicBus").value;
    const [lat, lon] = GPS_DEMO[bus] || GPS_LIMA;
    const boton = byId("panicAccept");

    boton.disabled = true;
    try {
      const alerta = await SistepApi.panico(bus, lat, lon);   // sin audio: HU-03 exige envío silencioso
      dialogo.close();
      toast(`Alerta ${alerta.id} registrada para ${bus}. Envío silencioso, sin sonido en el bus.`, "success");
      document.dispatchEvent(new CustomEvent("sistep:alerta-nueva", { detail: alerta }));
    } catch (error) {
      const caja = byId("panicError");
      caja.textContent = error.message;   // el modal queda abierto para reintentar
      caja.hidden = false;
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------------------------------------------------------------- arranque */
  function iniciar() {
    if (!byId("fleetList")) { return; }

    byId("panicButton").addEventListener("click", abrirPanico);
    byId("panicForm").addEventListener("submit", enviarPanico);
    byId("panicDialog").querySelectorAll("[data-panic-cancel]").forEach((b) => b.addEventListener("click", () => byId("panicDialog").close()));
    byId("fleetDemoActions").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-fleet-toggle]");
      if (boton) { alternarRed(boton.dataset.fleetToggle, boton.dataset.online === "true"); }
    });

    // La bandeja de Alertas se recarga al entrar a la vista; si ya estaba abierta se refresca el aviso.
    cargarFlota();
    window.setInterval(() => { if (!document.hidden) { cargarFlota(); } }, REFRESCO_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { cargarFlota(); } });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
