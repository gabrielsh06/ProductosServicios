"""INFRAESTRUCTURA: esquema de la tabla Alertas (HU-01)."""
from app.infrastructure.db import Database


def inicializar_bd(db: Database) -> None:
    ddl = f"""
    CREATE TABLE IF NOT EXISTS Alertas (
        id                    {db.pk},
        bus_id                TEXT    NOT NULL,
        velocidad_movimiento  INTEGER NOT NULL CHECK (velocidad_movimiento BETWEEN 0 AND 100),
        acercamiento_brusco   INTEGER NOT NULL CHECK (acercamiento_brusco IN (0, 1)),
        prediccion_agresion   INTEGER NOT NULL CHECK (prediccion_agresion IN (0, 1)),
        fecha_hora            {db.ts} NOT NULL,
        estado_envio          TEXT    NOT NULL,
        latitud               DOUBLE PRECISION,
        longitud              DOUBLE PRECISION
    )"""
    with db.transaction() as c:
        c.execute(ddl)
