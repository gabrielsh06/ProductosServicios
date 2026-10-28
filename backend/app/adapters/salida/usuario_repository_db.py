"""ADAPTADOR de salida: usuarios del panel en PostgreSQL/SQLite.

Los usuarios demo se crean únicamente cuando la tabla está vacía. En producción
define AUTH_SEED_DEMO=0 y crea las cuentas con contraseñas propias.
"""
from datetime import datetime, timezone
from app.domain.usuario import Usuario
from app.infrastructure import config
from app.infrastructure.db import Database
from app.infrastructure.seguridad import hash_password
from app.ports.usuario_repository import UsuarioRepository

DDL = """CREATE TABLE IF NOT EXISTS panel_usuarios(
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    rol TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL,
    ultimo_acceso TEXT
)"""

DEMO = [
    ("USR-001", "admin", "Administrador SISTEP", "admin@sistep.pe", "admin"),
    ("USR-002", "acastro", "Ana Castro", "ana.castro@sistep.pe", "operador"),
    ("USR-003", "cmendez", "Carlos Méndez", "carlos.mendez@sistep.pe", "operador"),
]


def _ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class UsuarioRepositoryDB(UsuarioRepository):
    def __init__(self, db: Database, seed_demo: bool = None, demo_password: str = None):
        self.db = db
        self.seed_demo = config.AUTH_SEED_DEMO if seed_demo is None else seed_demo
        self.demo_password = demo_password or config.AUTH_DEMO_PASSWORD

    def inicializar(self) -> None:
        with self.db.transaction() as c:
            c.execute(DDL)
            if not self.seed_demo:
                return
            if c.scalar("SELECT COUNT(*) FROM panel_usuarios") != 0:
                return
            creado = _ahora_iso()
            for uid, usuario, nombre, correo, rol in DEMO:
                c.execute(
                    "INSERT INTO panel_usuarios "
                    "(id, usuario, nombre, correo, rol, password_hash, activo, creado_en, ultimo_acceso) "
                    "VALUES (%s, %s, %s, %s, %s, %s, 1, %s, NULL)",
                    (uid, usuario, nombre, correo, rol, hash_password(self.demo_password), creado),
                )

    @staticmethod
    def _usuario(fila) -> Usuario:
        if not fila:
            return None
        return Usuario(
            id=fila["id"],
            usuario=fila["usuario"],
            nombre=fila["nombre"],
            correo=fila["correo"],
            rol=fila["rol"],
            activo=bool(fila["activo"]),
            ultimo_acceso=fila.get("ultimo_acceso"),
        )

    def buscar_por_usuario(self, usuario: str) -> Usuario:
        with self.db.transaction() as c:
            fila = c.one(
                "SELECT * FROM panel_usuarios "
                "WHERE lower(usuario) = lower(%s) OR lower(correo) = lower(%s)",
                (usuario.strip(), usuario.strip()),
            )
        return self._usuario(fila)

    def buscar_por_id(self, usuario_id: str) -> Usuario:
        with self.db.transaction() as c:
            fila = c.one("SELECT * FROM panel_usuarios WHERE id = %s", (usuario_id,))
        return self._usuario(fila)

    def password_hash(self, usuario_id: str) -> str:
        with self.db.transaction() as c:
            return c.scalar("SELECT password_hash FROM panel_usuarios WHERE id = %s", (usuario_id,))

    def registrar_acceso(self, usuario_id: str, momento: str) -> None:
        with self.db.transaction() as c:
            c.execute("UPDATE panel_usuarios SET ultimo_acceso = %s WHERE id = %s", (momento, usuario_id))
