# SISTEP · Contrato de integración Frontend → Backend

**Versión:** 1.0  
**Fecha:** 25/10/2026  
**Estado:** cerrado para el MVP  
**Autoridad:** este documento es la fuente de verdad de la integración

El frontend ya está terminado y funciona con datos de demostración en memoria. Para conectarlo no hay que rediseñar vistas ni cambiar flujos: el backend debe entregar exactamente los JSON descritos aquí y aceptar las acciones indicadas.

## Reglas de oro

1. Las rutas, los nombres de campos y los valores de estado son literales. No usar `snake_case`, traducciones ni alias.
2. No envolver las respuestas en `data`, `result` o `payload`. Cada endpoint devuelve directamente el objeto o arreglo indicado.
3. Los listados de Alertas e Incidentes devuelven todos los registros del MVP. El frontend busca, filtra y pagina en el navegador.
4. No devolver `null` en campos obligatorios. Usar `""` para textos vacíos y `[]` para listas vacías.
5. El backend no decide qué se muestra: el frontend ya tiene las vistas, filtros, paginación, modales y exportaciones.
6. Cualquier cambio de contrato se acuerda antes. El frontend no se adapta a nombres alternativos.

---

## 1. URL base y red

### Recomendado: mismo origen

Servir el frontend y exponer el backend detrás del mismo dominio, con el API bajo `/api`:

```text
Frontend: https://sistep.ejemplo.com
Backend:  https://sistep.ejemplo.com/api
```

La integración usará una única base:

```js
const API_BASE = "/api";
```

### Desarrollo en puertos separados

```text
Frontend: http://localhost:5500
Backend:  http://localhost:3000
API base: http://localhost:3000/api
```

En este caso el backend **debe habilitar CORS**. Abrir `index.html` con `file://` no es recomendable; usar un servidor estático.

### CORS obligatorio si hay orígenes distintos

El origen del frontend de desarrollo debe estar permitido:

```http
Access-Control-Allow-Origin: http://localhost:5500
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

Requisitos:

- Responder `OPTIONS` con `204` y sin cuerpo.
- Permitir el origen real de producción mediante variable de entorno; no dejar `*` en producción si luego se usan credenciales.
- No usar cookies ni `credentials: "include"` en el MVP.
- No redirigir las llamadas del API (por ejemplo, de `/api/alertas` a `/api/alertas/`), porque el navegador puede perder el CORS.
- Devolver siempre JSON en errores del API, nunca una página HTML.

### Autenticación

El frontend ya incluye pantalla de login (`/login.html`). Desde esta versión, **todas las rutas de datos requieren** la cabecera:

```http
Authorization: Bearer <token>
```

Endpoints públicos: `GET /api/health` y `POST /api/auth/login`. El resto devuelve `401` si falta el token o es inválido; el frontend borra la sesión y vuelve al login.

```http
POST /api/auth/login
Content-Type: application/json

{ "usuario": "acastro", "password": "********", "recordar": true }
```

```json
{
  "token": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 28800,
  "expiresAt": "2026-10-27T21:00:00+00:00",
  "user": {
    "id": "USR-002", "usuario": "acastro", "nombre": "Ana Castro",
    "correo": "ana.castro@sistep.pe", "rol": "operador",
    "rolLabel": "Operador", "iniciales": "AC", "activo": true, "ultimoAcceso": ""
  }
}
```

- `GET /api/auth/me` devuelve `{ "user": { ... } }` y sirve para validar la sesión al abrir el panel.
- `POST /api/auth/logout` devuelve `204` y revoca el token en el servidor.
- Errores de autenticación: `401` (`MISSING_TOKEN`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`), `403` (`USER_INACTIVE`) y `429` (`TOO_MANY_ATTEMPTS`).
- No se usan cookies ni `credentials: "include"`; el token viaja en `Authorization`.
- Tras 5 intentos fallidos por IP + usuario se bloquea el login durante 5 minutos (configurable).

---

## 2. Convenciones de datos

### Formato

- `Content-Type: application/json; charset=utf-8`.
- UTF-8 y acentos correctos (`Cámara`, `En revisión`, `Méndez`).
- IDs siempre como texto, nunca como número.
- Booleanos reales (`true` / `false`), no `"true"` ni `1`.
- Números enteros para conteos, porcentajes y valores de gráficos.

### Fechas y horas

| Campo | Formato | Ejemplo |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | `2026-10-25` |
| `time` | `HH:mm` (24 h) | `09:42` |
| `clock` | `HH:mm:ss` (24 h) | `09:42:18` |

- Zona horaria de referencia: `America/Lima` (UTC-5).
- El backend **nunca** envía etiquetas como `Hoy`, `Ayer`, `24/10/2026` ni `09:42 a. m.`. El frontend construye esas etiquetas para la pantalla.
- Las fechas de filtros y comparaciones son siempre ISO: `YYYY-MM-DD`.
- `date` y `time` de un mismo evento deben corresponder al mismo instante local.

### IDs

| Recurso | Formato de ejemplo | Ejemplos actuales |
| --- | --- | --- |
| Alerta del dashboard | texto | `HU-03`, `HU-04` |
| Alerta de la bandeja | `AL-###` | `AL-021`, `AL-020` |
| Incidente | `INC-###` | `INC-024`, `INC-023` |
| Bus | `BUS-###` o `BUS-####` | `BUS-302`, `BUS-118` |
| Cámara/dispositivo | texto | `CAM-001`, `SEN-014` |

Los IDs son inmutables. El backend los genera; el frontend no los inventa.

### Orden de las listas

- Dashboard: alertas más recientes primero.
- Bandeja de alertas: más recientes primero. La primera queda seleccionada por defecto.
- Incidentes: más recientes primero.
- Auditoría de un incidente: del evento más antiguo al más reciente.
- Cámaras: cualquier orden estable; se recomienda por `bus`.

### Estados permitidos

Cada vista usa su propio enum. **No normalizar ni traducir estos valores.**

| Vista | Campo | Valores exactos |
| --- | --- | --- |
| Dashboard | `alerts[].status` | `Pendiente`, `En proceso`, `Resuelto` |
| Bandeja de alertas | `status` | `Pendiente`, `En revisión`, `Derivado PNP` |
| Incidentes | `status` | `Cerrado`, `Derivado`, `Resuelto` |

El frontend muestra `Derivado` como **Derivado PNP 105** en la tabla de incidentes. El backend debe enviar el valor de enum `Derivado`, no la etiqueta visual.

También son literales:

- Prioridad: `Alta`, `Media`, `Baja`.
- Tipo de alerta/incidente: `Forcejeo`, `Arma detectada`, `Alerta manual`, `Sospechoso`.
- Origen de alerta: `IA`, `Operador`.
- Origen de incidente: `IA · Edge`, `Operador`.

### Filtros del frontend

En el MVP, el frontend filtra en memoria. Por eso:

- `GET /api/alertas` e `GET /api/incidentes` deben devolver el arreglo completo.
- No se enviarán parámetros `q`, `page`, `limit`, `sort`, `desde` ni `hasta`.
- No implementar paginación del lado del servidor todavía.

Los selects de Incidentes tienen valores fijos. Para el MVP, el backend debe usar solo estos:

- Tipos: `Forcejeo`, `Arma detectada`, `Alerta manual`, `Sospechoso`.
- Operadores: `Operador A`, `Operador B`, `Operador C`.
- Estados: `Cerrado`, `Derivado`, `Resuelto`.

Si el backend necesita más tipos u operadores, primero se acuerda con el frontend para hacer los filtros dinámicos.

---

## 3. Resumen de endpoints

| # | Método | Ruta | Uso | Respuesta |
| --- | --- | --- | --- | --- |
| 1 | `GET` | `/api/dashboard` | Cargar y refrescar el dashboard | `200` objeto |
| 2 | `PATCH` | `/api/dashboard/alertas/:id` | Marcar alerta como resuelta | `200` alerta |
| 3 | `DELETE` | `/api/dashboard/alertas/:id` | Cerrar y archivar alerta | `204` |
| 4 | `GET` | `/api/alertas` | Cargar bandeja de alertas | `200` arreglo |
| 5 | `POST` | `/api/alertas/:id/notificar-pnp` | Derivar alerta a PNP 105 | `200` alerta |
| 6 | `DELETE` | `/api/alertas/:id` | Descartar falso positivo | `204` |
| 7 | `GET` | `/api/incidentes` | Cargar historial de incidentes | `200` arreglo |
| 8 | `GET` | `/api/reportes?rango=30` | Cargar estadísticas de 7/30/90 días | `200` objeto |
| 9 | `GET` | `/api/configuracion` | Cargar configuración y cámaras | `200` objeto |
| 10 | `PUT` | `/api/configuracion` | Guardar configuración y cámaras | `200` objeto |

No se necesitan endpoints de detalle: el listado de incidentes ya incluye la auditoría y el modal se alimenta con esos datos.

Las alertas del dashboard (`/api/dashboard/alertas`) y las de la bandeja (`/api/alertas`) son dos recursos distintos en este MVP. No mezclar sus IDs, campos ni estados entre sí.

### Orden sugerido de implementación

1. Crear la base de datos, la configuración de CORS y las rutas.
2. Implementar los cinco `GET`: dashboard, alertas, incidentes, reportes y configuración.
3. Implementar las cuatro acciones: resolver, archivar, notificar PNP y descartar alerta.
4. Implementar `PUT /api/configuracion` con validación y persistencia de cámaras.
5. Probar errores, reinicio del servidor y checklist de aceptación.

No empezar por login, filtros del servidor, paginación ni exportaciones: no forman parte de esta conexión.

---

## 4. Dashboard

### `GET /api/dashboard`

Devuelve el resumen operativo y las **7 alertas más recientes** para la tabla del dashboard.

```json
{
  "summary": {
    "totalAlerts": 42,
    "newAlertsToday": 8,
    "alertsTrendPercent": 12,
    "activeIncidents": 15,
    "attentionCount": 4,
    "incidentsTrendToday": 3,
    "averageResponseMinutes": 4,
    "responseGoalMinutes": 5
  },
  "alerts": [
    {
      "id": "HU-03",
      "date": "2026-10-24",
      "time": "09:42",
      "alert": "Alerta de Cámara 1",
      "location": "Cámara IP · Acceso norte",
      "device": "CAM-001",
      "priority": "Alta",
      "status": "En proceso",
      "operator": "Carlos Méndez",
      "description": "Se detectó una persona en una zona restringida del acceso norte. La grabación fue verificada por el equipo de vigilancia y el caso se encuentra en revisión."
    }
  ]
}
```

#### Campos de `summary`

| Campo | Tipo | Uso |
| --- | --- | --- |
| `totalAlerts` | entero | Total histórico de alertas del dashboard |
| `newAlertsToday` | entero | Alertas nuevas del día |
| `alertsTrendPercent` | entero | Variación porcentual de alertas; puede ser negativo |
| `activeIncidents` | entero | Incidentes activos |
| `attentionCount` | entero | Alertas que requieren atención |
| `incidentsTrendToday` | entero | Incidentes nuevos hoy; puede ser negativo |
| `averageResponseMinutes` | número | Tiempo promedio de respuesta en minutos |
| `responseGoalMinutes` | número | Objetivo de tiempo de respuesta en minutos |

No hardcodear estos valores: se calculan desde los datos reales.

#### Campos de cada alerta

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Único |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:mm` |
| `alert` | string | Nombre visible de la alerta |
| `location` | string | Ubicación legible |
| `device` | string | Código del dispositivo |
| `priority` | enum | `Alta`, `Media`, `Baja` |
| `status` | enum | `Pendiente`, `En proceso`, `Resuelto` |
| `operator` | string | Responsable; usar `Sin asignar` si no hay |
| `description` | string | Texto del modal de detalle |

`alerts` debe tener como máximo 7 elementos. Si hay menos, se muestran menos.

### `PATCH /api/dashboard/alertas/:id`

Marca una alerta como resuelta. Es la acción **Resolver** de la tabla y del modal.

```http
PATCH /api/dashboard/alertas/HU-03
Content-Type: application/json

{
  "status": "Resuelto"
}
```

- Solo se acepta `status: "Resuelto"`; cualquier otro valor devuelve `422`.
- Si ya estaba resuelta, responder `200` con la alerta actualizada (idempotente).
- Si no existe, `404`.
- Después de responder, el frontend vuelve a pedir `GET /api/dashboard` para actualizar los contadores.

Respuesta `200`: el objeto de alerta actualizado, con la misma forma del listado.

### `DELETE /api/dashboard/alertas/:id`

Cierra y archiva una alerta. Es la acción **Cerrar** que aparece cuando el estado ya es `Resuelto`.

- Respuesta correcta: `204 No Content`, sin cuerpo.
- Es idempotente: si ya no existe, también puede devolver `204`.
- Debe ser un borrado lógico o un archivado; no debe reaparecer en `GET /api/dashboard`.
- El frontend vuelve a pedir `GET /api/dashboard` después de la acción.

---

## 5. Bandeja de alertas

### `GET /api/alertas`

Devuelve el arreglo completo, ordenado del más reciente al más antiguo.

```json
[
  {
    "id": "AL-021",
    "title": "Forcejeo detectado",
    "summary": "Posible forcejeo en la unidad BUS-302.",
    "bus": "BUS-302",
    "type": "Forcejeo",
    "source": "IA",
    "priority": "Alta",
    "status": "Pendiente",
    "date": "2026-10-25",
    "time": "09:42",
    "clock": "09:42:18",
    "location": "Av. Javier Prado Este, San Isidro",
    "mapStreet": "Av. Javier Prado Este",
    "mapDistrict": "San Isidro",
    "evidenceCaption": "Captura IA · BUS-302"
  }
]
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Formato `AL-###` |
| `title` | string | Título corto del panel derecho |
| `summary` | string | Resumen de la tarjeta |
| `bus` | string | Unidad, formato `BUS-###`/`BUS-####` |
| `type` | enum | Uno de los cuatro tipos permitidos |
| `source` | enum | `IA` u `Operador` |
| `priority` | enum | `Alta`, `Media`, `Baja` |
| `status` | enum | `Pendiente`, `En revisión`, `Derivado PNP` |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:mm` |
| `clock` | string | `HH:mm:ss`, usado en la marca de la evidencia |
| `location` | string | Ubicación completa |
| `mapStreet` | string | Línea principal del mapa |
| `mapDistrict` | string | Distrito |
| `evidenceCaption` | string | Leyenda bajo la evidencia |

El frontend arma la etiqueta visible (`Hoy · 09:42`, `Ayer · 21:16`, etc.) a partir de `date` y `time`. El backend no envía etiquetas de fecha.

La primera alerta del arreglo queda seleccionada automáticamente. No enviar alertas ya descartadas.

### `POST /api/alertas/:id/notificar-pnp`

Deriva la alerta a la PNP 105. Es el botón **Notificar PNP 105**.

- Sin cuerpo de solicitud (o cuerpo `{}`).
- Cambia el estado a `Derivado PNP`.
- Respuesta `200`: la alerta actualizada con la misma forma del listado.
- Si ya estaba en `Derivado PNP`, responder `200` con la alerta actual (idempotente).
- Si no existe, `404`.
- Si falla el envío externo real, responder `502` y **no** cambiar el estado.
- Para el MVP se puede usar un stub de la notificación externa; lo importante es que el cambio de estado quede persistido.
- El frontend deshabilita el botón cuando el estado ya es `Derivado PNP`.

### `DELETE /api/alertas/:id`

Descarta una alerta por falso positivo. Es el botón **Descartar (falso positivo)**.

- Respuesta correcta: `204 No Content`.
- Borrado lógico/archivado: no debe reaparecer en `GET /api/alertas`.
- Idempotente.
- El frontend actualiza sus contadores después de la acción.

---

## 6. Incidentes

### `GET /api/incidentes`

Devuelve el arreglo completo, ordenado del más reciente al más antiguo. Cada objeto incluye la información del modal y su auditoría.

```json
[
  {
    "id": "INC-024",
    "date": "2026-10-24",
    "time": "09:42",
    "bus": "BUS-302",
    "type": "Forcejeo",
    "operator": "Operador A",
    "status": "Derivado",
    "resolution": "Forcejeo confirmado",
    "source": "IA · Edge",
    "location": "Av. Javier Prado Este, San Isidro",
    "description": "La cámara Edge AI detectó un forcejeo entre dos pasajeros. El operador validó la evidencia y el caso fue derivado a la PNP 105.",
    "audit": [
      {
        "title": "Detección automática",
        "date": "2026-10-24",
        "time": "09:42",
        "text": "El modelo de IA registró la alerta con 93% de confianza."
      }
    ]
  }
]
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Formato `INC-###` |
| `date` | string | `YYYY-MM-DD`; usado por los filtros de fecha |
| `time` | string | `HH:mm` |
| `bus` | string | Unidad |
| `type` | enum | Tipo permitido |
| `operator` | enum | Operador A/B/C en el MVP |
| `status` | enum | `Cerrado`, `Derivado`, `Resuelto` |
| `resolution` | string | Texto corto de resolución |
| `source` | string | `IA · Edge` u `Operador` |
| `location` | string | Ubicación completa |
| `description` | string | Descripción del modal |
| `audit` | arreglo | Bitácora cronológica ascendente |

Cada entrada de `audit`:

| Campo | Tipo |
| --- | --- |
| `title` | string |
| `date` | string (`YYYY-MM-DD`) |
| `time` | string (`HH:mm`) |
| `text` | string |

El frontend formatea `date` y `time` para mostrar la fecha de auditoría. `audit` puede ser `[]`, pero se recomienda que cada incidente tenga al menos un evento.

No se necesita `GET /api/incidentes/:id`: el modal usa los datos ya recibidos.

No hay acciones de escritura en esta vista. **Ver** y **Auditar** solo abren el modal; la exportación CSV y el PDF se generan en el navegador.

---

## 7. Reportes y estadísticas

### `GET /api/reportes?rango=30`

Parámetro:

- `rango`: `7`, `30` o `90`.
- Si se omite, usar `30`.
- Cualquier otro valor devuelve `422`.

Ejemplo para `rango=30`:

```json
{
  "total": 42,
  "change": 8,
  "types": [
    { "label": "Forcejeo", "value": 18 },
    { "label": "Alerta manual", "value": 9 },
    { "label": "Sospechoso", "value": 8 },
    { "label": "Arma detectada", "value": 7 }
  ],
  "statuses": [
    { "label": "Resueltos", "value": 26, "color": "#0F766E" },
    { "label": "Derivados a PNP", "value": 9, "color": "#1E3A8A" },
    { "label": "Cerrados", "value": 7, "color": "#CBD5E1" }
  ],
  "trend": {
    "labels": ["30 sep", "05 oct", "10 oct", "15 oct", "20 oct", "25 oct"],
    "values": [6, 7, 6, 8, 7, 8]
  }
}
```

Reglas:

- `total` es la cantidad de incidentes del rango.
- `types` suma exactamente `total`.
- `statuses` suma exactamente `total`.
- `statuses` debe traer **siempre** las tres categorías, en este orden y con estos colores:
  1. `Resueltos` → incidentes con estado `Resuelto`, color `#0F766E`.
  2. `Derivados a PNP` → incidentes con estado `Derivado`, color `#1E3A8A`.
  3. `Cerrados` → incidentes con estado `Cerrado`, color `#CBD5E1`.
- `change` es un entero con signo: porcentaje de variación frente al periodo anterior equivalente. Puede ser negativo.
- `trend.labels` y `trend.values` deben tener la misma longitud, con al menos 2 puntos.
- Las etiquetas de tendencia usan el formato `DD mmm` con meses en español y sin punto: `ene`, `feb`, `mar`, `abr`, `may`, `jun`, `jul`, `ago`, `sep`, `oct`, `nov`, `dic`.
- No se exige una cantidad fija de puntos. Para replicar el diseño actual se pueden usar 7 puntos diarios para 7 días, 6 puntos de 5 días para 30 días y 10 puntos para 90 días.
- No devolver los totales demo fijos (42/138): se calculan desde los incidentes reales.
- El backend es la fuente de verdad del reporte; el frontend solo dibuja los valores.

> El frontend actual no tiene un estado vacío de reportes. Para el MVP, el backend debe garantizar al menos un incidente en cada rango (7, 30 y 90 días). Si en producción un rango queda sin datos, se acordará un estado vacío antes de liberar.

---

## 8. Configuración y cámaras

Las cámaras forman parte del recurso de configuración. **No se necesitan endpoints separados `/api/camaras` en el MVP.**

### `GET /api/configuracion`

Siempre devuelve todos los campos, incluso si el usuario nunca guardó nada.

```json
{
  "confidence": 85,
  "detectForce": true,
  "detectWeapons": true,
  "detectObjects": false,
  "activeModel": "v1.8.0-prod",
  "notifyPnp": true,
  "soundAlarm": false,
  "pnpContact": "105",
  "cameras": [
    { "bus": "BUS-302", "model": "Cámara v3", "active": true },
    { "bus": "BUS-118", "model": "Cámara v2", "active": true },
    { "bus": "BUS-207", "model": "Cámara v2", "active": false }
  ]
}
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `confidence` | entero | `0` a `100` |
| `detectForce` | booleano | Detección de forcejeos |
| `detectWeapons` | booleano | Detección de armas |
| `detectObjects` | booleano | Detección de objetos |
| `activeModel` | enum | `v1.8.0-prod`, `v1.8.0-beta`, `v1.7.6-prod` |
| `notifyPnp` | booleano | Notificación automática a PNP |
| `soundAlarm` | booleano | Alarma sonora remota |
| `pnpContact` | string | Solo dígitos, 3 a 6 caracteres; conservar ceros iniciales |
| `cameras` | arreglo | Cámaras registradas |

Cada cámara:

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `bus` | string | `^BUS-\d{3,4}$`, único, en mayúsculas |
| `model` | enum | `Cámara v2`, `Cámara v3` |
| `active` | booleano | Estado de conexión |

### `PUT /api/configuracion`

Guarda **toda** la configuración. El cuerpo es el mismo objeto completo del `GET`.

```json
{
  "confidence": 85,
  "detectForce": true,
  "detectWeapons": true,
  "detectObjects": false,
  "activeModel": "v1.8.0-prod",
  "notifyPnp": true,
  "soundAlarm": false,
  "pnpContact": "105",
  "cameras": [
    { "bus": "BUS-302", "model": "Cámara v3", "active": true }
  ]
}
```

Comportamiento:

- Reemplaza la configuración anterior y sincroniza la colección de cámaras con el arreglo enviado: crea las nuevas y actualiza las existentes.
- No duplicar cámaras con el mismo `bus`.
- Validar el formato de `bus`, el modelo, el contacto y el umbral.
- Si hay datos inválidos, `422` y no guardar nada.
- Si hay un `bus` duplicado, `409`.
- Respuesta `200`: el objeto completo guardado, con la misma forma del `GET`.
- La operación debe ser atómica: no guardar la mitad de la configuración.

### Flujo de «Agregar cámara» en el frontend

1. El usuario abre el modal, ingresa el Bus ID y elige el modelo.
2. El frontend valida el formato y los duplicados.
3. La cámara se agrega en memoria y aparece en la tabla.
4. El usuario pulsa **Guardar cambios**.
5. El frontend envía `PUT /api/configuracion` con la lista de cámaras completa, incluida la nueva.
6. El backend persiste la nueva cámara.

Por eso **no hace falta** `POST /api/camaras` para esta entrega. El botón **Cancelar** restaura la última configuración recibida y no llama al backend.

---

## 9. Errores

Todas las respuestas de error deben ser JSON con esta forma:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los datos enviados.",
    "fields": {
      "pnpContact": "Debe tener entre 3 y 6 dígitos."
    }
  }
}
```

- `message` debe ser un texto en español apto para mostrar en un toast.
- `fields` es opcional; se usa para validaciones por campo.
- No devolver HTML, trazas de error ni páginas de framework.

| HTTP | `code` sugerido | Cuándo |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | JSON inválido o malformado |
| `404` | `NOT_FOUND` | Recurso inexistente |
| `409` | `CONFLICT` | Cámara duplicada u operación incompatible |
| `422` | `VALIDATION_ERROR` | Campos inválidos o enum no permitido |
| `500` | `INTERNAL_ERROR` | Error no controlado |
| `502` | `PNP_NOTIFICATION_FAILED` | Falló el envío externo a PNP |

El frontend mostrará `error.message`. Si no hay conexión o la respuesta no es JSON, mostrará un mensaje genérico.

---

## 10. Fuera de alcance del MVP

No implementar todavía:

| Elemento | Motivo |
| --- | --- |
| Login, JWT obligatorio, cookies o sesiones | El frontend no tiene pantalla de login |
| Filtros, búsqueda o paginación en el servidor | El frontend ya los hace en memoria |
| `GET /api/incidentes/:id` | El listado ya trae la auditoría completa |
| `GET`, `POST` o `PATCH /api/camaras` | Las cámaras se guardan dentro de `/api/configuracion` |
| Exportaciones CSV, PDF o Excel en el servidor | Se generan en el navegador |
| WebSockets, SSE o polling automático | El frontend refresca por acción o con el botón **Actualizar** |
| Carga de imágenes o videos de evidencia | La evidencia actual es visual; no hay `input` de archivos |
| Coordenadas o mapas reales | Solo se usan `mapStreet` y `mapDistrict` como texto |
| Crear incidentes automáticamente al resolver o derivar alertas | El frontend no lo espera en el MVP |

---

## 11. Datos de prueba

Usar como base los arreglos demo que ya existen en el repositorio:

- `js/app.js` → alertas del dashboard.
- `js/views.js` → bandeja de alertas, incidentes, reportes y cámaras.

Al sembrar la base:

- Convertir `date` a `YYYY-MM-DD`, `time` a `HH:mm` y `clock` a `HH:mm:ss`.
- No usar las fechas de demostración como constantes en el código.
- No hardcodear los totales del dashboard ni de reportes; calcularlos.
- Asegurar datos en los tres rangos de reportes (7, 30 y 90 días).
- Mantener al menos 3 alertas en la bandeja y 3 cámaras para ver la interfaz completa.
- Cargar los 6 incidentes demo como mínimo; si se siembran más, el reporte debe reflejar ese total real.
- Mantener los tipos, operadores y estados permitidos por los selects actuales.

---

## 12. Criterios de aceptación

El backend se considera conectado cuando se cumple todo esto:

### Red y formato

- [ ] Todos los paths responden bajo `/api` con los métodos indicados.
- [ ] Las respuestas son JSON UTF-8 y usan exactamente los nombres del contrato.
- [ ] `OPTIONS` funciona para todos los endpoints si el frontend está en otro origen.
- [ ] No hay `401` ni redirecciones.
- [ ] Los datos persisten después de reiniciar el backend.

### Dashboard

- [ ] `GET /api/dashboard` carga los indicadores y hasta 7 alertas.
- [ ] La búsqueda y los filtros por prioridad/estado funcionan sobre esos datos.
- [ ] **Resolver** cambia el estado a `Resuelto` y el dashboard se refresca.
- [ ] **Cerrar** archiva la alerta y desaparece después de refrescar.
- [ ] **Actualizar** vuelve a consultar el endpoint y muestra el estado real.

### Alertas

- [ ] `GET /api/alertas` llena la bandeja y el detalle.
- [ ] La primera alerta aparece seleccionada.
- [ ] **Notificar PNP 105** deja el estado en `Derivado PNP` y deshabilita el botón.
- [ ] **Descartar (falso positivo)** elimina la alerta de la bandeja.
- [ ] El estado vacío aparece cuando no quedan alertas.

### Incidentes

- [ ] Se muestran todos los incidentes, con fecha ISO y auditoría.
- [ ] Los filtros de fecha, tipo, estado y operador devuelven resultados correctos.
- [ ] La paginación de 5/10/25 y el modal **Ver/Auditar** funcionan.
- [ ] La exportación CSV y el PDF siguen funcionando con los datos reales.

### Reportes

- [ ] Los rangos 7, 30 y 90 días consultan `GET /api/reportes?rango=...`.
- [ ] `total`, `change`, tipos, estados y tendencia se dibujan sin errores.
- [ ] Los totales coinciden con los incidentes del rango; no son valores fijos.
- [ ] La exportación Excel y el PDF siguen funcionando.

### Configuración

- [ ] `GET /api/configuracion` llena todos los controles y las cámaras.
- [ ] **Guardar cambios** persiste umbral, detecciones, modelo, protocolos y contacto.
- [ ] **Cancelar** restaura la última configuración guardada.
- [ ] Agregar una cámara válida y guardar la deja persistida al recargar.
- [ ] Un Bus ID duplicado o inválido no se guarda.
- [ ] Los valores `pnpContact` se conservan como texto.

### Errores

- [ ] Un `422` muestra un mensaje comprensible y no rompe la vista.
- [ ] Un `404`, `500` o backend caído no deja la interfaz bloqueada.
- [ ] Un error nunca se responde con `200`.

---

## 13. Entrega esperada del backend

Antes de probar con el frontend, el backend debe entregar:

1. URL base exacta de desarrollo y producción.
2. CORS configurado para el origen del frontend.
3. Los 10 endpoints implementados con persistencia real (no solo memoria).
4. Datos semilla mínimos.
5. Una colección de Postman, archivo `.http` o ejemplos de `curl` para probar cada endpoint.
6. Confirmación de que `OPTIONS` y los errores también devuelven JSON.

Con eso, la integración del frontend consiste únicamente en cambiar los arreglos demo por llamadas `fetch` a estas rutas. No se cambia el diseño, la navegación ni las interacciones existentes.
