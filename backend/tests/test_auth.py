"""Pruebas de autenticación (FastAPI + httpx, SQLite temporal).
Uso: python -m tests.test_auth
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///sistep_auth_boot.db")

from fastapi.testclient import TestClient
from app.adapters.entrada.api_contrato import create_app
from app.domain.usuario import Usuario
from app.infrastructure.db import Database
from app.infrastructure.seguridad import (
    TokenError, crear_token, decodificar_token, hash_password, verificar_password,
)

url = "sqlite:///sistep_auth_test.db"
for archivo in ("sistep_auth_test.db", "sistep_auth_boot.db"):
    if os.path.exists(archivo):
        os.remove(archivo)

password = os.getenv("AUTH_DEMO_PASSWORD", "Sistep2026!")
c = TestClient(create_app(db=Database(url), origins=["http://localhost:5500"]))

# --- Hashing de contraseñas ---
almacenado = hash_password("ClaveSegura123!")
assert almacenado.startswith("pbkdf2_sha256$") and "ClaveSegura123!" not in almacenado
assert verificar_password("ClaveSegura123!", almacenado)
assert not verificar_password("otra", almacenado)
assert not verificar_password("x", "hash-malformado")

# --- Token firmado: válido, alterado y con otra clave ---
u = Usuario("USR-999", "prueba", "Usuario Prueba", "prueba@sistep.pe", "operador")
token, expira = crear_token(u, "secreto-de-prueba", 10)
payload = decodificar_token(token, "secreto-de-prueba")
assert payload["sub"] == u.id and payload["exp"] == expira
try:
    decodificar_token(token[:-2] + ("aa" if token[-2:] != "aa" else "bb"), "secreto-de-prueba")
    raise AssertionError("un token alterado no debe aceptarse")
except TokenError:
    pass
try:
    decodificar_token(token, "otro-secreto")
    raise AssertionError("un token con otra firma no debe aceptarse")
except TokenError:
    pass

# --- Login / me / logout ---
r = c.post("/api/auth/login", json={"usuario": "ADMIN", "password": password})
assert r.status_code == 200, r.text
datos = r.json()
assert datos["user"]["rol"] == "admin" and datos["user"]["nombre"] == "Administrador SISTEP"
assert datos["token"] and datos["expiresIn"] > 0
auth = {"Authorization": f"Bearer {datos['token']}"}

assert c.get("/api/auth/me", headers=auth).json()["user"]["usuario"] == "admin"
assert c.get("/api/dashboard", headers=auth).status_code == 200
assert c.get("/api/alertas", headers={"Authorization": "Bearer token.falso.aqui"}).status_code == 401
assert c.get("/api/dashboard").status_code == 401
assert c.post("/api/auth/logout", headers=auth).status_code == 204
assert c.get("/api/dashboard", headers=auth).status_code == 401

# --- Bloqueo tras intentos fallidos ---
for intento in range(1, 6):
    r = c.post("/api/auth/login", json={"usuario": "intruso", "password": "mala"})
    assert r.status_code == 401, (intento, r.status_code, r.text)
r = c.post("/api/auth/login", json={"usuario": "intruso", "password": "mala"})
assert r.status_code == 429 and r.json()["error"]["code"] == "TOO_MANY_ATTEMPTS"

print("AUTH OK")
for archivo in ("sistep_auth_test.db", "sistep_auth_boot.db"):
    if os.path.exists(archivo):
        os.remove(archivo)
