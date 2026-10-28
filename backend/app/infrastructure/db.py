"""INFRAESTRUCTURA: acceso a datos. PostgreSQL es la base real; SQLite solo sirve para pruebas
locales sin servidor (el mismo SQL corre en ambos). Los placeholders se escriben como %s."""
import sqlite3
from contextlib import contextmanager


class DatabaseError(RuntimeError):
    """Fallo de base de datos (conexión, SQL o restricción)."""


class Conn:
    """Envoltorio mínimo: todas las filas llegan como dict en ambos motores."""

    def __init__(self, raw, postgres: bool):
        self.raw, self.postgres = raw, postgres

    def execute(self, sql, params=()):
        if not self.postgres:
            sql = sql.replace("%s", "?")
        cur = self.raw.cursor()
        cur.execute(sql, tuple(params))
        return cur

    def all(self, sql, params=()):
        return [dict(r) for r in self.execute(sql, params).fetchall()]

    def one(self, sql, params=()):
        r = self.execute(sql, params).fetchone()
        return dict(r) if r else None

    def scalar(self, sql, params=()):
        r = self.one(sql, params)
        return next(iter(r.values())) if r else None


class Database:
    def __init__(self, url: str):
        self.url = url
        self.postgres = url.startswith(("postgresql://", "postgres://"))
        if self.postgres:
            try:
                import psycopg2
                import psycopg2.extras
            except ImportError as e:
                raise DatabaseError("Falta el driver de PostgreSQL. Ejecuta: pip install psycopg2-binary") from e
            self._pg, self._extras = psycopg2, psycopg2.extras
            self._errors = (psycopg2.Error,)
        elif url.startswith("sqlite:///"):
            self.path = url[len("sqlite:///"):]
            self._errors = (sqlite3.Error,)
        else:
            raise DatabaseError("DATABASE_URL debe empezar con postgresql:// (o sqlite:/// para pruebas).")

    # Fragmentos de DDL que cambian entre motores
    @property
    def pk(self):
        return "SERIAL PRIMARY KEY" if self.postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"

    @property
    def ts(self):
        return "TIMESTAMP" if self.postgres else "TEXT"

    @property
    def nombre(self):
        return "PostgreSQL" if self.postgres else "SQLite"

    def _connect(self):
        try:
            if self.postgres:
                return self._pg.connect(self.url, cursor_factory=self._extras.RealDictCursor)
            raw = sqlite3.connect(self.path)
            raw.row_factory = lambda cur, row: {d[0]: row[i] for i, d in enumerate(cur.description)}
            return raw
        except self._errors as e:
            raise DatabaseError(f"No se pudo conectar a {self.nombre}: {e}") from e

    @contextmanager
    def transaction(self):
        """Transacción atómica: confirma al salir bien, revierte todo si algo falla."""
        raw = self._connect()
        try:
            yield Conn(raw, self.postgres)
            raw.commit()
        except self._errors as e:
            raw.rollback()
            raise DatabaseError(f"Error de base de datos: {e}") from e
        except Exception:
            raw.rollback()
            raise
        finally:
            raw.close()
