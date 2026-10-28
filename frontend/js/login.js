"use strict";

/* ==========================================================================
   SISTEP · Lógica de la pantalla de login
   ========================================================================== */
(function () {
  const form = document.getElementById("loginForm");
  const usuarioInput = document.getElementById("usuario");
  const passwordInput = document.getElementById("password");
  const usuarioField = document.getElementById("usuarioField");
  const passwordField = document.getElementById("passwordField");
  const recordarInput = document.getElementById("recordar");
  const submitButton = document.getElementById("loginButton");
  const submitLabel = submitButton.querySelector(".auth-submit__label");
  const alertBox = document.getElementById("loginAlert");
  const alertTitle = document.getElementById("loginAlertTitle");
  const alertText = document.getElementById("loginAlertText");
  const alertIcon = alertBox.querySelector(".auth-alert__icon use");
  const togglePassword = document.getElementById("togglePassword");
  const capsWarning = document.getElementById("capsWarning");
  const demoButtons = document.querySelectorAll("[data-usuario][data-password]");

  function mostrarAlerta(titulo, texto, variante = "danger") {
    alertBox.hidden = false;
    alertBox.classList.remove("auth-alert--info", "auth-alert--warning");
    if (variante === "info") {
      alertBox.classList.add("auth-alert--info");
    } else if (variante === "warning") {
      alertBox.classList.add("auth-alert--warning");
    }
    alertIcon.setAttribute("href", variante === "info" ? "#icon-shield" : "#icon-alert");
    alertTitle.textContent = titulo;
    alertText.textContent = texto;
  }

  function ocultarAlerta() {
    alertBox.hidden = true;
  }

  function marcarCampo(campo, input, invalido) {
    campo.classList.toggle("is-invalid", invalido);
    input.setAttribute("aria-invalid", invalido ? "true" : "false");
  }

  function limpiarErrores() {
    ocultarAlerta();
    marcarCampo(usuarioField, usuarioInput, false);
    marcarCampo(passwordField, passwordInput, false);
  }

  function setCargando(cargando) {
    submitButton.disabled = cargando;
    submitButton.classList.toggle("is-loading", cargando);
    submitButton.setAttribute("aria-busy", cargando ? "true" : "false");
    submitLabel.textContent = cargando ? "Verificando credenciales…" : "Ingresar al panel";
    form.setAttribute("aria-busy", cargando ? "true" : "false");
  }

  function errorDeLogin(error) {
    if (error.status === 401) {
      marcarCampo(usuarioField, usuarioInput, true);
      marcarCampo(passwordField, passwordInput, true);
      return {
        titulo: "Credenciales inválidas",
        texto: "El usuario o la contraseña no son correctos. Tu usuario se conservó: revisa la contraseña e inténtalo de nuevo.",
        variante: "danger"
      };
    }
    if (error.status === 429) {
      return { titulo: "Acceso bloqueado temporalmente", texto: error.message, variante: "warning" };
    }
    if (error.status === 403) {
      return { titulo: "Cuenta deshabilitada", texto: error.message, variante: "warning" };
    }
    if (error.status === 422) {
      return {
        titulo: "Revisa los datos",
        texto: "Completa el usuario y la contraseña con un formato válido.",
        variante: "warning"
      };
    }
    return {
      titulo: "No pudimos iniciar sesión",
      texto: error.message || "Ocurrió un error inesperado. Inténtalo nuevamente.",
      variante: "danger"
    };
  }

  function irAlPanel() {
    window.location.replace("index.html#dashboard");
  }

  async function comprobarSesionExistente() {
    if (!SistepAuth.hasSession()) {
      return false;
    }

    try {
      await SistepAuth.me();
      irAlPanel();
      return true;
    } catch (error) {
      // 401 ya limpia la sesión en auth.js. Si el servidor no responde,
      // se permite reintentar el login sin borrar el token guardado.
      return false;
    }
  }

  function mensajeDesdeUrl() {
    const parametros = new URLSearchParams(window.location.search);

    if (parametros.has("expired")) {
      mostrarAlerta(
        "Tu sesión expiró",
        "Por seguridad, vuelve a ingresar tus credenciales para continuar.",
        "warning"
      );
    } else if (parametros.has("logout")) {
      mostrarAlerta("Sesión cerrada", "Cerraste sesión correctamente. Puedes volver a ingresar cuando lo necesites.", "info");
    }
  }

  function configurarPassword() {
    togglePassword.addEventListener("click", () => {
      const oculto = passwordInput.type === "password";
      passwordInput.type = oculto ? "text" : "password";
      togglePassword.setAttribute("aria-pressed", String(oculto));
      togglePassword.setAttribute("aria-label", oculto ? "Ocultar contraseña" : "Mostrar contraseña");
      togglePassword.querySelector("use").setAttribute("href", oculto ? "#icon-eye-off" : "#icon-eye");
      passwordInput.focus();
    });

    const revisarBloqMayus = (event) => {
      if (typeof event.getModifierState !== "function") {
        return;
      }
      capsWarning.hidden = !event.getModifierState("CapsLock");
    };

    passwordInput.addEventListener("keydown", revisarBloqMayus);
    passwordInput.addEventListener("keyup", revisarBloqMayus);
    passwordInput.addEventListener("blur", () => {
      capsWarning.hidden = true;
    });
  }

  function configurarDemo() {
    demoButtons.forEach((boton) => {
      boton.addEventListener("click", () => {
        usuarioInput.value = boton.dataset.usuario || "";
        passwordInput.value = boton.dataset.password || "";
        limpiarErrores();
        passwordInput.focus();
        submitButton.focus();
      });
    });
  }

  function configurarFormulario() {
    [usuarioInput, passwordInput].forEach((input) => {
      input.addEventListener("input", () => {
        limpiarErrores();
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const usuario = usuarioInput.value.trim();
      const password = passwordInput.value;

      ocultarAlerta();
      marcarCampo(usuarioField, usuarioInput, false);
      marcarCampo(passwordField, passwordInput, false);

      if (!usuario) {
        marcarCampo(usuarioField, usuarioInput, true);
        mostrarAlerta("Falta tu usuario", "Ingresa tu nombre de usuario o correo institucional.", "warning");
        usuarioInput.focus();
        return;
      }

      if (!password) {
        marcarCampo(passwordField, passwordInput, true);
        mostrarAlerta("Falta tu contraseña", "Ingresa tu contraseña para continuar.", "warning");
        passwordInput.focus();
        return;
      }

      setCargando(true);

      try {
        await SistepAuth.login(usuario, password, recordarInput.checked);
        irAlPanel();
      } catch (error) {
        const info = errorDeLogin(error);
        mostrarAlerta(info.titulo, info.texto, info.variante);
        if (error.status === 401) {
          passwordInput.select();
        }
        setCargando(false);
      }
    });
  }

  async function init() {
    configurarPassword();
    configurarDemo();
    configurarFormulario();

    if (await comprobarSesionExistente()) {
      return;
    }

    mensajeDesdeUrl();
    window.requestAnimationFrame(() => usuarioInput.focus());
  }

  init();
})();
