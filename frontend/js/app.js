"use strict";

/* ==========================================================================
   SISTEP · Panel de Seguridad
   Lógica del frontend con JavaScript nativo. Los datos vienen del backend (js/api.js).
   ========================================================================== */

const VIEW_META = {
  dashboard: {
    context: "Centro de monitoreo",
    title: "SISTEP · Panel de Seguridad"
  },
  alertas: {
    context: "Bandeja de alertas",
    title: "Alertas · SISTEP"
  },
  incidentes: {
    context: "Historial de incidentes",
    title: "Incidentes · SISTEP"
  },
  reportes: {
    context: "Analítica de seguridad",
    title: "Reportes y Estadísticas · SISTEP"
  },
  configuracion: {
    context: "Administración del sistema",
    title: "Configuración del Sistema · SISTEP"
  }
};

const state = {
  query: "",
  priority: "",
  status: "",
  activeIncidents: 0,
  attentionCount: 0,
  activeAlertId: null,
  refreshing: false,
  loading: true,
  loadError: false,
  summary: null,
  userMenuOpen: false
};

let alerts = [];

const priorityClasses = {
  Alta: "badge--danger",
  Media: "badge--warning",
  Baja: "badge--accent"
};

const statusClasses = {
  Pendiente: "badge--warning",
  "En proceso": "badge--primary",
  Resuelto: "badge--success"
};

const els = {
  currentDate: document.getElementById("currentDate"),
  topbarContext: document.getElementById("topbarContext"),
  mainContent: document.getElementById("mainContent"),
  sidebar: document.getElementById("sidebar"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  sidebarClose: document.getElementById("sidebarClose"),
  menuToggle: document.getElementById("menuToggle"),
  alertsBody: document.getElementById("alertsBody"),
  visibleCount: document.getElementById("visibleCount"),
  tableSummary: document.getElementById("tableSummary"),
  searchInput: document.getElementById("alertSearch"),
  filterToggle: document.getElementById("filterToggle"),
  filterPopover: document.getElementById("filterPopover"),
  filterPriority: document.getElementById("filterPriority"),
  filterStatus: document.getElementById("filterStatus"),
  filterCount: document.getElementById("filterCount"),
  filterChips: document.getElementById("filterChips"),
  activeFilters: document.getElementById("activeFilters"),
  applyFiltersButton: document.getElementById("applyFiltersButton"),
  resetFilterButton: document.getElementById("resetFilterButton"),
  clearFiltersButton: document.getElementById("clearFiltersButton"),
  actionsToggle: document.getElementById("actionsToggle"),
  actionsPopover: document.getElementById("actionsPopover"),
  exportButton: document.getElementById("exportButton"),
  refreshButton: document.getElementById("refreshButton"),
  lastUpdated: document.getElementById("lastUpdated"),
  activeIncidents: document.querySelector('[data-stat="active-incidents"]'),
  statTotal: document.querySelector('[data-stat="total"]'),
  statTotalValue: document.getElementById("statTotalValue"),
  statNewToday: document.querySelector('[data-stat="new-today"]'),
  statTrend: document.querySelector('[data-stat="alerts-trend"]'),
  statTrendIcon: document.getElementById("statTrendIcon"),
  statIncidentsToday: document.querySelector('[data-stat="incidents-today"]'),
  statAvg: document.querySelector('[data-stat="avg-response"]'),
  statGoal: document.querySelector('[data-stat="goal-text"]'),
  statResponse: document.querySelector('[data-stat="response-status"]'),
  activeAttention: document.querySelector("[data-active-attention]"),
  alertDialog: document.getElementById("alertDialog"),
  dialogCode: document.getElementById("dialogCode"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogPriority: document.getElementById("dialogPriority"),
  dialogDescription: document.getElementById("dialogDescription"),
  dialogDate: document.getElementById("dialogDate"),
  dialogTime: document.getElementById("dialogTime"),
  dialogLocation: document.getElementById("dialogLocation"),
  dialogDevice: document.getElementById("dialogDevice"),
  dialogOperator: document.getElementById("dialogOperator"),
  dialogStatus: document.getElementById("dialogStatus"),
  dialogPrimaryAction: document.getElementById("dialogPrimaryAction"),
  toastRegion: document.getElementById("toastRegion"),
  userMenuAnchor: document.getElementById("userMenuAnchor"),
  userMenuToggle: document.getElementById("userMenuToggle"),
  userMenu: document.getElementById("userMenu"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userRole: document.getElementById("userRole"),
  userMenuAvatar: document.getElementById("userMenuAvatar"),
  userMenuName: document.getElementById("userMenuName"),
  userMenuRole: document.getElementById("userMenuRole"),
  userMenuEmail: document.getElementById("userMenuEmail"),
  logoutButton: document.getElementById("logoutButton")
};

const popoverPairs = [
  { trigger: els.filterToggle, popover: els.filterPopover },
  { trigger: els.actionsToggle, popover: els.actionsPopover }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getFilteredAlerts() {
  const query = normalizeText(state.query);

  return alerts.filter((alert) => {
    const searchable = normalizeText(
      [alert.id, alert.date, alert.alert, alert.priority, alert.status, alert.location, alert.operator].join(" ")
    );
    const matchesQuery = !query || searchable.includes(query);
    const matchesPriority = !state.priority || alert.priority === state.priority;
    const matchesStatus = !state.status || alert.status === state.status;

    return matchesQuery && matchesPriority && matchesStatus;
  });
}

function hasActiveCriteria() {
  return Boolean(state.query.trim() || state.priority || state.status);
}

function getBadgeMarkup(text, modifier, withDot = true) {
  const dot = withDot ? '<span class="badge__dot" aria-hidden="true"></span>' : "";
  return `<span class="badge ${modifier}">${dot}${escapeHtml(text)}</span>`;
}

function getPriorityBadge(priority) {
  return getBadgeMarkup(priority, priorityClasses[priority] || "badge--neutral");
}

function getStatusBadge(status) {
  return getBadgeMarkup(status, statusClasses[status] || "badge--neutral");
}

function paintBadge(element, text, modifier) {
  element.className = `badge ${modifier}`;
  element.innerHTML = `<span class="badge__dot" aria-hidden="true"></span>${escapeHtml(text)}`;
}

function getRowMarkup(alert) {
  const isResolved = alert.status === "Resuelto";
  const secondAction = isResolved
    ? `<button class="row-action row-action--muted" type="button" data-action="close" data-id="${escapeHtml(alert.id)}" aria-label="Cerrar alerta ${escapeHtml(alert.id)}">Cerrar</button>`
    : `<button class="row-action row-action--primary" type="button" data-action="resolve" data-id="${escapeHtml(alert.id)}" aria-label="Resolver alerta ${escapeHtml(alert.id)}">Resolver</button>`;

  return `
    <tr>
      <td><span class="alert-id">${escapeHtml(alert.id)}</span></td>
      <td><span class="alert-date">${escapeHtml(alert.date)}</span></td>
      <td>
        <span class="alert-name">${escapeHtml(alert.alert)}</span>
        <span class="alert-meta">${escapeHtml(alert.location)}</span>
      </td>
      <td>${getPriorityBadge(alert.priority)}</td>
      <td>${getStatusBadge(alert.status)}</td>
      <td>
        <div class="row-actions">
          <button class="row-action" type="button" data-action="view" data-id="${escapeHtml(alert.id)}" aria-label="Ver detalle de la alerta ${escapeHtml(alert.id)}">Ver</button>
          ${secondAction}
        </div>
      </td>
    </tr>
  `;
}

function getEmptyStateMarkup() {
  return `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <span class="empty-state__icon" aria-hidden="true">
            <svg class="icon"><use href="#icon-search"></use></svg>
          </span>
          <p class="empty-state__title">No encontramos alertas</p>
          <p class="empty-state__text">Prueba con otros términos de búsqueda o limpia los filtros para ver nuevamente las alertas recientes.</p>
          <button class="button button--sm" type="button" data-action="clear-all">Limpiar búsqueda y filtros</button>
        </div>
      </td>
    </tr>
  `;
}

/* CA-02.2: sin alertas en el sistema -> tabla vacía con un mensaje claro y tranquilizador */
function getNoIncidentsMarkup() {
  return `
    <tr>
      <td colspan="6">
        <div class="empty-state empty-state--calm">
          <span class="empty-state__icon" aria-hidden="true">
            <svg class="icon"><use href="#icon-check"></use></svg>
          </span>
          <p class="empty-state__title">No hay incidentes de seguridad recientes</p>
          <p class="empty-state__text">La flota opera con normalidad. Las nuevas alertas aparecerán aquí automáticamente.</p>
        </div>
      </td>
    </tr>
  `;
}

function getMessageRowMarkup(title, text, withRetry) {
  const retry = withRetry
    ? '<button class="button button--sm" type="button" data-action="retry">Reintentar</button>'
    : "";

  return `
    <tr>
      <td colspan="6">
        <div class="empty-state">
          <p class="empty-state__title">${escapeHtml(title)}</p>
          <p class="empty-state__text">${escapeHtml(text)}</p>
          ${retry}
        </div>
      </td>
    </tr>
  `;
}

function updateTableSummary(count) {
  if (state.loading) {
    els.tableSummary.textContent = "Cargando alertas…";
    return;
  }

  if (state.loadError) {
    els.tableSummary.textContent = "No se pudieron cargar las alertas.";
    return;
  }

  if (alerts.length === 0) {
    els.tableSummary.textContent = "No hay incidentes de seguridad recientes.";
    return;
  }

  if (!hasActiveCriteria()) {
    const total = state.summary ? state.summary.totalAlerts : count;
    els.tableSummary.innerHTML = `Mostrando <strong>${count}</strong> de ${total} alertas totales.`;
    return;
  }

  if (count === 0) {
    els.tableSummary.textContent = "Sin resultados para los criterios seleccionados.";
    return;
  }

  const label = count === 1 ? "alerta coincide" : "alertas coinciden";
  els.tableSummary.innerHTML = `<strong>${count}</strong> ${label} con los filtros aplicados.`;
}

function renderActiveFilterChips() {
  const chips = [];

  if (state.priority) {
    chips.push(`
      <span class="filter-chip">
        Prioridad: <strong>${escapeHtml(state.priority)}</strong>
        <button type="button" data-clear-filter="priority" aria-label="Quitar filtro de prioridad ${escapeHtml(state.priority)}">
          <svg class="icon" aria-hidden="true"><use href="#icon-x"></use></svg>
        </button>
      </span>
    `);
  }

  if (state.status) {
    chips.push(`
      <span class="filter-chip">
        Estado: <strong>${escapeHtml(state.status)}</strong>
        <button type="button" data-clear-filter="status" aria-label="Quitar filtro de estado ${escapeHtml(state.status)}">
          <svg class="icon" aria-hidden="true"><use href="#icon-x"></use></svg>
        </button>
      </span>
    `);
  }

  els.filterChips.innerHTML = chips.join("");
  els.activeFilters.hidden = chips.length === 0;
  els.filterCount.textContent = String(chips.length);
  els.filterCount.hidden = chips.length === 0;
}

function renderTable() {
  const filteredAlerts = getFilteredAlerts();

  if (state.loading) {
    els.alertsBody.innerHTML = getMessageRowMarkup("Cargando alertas…", "Consultando el servidor.", false);
  } else if (state.loadError) {
    els.alertsBody.innerHTML = getMessageRowMarkup(
      "No se pudieron cargar las alertas",
      "Verifica que el backend esté activo e inténtalo nuevamente.",
      true
    );
  } else {
    els.alertsBody.innerHTML = filteredAlerts.length
      ? filteredAlerts.map(getRowMarkup).join("")
      : (alerts.length === 0 ? getNoIncidentsMarkup() : getEmptyStateMarkup());
  }

  els.visibleCount.textContent = String(filteredAlerts.length);
  els.visibleCount.setAttribute(
    "aria-label",
    `${filteredAlerts.length} ${filteredAlerts.length === 1 ? "alerta visible" : "alertas visibles"}`
  );

  updateTableSummary(filteredAlerts.length);
  renderActiveFilterChips();
}

function syncFilterControls() {
  els.filterPriority.value = state.priority;
  els.filterStatus.value = state.status;
}

function setCurrentDate() {
  try {
    const formatter = new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
    const text = formatter.format(new Date()).replaceAll(".", "");
    els.currentDate.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  } catch (error) {
    els.currentDate.textContent = new Date().toLocaleDateString("es-ES");
  }
}

/* ==========================================================================
   Sesión del usuario
   ========================================================================== */

function updateUserChip(user) {
  if (!user) {
    return;
  }

  const iniciales = user.iniciales || SistepAuth.iniciales(user.nombre, user.usuario);
  const rol = SistepAuth.rolEtiqueta(user.rol, user.rolLabel);
  const nombre = user.nombre || user.usuario || "Usuario";
  const correo = user.correo || user.usuario || "";

  els.userAvatar.textContent = iniciales;
  els.userMenuAvatar.textContent = iniciales;
  els.userName.textContent = nombre;
  els.userRole.textContent = rol;
  els.userMenuName.textContent = nombre;
  els.userMenuRole.textContent = rol;
  els.userMenuEmail.textContent = correo;
  els.userMenuToggle.setAttribute("aria-label", `Cuenta de ${nombre}, ${rol}. Abrir menú de sesión`);
}

function closeUserMenu(options = {}) {
  const { restoreFocus = false } = options;

  els.userMenu.hidden = true;
  els.userMenuToggle.setAttribute("aria-expanded", "false");
  state.userMenuOpen = false;

  if (restoreFocus) {
    els.userMenuToggle.focus();
  }
}

function openUserMenu() {
  closeAllPopovers();
  els.userMenu.hidden = false;
  els.userMenuToggle.setAttribute("aria-expanded", "true");
  state.userMenuOpen = true;

  const firstItem = els.userMenu.querySelector('[role="menuitem"]');
  if (firstItem) {
    window.requestAnimationFrame(() => firstItem.focus());
  }
}

function toggleUserMenu() {
  if (state.userMenuOpen) {
    closeUserMenu({ restoreFocus: true });
  } else {
    openUserMenu();
  }
}

async function initAuth() {
  if (!window.SistepAuth) {
    window.location.replace("login.html");
    return false;
  }

  if (!SistepAuth.requireAuth()) {
    return false;
  }

  const cached = SistepAuth.getUser();
  if (cached) {
    updateUserChip(cached);
  }

  try {
    const user = await SistepAuth.me();
    if (user) {
      updateUserChip(user);
    }
    return true;
  } catch (error) {
    // 401/403 ya redirigen al login desde auth.js.
    if (error.status === 401) {
      SistepAuth.expirarSesion();
      return false;
    }
    // Si el servidor no responde, se conserva la sesión y el usuario en caché.
    return true;
  }
}

async function logout() {
  els.logoutButton.disabled = true;
  const label = els.logoutButton.querySelector("span");
  if (label) {
    label.textContent = "Cerrando sesión…";
  }

  if (window.SistepAuth) {
    await SistepAuth.logout();
    return;
  }

  window.location.replace("login.html");
}

/* ==========================================================================
   Navegación móvil y capas flotantes
   ========================================================================== */

function setSidebarOpen(isOpen, options = {}) {
  const { restoreFocus = true } = options;

  els.sidebar.classList.toggle("is-open", isOpen);
  els.sidebarOverlay.hidden = !isOpen;
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("sidebar-open", isOpen);

  if (isOpen) {
    window.requestAnimationFrame(() => els.sidebarClose.focus());
  } else if (restoreFocus && window.matchMedia("(max-width: 1180px)").matches) {
    els.menuToggle.focus();
  }
}

function closeAllPopovers() {
  popoverPairs.forEach(({ trigger, popover }) => {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  });
}

function togglePopover(trigger, popover) {
  const shouldOpen = popover.hidden;
  closeAllPopovers();
  closeUserMenu();

  if (!shouldOpen) {
    return;
  }

  if (popover === els.filterPopover) {
    syncFilterControls();
  }

  popover.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
}

/* ==========================================================================
   Navegación entre vistas
   ========================================================================== */

function getRouteView() {
  const hash = window.location.hash.slice(1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(VIEW_META, hash) ? hash : "dashboard";
}

function setActiveView(view, options = {}) {
  const { scroll = false } = options;
  const meta = VIEW_META[view] || VIEW_META.dashboard;

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });

  document.querySelectorAll("[data-view-link]").forEach((link) => {
    const isActive = link.dataset.viewLink === view;

    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (els.topbarContext) {
    els.topbarContext.textContent = meta.context;
  }

  document.title = meta.title;
  closeAllPopovers();
  closeUserMenu();

  if (els.sidebar.classList.contains("is-open")) {
    setSidebarOpen(false, { restoreFocus: false });
  }

  if (scroll) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}

function handleRouteChange() {
  setActiveView(getRouteView(), { scroll: true });
}

function initRouter() {
  window.addEventListener("hashchange", handleRouteChange);
  setActiveView(getRouteView());
}

/* ==========================================================================
   Notificaciones
   ========================================================================== */

function showToast(message, variant = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${variant}`;
  const iconId = variant === "warning" || variant === "danger" || variant === "info"
    ? "icon-info"
    : "icon-check";

  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">
      <svg class="icon"><use href="#${iconId}"></use></svg>
    </span>
    <p></p>
  `;
  toast.querySelector("p").textContent = message;
  els.toastRegion.append(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 500);
  }, 4200);
}

/* ==========================================================================
   Acciones sobre alertas
   ========================================================================== */

function animateActiveValue() {
  const value = els.activeIncidents.closest(".stat-card__value");
  if (!value) {
    return;
  }

  value.classList.remove("is-updated");
  void value.offsetWidth;
  value.classList.add("is-updated");
}

function updateActiveStats() {
  els.activeIncidents.textContent = String(state.activeIncidents);
  els.activeAttention.textContent = state.attentionCount === 0
    ? "Sin alertas pendientes"
    : `${state.attentionCount} ${state.attentionCount === 1 ? "requiere" : "requieren"} atención`;
  animateActiveValue();
}

function normalizeDashboardAlert(item) {
  // El backend envía la fecha ISO; la tabla, el detalle y el CSV muestran DD/MM/AAAA
  return { ...item, dateIso: item.date, date: SistepApi.format.displayDate(item.date) };
}

function renderSummary() {
  const summary = state.summary;

  if (!summary) {
    return;
  }

  const trend = summary.alertsTrendPercent;
  const incidentsToday = summary.incidentsTrendToday;
  const average = summary.averageResponseMinutes;

  els.statTotal.textContent = String(summary.totalAlerts);
  els.statTotalValue.setAttribute("aria-label", `${summary.totalAlerts} alertas totales`);
  els.statNewToday.textContent = `${summary.newAlertsToday} ${summary.newAlertsToday === 1 ? "alerta nueva hoy" : "alertas nuevas hoy"}`;
  els.statTrend.textContent = `${trend > 0 ? "+" : ""}${trend}%`;
  els.statTrendIcon.style.transform = trend < 0 ? "rotate(180deg)" : "";
  els.statIncidentsToday.textContent = `${incidentsToday > 0 ? "+" : ""}${incidentsToday} hoy`;
  els.statAvg.textContent = String(average);
  els.statGoal.textContent = `Objetivo: menos de ${summary.responseGoalMinutes} min`;
  els.statResponse.textContent = average <= summary.responseGoalMinutes ? "En rango" : "Fuera de rango";

  state.activeIncidents = summary.activeIncidents;
  state.attentionCount = summary.attentionCount;
  updateActiveStats();
}

async function loadDashboard() {
  const data = await SistepApi.getDashboard();

  state.summary = data.summary;
  alerts = data.alerts.map(normalizeDashboardAlert);
  state.loading = false;
  state.loadError = false;
  renderSummary();
  renderTable();
}

async function resolveAlert(id) {
  const alert = alerts.find((item) => item.id === id);

  if (!alert || alert.status === "Resuelto") {
    return;
  }

  try {
    await SistepApi.resolverAlertaDashboard(id);
    await loadDashboard();
    showToast(`La alerta ${id} fue marcada como resuelta.`, "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

async function archiveAlert(id) {
  if (!alerts.some((item) => item.id === id)) {
    return;
  }

  try {
    await SistepApi.archivarAlertaDashboard(id);
    await loadDashboard();
    showToast(`La alerta ${id} fue cerrada y archivada.`, "success");
  } catch (error) {
    showToast(error.message, "danger");
  }
}

/* ==========================================================================
   Búsqueda y filtros
   ========================================================================== */

function clearFilterByKey(key) {
  if (key === "priority") {
    state.priority = "";
  } else if (key === "status") {
    state.status = "";
  }

  syncFilterControls();
  renderTable();
}

function resetAllFilters(options = {}) {
  const { focusSearch = false } = options;

  state.query = "";
  state.priority = "";
  state.status = "";
  els.searchInput.value = "";
  syncFilterControls();
  renderTable();
  closeAllPopovers();

  if (focusSearch) {
    els.searchInput.focus();
  }
}

function clearFilterFields() {
  state.priority = "";
  state.status = "";
  syncFilterControls();
  renderTable();
}

/* ==========================================================================
   Exportación y actualización
   ========================================================================== */

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportAlerts() {
  const visibleAlerts = getFilteredAlerts();

  if (visibleAlerts.length === 0) {
    closeAllPopovers();
    showToast("No hay alertas visibles para exportar.", "warning");
    return;
  }

  const headers = [
    "ID",
    "Fecha",
    "Hora",
    "Alerta",
    "Ubicación",
    "Dispositivo",
    "Prioridad",
    "Estado",
    "Responsable"
  ];

  const rows = visibleAlerts.map((alert) => [
    alert.id,
    alert.date,
    alert.time,
    alert.alert,
    alert.location,
    alert.device,
    alert.priority,
    alert.status,
    alert.operator
  ]);

  const csv = "\uFEFF" + [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `alertas-sistep-${today}.csv`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  closeAllPopovers();
  els.actionsToggle.focus();
  showToast(
    `${visibleAlerts.length} ${visibleAlerts.length === 1 ? "alerta exportada" : "alertas exportadas"} en formato CSV.`,
    "success"
  );
}

async function refreshDashboard() {
  if (state.refreshing) {
    return;
  }

  state.refreshing = true;
  closeAllPopovers();
  els.actionsToggle.focus();
  els.refreshButton.disabled = true;
  els.lastUpdated.textContent = "Actualizando…";
  const syncIcon = els.lastUpdated.parentElement.querySelector(".icon");
  syncIcon?.classList.add("is-spinning");

  try {
    await loadDashboard();
    els.lastUpdated.textContent = "Sincronizado ahora";
    showToast("Panel actualizado con la información más reciente.", "success");
  } catch (error) {
    state.loading = false;
    state.loadError = alerts.length === 0;
    renderTable();
    els.lastUpdated.textContent = "Error de sincronización";
    showToast(error.message, "danger");
  } finally {
    state.refreshing = false;
    els.refreshButton.disabled = false;
    syncIcon?.classList.remove("is-spinning");
  }
}

/* ==========================================================================
   Detalle de alerta
   ========================================================================== */

function openAlertDialog(id) {
  const alert = alerts.find((item) => item.id === id);

  if (!alert) {
    return;
  }

  state.activeAlertId = id;
  closeAllPopovers();

  els.dialogCode.textContent = `Alerta · ${alert.id}`;
  els.dialogTitle.textContent = alert.alert;
  els.dialogDescription.textContent = alert.description;
  els.dialogDate.textContent = alert.date;
  els.dialogTime.textContent = alert.time;
  els.dialogLocation.textContent = alert.location;
  els.dialogDevice.textContent = alert.device;
  els.dialogOperator.textContent = alert.operator;

  paintBadge(
    els.dialogPriority,
    `Prioridad ${alert.priority.toLowerCase()}`,
    priorityClasses[alert.priority] || "badge--neutral"
  );
  paintBadge(
    els.dialogStatus,
    alert.status,
    statusClasses[alert.status] || "badge--neutral"
  );

  els.dialogPrimaryAction.textContent = alert.status === "Resuelto"
    ? "Cerrar alerta"
    : "Marcar como resuelta";

  if (typeof els.alertDialog.showModal === "function") {
    els.alertDialog.showModal();
  } else {
    els.alertDialog.setAttribute("open", "");
  }
}

/* ==========================================================================
   Eventos e inicialización
   ========================================================================== */

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderTable();
  });

  els.filterToggle.addEventListener("click", () => {
    togglePopover(els.filterToggle, els.filterPopover);
  });

  els.actionsToggle.addEventListener("click", () => {
    togglePopover(els.actionsToggle, els.actionsPopover);
  });

  els.userMenuToggle.addEventListener("click", () => {
    toggleUserMenu();
  });

  els.logoutButton.addEventListener("click", () => {
    logout();
  });

  els.applyFiltersButton.addEventListener("click", () => {
    state.priority = els.filterPriority.value;
    state.status = els.filterStatus.value;
    closeAllPopovers();
    renderTable();
    els.filterToggle.focus();
  });

  els.resetFilterButton.addEventListener("click", () => {
    clearFilterFields();
  });

  els.clearFiltersButton.addEventListener("click", () => {
    resetAllFilters();
  });

  els.activeFilters.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-clear-filter]");
    if (removeButton) {
      clearFilterByKey(removeButton.dataset.clearFilter);
    }
  });

  els.alertsBody.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");

    if (!actionButton) {
      return;
    }

    const { action, id } = actionButton.dataset;

    if (action === "view") {
      openAlertDialog(id);
    } else if (action === "resolve") {
      resolveAlert(id);
    } else if (action === "close") {
      archiveAlert(id);
    } else if (action === "clear-all") {
      resetAllFilters({ focusSearch: true });
    } else if (action === "retry") {
      refreshDashboard();
    }
  });

  els.exportButton.addEventListener("click", exportAlerts);
  els.refreshButton.addEventListener("click", refreshDashboard);

  document.querySelectorAll("[data-close-popover]").forEach((button) => {
    button.addEventListener("click", () => {
      closeAllPopovers();
      els.filterToggle.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".popover-anchor")) {
      closeAllPopovers();
    }
    if (!event.target.closest(".user-menu-anchor")) {
      closeUserMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (state.userMenuOpen) {
      closeUserMenu({ restoreFocus: true });
      return;
    }

    const openPair = popoverPairs.find(({ popover }) => !popover.hidden);
    if (openPair) {
      closeAllPopovers();
      openPair.trigger.focus();
      return;
    }

    if (els.sidebar.classList.contains("is-open") && !els.alertDialog.open) {
      setSidebarOpen(false);
    }
  });

  els.menuToggle.addEventListener("click", () => {
    setSidebarOpen(!els.sidebar.classList.contains("is-open"));
  });

  els.sidebarClose.addEventListener("click", () => {
    setSidebarOpen(false);
  });

  els.sidebarOverlay.addEventListener("click", () => {
    setSidebarOpen(false);
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (els.sidebar.classList.contains("is-open")) {
        setSidebarOpen(false, { restoreFocus: false });
      }
    });
  });

  document.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    els.mainContent.focus();
  });

  document.querySelectorAll("[data-dialog-close]").forEach((button) => {
    button.addEventListener("click", () => {
      els.alertDialog.close();
    });
  });

  els.alertDialog.addEventListener("click", (event) => {
    if (event.target === els.alertDialog) {
      els.alertDialog.close();
    }
  });

  els.dialogPrimaryAction.addEventListener("click", () => {
    const alert = alerts.find((item) => item.id === state.activeAlertId);

    if (!alert) {
      els.alertDialog.close();
      return;
    }

    const shouldArchive = alert.status === "Resuelto";
    els.alertDialog.close();

    if (shouldArchive) {
      archiveAlert(alert.id);
    } else {
      resolveAlert(alert.id);
    }
  });

  const desktopViewport = window.matchMedia("(min-width: 1181px)");
  const closeSidebarOnDesktop = (event) => {
    if (event.matches) {
      setSidebarOpen(false, { restoreFocus: false });
    }
  };

  if (typeof desktopViewport.addEventListener === "function") {
    desktopViewport.addEventListener("change", closeSidebarOnDesktop);
  } else {
    desktopViewport.addListener(closeSidebarOnDesktop);
  }
}

async function init() {
  setCurrentDate();
  syncFilterControls();
  renderTable();
  bindEvents();
  initRouter();

  if (!(await initAuth())) {
    return;
  }

  try {
    await loadDashboard();
    els.lastUpdated.textContent = "Sincronizado ahora";
  } catch (error) {
    state.loading = false;
    state.loadError = true;
    renderTable();
    els.lastUpdated.textContent = "Sin conexión con el servidor";
    showToast(error.message, "danger");
  }
}

init();
