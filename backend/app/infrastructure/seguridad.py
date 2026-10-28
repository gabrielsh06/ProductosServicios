"""INFRAESTRUCTURA: criptografía para autenticación (solo biblioteca estándar).

- Contraseñas: PBKDF2-HMAC-SHA256 con sal aleatoria e iteraciones configurables.
- Tokens: JWT firmados con HS256 (mismo formato que Authorization: Bearer <token>).
   No se guardan en el servidor; llevan expiración y un identificador único (jti).
"""
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Tuple

PASSWORD_ITERACIONES = 260_000
PASSWORD_ALGORITMO = "pbkdf2_sha256"


class TokenError(ValueError):
    """Token ausente, alterado, malformado o expirado."""


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(texto: str) -> bytes:
    relleno = "=" * (-len(texto) % 4)
    return base64.urlsafe_b64decode(texto + relleno)


def hash_password(password: str, iteraciones: int = PASSWORD_ITERACIONES) -> str:
    """Devuelve pbkdf2_sha256$iteraciones$sal$hash (listo para guardar en la base)."""
    if not password:
        raise ValueError("La contraseña no puede estar vacía.")
    sal = secrets.token_bytes(16)
    derivada = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), sal, iteraciones)
    return f"{PASSWORD_ALGORITMO}${iteraciones}${_b64url(sal)}${_b64url(derivada)}"


def verificar_password(password: str, almacenado: str) -> bool:
    """Comparación en tiempo constante. Nunca lanza por un hash malformado."""
    try:
        algoritmo, iteraciones, sal_b64, hash_b64 = str(almacenado).split("$", 3)
        if algoritmo != PASSWORD_ALGORITMO:
            return False
        sal = _b64url_decode(sal_b64)
        esperado = _b64url_decode(hash_b64)
        derivada = hashlib.pbkdf2_hmac("sha256", str(password).encode("utf-8"), sal, int(iteraciones))
        return secrets.compare_digest(derivada, esperado)
    except (ValueError, TypeError):
        return False


def crear_token(usuario, secreto: str, minutos: int) -> Tuple[str, int]:
    """Crea un JWT HS256 y devuelve (token, expiración UNIX)."""
    ahora = int(time.time())
    expira = ahora + max(1, int(minutos)) * 60
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": usuario.id,
        "usuario": usuario.usuario,
        "nombre": usuario.nombre,
        "rol": usuario.rol,
        "iat": ahora,
        "exp": expira,
        "jti": secrets.token_urlsafe(18),
        "iss": "sistep",
    }
    partes = [
        _b64url(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        _b64url(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")),
    ]
    firma = hmac.new(secreto.encode("utf-8"), ".".join(partes).encode("ascii"), hashlib.sha256).digest()
    partes.append(_b64url(firma))
    return ".".join(partes), expira


def decodificar_token(token: str, secreto: str) -> dict:
    """Verifica firma y expiración. Lanza TokenError si algo no cuadra."""
    if not token or token.count(".") != 2:
        raise TokenError("Token inválido.")
    header_b64, payload_b64, firma_b64 = token.split(".")
    firma_esperada = hmac.new(
        secreto.encode("utf-8"), f"{header_b64}.{payload_b64}".encode("ascii"), hashlib.sha256
    ).digest()
    try:
        firma = _b64url_decode(firma_b64)
    except (ValueError, TypeError) as e:
        raise TokenError("Token inválido.") from e
    if not hmac.compare_digest(firma, firma_esperada):
        raise TokenError("La firma del token no es válida.")
    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, TypeError, json.JSONDecodeError) as e:
        raise TokenError("Token inválido.") from e
    if header.get("alg") != "HS256":
        raise TokenError("Algoritmo de token no permitido.")
    if not payload.get("sub") or not payload.get("exp"):
        raise TokenError("Token incompleto.")
    if int(payload["exp"]) <= int(time.time()):
        raise TokenError("La sesión expiró. Vuelve a iniciar sesión.")
    return payload
