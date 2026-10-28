"use strict";

/* ==========================================================================
   SISTEP · Vistas secundarias
   Alertas, incidentes, reportes y configuración con JavaScript nativo.
   Los datos vienen del backend (js/api.js).
   ========================================================================== */

(function () {
  const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic"
  ];

  const PRIORITY_CLASSES = {
    Alta: "badge--danger",
    Media: "badge--warning",
    Baja: "badge--accent"
  };

  const ALERT_STATUS_CLASSES = {
    Pendiente: "badge--warning",
    "En revisión": "badge--primary",
    "Derivado PNP": "badge--accent"
  };

  const INCIDENT_STATUS_CLASSES = {
    Cerrado: "resolution-badge--neutral",
    Derivado: "resolution-badge--primary",
    Resuelto: "resolution-badge--success"
  };

  const INCIDENT_STATUS_LABELS = {
    Cerrado: "Cerrado",
    Derivado: "Derivado PNP 105",
    Resuelto: "Resuelto"
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return escapeHtml(value);
  }

  function notify(message, variant) {
    showToast(message, variant);
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function parseIsoDate(value) {
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      return null;
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function formatIsoDate(date) {
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
  }

  function formatShortDate(date) {
    return `${padNumber(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatDisplayDate(value) {
    const date = parseIsoDate(value);
    return date
      ? `${padNumber(date.getDate())}/${padNumber(date.getMonth() + 1)}/${date.getFullYear()}`
      : value;
  }

  function todayIso() {
    return formatIsoDate(new Date());
  }

  function openDialog(dialog) {
    if (!dialog) {
      return;
    }

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closeDialog(dialog) {
    if (!dialog) {
      return;
    }

    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function setBadge(element, text, modifier) {
    if (!element) {
      return;
    }

    element.className = `badge ${modifier}`;
    element.innerHTML = `<span class="badge__dot" aria-hidden="true"></span>${esc(text)}`;
  }

  function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
  }

  function percentages(values) {
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const exact = values.map((value) => (value / total) * 100);
    const rounded = exact.map((value) => Math.floor(value));
    let remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
    const order = exact
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);

    for (let index = 0; index < order.length && remainder > 0; index += 1) {
      rounded[order[index].index] += 1;
      remainder -= 1;
    }

    return rounded;
  }

  /* ========================================================================
     Vista · Alertas
     ======================================================================== */

  const alertIcons = {
    Forcejeo: "icon-user",
    "Arma detectada": "icon-shield",
    "Alerta manual": "icon-bell",
    Sospechoso: "icon-search"
  };

  const alertsViewState = {
    selectedId: null,
    items: [],
    status: "loading"
  };

  function normalizeAlert(item) {
    // El backend envía date/time ISO; la bandeja muestra "Hoy · 09:42", "Ayer · 21:16" o "24 oct · 09:42"
    return { ...item, time: SistepApi.format.relativeLabel(item.date, item.time) };
  }

  async function loadAlerts() {
    try {
      const data = await SistepApi.getAlertas();

      alertsViewState.items = data.map(normalizeAlert);
      alertsViewState.status = "ready";

      if (!alertsViewState.items.some((item) => item.id === alertsViewState.selectedId)) {
        alertsViewState.selectedId = alertsViewState.items[0]?.id || null;
      }
    } catch (error) {
      alertsViewState.status = "error";
      notify(error.message, "danger");
    }

    renderAlerts();
  }

  function getSelectedAlert() {
    return alertsViewState.items.find((item) => item.id === alertsViewState.selectedId) || null;
  }

  function alertInboxMarkup(alert) {
    const selected = alert.id === alertsViewState.selectedId;
    const icon = alertIcons[alert.type] || "icon-camera";

    return `
      <button class="alert-list-item${selected ? " is-selected" : ""}" type="button"
        data-alert-id="${esc(alert.id)}" aria-pressed="${selected}"
        aria-label="Ver alerta ${esc(alert.id)}: ${esc(alert.title)}">
        <span class="alert-thumb" aria-hidden="true">
          <svg class="icon"><use href="#${icon}"></use></svg>
          <span class="alert-thumb__source">${esc(alert.bus)}</span>
        </span>
        <span class="alert-list-item__body">
          <span class="alert-list-item__top">
            <span class="alert-list-item__title">${esc(alert.title)}</span>
            <span class="alert-select-indicator" aria-hidden="true">
              <svg class="icon"><use href="#icon-check"></use></svg>
            </span>
          </span>
          <span class="alert-list-item__desc">${esc(alert.summary)}</span>
          <span class="alert-list-item__meta">
            <span class="alert-list-item__time">${esc(alert.time)}</span>
            <span class="badge ${PRIORITY_CLASSES[alert.priority] || "badge--neutral"}">
              <span class="badge__dot" aria-hidden="true"></span>${esc(alert.priority)}
            </span>
          </span>
        </span>
      </button>
    `;
  }

  function renderAlertCounters() {
    const count = alertsViewState.items.length;
    const badge = byId("navAlertBadge");
    const queueCount = byId("alertQueueCount");
    const queueLabel = byId("alertQueueLabel");
    const inboxCount = byId("alertInboxCount");

    if (badge) {
      badge.textContent = String(count);
      badge.setAttribute("aria-label", `${count} ${count === 1 ? "alerta" : "alertas"}`);
      badge.hidden = count === 0;
    }

    if (queueCount) {
      queueCount.textContent = String(count);
    }

    if (queueLabel) {
      queueLabel.textContent = count === 1 ? "alerta activa" : "alertas activas";
    }

    if (inboxCount) {
      inboxCount.textContent = String(count);
      inboxCount.setAttribute("aria-label", `${count} ${count === 1 ? "alerta" : "alertas"}`);
    }
  }

  function renderAlertDetail() {
    const content = byId("alertDetailContent");
    const empty = byId("alertDetailEmpty");
    const alert = getSelectedAlert();

    if (!content || !empty) {
      return;
    }

    content.hidden = !alert;
    empty.hidden = Boolean(alert);

    if (!alert) {
      return;
    }

    byId("alertDetailCode").textContent = alert.id;
    byId("alertDetailTime").textContent = alert.time;
    byId("alertDetailTitle").textContent = alert.title;
    byId("alertDetailSummary").textContent = alert.summary;
    byId("alertDetailId").textContent = alert.id;
    byId("alertDetailPriorityText").textContent = alert.priority;
    byId("alertDetailType").textContent = `${alert.type} · ${alert.source}`;
    byId("alertMapCaption").textContent = alert.location;
    byId("alertMapStreet").textContent = alert.mapStreet;
    byId("alertMapDistrict").textContent = alert.mapDistrict;
    byId("alertEvidenceTime").textContent = alert.clock;
    byId("alertEvidenceCaption").textContent = alert.evidenceCaption;

    setBadge(
      byId("alertDetailPriority"),
      alert.priority,
      PRIORITY_CLASSES[alert.priority] || "badge--neutral"
    );
    setBadge(
      byId("alertDetailStatus"),
      alert.status,
      ALERT_STATUS_CLASSES[alert.status] || "badge--neutral"
    );

    const notifyButton = byId("notifyPnpButton");
    const alreadyNotified = alert.status === "Derivado PNP";

    notifyButton.disabled = alreadyNotified;
    notifyButton.innerHTML = alreadyNotified
      ? '<svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg>Notificado a PNP 105'
      : '<svg class="icon" aria-hidden="true"><use href="#icon-incident"></use></svg>Notificar PNP 105';
  }

  function renderAlerts() {
    const inbox = byId("alertInbox");

    if (!inbox) {
      return;
    }

    if (alertsViewState.status !== "ready" && !alertsViewState.items.length) {
      const failed = alertsViewState.status === "error";
      alertsViewState.selectedId = null;
      inbox.innerHTML = `
        <div class="empty-state alert-inbox-empty">
          <p class="empty-state__title">${failed ? "No se pudieron cargar las alertas" : "Cargando alertas…"}</p>
          <p class="empty-state__text">${failed ? "Verifica que el backend esté activo e inténtalo nuevamente." : "Consultando el servidor."}</p>
        </div>
      `;
    } else if (!alertsViewState.items.length) {
      alertsViewState.selectedId = null;
      inbox.innerHTML = `
        <div class="empty-state alert-inbox-empty">
          <span class="empty-state__icon" aria-hidden="true">
            <svg class="icon"><use href="#icon-check"></use></svg>
          </span>
          <p class="empty-state__title">Sin alertas pendientes</p>
          <p class="empty-state__text">Las nuevas detecciones aparecerán en esta bandeja.</p>
        </div>
      `;
    } else {
      const selected = getSelectedAlert();
      if (!selected) {
        alertsViewState.selectedId = alertsViewState.items[0].id;
      }
      inbox.innerHTML = alertsViewState.items.map(alertInboxMarkup).join("");
    }

    renderAlertCounters();
    renderAlertDetail();
  }

  function selectAlert(id) {
    if (!alertsViewState.items.some((item) => item.id === id)) {
      return;
    }

    alertsViewState.selectedId = id;
    renderAlerts();
  }

  async function notifyAlertPnp() {
    const alert = getSelectedAlert();

    if (!alert) {
      return;
    }

    if (alert.status === "Derivado PNP") {
      notify(`La alerta ${alert.id} ya fue derivada a la PNP.`, "info");
      return;
    }

    const wasPending = alert.status === "Pendiente";

    // UX-04 · Prevención de errores: derivar a la PNP es irreversible, se pide confirmación explícita.
    const confirmado = await window.SistepUi.confirm({
      title: "¿Derivar la alerta a la PNP 105?",
      message: "Se enviará la alerta a la Central PNP 105. Esta acción no se puede deshacer desde el panel.",
      detail: `${alert.id} · ${alert.title} · ${alert.bus}`,
      confirmLabel: "Sí, derivar a la PNP",
      cancelLabel: "Cancelar"
    });

    if (!confirmado) {
      notify("Derivación cancelada. No se envió nada a la PNP.", "info");
      return;
    }

    try {
      const updated = await SistepApi.notificarPnp(alert.id);
      const index = alertsViewState.items.findIndex((item) => item.id === alert.id);

      if (index !== -1) {
        alertsViewState.items[index] = normalizeAlert(updated);
      }

      renderAlerts();
      notify(
        wasPending
          ? `Alerta ${alert.id} derivada a la PNP 105.`
          : `Alerta ${alert.id} actualizada y derivada a la PNP 105.`,
        "success"
      );
    } catch (error) {
      notify(error.message, "danger");
    }
  }

  /* HU-08 / CA-08.1 · Exportar evidencia en UN clic: descarga el PDF con la captura y el GPS. */
  async function exportEvidence() {
    const alert = getSelectedAlert();
    const button = byId("exportEvidenceButton");

    if (!alert || !button || button.disabled) {
      return;
    }

    button.disabled = true;
    button.setAttribute("aria-busy", "true");

    try {
      const blob = await SistepApi.descargarEvidencia(alert.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `evidencia-${alert.id}.pdf`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Evidencia de ${alert.id} exportada en PDF.`, "success");
    } catch (error) {
      notify(error.message, "danger");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  async function dismissAlert() {
    const alert = getSelectedAlert();

    if (!alert) {
      return;
    }

    try {
      await SistepApi.descartarAlerta(alert.id);
    } catch (error) {
      notify(error.message, "danger");
      return;
    }

    const index = alertsViewState.items.findIndex((item) => item.id === alert.id);
    alertsViewState.items.splice(index, 1);
    alertsViewState.selectedId = alertsViewState.items[index]?.id || alertsViewState.items[index - 1]?.id || null;
    renderAlerts();
    notify(`Alerta ${alert.id} descartada como falso positivo.`, "info");
  }

  function initAlerts() {
    const inbox = byId("alertInbox");

    if (!inbox) {
      return;
    }

    inbox.addEventListener("click", (event) => {
      const item = event.target.closest("[data-alert-id]");
      if (item) {
        selectAlert(item.dataset.alertId);
      }
    });

    byId("notifyPnpButton")?.addEventListener("click", notifyAlertPnp);
    byId("dismissAlertButton")?.addEventListener("click", dismissAlert);
    byId("exportEvidenceButton")?.addEventListener("click", exportEvidence);

    renderAlerts();
    loadAlerts();
  }

  /* ========================================================================
     Vista · Incidentes
     ======================================================================== */

  let incidents = [];

  // Rango de fechas por defecto: últimos 90 días hasta hoy (antes estaba fijo en octubre 2026)
  function defaultIncidentRange() {
    return { from: SistepApi.format.isoDaysAgo(89), to: SistepApi.format.todayIso() };
  }

  function normalizeIncident(item) {
    return {
      ...item,
      audit: item.audit.map((entry) => ({
        title: entry.title,
        text: entry.text,
        time: `${formatDisplayDate(entry.date)} · ${entry.time}`
      }))
    };
  }

  async function loadIncidents() {
    try {
      incidents = (await SistepApi.getIncidentes()).map(normalizeIncident);
    } catch (error) {
      notify(error.message, "danger");
    }

    renderIncidents();
  }

  const incidentsViewState = {
    query: "",
    dateFrom: defaultIncidentRange().from,
    dateTo: defaultIncidentRange().to,
    type: "",
    status: "",
    operator: "",
    page: 1,
    pageSize: 5
  };

  let lastIncidentTrigger = null;

  function getFilteredIncidents() {
    const query = normalize(incidentsViewState.query);

    return incidents.filter((incident) => {
      const searchable = normalize([
        incident.id,
        incident.bus,
        incident.type,
        incident.operator,
        incident.status,
        incident.resolution,
        incident.location
      ].join(" "));

      const matchesQuery = !query || searchable.includes(query);
      const matchesType = !incidentsViewState.type || incident.type === incidentsViewState.type;
      const matchesStatus = !incidentsViewState.status || incident.status === incidentsViewState.status;
      const matchesOperator = !incidentsViewState.operator || incident.operator === incidentsViewState.operator;
      const matchesFrom = !incidentsViewState.dateFrom || incident.date >= incidentsViewState.dateFrom;
      const matchesTo = !incidentsViewState.dateTo || incident.date <= incidentsViewState.dateTo;

      return matchesQuery && matchesType && matchesStatus && matchesOperator && matchesFrom && matchesTo;
    });
  }

  function incidentRowMarkup(incident) {
    const statusClass = INCIDENT_STATUS_CLASSES[incident.status] || "resolution-badge--neutral";

    return `
      <tr>
        <td><span class="incident-id">${esc(incident.id)}</span></td>
        <td>
          <span class="incident-date">${esc(formatDisplayDate(incident.date))}</span>
          <span class="incident-time">${esc(incident.time)}</span>
        </td>
        <td><span class="incident-bus">${esc(incident.bus)}</span></td>
        <td>
          <span class="incident-type">${esc(incident.type)}</span>
          <span class="incident-source">${esc(incident.source)}</span>
        </td>
        <td>${esc(incident.operator)}</td>
        <td>
          <span class="resolution-badge ${statusClass}">
            <span class="resolution-badge__dot" aria-hidden="true"></span>${esc(INCIDENT_STATUS_LABELS[incident.status] || incident.status)}
          </span>
          <span class="incident-resolution-note">${esc(incident.resolution)}</span>
        </td>
        <td>
          <div class="incident-row-actions">
            <button class="row-action" type="button" data-incident-action="view" data-id="${esc(incident.id)}" aria-label="Ver detalle del incidente ${esc(incident.id)}">Ver</button>
            <button class="row-action row-action--muted" type="button" data-incident-action="audit" data-id="${esc(incident.id)}" aria-label="Auditar el incidente ${esc(incident.id)}">Auditar</button>
          </div>
        </td>
      </tr>
    `;
  }

  function incidentEmptyMarkup() {
    return `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <span class="empty-state__icon" aria-hidden="true">
              <svg class="icon"><use href="#icon-search"></use></svg>
            </span>
            <p class="empty-state__title">No encontramos incidentes</p>
            <p class="empty-state__text">Prueba con otros filtros o amplía el rango de fechas para ver más resultados.</p>
            <button class="button button--sm" type="button" data-incident-action="clear">Limpiar filtros</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderIncidents() {
    const body = byId("incidentsTableBody");

    if (!body) {
      return;
    }

    const filtered = getFilteredIncidents();
    const totalPages = Math.max(1, Math.ceil(filtered.length / incidentsViewState.pageSize));
    incidentsViewState.page = Math.min(Math.max(1, incidentsViewState.page), totalPages);

    const start = (incidentsViewState.page - 1) * incidentsViewState.pageSize;
    const visible = filtered.slice(start, start + incidentsViewState.pageSize);

    body.innerHTML = visible.length ? visible.map(incidentRowMarkup).join("") : incidentEmptyMarkup();

    const resultsLabel = byId("incidentResultsLabel");
    if (resultsLabel) {
      resultsLabel.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
    }

    const totalCount = byId("incidentTotalCount");
    const totalLabel = byId("incidentTotalLabel");
    if (totalCount) {
      totalCount.textContent = String(incidents.length);
    }
    if (totalLabel) {
      totalLabel.textContent = incidents.length === 1 ? "incidencia registrada" : "incidencias registradas";
    }

    const summary = byId("incidentPageSummary");
    if (summary) {
      if (!filtered.length) {
        summary.textContent = "Sin incidentes para los filtros seleccionados.";
      } else {
        const from = start + 1;
        const to = Math.min(start + incidentsViewState.pageSize, filtered.length);
        summary.textContent = `Mostrando ${from}–${to} de ${filtered.length} ${filtered.length === 1 ? "incidente" : "incidentes"}`;
      }
    }

    const indicator = byId("incidentPageIndicator");
    if (indicator) {
      indicator.textContent = String(incidentsViewState.page);
      indicator.setAttribute("aria-label", `Página ${incidentsViewState.page} de ${totalPages}`);
    }

    const prev = byId("incidentPrevPage");
    const next = byId("incidentNextPage");
    if (prev) {
      prev.disabled = incidentsViewState.page <= 1;
    }
    if (next) {
      next.disabled = incidentsViewState.page >= totalPages;
    }
  }

  function openIncidentDialog(id, focusAudit) {
    const incident = incidents.find((item) => item.id === id);
    const dialog = byId("incidentDialog");

    if (!incident || !dialog) {
      return;
    }

    lastIncidentTrigger = document.activeElement;

    const statusClass = INCIDENT_STATUS_CLASSES[incident.status] || "resolution-badge--neutral";
    const code = byId("incidentDialogCode");
    const status = byId("incidentDialogStatus");

    if (code) {
      code.textContent = `${incident.id} · ${incident.bus}`;
    }

    if (status) {
      status.className = `resolution-badge ${statusClass}`;
      status.innerHTML = `<span class="resolution-badge__dot" aria-hidden="true"></span>${esc(INCIDENT_STATUS_LABELS[incident.status] || incident.status)}`;
    }

    byId("incidentDialogTitle").textContent = incident.type;
    byId("incidentDialogDescription").textContent = incident.description;

    byId("incidentDialogMeta").innerHTML = `
      <div>
        <dt>Fecha y hora</dt>
        <dd>${esc(formatDisplayDate(incident.date))} · ${esc(incident.time)}</dd>
      </div>
      <div>
        <dt>Unidad</dt>
        <dd>${esc(incident.bus)}</dd>
      </div>
      <div>
        <dt>Operador</dt>
        <dd>${esc(incident.operator)}</dd>
      </div>
      <div>
        <dt>Origen</dt>
        <dd>${esc(incident.source)}</dd>
      </div>
      <div>
        <dt>Ubicación</dt>
        <dd>${esc(incident.location)}</dd>
      </div>
      <div>
        <dt>Resolución</dt>
        <dd>${esc(incident.resolution)}</dd>
      </div>
    `;

    byId("incidentAuditTimeline").innerHTML = incident.audit.map((entry) => `
      <li class="audit-item">
        <div class="audit-item__top">
          <span class="audit-item__title">${esc(entry.title)}</span>
          <span class="audit-item__time">${esc(entry.time)}</span>
        </div>
        <p class="audit-item__text">${esc(entry.text)}</p>
      </li>
    `).join("");

    openDialog(dialog);

    if (focusAudit) {
      window.requestAnimationFrame(() => {
        const auditBlock = dialog.querySelector(".audit-block");
        if (auditBlock) {
          auditBlock.focus({ preventScroll: false });
        }
      });
    }
  }

  function resetIncidentFilters(focusSearch = false) {
    incidentsViewState.query = "";
    incidentsViewState.dateFrom = defaultIncidentRange().from;
    incidentsViewState.dateTo = defaultIncidentRange().to;
    incidentsViewState.type = "";
    incidentsViewState.status = "";
    incidentsViewState.operator = "";
    incidentsViewState.page = 1;

    byId("incidentSearch").value = "";
    byId("incidentDateFrom").value = incidentsViewState.dateFrom;
    byId("incidentDateTo").value = incidentsViewState.dateTo;
    byId("incidentTypeFilter").value = "";
    byId("incidentStatusFilter").value = "";
    byId("incidentOperatorFilter").value = "";

    renderIncidents();

    if (focusSearch) {
      byId("incidentSearch").focus();
    }
  }

  function exportIncidentsCsv() {
    const filtered = getFilteredIncidents();

    if (!filtered.length) {
      notify("No hay incidentes para exportar con los filtros actuales.", "warning");
      return;
    }

    const headers = [
      "ID", "Fecha", "Hora", "Unidad", "Tipo", "Operador",
      "Estado", "Resolución", "Origen", "Ubicación"
    ];

    const rows = filtered.map((incident) => [
      incident.id,
      formatDisplayDate(incident.date),
      incident.time,
      incident.bus,
      incident.type,
      incident.operator,
      incident.status,
      incident.resolution,
      incident.source,
      incident.location
    ]);

    const csv = `\uFEFF${[headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")}`;

    downloadBlob(csv, "text/csv;charset=utf-8;", `incidentes-sistep-${todayIso()}.csv`);
    notify(
      `${filtered.length} ${filtered.length === 1 ? "incidente exportado" : "incidentes exportados"} en formato CSV.`,
      "success"
    );
  }

  function printIncidents() {
    const filtered = getFilteredIncidents();

    if (!filtered.length) {
      notify("No hay incidentes para incluir en el PDF.", "warning");
      return;
    }

    const previousPageSize = incidentsViewState.pageSize;
    incidentsViewState.pageSize = Math.max(filtered.length, 5);
    incidentsViewState.page = 1;
    renderIncidents();

    let restored = false;
    let fallbackTimer = 0;
    const restore = () => {
      if (restored) {
        return;
      }

      restored = true;
      window.clearTimeout(fallbackTimer);
      incidentsViewState.pageSize = previousPageSize;
      incidentsViewState.page = 1;
      renderIncidents();
      window.removeEventListener("afterprint", restore);
    };

    window.addEventListener("afterprint", restore, { once: true });
    fallbackTimer = window.setTimeout(restore, 1500);
    window.print();
  }

  function initIncidents() {
    const body = byId("incidentsTableBody");

    if (!body) {
      return;
    }

    byId("incidentDateFrom").value = incidentsViewState.dateFrom;
    byId("incidentDateTo").value = incidentsViewState.dateTo;

    byId("incidentSearch").addEventListener("input", (event) => {
      incidentsViewState.query = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentDateFrom").addEventListener("change", (event) => {
      incidentsViewState.dateFrom = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentDateTo").addEventListener("change", (event) => {
      incidentsViewState.dateTo = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentTypeFilter").addEventListener("change", (event) => {
      incidentsViewState.type = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentStatusFilter").addEventListener("change", (event) => {
      incidentsViewState.status = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentOperatorFilter").addEventListener("change", (event) => {
      incidentsViewState.operator = event.target.value;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("resetIncidentFilters").addEventListener("click", () => {
      resetIncidentFilters();
    });

    byId("incidentPageSize").addEventListener("change", (event) => {
      incidentsViewState.pageSize = Number(event.target.value) || 5;
      incidentsViewState.page = 1;
      renderIncidents();
    });

    byId("incidentPrevPage").addEventListener("click", () => {
      incidentsViewState.page = Math.max(1, incidentsViewState.page - 1);
      renderIncidents();
    });

    byId("incidentNextPage").addEventListener("click", () => {
      incidentsViewState.page += 1;
      renderIncidents();
    });

    body.addEventListener("click", (event) => {
      const action = event.target.closest("[data-incident-action]");

      if (!action) {
        return;
      }

      if (action.dataset.incidentAction === "clear") {
        resetIncidentFilters(true);
        return;
      }

      openIncidentDialog(action.dataset.id, action.dataset.incidentAction === "audit");
    });

    byId("incidentsCsvButton").addEventListener("click", exportIncidentsCsv);
    byId("incidentsPdfButton").addEventListener("click", printIncidents);

    const dialog = byId("incidentDialog");
    const close = () => closeDialog(dialog);

    byId("incidentDialogClose")?.addEventListener("click", close);
    byId("incidentDialogCloseFooter")?.addEventListener("click", close);

    dialog?.addEventListener("click", (event) => {
      if (event.target === dialog) {
        close();
      }
    });

    dialog?.addEventListener("close", () => {
      if (lastIncidentTrigger?.isConnected) {
        lastIncidentTrigger.focus();
      }
      lastIncidentTrigger = null;
    });

    renderIncidents();
    loadIncidents();
  }

  /* ========================================================================
     Vista · Reportes y estadísticas
     ======================================================================== */

  // Datos del contrato GET /api/reportes?rango=N (el backend calcula todo; aquí solo se dibuja)
  const reportCache = {};

  async function loadReports() {
    const range = activeReportRange;

    try {
      reportCache[range] = await SistepApi.getReportes(range);
    } catch (error) {
      notify(error.message, "danger");
      return;
    }

    if (range === activeReportRange) {
      renderReports();
    }
  }

  let activeReportRange = 30;

  function getReportPeriodLabel(days) {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
    return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  }

  function renderTypesChart(dataset) {
    const container = byId("reportTypesChart");

    if (!container) {
      return;
    }

    const data = dataset.types;
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const width = 560;
    const height = 400;
    const padding = { top: 34, right: 18, bottom: 64, left: 44 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.map((item) => item.value), 1);
    const step = Math.max(2, Math.ceil(maxValue / 4));
    const axisMax = step * 4;
    const gap = 26;
    const barWidth = Math.min(82, (plotWidth - gap * (data.length - 1)) / data.length);
    const groupWidth = barWidth * data.length + gap * (data.length - 1);
    const startX = padding.left + (plotWidth - groupWidth) / 2;

    const grid = [];
    for (let tick = 0; tick <= axisMax; tick += step) {
      const y = padding.top + plotHeight - (tick / axisMax) * plotHeight;
      grid.push(`
        <line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
        <text class="chart-axis-label" x="${padding.left - 10}" y="${y}" text-anchor="end" dominant-baseline="middle">${tick}</text>
      `);
    }

    const bars = data.map((item, index) => {
      const x = startX + index * (barWidth + gap);
      const barHeight = (item.value / axisMax) * plotHeight;
      const y = padding.top + plotHeight - barHeight;
      const center = x + barWidth / 2;
      const percent = total ? Math.round((item.value / total) * 100) : 0;

      return `
        <g>
          <rect class="chart-bar-background" x="${x}" y="${padding.top}" width="${barWidth}" height="${plotHeight}" rx="7"></rect>
          <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="7">
            <title>${esc(item.label)}: ${item.value} incidentes (${percent}%)</title>
          </rect>
          <text class="chart-bar-value" x="${center}" y="${y - 9}" text-anchor="middle">${item.value}</text>
          <text class="chart-category-label" x="${center}" y="${padding.top + plotHeight + 24}" text-anchor="middle">${esc(item.label)}</text>
        </g>
      `;
    }).join("");

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Tipos de incidentes: ${data.map((item) => `${esc(item.label)} ${item.value}`).join(", ")}">
        <defs>
          <linearGradient id="reportBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1E3A8A"></stop>
            <stop offset="100%" stop-color="#4B63B8"></stop>
          </linearGradient>
        </defs>
        ${grid.join("")}
        ${bars}
        <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#DDE2EA" stroke-width="1"></line>
      </svg>
    `;
  }

  function renderStatusDonut(dataset) {
    const donut = byId("reportStatusDonut");
    const legend = byId("reportStatusLegend");
    const totalLabel = byId("reportResolutionTotal");

    if (!donut || !legend) {
      return;
    }

    const values = dataset.statuses.map((item) => item.value);
    const shares = percentages(values);
    const total = values.reduce((sum, value) => sum + value, 0);
    let cursor = 0;

    const stops = dataset.statuses.map((item) => {
      const start = cursor;
      cursor += total ? (item.value / total) * 100 : 0;
      return `${item.color} ${start}% ${cursor}%`;
    }).join(", ");

    donut.style.background = `conic-gradient(${stops})`;
    donut.setAttribute(
      "aria-label",
      `Estado de resolución: ${dataset.statuses.map((item, index) => `${item.label} ${shares[index]}%`).join(", ")}`
    );

    if (totalLabel) {
      totalLabel.textContent = String(total);
    }

    legend.innerHTML = dataset.statuses.map((item, index) => `
      <li class="legend-item">
        <span class="legend-dot" style="--legend-color: ${item.color}" aria-hidden="true"></span>
        <span class="legend-label">${esc(item.label)}</span>
        <span class="legend-value">${item.value}</span>
        <span class="legend-percent">${shares[index]}%</span>
      </li>
    `).join("");
  }

  function renderLineChart(dataset) {
    const container = byId("reportLineChart");

    if (!container) {
      return;
    }

    const { labels, values } = dataset.trend;
    const width = 620;
    const height = 220;
    const padding = { top: 22, right: 18, bottom: 38, left: 36 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...values, 1);
    const axisMax = Math.max(2, Math.ceil(maxValue / 2) * 2);
    const xFor = (index) => padding.left + (plotWidth / (values.length - 1)) * index;
    const yFor = (value) => padding.top + plotHeight - (value / axisMax) * plotHeight;

    const ticks = [0, axisMax / 2, axisMax];
    const grid = ticks.map((tick) => {
      const y = yFor(tick);
      return `
        <line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
        <text class="chart-axis-label" x="${padding.left - 9}" y="${y}" text-anchor="end" dominant-baseline="middle">${tick}</text>
      `;
    }).join("");

    const points = values.map((value, index) => ({
      x: xFor(index),
      y: yFor(value),
      value,
      label: labels[index]
    }));

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    const baseY = padding.top + plotHeight;
    const areaPath = `M${points[0].x} ${baseY} ${points.map((point) => `L${point.x} ${point.y}`).join(" ")} L${points[points.length - 1].x} ${baseY} Z`;

    const labelStep = values.length > 7 ? Math.ceil((values.length - 1) / 4) : 1;
    const xLabels = points.map((point, index) => {
      const shouldLabel = index % labelStep === 0
        || (index === points.length - 1 && (values.length - 1) % labelStep !== 0);

      return shouldLabel
        ? `<text class="chart-axis-label" x="${point.x}" y="${baseY + 20}" text-anchor="middle">${esc(point.label)}</text>`
        : "";
    }).join("");

    const dots = points.map((point, index) => `
      <circle class="line-point${index === points.length - 1 ? " line-point--last" : ""}"
        cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 4.2 : 3.3}">
        <title>${esc(point.label)}: ${point.value} incidentes</title>
      </circle>
    `).join("");

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img"
        aria-label="Incidentes en el tiempo: ${points.map((point) => `${esc(point.label)} ${point.value}`).join(", ")}">
        <defs>
          <linearGradient id="reportLineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0F766E" stop-opacity="0.24"></stop>
            <stop offset="100%" stop-color="#0F766E" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${grid}
        <path class="line-area" d="${areaPath}"></path>
        <path class="line-path" d="${linePath}"></path>
        ${dots}
        ${xLabels}
      </svg>
    `;
  }

  function renderReports() {
    byId("reportsPeriodLabel").textContent = getReportPeriodLabel(activeReportRange);

    const dataset = reportCache[activeReportRange];

    if (!dataset) {
      return;
    }

    byId("reportTypesTotal").textContent = `${dataset.total} incidentes`;

    const trend = byId("reportTrendLabel");
    const isPositive = dataset.change >= 0;
    trend.textContent = `${isPositive ? "+" : ""}${dataset.change}%`;
    trend.classList.toggle("chart-metric--accent", isPositive);
    trend.classList.toggle("chart-metric--negative", !isPositive);

    renderTypesChart(dataset);
    renderStatusDonut(dataset);
    renderLineChart(dataset);
  }

  function exportReportExcel() {
    const dataset = reportCache[activeReportRange];

    if (!dataset) {
      notify("Los datos del reporte aún no están disponibles.", "warning");
      return;
    }

    const period = getReportPeriodLabel(activeReportRange);
    const shares = percentages(dataset.statuses.map((item) => item.value));

    const typeRows = dataset.types.map((item) => `
      <tr>
        <td>${esc(item.label)}</td>
        <td>${item.value}</td>
        <td>${dataset.total ? Math.round((item.value / dataset.total) * 100) : 0}%</td>
      </tr>
    `).join("");

    const statusRows = dataset.statuses.map((item, index) => `
      <tr>
        <td>${esc(item.label)}</td>
        <td>${item.value}</td>
        <td>${shares[index]}%</td>
      </tr>
    `).join("");

    const html = `
      <html>
        <head><meta charset="UTF-8"></head>
        <body>
          <table>
            <tr><th colspan="3">SISTEP · Reporte de incidentes</th></tr>
            <tr><td colspan="3">Periodo: ${esc(period)}</td></tr>
            <tr><td colspan="3">Total de incidentes: ${dataset.total}</td></tr>
            <tr><th>Tipo de incidente</th><th>Cantidad</th><th>Porcentaje</th></tr>
            ${typeRows}
            <tr><th>Estado de resolución</th><th>Cantidad</th><th>Porcentaje</th></tr>
            ${statusRows}
          </table>
        </body>
      </html>
    `;

    downloadBlob(
      `\uFEFF${html}`,
      "application/vnd.ms-excel;charset=utf-8;",
      `reporte-sistep-${todayIso()}.xls`
    );
    notify(`Reporte de los últimos ${activeReportRange} días exportado a Excel.`, "success");
  }

  function printReports() {
    window.print();
  }

  function initReports() {
    const range = byId("reportRange");

    if (!range) {
      return;
    }

    range.value = String(activeReportRange);
    range.addEventListener("change", (event) => {
      activeReportRange = Number(event.target.value) || 30;
      renderReports();
      loadReports();
    });

    byId("reportsExcelButton").addEventListener("click", exportReportExcel);
    byId("reportsPdfButton").addEventListener("click", printReports);

    renderReports();
    loadReports();
  }

  /* ========================================================================
     Vista · Configuración del sistema
     ======================================================================== */

  const configState = {
    cameras: [],
    saved: null,
    loaded: false
  };

  let lastCameraTrigger = null;

  function camerasMarkup() {
    return configState.cameras.map((camera) => `
      <tr>
        <td><span class="camera-bus">${esc(camera.bus)}</span></td>
        <td>${esc(camera.model)}</td>
        <td>
          <span class="camera-status camera-status--${camera.active ? "active" : "inactive"}">
            <span class="camera-status__dot" aria-hidden="true"></span>
            ${camera.active ? "Activa" : "Inactiva"}
          </span>
        </td>
      </tr>
    `).join("");
  }

  function renderCameras() {
    const body = byId("camerasTableBody");

    if (body) {
      body.innerHTML = camerasMarkup();
    }
  }

  function collectSettings() {
    const form = byId("settingsForm");
    const range = byId("confidenceRange");

    return {
      confidence: Number(range.value),
      detectForce: form.elements.detectForce.checked,
      detectWeapons: form.elements.detectWeapons.checked,
      detectObjects: form.elements.detectObjects.checked,
      activeModel: form.elements.activeModel.value,
      notifyPnp: form.elements.notifyPnp.checked,
      soundAlarm: form.elements.soundAlarm.checked,
      pnpContact: form.elements.pnpContact.value.trim(),
      cameras: configState.cameras.map((camera) => ({ ...camera }))
    };
  }

  function settingsEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  function updateRangeFill(value) {
    const range = byId("confidenceRange");
    const output = byId("confidenceValue");
    const numeric = Number(value);

    range.style.setProperty("--range-fill", `${numeric}%`);
    output.textContent = `${numeric}%`;
  }

  function refreshSaveState() {
    const note = byId("settingsSaveNote");
    const noteText = byId("settingsSaveText");
    const status = byId("configStatusLabel");

    if (!configState.saved) {
      return;
    }

    const dirty = !settingsEqual(collectSettings(), configState.saved);

    note?.classList.toggle("is-dirty", dirty);

    if (noteText) {
      noteText.textContent = dirty
        ? "Cambios sin guardar"
        : "Todos los cambios están guardados";
    }

    if (status) {
      status.textContent = dirty ? "Cambios sin guardar" : "Configuración sincronizada";
    }
  }

  function restoreSettings(settings) {
    const form = byId("settingsForm");

    byId("confidenceRange").value = String(settings.confidence);
    updateRangeFill(settings.confidence);

    form.elements.detectForce.checked = settings.detectForce;
    form.elements.detectWeapons.checked = settings.detectWeapons;
    form.elements.detectObjects.checked = settings.detectObjects;
    form.elements.activeModel.value = settings.activeModel;
    form.elements.notifyPnp.checked = settings.notifyPnp;
    form.elements.soundAlarm.checked = settings.soundAlarm;
    form.elements.pnpContact.value = settings.pnpContact;

    configState.cameras = settings.cameras.map((camera) => ({ ...camera }));
    renderCameras();
    refreshSaveState();
  }

  async function loadConfig(options = {}) {
    // Al volver a la vista no se pisan cambios sin guardar
    if (options.onlyIfClean && configState.saved && !settingsEqual(collectSettings(), configState.saved)) {
      return;
    }

    try {
      restoreSettings(await SistepApi.getConfiguracion());
      configState.saved = collectSettings();
      configState.loaded = true;
      refreshSaveState();
    } catch (error) {
      notify(error.message, "danger");
    }
  }

  function initConfig() {
    const form = byId("settingsForm");
    const range = byId("confidenceRange");

    if (!form || !range) {
      return;
    }

    const dialog = byId("cameraDialog");
    const cameraForm = byId("cameraForm");
    const error = byId("cameraFormError");
    const busInput = byId("cameraBusId");
    const modelSelect = byId("cameraModel");

    updateRangeFill(range.value);
    renderCameras();
    loadConfig();

    range.addEventListener("input", () => {
      updateRangeFill(range.value);
      refreshSaveState();
    });

    form.addEventListener("input", refreshSaveState);
    form.addEventListener("change", refreshSaveState);

    form.elements.pnpContact.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!configState.loaded) {
        notify("La configuración aún no se cargó desde el servidor.", "warning");
        return;
      }

      const contact = form.elements.pnpContact.value.trim();

      if (!/^\d{3,6}$/.test(contact)) {
        notify("Ingresa un número de contacto PNP válido, de 3 a 6 dígitos.", "warning");
        form.elements.pnpContact.focus();
        return;
      }

      form.elements.pnpContact.value = contact;

      const submitButton = form.querySelector('[type="submit"]');
      const payload = collectSettings();

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        // Contrato: PUT guarda TODA la configuración, incluida la lista completa de cámaras
        restoreSettings(await SistepApi.guardarConfiguracion(payload));
        configState.saved = collectSettings();
        refreshSaveState();
        notify("Configuración guardada correctamente.", "success");
      } catch (error) {
        notify(error.message, error.status === 409 || error.status === 422 ? "warning" : "danger");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });

    byId("settingsCancelButton").addEventListener("click", () => {
      if (!configState.saved) {
        return;
      }

      restoreSettings(configState.saved);
      notify("Cambios descartados. Se restauró la última configuración guardada.", "info");
    });

    const openCameraDialog = () => {
      lastCameraTrigger = document.activeElement;
      cameraForm.reset();
      error.hidden = true;
      error.textContent = "";
      openDialog(dialog);
      window.requestAnimationFrame(() => busInput.focus());
    };

    const closeCameraDialog = () => closeDialog(dialog);

    byId("addCameraButton").addEventListener("click", openCameraDialog);
    byId("cameraDialogClose").addEventListener("click", closeCameraDialog);
    byId("cameraCancelButton").addEventListener("click", closeCameraDialog);

    busInput.addEventListener("input", () => {
      busInput.value = busInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      error.hidden = true;
    });

    cameraForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const bus = busInput.value.trim().toUpperCase();
      const model = modelSelect.value;

      if (!bus) {
        error.textContent = "Ingresa el Bus ID de la unidad.";
        error.hidden = false;
        busInput.focus();
        return;
      }

      if (!/^BUS-\d{3,4}$/.test(bus)) {
        error.textContent = "Usa el formato BUS-000, por ejemplo BUS-302.";
        error.hidden = false;
        busInput.focus();
        return;
      }

      if (configState.cameras.some((camera) => camera.bus === bus)) {
        error.textContent = `La cámara para ${bus} ya está registrada.`;
        error.hidden = false;
        busInput.focus();
        return;
      }

      configState.cameras.push({ bus, model, active: true });
      renderCameras();
      refreshSaveState();
      closeCameraDialog();
      notify(`Cámara ${model} agregada a la unidad ${bus}.`, "success");
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeCameraDialog();
      }
    });

    dialog.addEventListener("close", () => {
      if (lastCameraTrigger?.isConnected) {
        lastCameraTrigger.focus();
      }
      lastCameraTrigger = null;
    });
  }

  /* ========================================================================
     Inicialización
     ======================================================================== */

  initAlerts();
  initIncidents();
  initReports();
  initConfig();

  // Al volver a una vista se consulta de nuevo el backend (p. ej. alertas nuevas generadas por la IA)
  // Una alerta nueva (p. ej. botón de pánico) debe aparecer en la bandeja sin recargar la página.
  document.addEventListener("sistep:alerta-nueva", () => loadAlerts());

  window.addEventListener("hashchange", () => {
    const view = window.location.hash.slice(1).toLowerCase();

    if (view === "alertas") {
      loadAlerts();
    } else if (view === "incidentes") {
      loadIncidents();
    } else if (view === "reportes") {
      loadReports();
    } else if (view === "configuracion") {
      loadConfig({ onlyIfClean: true });
    }
  });
})();
