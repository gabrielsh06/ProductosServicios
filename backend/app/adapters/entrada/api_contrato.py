"""ADAPTADOR de entrada HTTP (FastAPI) que cumple INTEGRACION_BACKEND.md v1.0 + endpoint HU-01.
Ejecutar:  uvicorn app.adapters.entrada.api_contrato:app --port 3000 --reload"""
import logging
import os
from pathlib import Path
from typing import Optional
from fastapi import Depends, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.adapters.entrada.api_auth import crear_dependencia_usuario, crear_router_auth
from app.adapters.salida.panel_repository import PanelRepository
from app.adapters.salida.usuario_repository_db import UsuarioRepositoryDB
from app.application.autenticar import AutenticacionService
from app.infrastructure import config
from app.infrastructure.container import construir_controlador
from app.infrastructure.db import Database, DatabaseError
from app.infrastructure.errores import ApiError
from app.infrastructure.evidencia_pdf import generar_pdf_evidencia

log = logging.getLogger("sistep.api")
CODIGOS_HTTP = {400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
                405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 422: "VALIDATION_ERROR",
                429: "TOO_MANY_REQUESTS"}


class EventoIn(BaseModel):
    """Evento de cámara de la HU-01 (lo que consume el modelo Random Forest)."""
    bus_id: str = Field(min_length=1, max_length=20)
    velocidad_movimiento: int = Field(ge=0, le=100)
    acercamiento_brusco: int = Field(ge=0, le=1)
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)


class PanicoIn(BaseModel):
    """HU-03: el botón de pánico solo envía la unidad y, si existe, el GPS."""
    bus_id: str = Field(min_length=1, max_length=20)
    latitud: Optional[float] = Field(default=None, ge=-90, le=90)
    longitud: Optional[float] = Field(default=None, ge=-180, le=180)


async def _json(request: Request):
    try:
        return await request.json()
    except Exception:
        raise ApiError(400, "BAD_REQUEST", "El JSON enviado es inválido o está malformado.")


def create_app(db=None, backend=None, origins=None) -> FastAPI:
    # redirect_slashes=False: el contrato prohíbe redirecciones (/api/alertas -> /api/alertas/)
    app = FastAPI(title="SISTEP Vision Guardian AI - API", redirect_slashes=False)
    db = db or Database(config.DATABASE_URL)
    permitidos = origins or [o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",") if o.strip()]
    panel = PanelRepository(db)
    panel.inicializar()
    usuario_repo = UsuarioRepositoryDB(db)
    usuario_repo.inicializar()
    auth = AutenticacionService(usuario_repo, config.AUTH_SECRET, config.AUTH_TOKEN_MINUTOS)
    requerir_usuario = crear_dependencia_usuario(auth)
    if config.AUTH_SECRET.startswith(("sistep-dev-secret", "cambia-esta")) or len(config.AUTH_SECRET) < 32:
        log.warning("AUTH_SECRET es débil o de ejemplo. Define uno largo y aleatorio antes de publicar.")
    if config.AUTH_SEED_DEMO:
        log.warning("Usuarios demo activos (AUTH_SEED_DEMO=1). Usa AUTH_SEED_DEMO=0 en producción.")
    controlador, _repo = construir_controlador(db=db, backend=backend)

    app.include_router(crear_router_auth(auth, config.AUTH_MAX_INTENTOS, config.AUTH_BLOQUEO_MINUTOS))

    # ---------- CORS + errores 500 en JSON (siempre JSON, nunca HTML) ----------
    @app.middleware("http")
    async def cors_y_errores(request: Request, call_next):
        if request.method == "OPTIONS":
            resp = Response(status_code=204)          # preflight: 204 sin cuerpo
        else:
            try:
                resp = await call_next(request)
            except Exception:
                log.exception("Error no controlado")
                resp = JSONResponse(status_code=500, content=ApiError(
                    500, "INTERNAL_ERROR", "Ocurrió un error inesperado en el servidor.").body())
        origin = request.headers.get("origin")
        if origin and ("*" in permitidos or origin in permitidos):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            resp.headers["Access-Control-Max-Age"] = "86400"
        return resp

    @app.exception_handler(ApiError)
    async def _h_api(_, e: ApiError):
        headers = {"WWW-Authenticate": 'Bearer realm="sistep"'} if e.status == 401 else None
        return JSONResponse(status_code=e.status, content=e.body(), headers=headers)

    @app.exception_handler(DatabaseError)
    async def _h_db(_, e: DatabaseError):
        log.error("Error de base de datos: %s", e)
        return JSONResponse(status_code=500, content=ApiError(
            500, "INTERNAL_ERROR", "No se pudo acceder a la base de datos.").body())

    @app.exception_handler(StarletteHTTPException)
    async def _h_http(_, e: StarletteHTTPException):
        return JSONResponse(status_code=e.status_code, content=ApiError(
            e.status_code, CODIGOS_HTTP.get(e.status_code, "INTERNAL_ERROR"), str(e.detail)).body())

    @app.exception_handler(RequestValidationError)
    async def _h_val(_, e: RequestValidationError):
        campos = {str(x["loc"][-1]): "Valor inválido." for x in e.errors() if x.get("loc")}
        return JSONResponse(status_code=422, content=ApiError(
            422, "VALIDATION_ERROR", "Revisa los datos enviados.", campos).body())

    # ---------- Salud y puente con la IA (HU-01) ----------
    @app.get("/api/health")
    def health():
        return {"status": "ok", "database": db.nombre}

    @app.post("/api/eventos")
    def registrar_evento(e: EventoIn, _usuario=Depends(requerir_usuario)):
        # IA (Random Forest) -> tabla Alertas (HU-01) -> y si hay agresión, aparece en la bandeja del panel
        try:
            r = controlador.recibir_evento(e.bus_id, e.velocidad_movimiento, e.acercamiento_brusco,
                                           e.latitud, e.longitud)
        except ValueError as err:
            raise ApiError(422, "VALIDATION_ERROR", str(err))
        except RuntimeError as err:
            raise ApiError(500, "INTERNAL_ERROR", str(err))
        bandeja_id = panel.crear_alerta_ia(e.bus_id, e.latitud, e.longitud) if r.prediccion else None
        return {"prediccion": r.prediccion, "alertaId": r.alerta.id if r.alerta else None, "bandejaId": bandeja_id,
                "mensaje": "ALERTA: forcejeo detectado" if r.prediccion else "Contacto normal: sin alerta"}

    # ---------- 1-3 Dashboard ----------
    @app.get("/api/dashboard")
    def dashboard(_usuario=Depends(requerir_usuario)):
        return panel.dashboard()

    @app.patch("/api/dashboard/alertas/{alerta_id}")
    async def resolver(alerta_id: str, request: Request, _usuario=Depends(requerir_usuario)):
        return panel.resolver_dashboard(alerta_id, await _json(request))

    @app.delete("/api/dashboard/alertas/{alerta_id}")
    def archivar(alerta_id: str, _usuario=Depends(requerir_usuario)):
        panel.archivar_dashboard(alerta_id)
        return Response(status_code=204)

    # ---------- 4-6 Bandeja de alertas ----------
    @app.get("/api/alertas")
    def alertas(_usuario=Depends(requerir_usuario)):
        return panel.alertas()

    @app.post("/api/alertas/{alerta_id}/notificar-pnp")
    def notificar(alerta_id: str, _usuario=Depends(requerir_usuario)):
        return panel.notificar_pnp(alerta_id)

    @app.post("/api/alertas/panico", status_code=201)
    def panico(e: PanicoIn, _usuario=Depends(requerir_usuario)):
        # HU-03: registro silencioso. Sin sonido ni cambios de volumen: solo GPS + incidente en la BD.
        return panel.crear_alerta_manual(e.bus_id, e.latitud, e.longitud)

    @app.get("/api/alertas/{alerta_id}/evidencia")
    def evidencia(alerta_id: str, _usuario=Depends(requerir_usuario)):
        # HU-08: reporte descargable (PDF) con la captura y los metadatos GPS
        pdf = generar_pdf_evidencia(panel.evidencia(alerta_id))
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="evidencia-{alerta_id}.pdf"'})

    @app.delete("/api/alertas/{alerta_id}")
    def descartar(alerta_id: str, _usuario=Depends(requerir_usuario)):
        panel.descartar_alerta(alerta_id)
        return Response(status_code=204)

    # ---------- HU-09 Estado de la flota ----------
    @app.get("/api/flota")
    def flota(_usuario=Depends(requerir_usuario)):
        return panel.flota()

    @app.put("/api/flota/{bus}")
    async def estado_flota(bus: str, request: Request, _usuario=Depends(requerir_usuario)):
        return panel.cambiar_estado_flota(bus, await _json(request))   # simula caída/recuperación de red

    # ---------- 7 Incidentes, 8 Reportes ----------
    @app.get("/api/incidentes")
    def incidentes(_usuario=Depends(requerir_usuario)):
        return panel.incidentes()

    @app.get("/api/reportes")
    def reportes(rango: str = Query("30"), _usuario=Depends(requerir_usuario)):
        return panel.reportes(rango)

    # ---------- 9-10 Configuración ----------
    @app.get("/api/configuracion")
    def get_config(_usuario=Depends(requerir_usuario)):
        return panel.configuracion()

    @app.put("/api/configuracion")
    async def put_config(request: Request, _usuario=Depends(requerir_usuario)):
        return panel.guardar_configuracion(await _json(request))

    # Sirve el frontend en el mismo origen (API_BASE = "/api"): carpeta ../frontend o FRONTEND_DIR del .env
    front = os.getenv("FRONTEND_DIR") or str(Path(__file__).resolve().parents[4] / "frontend")
    if Path(front).exists():
        app.mount("/", StaticFiles(directory=front, html=True), name="frontend")
    return app


app = create_app()
