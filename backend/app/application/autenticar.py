"""CASO DE USO: iniciar/cerrar sesión y validar el token de acceso."""
import threading
import time
from datetime import datetime, timezone
from app.domain.usuario import Usuario
from app.infrastructure.errores import ApiError
from app.infrastructure.seguridad import (
    TokenError, crear_token, decodificar_token, hash_password, verificar_password,
)


class AutenticacionService:
    def __init__(self, repo, secreto: str, minutos: int = 480):
        self.repo = repo
        self.secreto = secreto
        self.minutos = minutos
        self._revocados = {}
        self._lock = threading.Lock()
        # Hash de relleno: mantiene un tiempo de respuesta similar cuando el usuario no existe.
        self._hash_relleno = hash_password("usuario-inexistente-sistep")

    # ------------------------------------------------------------------ login
    def iniciar_sesion(self, usuario: str, password: str) -> dict:
        encontrado = self.repo.buscar_por_usuario(usuario)
        almacenado = self.repo.password_hash(encontrado.id) if encontrado else self._hash_relleno
        valida = verificar_password(password, almacenado)
        if not encontrado or not valida:
            raise ApiError(401, "INVALID_CREDENTIALS", "Usuario o contraseña incorrectos.")
        if not encontrado.activo:
            raise ApiError(403, "USER_INACTIVE", "Esta cuenta está deshabilitada. Contacta al administrador.")

        token, expira = crear_token(encontrado, self.secreto, self.minutos)
        momento = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.repo.registrar_acceso(encontrado.id, momento)
        actualizado = Usuario(
            id=encontrado.id, usuario=encontrado.usuario, nombre=encontrado.nombre,
            correo=encontrado.correo, rol=encontrado.rol, activo=encontrado.activo,
            ultimo_acceso=momento,
        )
        return {
            "token": token,
            "tokenType": "Bearer",
            "expiresIn": max(1, expira - int(time.time())),
            "expiresAt": datetime.fromtimestamp(expira, timezone.utc).isoformat(timespec="seconds"),
            "user": actualizado.publico(),
        }

    # -------------------------------------------------------------- validación
    def usuario_desde_token(self, token: str) -> Usuario:
        try:
            payload = decodificar_token(token, self.secreto)
        except TokenError as e:
            raise ApiError(401, "INVALID_TOKEN", str(e)) from e

        with self._lock:
            if payload.get("jti") in self._revocados:
                raise ApiError(401, "INVALID_TOKEN", "La sesión fue cerrada. Vuelve a iniciar sesión.")

        usuario = self.repo.buscar_por_id(payload.get("sub"))
        if not usuario:
            raise ApiError(401, "INVALID_TOKEN", "El usuario de la sesión ya no existe.")
        if not usuario.activo:
            raise ApiError(403, "USER_INACTIVE", "Esta cuenta está deshabilitada.")
        return usuario

    def cerrar_sesion(self, token: str) -> None:
        try:
            payload = decodificar_token(token, self.secreto)
        except TokenError:
            return
        with self._lock:
            ahora = int(time.time())
            # Limpieza oportunista de revocaciones vencidas.
            self._revocados = {jti: exp for jti, exp in self._revocados.items() if exp > ahora}
            self._revocados[payload["jti"]] = int(payload["exp"])
