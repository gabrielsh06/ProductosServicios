# SISTEP · Frontend del Panel de Seguridad

Prototipo funcional del panel de seguridad construido únicamente con **HTML, CSS y JavaScript nativo**, sin frameworks, sin librerías y sin proceso de compilación. Incluye el dashboard y los módulos de Alertas, Incidentes, Reportes y Configuración.

## Cómo abrir

La forma recomendada es levantar el backend (ver `../README.md`), que sirve el frontend en `http://localhost:3000`.
La primera pantalla es `login.html`; sin sesión, `index.html` redirige allí.

También puedes servir esta carpeta con un servidor estático para revisar el diseño:

```powershell
python -m http.server 5500
```

Luego visita `http://localhost:5500/login.html`. Para que el login funcione contra un backend en otro puerto,
define `window.SISTEP_API_BASE = "http://localhost:3000/api";` antes de cargar `js/auth.js` y `js/api.js`.

## Estructura

```text
.
├── index.html          # Shell, cinco vistas, diálogos y sprite de iconos SVG
├── login.html          # Pantalla de inicio de sesión
├── css/
│   ├── global.css      # Tokens de color, reset, shell, botones y modales
│   ├── auth.css        # Estilos del login (layout, formulario y responsive)
│   ├── dashboard.css   # Indicadores, tabla, filtros y responsive del panel
│   └── views.css       # Alertas, incidentes, reportes, configuración e impresión
├── js/
│   ├── auth.js         # Sesión: token, usuario, guardas y logout
│   ├── login.js        # Validación y envío del formulario de login
│   ├── api.js          # Cliente HTTP con Authorization: Bearer
│   ├── app.js          # Dashboard, notificaciones y router por hash
│   └── views.js        # Lógica de las cuatro vistas secundarias
├── assets/
│   └── favicon.svg
└── README.md
```

## Autenticación

- `/login.html` es la entrada al sistema. `index.html` redirige al login si no hay una sesión guardada.
- El token se guarda en `localStorage` si se marca «Mantener sesión activa»; si no, en `sessionStorage`.
- `js/api.js` agrega `Authorization: Bearer <token>` a todas las llamadas y regresa al login ante un `401`.
- El menú de la cuenta (arriba a la derecha) muestra el usuario, su rol y la opción «Cerrar sesión».
- Cuentas demo: `admin`, `acastro` y `cmendez`, todas con `Sistep2026!` (ver `../README.md`).

## Paleta

| Uso | Color |
| --- | --- |
| Principal | `#1E3A8A` |
| Acento | `#0F766E` |
| Alerta / peligro | `#DC2626` |
| Fondo | `#F9FAFB` |
| Texto | `#111827` |

Los tokens están definidos en `css/global.css` dentro de `:root`. Los colores semánticos de apoyo (éxito, advertencia, bordes y textos secundarios) también están centralizados allí.

## Navegación

La aplicación es una SPA con rutas por hash. El menú lateral y los botones Atrás/Adelante del navegador funcionan sin recargar la página:

| Vista | Ruta |
| --- | --- |
| Dashboard | `#dashboard` |
| Alertas | `#alertas` |
| Incidentes | `#incidentes` |
| Reportes y Estadísticas | `#reportes` |
| Configuración del Sistema | `#configuracion` |

El router actualiza el panel visible, el enlace activo, `aria-current`, el contexto del topbar y el título del documento.

## Funcionalidad incluida

### Dashboard

- Búsqueda por ID, alerta, ubicación, estado o responsable (sin distinguir acentos).
- Filtros por prioridad y estado, con chips de filtros activos.
- Detalle de cada alerta en un diálogo accesible.
- Acciones para resolver, cerrar y archivar alertas de la muestra.
- Exportación CSV de los resultados visibles.

### Alertas

- Bandeja dividida con tres alertas de ejemplo y detalle sincronizado.
- Mapa y evidencia de cámara como recursos visuales de demostración.
- «Notificar PNP 105» deriva la alerta y deshabilita la acción.
- «Descartar (falso positivo)» retira la alerta y actualiza los contadores.
- Estado vacío cuando ya no quedan alertas pendientes.

### Incidentes

- Historial con seis registros, búsqueda sin acentos y filtros por fecha, tipo, estado y operador.
- Paginación, tamaño de página y resumen de resultados.
- Modal con metadatos y bitácora de auditoría de cada incidente.
- Exportación CSV y PDF (mediante el diálogo de impresión del navegador).

### Reportes y Estadísticas

- Rangos de 7, 30 y 90 días con periodos calculados dinámicamente.
- Gráfico de barras, dona de resolución y gráfico de línea generados con SVG/CSS nativo.
- Exportación PDF y Excel (archivo `.xls` con tabla HTML compatible).

### Configuración del Sistema

- Umbral de confianza con slider, detecciones activas y modelo seleccionable.
- Protocolos de alerta y contacto PNP con validación.
- Tabla de cámaras, alta de dispositivos con validación de Bus ID y duplicados.
- Estado de cambios sin guardar, guardado simulado y restauración con «Cancelar».

### Comportamiento general

- Actualización simulada y notificaciones tipo toast.
- Navegación responsive con menú lateral deslizante.
- Tablas con desplazamiento horizontal contenido en pantallas pequeñas.
- Estados vacíos, foco visible y soporte para `prefers-reduced-motion`.
- Estilos de impresión para guardar las vistas como PDF.

## Datos de demostración

Los datos ya no viven en el frontend: el backend los siembra en el primer arranque y los entrega por el API.
El dashboard muestra 7 alertas recientes, la bandeja 3 alertas, el historial 6 incidentes y la configuración
3 cámaras. Puedes reiniciar esos datos con `python seed_demo.py` desde `backend/`.

## Integración con el backend

El frontend consume el API descrito en `INTEGRACION_BACKEND.md` mediante `js/api.js` (objeto global `SistepApi`).
Dashboard, alertas, incidentes, reportes y configuración se cargan al iniciar y al volver a cada vista. Las fechas
llegan en ISO y se formatean en el navegador. Las peticiones incluyen el token de `js/auth.js`.
Si el backend no responde, cada vista muestra un mensaje de error y los toasts muestran `error.message`.
Ver `../README.md` para ponerlo en marcha.
