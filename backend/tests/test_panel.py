"""Verifica los invariantes del contrato. Usa SQLite en archivo (sin servidor); con PostgreSQL:
   TEST_DATABASE_URL=postgresql://... python -m tests.test_panel   (ojo: recrea las tablas panel_*)"""
import os
from app.adapters.salida.panel_repository import PanelRepository
from app.infrastructure.db import Database
from app.infrastructure.errores import ApiError

url = os.getenv("TEST_DATABASE_URL", "sqlite:///sistep_panel_test.db")
if url.startswith("sqlite:///") and os.path.exists(url[10:]): os.remove(url[10:])
db = Database(url); p = PanelRepository(db); p.reiniciar_demo()
print("Motor:", db.nombre)


def falla(status, fn, *a):
    try: fn(*a)
    except ApiError as e:
        assert e.status == status, (e.status, status); return e
    raise AssertionError("debía fallar con %s" % status)


d = p.dashboard()
assert len(d["alerts"]) <= 7 and d["summary"]["totalAlerts"] == 7
assert all(a["status"] in ("Pendiente", "En proceso", "Resuelto") for a in d["alerts"])
r = p.resolver_dashboard("HU-03", {"status": "Resuelto"}); assert r["status"] == "Resuelto"
assert p.resolver_dashboard("HU-03", {"status": "Resuelto"})["status"] == "Resuelto"   # idempotente
falla(422, p.resolver_dashboard, "HU-03", {"status": "Pendiente"}); falla(404, p.resolver_dashboard, "XX", {"status": "Resuelto"})
p.archivar_dashboard("HU-03"); p.archivar_dashboard("HU-03")
assert "HU-03" not in [a["id"] for a in p.dashboard()["alerts"]]

al = p.alertas(); assert al[0]["id"] == "AL-021" and len(al) == 3
assert p.notificar_pnp("AL-021")["status"] == "Derivado PNP" and p.notificar_pnp("AL-021")["status"] == "Derivado PNP"
p.descartar_alerta("AL-020"); assert "AL-020" not in [a["id"] for a in p.alertas()]
nuevo = p.crear_alerta_ia("BUS-302", -12.0911, -77.023); assert nuevo == "AL-022" and p.alertas()[0]["id"] == "AL-022"

assert len(p.incidentes()) == 6 and p.incidentes()[0]["audit"]
for rg in ("7", "30", "90"):
    rep = p.reportes(rg)
    assert rep["total"] >= 1 and sum(x["value"] for x in rep["types"]) == rep["total"]
    assert sum(x["value"] for x in rep["statuses"]) == rep["total"] and len(rep["statuses"]) == 3
    assert len(rep["trend"]["labels"]) == len(rep["trend"]["values"]) >= 2
falla(422, p.reportes, "15")

cfg = p.configuracion(); assert cfg["pnpContact"] == "105" and len(cfg["cameras"]) == 3
cfg["cameras"].append({"bus": "BUS-999", "model": "Cámara v3", "active": True}); cfg["confidence"] = 70
assert len(p.guardar_configuracion(cfg)["cameras"]) == 4 and p.configuracion()["confidence"] == 70
e = falla(422, p.guardar_configuracion, {**cfg, "pnpContact": "10"}); assert "pnpContact" in e.fields
falla(422, p.guardar_configuracion, {**cfg, "cameras": [{"bus": "bus-1", "model": "Cámara v3", "active": True}]})
falla(409, p.guardar_configuracion, {**cfg, "cameras": [cfg["cameras"][0], cfg["cameras"][0]]})
assert p.configuracion()["confidence"] == 70 and len(p.configuracion()["cameras"]) == 4   # nada a medias
assert p.guardar_configuracion({**cfg, "cameras": []})["cameras"] == []                  # lista vacía => sin cámaras
print("TODOS LOS INVARIANTES DEL CONTRATO OK")
if url.startswith("sqlite:///"): os.remove(url[10:])
