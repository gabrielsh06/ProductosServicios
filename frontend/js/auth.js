"use strict";

/* ==========================================================================
   SISTEP · Sesión del usuario
   Guarda el token en localStorage (recordar sesión) o sessionStorage.
   ========================================================================== */
(function () {
  const API_BASE = window.SISTEP_API_BASE
    || (window.location.protocol === "file:" ? "http://localhost:8000/api/v1/auth/login" : "/api");
  const STORAGE_KEY = "sistep.auth.session";

  function leerStorage(storage) {
    try {
      return storage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function escribirStorage(storage, valor) {
    try {
      storage.setItem(STORAGE_KEY, valor);
    } catch (error) {
      /* modo privado o almacenamiento bloqueado */
    }
  }

  function borrarStorage(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* sin acción */
    }
  }

  function limpiar() {
    borrarStorage(window.localStorage);
    borrarStorage(window.sessionStorage);
  }

  function getSession() {
    const raw = leerStorage(window.localStorage) || leerStorage(window.sessionStorage);

    if (!raw) {
      return null;
    }

    try {
      const sesion = JSON.parse(raw);
      if (!sesion || !sesion.token) {
        limpiar();
        return null;
      }
      if (sesion.expiresAt && Date.parse(sesion.expiresAt) <= Date.now()) {
        limpiar();
        return null;
      }
      return sesion;
    } catch (error) {
      limpiar();
      return null;
    }
  }

  function guardarSesion(datos, recordar) {
    const sesion = {
      token: datos.token,
      user: datos.user,
      expiresAt: datos.expiresAt || null
    };
    const valor = JSON.stringify(sesion);

    limpiar();
    escribirStorage(recordar ? window.localStorage : window.sessionStorage, valor);
    return sesion;
  }

  function actualizarUsuario(user) {
    const sesion = getSession();

    if (!sesion || !user) {
      return;
    }

    sesion.user = user;
    const valor = JSON.stringify(sesion);
    if (leerStorage(window.localStorage)) {
      escribirStorage(window.localStorage, valor);
    } else {
      escribirStorage(window.sessionStorage, valor);
    }
  }

  function getToken() {
    const sesion = getSession();
    return sesion ? sesion.token : null;
  }

  function getUser() {
    const sesion = getSession();
    return sesion ? sesion.user || null : null;
  }

  function hasSession() {
    return Boolean(getToken());
  }

  function crearError(data, response) {
    const info = data && data.error ? data.error : {};
    const failure = new Error(info.message || "No se pudo completar la operación.");
    failure.status = response.status;
    failure.code = info.code;
    failure.fields = info.fields;
    return failure;
  }

  async function login(usuario, password, recordar) {
    let response;

    try {
      response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password, recordar: Boolean(recordar) })
      });
    } catch (error) {
      throw new Error("No se pudo conectar con el servidor. Verifica que el backend esté activo.");
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw crearError(data, response);
    }

    if (!data || !data.token) {
      throw new Error("El servidor no devolvió una sesión válida.");
    }

    guardarSesion(data, recordar);
    return data;
  }

  async function me() {
    const token = getToken();

    if (!token) {
      return null;
    }

    let response;

    try {
      response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      throw new Error("No se pudo conectar con el servidor. Verifica que el backend esté activo.");
    }

    if (response.status === 401) {
      limpiar();
      const failure = new Error("La sesión expiró. Vuelve a iniciar sesión.");
      failure.status = 401;
      throw failure;
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      throw crearError(data, response);
    }

    if (data && data.user) {
      actualizarUsuario(data.user);
      return data.user;
    }

    return null;
  }

  async function logout() {
    const token = getToken();

    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        /* El token local se borra igualmente. */
      }
    }

    limpiar();
    window.location.replace("login.html?logout=1");
  }

  function expirarSesion() {
    limpiar();
    if (!/login\.html$/i.test(window.location.pathname)) {
      window.location.replace("login.html?expired=1");
    }
  }

  function requireAuth() {
    if (!hasSession()) {
      window.location.replace("login.html");
      return false;
    }
    return true;
  }

  function iniciales(nombre, usuario) {
    const partes = String(nombre || "")
      .replace(/\./g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const valor = partes.slice(0, 2).map((parte) => parte.charAt(0)).join("");
    return (valor || String(usuario || "US").slice(0, 2)).toUpperCase();
  }

  function rolEtiqueta(rol, rolLabel) {
    if (rolLabel) {
      return rolLabel;
    }
    const etiquetas = { admin: "Administrador", operador: "Operador" };
    return etiquetas[rol] || "Usuario";
  }

  window.SistepAuth = {
    apiBase: API_BASE,
    getSession,
    getToken,
    getUser,
    hasSession,
    login,
    me,
    logout,
    expirarSesion,
    requireAuth,
    iniciales,
    rolEtiqueta
  };
})();
