"use strict";

/* ==========================================================================
   SISTEP · Tema claro / oscuro (HU-10)
   - Se carga en <head> SIN defer para aplicar el tema antes del primer pintado (sin parpadeo).
   - Orden de decisión: preferencia guardada por la persona > preferencia del sistema > claro.
   - El alternador es un <button role="switch"> accesible por teclado (Tab + Espacio/Enter).
   ========================================================================== */
(function () {
  const KEY = "sistep.tema";
  const consulta = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function leer() {
    try {
      const valor = window.localStorage.getItem(KEY);
      return valor === "dark" || valor === "light" ? valor : null;
    } catch (error) {
      return null; // almacenamiento bloqueado: se usa la preferencia del sistema
    }
  }

  function actual() {
    return leer() || (consulta && consulta.matches ? "dark" : "light");
  }

  function aplicar(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", tema === "dark" ? "#0b1220" : "#1e3a8a");
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((boton) => {
      boton.setAttribute("aria-checked", String(tema === "dark"));
      const texto = boton.querySelector("[data-theme-label]");
      if (texto) {
        texto.textContent = tema === "dark" ? "Modo oscuro: activado" : "Modo oscuro: desactivado";
      }
    });
  }

  function fijar(tema) {
    try {
      window.localStorage.setItem(KEY, tema);
    } catch (error) {
      /* sin acción: el cambio sigue valiendo durante la sesión de la página */
    }
    aplicar(tema);
    document.dispatchEvent(new CustomEvent("sistep:tema", { detail: { tema } }));
  }

  aplicar(actual());

  document.addEventListener("DOMContentLoaded", () => {
    aplicar(actual());
    document.querySelectorAll("[data-theme-toggle]").forEach((boton) => {
      boton.addEventListener("click", () => {
        const nuevo = actual() === "dark" ? "light" : "dark";
        fijar(nuevo);
        // Retroalimentación para lectores de pantalla (UX-06)
        const region = document.getElementById("toastRegion") || document.getElementById("themeStatus");
        if (region && region.id === "themeStatus") {
          region.textContent = nuevo === "dark" ? "Modo oscuro activado." : "Modo claro activado.";
        }
      });
    });
  });

  const alCambiarSistema = () => { if (!leer()) { aplicar(actual()); } };
  if (consulta) {
    if (consulta.addEventListener) { consulta.addEventListener("change", alCambiarSistema); }
    else if (consulta.addListener) { consulta.addListener(alCambiarSistema); }
  }

  window.SistepTheme = { actual, fijar };
})();
