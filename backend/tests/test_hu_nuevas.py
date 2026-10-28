"""Pruebas de HU-03 (pánico silencioso), HU-08 (evidencia PDF) y HU-09 (flota Offline). Uso: python -m tests.test_hu_nuevas"""
import os
os.environ.setdefault("DATABASE_URL", "sqlite:///sistep_nuevas_boot.db")
from fastapi.testclient import TestClient
from app.adapters.entrada.api_contrato import create_app
from app.infrastructure.db import Database

url = os.getenv("TEST_DATABASE_URL", "sqlite:///sistep_nuevas_test.db")
if url.startswith("sqlite:///") and os.path.exists(url[10:]): os.remove(url[10:])
c = TestClient(create_app(db=Database(url)))
tok = c.post("/api/auth/login", json={"usuario": "acastro", "password": os.getenv("AUTH_DEMO_PASSWORD", "Sistep2026!")}).json()["token"]
h = {"Authorization": f"Bearer {tok}"}

# --- HU-09 / CA-09.1: indicador de desconexión (estado + etiqueta «Offline»)
assert c.get("/api/flota").status_code == 401
f = c.get("/api/flota", headers=h).json()
assert f["summary"] == {"total": 3, "online": 2, "offline": 1}, f["summary"]
u207 = next(u for u in f["units"] if u["bus"] == "BUS-207")
assert u207["status"] == "offline" and u207["statusLabel"] == "Offline"          # texto + estado, no solo color
r = c.put("/api/flota/BUS-302", headers=h, json={"online": False})                # FV-09: simular caída de red
assert r.status_code == 200 and r.json()["status"] == "offline" and r.json()["statusLabel"] == "Offline"
assert c.get("/api/flota", headers=h).json()["summary"]["offline"] == 2
assert c.put("/api/flota/BUS-302", headers=h, json={"online": True}).json()["statusLabel"] == "En línea"
assert c.put("/api/flota/BUS-999", headers=h, json={"online": True}).status_code == 404
assert c.put("/api/flota/BUS-302", headers=h, json={"online": "no"}).status_code == 422

# --- HU-03 / CA-03.1: pánico silencioso con GPS
r = c.post("/api/alertas/panico", headers=h, json={"bus_id": "BUS-118", "latitud": -12.085, "longitud": -77.034})
assert r.status_code == 201, r.text
a = r.json()
assert a["type"] == "Alerta manual" and a["priority"] == "Alta" and a["status"] == "Pendiente" and "GPS -12.0850" in a["location"]
assert "sound" not in str(a).lower() and "alarm" not in str(a).lower()           # sin orden de sonido
assert a["id"] in [x["id"] for x in c.get("/api/alertas", headers=h).json()]
assert c.post("/api/alertas/panico", headers=h, json={"bus_id": "XX"}).status_code == 422
assert c.post("/api/alertas/panico", headers=h, json={"bus_id": "BUS-118", "latitud": 999}).status_code == 422
assert c.post("/api/alertas/panico", json={"bus_id": "BUS-118"}).status_code == 401

# --- HU-08 / CA-08.1: descarga del reporte con captura y GPS
r = c.get("/api/alertas/AL-021/evidencia", headers=h)
assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
assert 'filename="evidencia-AL-021.pdf"' in r.headers["content-disposition"] and r.content[:5] == b"%PDF-" and len(r.content) > 2000
r2 = c.get(f"/api/alertas/{a['id']}/evidencia", headers=h)                       # alerta con GPS capturado por pánico
assert r2.status_code == 200 and r2.content[:5] == b"%PDF-"
assert c.get("/api/alertas/AL-999/evidencia", headers=h).status_code == 404
assert c.get("/api/alertas/AL-021/evidencia").status_code == 401

# --- el GPS de una alerta de la IA (HU-01) también queda para la evidencia
ev = c.post("/api/eventos", headers=h, json={"bus_id": "BUS-302", "velocidad_movimiento": 95, "acercamiento_brusco": 1,
                                             "latitud": -12.0911, "longitud": -77.023}).json()
assert c.get(f"/api/alertas/{ev['bandejaId']}/evidencia", headers=h).status_code == 200
print("HU-03 / HU-08 / HU-09 OK")
if url.startswith("sqlite:///"): os.remove(url[10:])
if os.path.exists("sistep_nuevas_boot.db"): os.remove("sistep_nuevas_boot.db")
