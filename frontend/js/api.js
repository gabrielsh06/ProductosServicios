"use strict";

/* ==========================================================================
   SISTEP · Cliente HTTP del contrato INTEGRACION_BACKEND.md v1.0
   - Mismo origen (recomendado): API_BASE = "/api".
   - Puertos separados: definir antes de cargar este archivo
       window.SISTEP_API_BASE = "http://localhost:3000/api";
   ========================================================================== */
(function () {
  const API_BASE = window.SISTEP_API_BASE
    || (window.location.protocol === "file:" ? "http://localhost:8000/api/v1" : "/api");

  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const pad = (value) => String(value).padStart(2, "0");
  const isoLocal = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  /* El backend solo envía fechas ISO; las etiquetas visibles se construyen aquí. */
  const format = {
    displayDate(iso) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
      return match ? `${match[3]}/${match[2]}/${match[1]}` : String(iso || "");
    },
    relativeLabel(iso, time) {
      const today = new Date();
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      if (iso === isoLocal(today)) {
        return `Hoy · ${time}`;
      }
      if (iso === isoLocal(yesterday)) {
        return `Ayer · ${time}`;
      }
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
      return match ? `${match[3]} ${MONTHS[Number(match[2]) - 1]} · ${time}` : `${iso} · ${time}`;
    },
    todayIso() {
      return isoLocal(new Date());
    },
    isoDaysAgo(days) {
      const now = new Date();
      return isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
    }
  };

  async function request(method, path, body) {
    const options = { method, headers: {} };
    const auth = window.SistepAuth;
    const token = auth ? auth.getToken() : null;

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    } else if (auth) {
      auth.expirarSesion();
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }

    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(API_BASE + path, options);
    } catch (error) {
      throw new Error("No se pudo conectar con el servidor. Verifica que el backend esté activo.");
    }

    if (response.status === 204) {
      return null;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      const info = data && data.error ? data.error : {};

      // Sesión vencida, token revocado o cuenta deshabilitada: volver al login.
      if (response.status === 401 || info.code === "USER_INACTIVE") {
        if (auth) {
          auth.expirarSesion();
        }
      }

      // Contrato: { error: { code, message, fields? } }; el toast muestra error.message
      const failure = new Error(info.message || "No se pudo completar la operación.");
      failure.status = response.status;
      failure.code = info.code;
      failure.fields = info.fields;
      throw failure;
    }

    return data;
  }

  /* Descarga binaria (PDF de evidencia): misma autenticación y mismo formato de error que request(). */
  async function requestBlob(path) {
    const auth = window.SistepAuth;
    const token = auth ? auth.getToken() : null;

    if (!token && auth) {
      auth.expirarSesion();
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }

    let response;
    try {
      response = await fetch(API_BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch (error) {
      throw new Error("No se pudo conectar con el servidor. Verifica que el backend esté activo.");
    }

    if (!response.ok) {
      let info = {};
      try {
        info = (await response.json()).error || {};
      } catch (error) {
        info = {};
      }
      if (response.status === 401 && auth) {
        auth.expirarSesion();
      }
      const failure = new Error(info.message || "No se pudo generar el archivo.");
      failure.status = response.status;
      throw failure;
    }

    return response.blob();
  }

  const id = encodeURIComponent;

  window.SistepApi = {
    format,
    getDashboard: () => request("GET", "/dashboard"),
    resolverAlertaDashboard: (alertId) => request("PATCH", `/dashboard/alertas/${id(alertId)}`, { status: "Resuelto" }),
    archivarAlertaDashboard: (alertId) => request("DELETE", `/dashboard/alertas/${id(alertId)}`),
    getAlertas: () => request("GET", "/alertas"),
    notificarPnp: (alertId) => request("POST", `/alertas/${id(alertId)}/notificar-pnp`),
    descartarAlerta: (alertId) => request("DELETE", `/alertas/${id(alertId)}`),
    panico: (busId, latitud, longitud) => request("POST", "/alertas/panico", { bus_id: busId, latitud, longitud }),
    descargarEvidencia: (alertId) => requestBlob(`/alertas/${id(alertId)}/evidencia`),
    getFlota: () => request("GET", "/flota"),
    cambiarEstadoFlota: (bus, online) => request("PUT", `/flota/${id(bus)}`, { online }),
    getIncidentes: () => request("GET", "/incidentes"),
    getReportes: (rango) => request("GET", `/reportes?rango=${id(rango)}`),
    getConfiguracion: () => request("GET", "/configuracion"),
    guardarConfiguracion: (config) => request("PUT", "/configuracion", config)
  };
})();
