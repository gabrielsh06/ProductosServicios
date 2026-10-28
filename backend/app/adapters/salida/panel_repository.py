"""ADAPTADOR de salida: persistencia del panel (PostgreSQL) según INTEGRACION_BACKEND.md v1.0.
Los nombres de campo del JSON son literales del contrato (camelCase); las columnas SQL van en español.
Fechas y horas se guardan como texto ISO (YYYY-MM-DD, HH:mm) porque el contrato las exige así."""
import json
import re
from datetime import datetime, timedelta, timezone
from app.infrastructure.db import Database
from app.infrastructure.errores import ApiError

LIMA = timezone(timedelta(hours=-5))          # America/Lima (sin horario de verano)
TIPOS = ["Forcejeo", "Arma detectada", "Alerta manual", "Sospechoso"]
MODELOS_IA = ["v1.8.0-prod", "v1.8.0-beta", "v1.7.6-prod"]
MODELOS_CAMARA = ["Cámara v2", "Cámara v3"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
RE_BUS = re.compile(r"^BUS-\d{3,4}$")
RE_PNP = re.compile(r"^\d{3,6}$")
CONFIG_DEFECTO = {"confidence": 85, "detectForce": True, "detectWeapons": True, "detectObjects": False,
                  "activeModel": "v1.8.0-prod", "notifyPnp": True, "soundAlarm": False, "pnpContact": "105"}
TABLAS = ["panel_dash_alertas", "panel_alertas", "panel_incidentes", "panel_config", "panel_camaras",
          "panel_flota", "panel_alertas_gps"]
# Coordenadas de las alertas demo (Lima). Sirven para los metadatos GPS de la evidencia (HU-08).
GPS_DEMO = {"AL-019": (-12.0464, -77.0428), "AL-020": (-12.0850, -77.0340), "AL-021": (-12.0911, -77.0230)}


def _ahora():
    return datetime.now(LIMA)


def _ph(n):
    return ",".join(["%s"] * n)


def _ddl():
    return [
        """CREATE TABLE IF NOT EXISTS panel_dash_alertas(
             id TEXT PRIMARY KEY, fecha TEXT NOT NULL, hora TEXT NOT NULL, alerta TEXT NOT NULL,
             ubicacion TEXT NOT NULL, dispositivo TEXT NOT NULL, prioridad TEXT NOT NULL, estado TEXT NOT NULL,
             operador TEXT NOT NULL, descripcion TEXT NOT NULL, response_minutes DOUBLE PRECISION,
             archivada INTEGER NOT NULL DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS panel_alertas(
             id TEXT PRIMARY KEY, titulo TEXT NOT NULL, resumen TEXT NOT NULL, bus TEXT NOT NULL, tipo TEXT NOT NULL,
             origen TEXT NOT NULL, prioridad TEXT NOT NULL, estado TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL,
             reloj TEXT NOT NULL, ubicacion TEXT NOT NULL, mapa_calle TEXT NOT NULL, mapa_distrito TEXT NOT NULL,
             evidencia TEXT NOT NULL, descartada INTEGER NOT NULL DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS panel_incidentes(
             id TEXT PRIMARY KEY, fecha TEXT NOT NULL, hora TEXT NOT NULL, bus TEXT NOT NULL, tipo TEXT NOT NULL,
             operador TEXT NOT NULL, estado TEXT NOT NULL, resolucion TEXT NOT NULL, origen TEXT NOT NULL,
             ubicacion TEXT NOT NULL, descripcion TEXT NOT NULL, auditoria TEXT NOT NULL)""",
        "CREATE TABLE IF NOT EXISTS panel_config(id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS panel_camaras(bus TEXT PRIMARY KEY, modelo TEXT NOT NULL, activa INTEGER NOT NULL)",
        # HU-09: estado de conexión de cada unidad Edge AI (conectado=1 / 0) y su última señal
        "CREATE TABLE IF NOT EXISTS panel_flota(bus TEXT PRIMARY KEY, conectado INTEGER NOT NULL, ultima_senal TEXT NOT NULL)",
        # HU-08: coordenadas GPS asociadas a cada alerta de la bandeja
        "CREATE TABLE IF NOT EXISTS panel_alertas_gps(alerta_id TEXT PRIMARY KEY, latitud DOUBLE PRECISION, longitud DOUBLE PRECISION)",
    ]


class PanelRepository:
    def __init__(self, db: Database):
        self.db = db

    # ------------------------------------------------------------ inicialización y semillas
    def inicializar(self):
        with self.db.transaction() as c:
            for sentencia in _ddl():
                c.execute(sentencia)
            if c.scalar("SELECT COUNT(*) FROM panel_dash_alertas") == 0:
                self._sembrar(c)
            self._completar_demo(c)

    def reiniciar_demo(self):
        """Borra las tablas del panel y las vuelve a sembrar con fechas relativas a hoy."""
        with self.db.transaction() as c:
            for t in TABLAS:
                c.execute(f"DROP TABLE IF EXISTS {t}")
        self.inicializar()

    def _completar_demo(self, c):
        """Idempotente: crea el estado de flota y el GPS demo que falten (también en BDs ya existentes)."""
        ahora = _ahora().isoformat(timespec="seconds")
        for r in c.all("SELECT bus, activa FROM panel_camaras"):
            if not c.one("SELECT bus FROM panel_flota WHERE bus=%s", (r["bus"],)):
                c.execute("INSERT INTO panel_flota VALUES (%s, %s, %s)", (r["bus"], 1 if r["activa"] else 0, ahora))
        for alerta_id, (lat, lon) in GPS_DEMO.items():
            if c.one("SELECT id FROM panel_alertas WHERE id=%s", (alerta_id,)) and \
                    not c.one("SELECT alerta_id FROM panel_alertas_gps WHERE alerta_id=%s", (alerta_id,)):
                c.execute("INSERT INTO panel_alertas_gps VALUES (%s, %s, %s)", (alerta_id, lat, lon))

    def _sembrar(self, c):
        # Fechas RELATIVAS a hoy (el contrato prohíbe fechas de demostración fijas)
        ahora = _ahora()
        hoy = ahora.date()
        dash = [  # id, minutos atrás, alerta, ubicación, dispositivo, prioridad, estado, operador, resp.min
            ("HU-07", 3, "Alerta de Cámara 3", "Cámara IP · Pasillo central", "CAM-003", "Media", "Pendiente", "Sin asignar", None),
            ("HU-06", 11, "Forcejeo detectado", "BUS-302 · Av. Javier Prado", "CAM-002", "Alta", "Pendiente", "Sin asignar", None),
            ("HU-05", 19, "Alerta de Cámara 2", "Cámara IP · Acceso sur", "CAM-002", "Baja", "En proceso", "Lucía Torres", None),
            ("HU-04", 28, "Sospechoso en unidad", "BUS-118 · Av. Arequipa", "SEN-014", "Media", "En proceso", "Carlos Méndez", None),
            ("HU-03", 41, "Alerta de Cámara 1", "Cámara IP · Acceso norte", "CAM-001", "Alta", "En proceso", "Carlos Méndez", None),
            ("HU-02", 57, "Alerta de Cámara 4", "Cámara IP · Estacionamiento", "CAM-004", "Baja", "Resuelto", "Lucía Torres", 5),
            ("HU-01", 75, "Arma detectada", "BUS-207 · Av. Tacna", "CAM-005", "Alta", "Resuelto", "Carlos Méndez", 3),
        ]
        for i, mins, alerta, ub, dev, pri, est, op, resp in dash:
            t = ahora - timedelta(minutes=mins)
            c.execute(f"INSERT INTO panel_dash_alertas VALUES ({_ph(11)}, 0)",
                      (i, t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), alerta, ub, dev, pri, est, op,
                       f"{alerta} registrada en {ub}. El equipo de vigilancia revisa la evidencia.", resp))

        band = [  # id, horas atrás, título, bus, tipo, origen, prioridad, estado, calle, distrito
            ("AL-019", 20, "Sospechoso detectado", "BUS-207", "Sospechoso", "Operador", "Media", "Pendiente", "Av. Tacna", "Cercado de Lima"),
            ("AL-020", 5, "Arma detectada", "BUS-118", "Arma detectada", "IA", "Alta", "En revisión", "Av. Arequipa", "Lince"),
            ("AL-021", 0.2, "Forcejeo detectado", "BUS-302", "Forcejeo", "IA", "Alta", "Pendiente", "Av. Javier Prado Este", "San Isidro"),
        ]
        for i, h, tit, bus, tipo, org, pri, est, calle, dist in band:
            t = ahora - timedelta(hours=h)
            c.execute(f"INSERT INTO panel_alertas VALUES ({_ph(15)}, 0)",
                      (i, tit, f"Posible {tipo.lower()} en la unidad {bus}.", bus, tipo, org, pri, est,
                       t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), t.strftime("%H:%M:%S"),
                       f"{calle}, {dist}", calle, dist, f"Captura {org} · {bus}"))

        inc = [  # id, días atrás, hora, bus, tipo, operador, estado, resolución, origen, ubicación
            ("INC-006", 0, "09:42", "BUS-302", "Forcejeo", "Operador A", "Derivado", "Forcejeo confirmado", "IA · Edge", "Av. Javier Prado Este, San Isidro"),
            ("INC-005", 1, "21:16", "BUS-118", "Arma detectada", "Operador B", "Derivado", "Arma confirmada", "IA · Edge", "Av. Arequipa, Lince"),
            ("INC-004", 3, "14:05", "BUS-207", "Alerta manual", "Operador C", "Resuelto", "Atendido en ruta", "Operador", "Av. Tacna, Cercado de Lima"),
            ("INC-003", 6, "07:30", "BUS-302", "Sospechoso", "Operador A", "Cerrado", "Falso positivo", "IA · Edge", "Av. Brasil, Jesús María"),
            ("INC-002", 12, "18:22", "BUS-118", "Forcejeo", "Operador B", "Resuelto", "Pasajeros separados", "IA · Edge", "Av. Abancay, Cercado de Lima"),
            ("INC-001", 40, "11:10", "BUS-207", "Sospechoso", "Operador C", "Cerrado", "Sin novedad", "Operador", "Av. Venezuela, Breña"),
        ]
        for i, d, h, bus, tipo, op, est, res, org, ub in inc:
            f = (hoy - timedelta(days=d)).isoformat()
            audit = [{"title": "Detección automática" if org != "Operador" else "Registro manual", "date": f, "time": h,
                      "text": "El sistema registró el evento y lo envió a la bandeja de alertas."},
                     {"title": "Revisión del operador", "date": f, "time": h,
                      "text": f"{op} validó la evidencia y registró: {res}."}]
            c.execute(f"INSERT INTO panel_incidentes VALUES ({_ph(12)})",
                      (i, f, h, bus, tipo, op, est, res, org, ub,
                       f"{tipo} reportado en {bus}. Resolución: {res}.", json.dumps(audit, ensure_ascii=False)))

        c.execute("INSERT INTO panel_config VALUES (1, %s)", (json.dumps(CONFIG_DEFECTO),))
        for bus, mod, act in [("BUS-302", "Cámara v3", 1), ("BUS-118", "Cámara v2", 1), ("BUS-207", "Cámara v2", 0)]:
            c.execute("INSERT INTO panel_camaras VALUES (%s, %s, %s)", (bus, mod, act))

    # ------------------------------------------------------------ serializadores (nombres del contrato)
    @staticmethod
    def _dash(r):
        return {"id": r["id"], "date": r["fecha"], "time": r["hora"], "alert": r["alerta"],
                "location": r["ubicacion"], "device": r["dispositivo"], "priority": r["prioridad"],
                "status": r["estado"], "operator": r["operador"] or "Sin asignar",
                "description": r["descripcion"] or ""}

    @staticmethod
    def _band(r):
        return {"id": r["id"], "title": r["titulo"], "summary": r["resumen"], "bus": r["bus"], "type": r["tipo"],
                "source": r["origen"], "priority": r["prioridad"], "status": r["estado"], "date": r["fecha"],
                "time": r["hora"], "clock": r["reloj"], "location": r["ubicacion"], "mapStreet": r["mapa_calle"],
                "mapDistrict": r["mapa_distrito"], "evidenceCaption": r["evidencia"]}

    @staticmethod
    def _inc(r):
        return {"id": r["id"], "date": r["fecha"], "time": r["hora"], "bus": r["bus"], "type": r["tipo"],
                "operator": r["operador"], "status": r["estado"], "resolution": r["resolucion"],
                "source": r["origen"], "location": r["ubicacion"], "description": r["descripcion"],
                "audit": json.loads(r["auditoria"])}

    # ------------------------------------------------------------ 1-3. Dashboard
    def dashboard(self):
        hoy = _ahora().date()
        h, ayer = hoy.isoformat(), (hoy - timedelta(days=1)).isoformat()
        with self.db.transaction() as c:
            total = c.scalar("SELECT COUNT(*) FROM panel_dash_alertas")
            nuevas = c.scalar("SELECT COUNT(*) FROM panel_dash_alertas WHERE fecha=%s AND archivada=0", (h,))
            ayer_n = c.scalar("SELECT COUNT(*) FROM panel_dash_alertas WHERE fecha=%s AND archivada=0", (ayer,))
            activos = c.scalar("SELECT COUNT(*) FROM panel_dash_alertas WHERE archivada=0 AND estado<>'Resuelto'")
            atencion = c.scalar("SELECT COUNT(*) FROM panel_dash_alertas WHERE archivada=0 AND estado='Pendiente'")
            inc_hoy = c.scalar("SELECT COUNT(*) FROM panel_incidentes WHERE fecha=%s", (h,))
            prom = c.scalar("SELECT AVG(response_minutes) FROM panel_dash_alertas WHERE response_minutes IS NOT NULL")
            filas = c.all("SELECT * FROM panel_dash_alertas WHERE archivada=0 "
                          "ORDER BY fecha DESC, hora DESC, id DESC LIMIT 7")
        tendencia = round((nuevas - ayer_n) * 100 / ayer_n) if ayer_n else 0
        return {"summary": {"totalAlerts": total, "newAlertsToday": nuevas, "alertsTrendPercent": tendencia,
                            "activeIncidents": activos, "attentionCount": atencion,
                            "incidentsTrendToday": inc_hoy,
                            "averageResponseMinutes": round(float(prom), 1) if prom is not None else 0,
                            "responseGoalMinutes": 5},
                "alerts": [self._dash(r) for r in filas]}

    def resolver_dashboard(self, alerta_id, body):
        if not isinstance(body, dict) or body.get("status") != "Resuelto":
            raise ApiError(422, "VALIDATION_ERROR", "Solo se permite el estado «Resuelto».",
                           {"status": "Valor no permitido."})
        with self.db.transaction() as c:
            r = c.one("SELECT * FROM panel_dash_alertas WHERE id=%s AND archivada=0", (alerta_id,))
            if not r:
                raise ApiError(404, "NOT_FOUND", "La alerta no existe.")
            if r["estado"] != "Resuelto":  # idempotente: si ya estaba resuelta no se toca
                creada = datetime.strptime(f"{r['fecha']} {r['hora']}", "%Y-%m-%d %H:%M").replace(tzinfo=LIMA)
                minutos = max(1, round((_ahora() - creada).total_seconds() / 60))
                c.execute("UPDATE panel_dash_alertas SET estado='Resuelto', response_minutes=%s WHERE id=%s",
                          (minutos, alerta_id))
            return self._dash(c.one("SELECT * FROM panel_dash_alertas WHERE id=%s", (alerta_id,)))

    def archivar_dashboard(self, alerta_id):
        with self.db.transaction() as c:   # borrado lógico e idempotente
            c.execute("UPDATE panel_dash_alertas SET archivada=1 WHERE id=%s", (alerta_id,))

    # ------------------------------------------------------------ 4-6. Bandeja de alertas
    def alertas(self):
        with self.db.transaction() as c:
            filas = c.all("SELECT * FROM panel_alertas WHERE descartada=0 ORDER BY fecha DESC, reloj DESC, id DESC")
        return [self._band(r) for r in filas]

    def notificar_pnp(self, alerta_id):
        with self.db.transaction() as c:
            r = c.one("SELECT * FROM panel_alertas WHERE id=%s AND descartada=0", (alerta_id,))
            if not r:
                raise ApiError(404, "NOT_FOUND", "La alerta no existe.")
            if r["estado"] != "Derivado PNP":
                # STUB del envío externo a la Central PNP 105 (si fallara: ApiError 502 sin cambiar el estado)
                c.execute("UPDATE panel_alertas SET estado='Derivado PNP' WHERE id=%s", (alerta_id,))
            return self._band(c.one("SELECT * FROM panel_alertas WHERE id=%s", (alerta_id,)))

    def descartar_alerta(self, alerta_id):
        with self.db.transaction() as c:
            c.execute("UPDATE panel_alertas SET descartada=1 WHERE id=%s", (alerta_id,))

    def crear_alerta_ia(self, bus, lat=None, lon=None):
        """Puente HU-01: una predicción de agresión del Random Forest aparece en la bandeja del panel."""
        t = _ahora()
        ubic = f"GPS {lat:.4f}, {lon:.4f}" if lat is not None and lon is not None else "Ubicación no disponible"
        with self.db.transaction() as c:
            if self.db.postgres:  # evita dos IDs iguales si llegan eventos simultáneos
                c.execute("LOCK TABLE panel_alertas IN SHARE ROW EXCLUSIVE MODE")
            n = c.scalar("SELECT COALESCE(MAX(CAST(SUBSTR(id, 4) AS INTEGER)), 0) FROM panel_alertas") + 1
            nuevo = f"AL-{n:03d}"
            c.execute(f"INSERT INTO panel_alertas VALUES ({_ph(15)}, 0)",
                      (nuevo, "Forcejeo detectado", f"Posible forcejeo en la unidad {bus}.", bus, "Forcejeo", "IA",
                       "Alta", "Pendiente", t.strftime("%Y-%m-%d"), t.strftime("%H:%M"), t.strftime("%H:%M:%S"),
                       ubic, ubic, "Lima", f"Captura IA · {bus}"))
            self._guardar_gps(c, nuevo, lat, lon)
            return nuevo

    @staticmethod
    def _guardar_gps(c, alerta_id, lat, lon):
        if lat is not None and lon is not None:
            c.execute("INSERT INTO panel_alertas_gps VALUES (%s, %s, %s)", (alerta_id, lat, lon))

    # ------------------------------------------------------------ HU-03. Botón de pánico (envío silencioso)
    def crear_alerta_manual(self, bus, lat=None, lon=None):
        """El conductor presiona el botón: se captura el GPS y se registra la alerta SIN emitir sonido.
        La respuesta no contiene ninguna orden de alarma; el frontend tampoco reproduce audio."""
        if not RE_BUS.match(bus or ""):
            raise ApiError(422, "VALIDATION_ERROR", "El identificador del bus no es válido.",
                           {"bus_id": "Usa el formato BUS-123."})
        t = _ahora()
        ubic = f"GPS {lat:.4f}, {lon:.4f}" if lat is not None and lon is not None else "Ubicación no disponible"
        with self.db.transaction() as c:
            if self.db.postgres:
                c.execute("LOCK TABLE panel_alertas IN SHARE ROW EXCLUSIVE MODE")
            n = c.scalar("SELECT COALESCE(MAX(CAST(SUBSTR(id, 4) AS INTEGER)), 0) FROM panel_alertas") + 1
            nuevo = f"AL-{n:03d}"
            c.execute(f"INSERT INTO panel_alertas VALUES ({_ph(15)}, 0)",
                      (nuevo, "Alerta manual", f"El conductor activó el botón de pánico en la unidad {bus}.", bus,
                       "Alerta manual", "Conductor", "Alta", "Pendiente", t.strftime("%Y-%m-%d"), t.strftime("%H:%M"),
                       t.strftime("%H:%M:%S"), ubic, ubic, "Lima", f"Registro silencioso · {bus}"))
            self._guardar_gps(c, nuevo, lat, lon)
            return self._band(c.one("SELECT * FROM panel_alertas WHERE id=%s", (nuevo,)))

    # ------------------------------------------------------------ HU-09. Estado de la flota
    def flota(self):
        """Unidades Edge AI con su estado. 'offline' siempre se acompaña del texto «Offline» en la interfaz."""
        with self.db.transaction() as c:
            filas = c.all("SELECT c.bus, c.modelo, f.conectado, f.ultima_senal FROM panel_camaras c "
                          "LEFT JOIN panel_flota f ON f.bus = c.bus ORDER BY c.bus")
        unidades = [{"bus": r["bus"], "model": r["modelo"],
                     "status": "online" if (r["conectado"] is None or r["conectado"]) else "offline",
                     "statusLabel": "En línea" if (r["conectado"] is None or r["conectado"]) else "Offline",
                     "lastSignal": r["ultima_senal"]} for r in filas]
        return {"summary": {"total": len(unidades), "online": sum(u["status"] == "online" for u in unidades),
                            "offline": sum(u["status"] == "offline" for u in unidades)},
                "units": unidades}

    def cambiar_estado_flota(self, bus, body):
        """Simula la pérdida/recuperación de conectividad de una unidad (FV-09)."""
        if not isinstance(body, dict) or not isinstance(body.get("online"), bool):
            raise ApiError(422, "VALIDATION_ERROR", "Indica si la unidad está en línea.", {"online": "Debe ser true o false."})
        with self.db.transaction() as c:
            if not c.one("SELECT bus FROM panel_camaras WHERE bus=%s", (bus,)):
                raise ApiError(404, "NOT_FOUND", "La unidad no existe.")
            ahora = _ahora().isoformat(timespec="seconds")
            c.execute("INSERT INTO panel_flota VALUES (%s, %s, %s) ON CONFLICT (bus) DO UPDATE SET "
                      "conectado=EXCLUDED.conectado, ultima_senal=EXCLUDED.ultima_senal",
                      (bus, 1 if body["online"] else 0, ahora))
        return next(u for u in self.flota()["units"] if u["bus"] == bus)

    # ------------------------------------------------------------ HU-08. Datos de la evidencia
    def evidencia(self, alerta_id):
        with self.db.transaction() as c:
            r = c.one("SELECT * FROM panel_alertas WHERE id=%s AND descartada=0", (alerta_id,))
            if not r:
                raise ApiError(404, "NOT_FOUND", "La alerta no existe.")
            g = c.one("SELECT latitud, longitud FROM panel_alertas_gps WHERE alerta_id=%s", (alerta_id,))
        datos = self._band(r)
        datos["latitude"] = g["latitud"] if g else None
        datos["longitude"] = g["longitud"] if g else None
        return datos

    # ------------------------------------------------------------ 7. Incidentes
    def incidentes(self):
        with self.db.transaction() as c:
            filas = c.all("SELECT * FROM panel_incidentes ORDER BY fecha DESC, hora DESC, id DESC")
        return [self._inc(r) for r in filas]

    # ------------------------------------------------------------ 8. Reportes
    def reportes(self, rango):
        if rango not in ("7", "30", "90"):
            raise ApiError(422, "VALIDATION_ERROR", "El rango debe ser 7, 30 o 90.", {"rango": "Valor no permitido."})
        n = int(rango)
        hoy = _ahora().date()
        ini = hoy - timedelta(days=n - 1)
        ini_prev = ini - timedelta(days=n)
        with self.db.transaction() as c:
            filas = c.all("SELECT fecha, tipo, estado FROM panel_incidentes WHERE fecha>=%s AND fecha<=%s",
                          (ini_prev.isoformat(), hoy.isoformat()))
        actual = [r for r in filas if r["fecha"] >= ini.isoformat()]
        previo = len(filas) - len(actual)
        total = len(actual)
        cambio = round((total - previo) * 100 / previo) if previo else 0
        estado_map = [("Resueltos", "Resuelto", "#0F766E"), ("Derivados a PNP", "Derivado", "#1E3A8A"),
                      ("Cerrados", "Cerrado", "#CBD5E1")]
        # Tendencia: 7 -> 7 puntos diarios; 30 -> 6 de 5 días; 90 -> 10 de 9 días (etiqueta = fin del tramo)
        puntos = {7: 7, 30: 6, 90: 10}[n]
        paso = n // puntos
        labels, values = [], []
        for k in range(puntos):
            fin = hoy - timedelta(days=(puntos - 1 - k) * paso)
            comienzo = fin - timedelta(days=paso - 1)
            labels.append(f"{fin.day:02d} {MESES[fin.month - 1]}")
            values.append(sum(1 for r in actual if comienzo.isoformat() <= r["fecha"] <= fin.isoformat()))
        return {"total": total, "change": cambio,
                "types": [{"label": t, "value": sum(1 for r in actual if r["tipo"] == t)} for t in TIPOS],
                "statuses": [{"label": l, "value": sum(1 for r in actual if r["estado"] == e), "color": col}
                             for l, e, col in estado_map],
                "trend": {"labels": labels, "values": values}}

    # ------------------------------------------------------------ 9-10. Configuración y cámaras
    def _config(self, c):
        data = json.loads(c.scalar("SELECT data FROM panel_config WHERE id=1"))
        cams = c.all("SELECT bus, modelo, activa FROM panel_camaras ORDER BY bus")
        data["cameras"] = [{"bus": r["bus"], "model": r["modelo"], "active": bool(r["activa"])} for r in cams]
        return data

    def configuracion(self):
        with self.db.transaction() as c:
            return self._config(c)

    def guardar_configuracion(self, b):
        campos = {}
        if not isinstance(b, dict):
            raise ApiError(422, "VALIDATION_ERROR", "El cuerpo debe ser un objeto JSON.")
        conf = b.get("confidence")
        if type(conf) is not int or not 0 <= conf <= 100:
            campos["confidence"] = "Debe ser un entero entre 0 y 100."
        for k in ("detectForce", "detectWeapons", "detectObjects", "notifyPnp", "soundAlarm"):
            if type(b.get(k)) is not bool:
                campos[k] = "Debe ser verdadero o falso."
        if b.get("activeModel") not in MODELOS_IA:
            campos["activeModel"] = "Modelo no permitido."
        pnp = b.get("pnpContact")
        if not isinstance(pnp, str) or not RE_PNP.match(pnp):
            campos["pnpContact"] = "Debe tener entre 3 y 6 dígitos."
        cams = b.get("cameras")
        if not isinstance(cams, list):
            campos["cameras"] = "Debe ser una lista."
            cams = []
        for i, cam in enumerate(cams):
            if not isinstance(cam, dict) or not isinstance(cam.get("bus"), str) or not RE_BUS.match(cam["bus"]):
                campos[f"cameras[{i}].bus"] = "Formato esperado: BUS-123 o BUS-1234."
            elif cam.get("model") not in MODELOS_CAMARA:
                campos[f"cameras[{i}].model"] = "Modelo de cámara no permitido."
            elif type(cam.get("active")) is not bool:
                campos[f"cameras[{i}].active"] = "Debe ser verdadero o falso."
        if campos:
            raise ApiError(422, "VALIDATION_ERROR", "Revisa los datos enviados.", campos)
        buses = [cam["bus"] for cam in cams]
        if len(set(buses)) != len(buses):
            raise ApiError(409, "CONFLICT", "Hay cámaras con el mismo Bus ID.")
        data = {k: b[k] for k in CONFIG_DEFECTO}
        with self.db.transaction() as c:   # atómico: si algo falla, no se guarda nada
            c.execute("UPDATE panel_config SET data=%s WHERE id=1", (json.dumps(data),))
            if buses:
                c.execute(f"DELETE FROM panel_camaras WHERE bus NOT IN ({_ph(len(buses))})", buses)
            else:
                c.execute("DELETE FROM panel_camaras")
            for cam in cams:
                c.execute("INSERT INTO panel_camaras VALUES (%s, %s, %s) ON CONFLICT (bus) DO UPDATE SET "
                          "modelo = EXCLUDED.modelo, activa = EXCLUDED.activa",
                          (cam["bus"], cam["model"], int(cam["active"])))
            return self._config(c)
