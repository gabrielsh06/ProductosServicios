"""ADAPTADOR de entrada HTTP: login, sesión actual y logout.

Formato de error: el mismo del contrato {"error": {"code", "message"}}.
"""
import threading
import time
from typing import Callable
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from app.infrastructure.errores import ApiError


class LoginIn(BaseModel):
    usuario: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)
    recordar: bool = False


class LimiteIntentos:
    """Bloqueo temporal en memoria por IP + usuario. Para varias instancias usar Redis."""

    def __init__(self, maximo: int, bloqueo_minutos: int):
        self.maximo = max(1, maximo)
        self.bloqueo = max(1, bloqueo_minutos) * 60
        self._datos = {}
        self._lock = threading.Lock()

    def _clave(self, request: Request, usuario: str) -> str:
        ip = request.client.host if request.client else "desconocida"
        return f"{ip}|{usuario.strip().lower()}"

    def verificar(self, request: Request, usuario: str) -> str:
        clave = self._clave(request, usuario)
        ahora = time.time()
        with self._lock:
            estado = self._datos.get(clave)
            if not estado:
                return clave
            if estado["hasta"] > ahora:
                restante = max(1, int((estado["hasta"] - ahora + 59) // 60))
                raise ApiError(
                    429, "TOO_MANY_ATTEMPTS",
                    f"Demasiados intentos fallidos. Espera {restante} minuto(s) o contacta al administrador.",
                )
            if estado["hasta"] and estado["hasta"] <= ahora:
                self._datos.pop(clave, None)
        return clave

    def fallo(self, clave: str) -> None:
        ahora = time.time()
        with self._lock:
            estado = self._datos.setdefault(clave, {"intentos": 0, "hasta": 0, "inicio": ahora})
            # Los intentos fallidos caducan pasada la ventana de bloqueo.
            if not estado["hasta"] and ahora - estado.get("inicio", ahora) > self.bloqueo:
                estado["intentos"] = 0
                estado["inicio"] = ahora
            estado["intentos"] += 1
            if estado["intentos"] >= self.maximo:
                estado["hasta"] = ahora + self.bloqueo
                estado["intentos"] = 0
            if len(self._datos) > 2000:
                self._datos = {
                    k: v for k, v in self._datos.items()
                    if v["hasta"] > ahora or ahora - v.get("inicio", ahora) < self.bloqueo
                }

    def exito(self, clave: str) -> None:
        with self._lock:
            self._datos.pop(clave, None)


def extraer_token(request: Request) -> str:
    cabecera = (request.headers.get("Authorization") or "").strip()
    partes = cabecera.split(" ", 1)
    if len(partes) != 2 or partes[0].lower() != "bearer" or not partes[1].strip():
        raise ApiError(401, "MISSING_TOKEN", "Inicia sesión para continuar.")
    return partes[1].strip()


def crear_dependencia_usuario(servicio) -> Callable:
    def requerir_usuario(request: Request):
        token = extraer_token(request)
        request.state.token = token
        return servicio.usuario_desde_token(token)

    return requerir_usuario


def crear_router_auth(servicio, max_intentos: int = 5, bloqueo_minutos: int = 5) -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
    limite = LimiteIntentos(max_intentos, bloqueo_minutos)
    requerir_usuario = crear_dependencia_usuario(servicio)

    @router.post("/login")
    def login(datos: LoginIn, request: Request):
        clave = limite.verificar(request, datos.usuario)
        try:
            sesion = servicio.iniciar_sesion(datos.usuario, datos.password)
        except ApiError as e:
            if e.status == 401:
                limite.fallo(clave)
            raise
        limite.exito(clave)
        return sesion

    @router.get("/me")
    def me(usuario=Depends(requerir_usuario)):
        return {"user": usuario.publico()}

    @router.post("/logout")
    def logout(request: Request, _usuario=Depends(requerir_usuario)):
        servicio.cerrar_sesion(getattr(request.state, "token", ""))
        return Response(status_code=204)

    return router
