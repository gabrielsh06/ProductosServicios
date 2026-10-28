"""Prueba HTTP de la API (requiere fastapi + httpx). Uso: python -m tests.test_http
Usa SQLite temporal salvo que definas TEST_DATABASE_URL (PostgreSQL)."""
import os

# El módulo api_contrato crea una app al importarse; evita depender de PostgreSQL en pruebas.
os.environ.setdefault("DATABASE_URL", "sqlite:///sistep_http_boot.db")

from fastapi.testclient import TestClient
from app.adapters.entrada.api_contrato import create_app
from app.infrastructure.db import Database

url = os.getenv("TEST_DATABASE_URL", "sqlite:///sistep_http_test.db")
if url.startswith("sqlite:///") and os.path.exists(url[10:]): os.remove(url[10:])
c = TestClient(create_app(db=Database(url), origins=["http://localhost:5500"]))
h = {"Origin": "http://localhost:5500"}

# Salud pública y login
assert c.get("/api/health", headers=h).status_code == 200
assert c.get("/api/dashboard", headers=h).status_code == 401
assert c.get("/api/dashboard", headers=h).json()["error"]["code"] == "MISSING_TOKEN"
assert c.post("/api/auth/login", json={"usuario": "acastro", "password": "invalida"}).status_code == 401
login = c.post("/api/auth/login", json={"usuario": "acastro",
                                        "password": os.getenv("AUTH_DEMO_PASSWORD", "Sistep2026!")})
assert login.status_code == 200, login.text
sesion = login.json()
assert sesion["user"]["nombre"] == "Ana Castro" and sesion["tokenType"] == "Bearer"
auth = {**h, "Authorization": f"Bearer {sesion['token']}"}
assert c.get("/api/auth/me", headers=auth).json()["user"]["usuario"] == "acastro"

# CORS, preflight y errores JSON
assert c.get("/api/dashboard", headers=auth).headers["access-control-allow-origin"] == "http://localhost:5500"
o = c.options("/api/alertas", headers={**h, "Access-Control-Request-Method": "GET"}); assert o.status_code == 204 and o.content == b""
assert c.get("/api/alertas/", headers=auth).status_code in (404, 405)   # sin redirecciones
assert c.get("/api/noexiste", headers=auth).json()["error"]["code"] == "NOT_FOUND"
assert c.get("/api/reportes?rango=15", headers=auth).status_code == 422
assert c.patch("/api/dashboard/alertas/HU-03", content="{malo", headers=auth).status_code == 400
assert c.delete("/api/alertas/AL-020", headers=auth).status_code == 204
r = c.post("/api/eventos", headers=auth, json={"bus_id": "BUS-302", "velocidad_movimiento": 95, "acercamiento_brusco": 1})
assert r.json()["prediccion"] == 1 and c.get("/api/alertas", headers=auth).json()[0]["id"] == r.json()["bandejaId"]
assert c.post("/api/eventos", headers=auth, json={"bus_id": "BUS-302", "velocidad_movimiento": 15, "acercamiento_brusco": 0}).json()["bandejaId"] is None
assert c.get("/", headers=h).status_code == 200                         # sirve el frontend en el mismo origen

# Logout invalida el token en el servidor
assert c.post("/api/auth/logout", headers=auth).status_code == 204
assert c.get("/api/dashboard", headers=auth).status_code == 401

print("HTTP OK")
if url.startswith("sqlite:///"): os.remove(url[10:])
if os.path.exists("sistep_http_boot.db"): os.remove("sistep_http_boot.db")
