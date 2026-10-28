"""ADAPTADOR de salida: persistencia de la tabla Alertas (PostgreSQL)."""
from datetime import datetime
from typing import List
from app.domain.alerta import Alerta
from app.infrastructure.db import Database
from app.ports.alerta_repository import AlertaRepositoryPort


def _a_datetime(v):
    # PostgreSQL devuelve datetime; SQLite (solo pruebas) devuelve texto ISO
    return v if isinstance(v, datetime) else datetime.fromisoformat(v)


class AlertaRepositoryDB(AlertaRepositoryPort):
    def __init__(self, db: Database):
        self.db = db

    def guardar(self, alerta: Alerta) -> Alerta:
        # INSERT parametrizado (sin SQL injection). Si falla, db.transaction lanza DatabaseError (CA-03)
        with self.db.transaction() as c:
            alerta.id = c.scalar(
                """INSERT INTO Alertas (bus_id, velocidad_movimiento, acercamiento_brusco,
                   prediccion_agresion, fecha_hora, estado_envio, latitud, longitud)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (alerta.bus_id, alerta.velocidad_movimiento, alerta.acercamiento_brusco,
                 alerta.prediccion_agresion, alerta.fecha_hora.isoformat(timespec="seconds"),
                 alerta.estado_envio, alerta.latitud, alerta.longitud))
        return alerta

    def actualizar_estado(self, alerta_id: int, nuevo_estado: str) -> None:
        with self.db.transaction() as c:
            c.execute("UPDATE Alertas SET estado_envio = %s WHERE id = %s", (nuevo_estado, alerta_id))

    def listar(self) -> List[Alerta]:
        with self.db.transaction() as c:
            filas = c.all("""SELECT id, bus_id, velocidad_movimiento, acercamiento_brusco,
                             prediccion_agresion, fecha_hora, estado_envio, latitud, longitud
                             FROM Alertas ORDER BY id""")
        return [Alerta(id=f["id"], bus_id=f["bus_id"], velocidad_movimiento=f["velocidad_movimiento"],
                       acercamiento_brusco=f["acercamiento_brusco"], prediccion_agresion=f["prediccion_agresion"],
                       fecha_hora=_a_datetime(f["fecha_hora"]), estado_envio=f["estado_envio"],
                       latitud=f["latitud"], longitud=f["longitud"]) for f in filas]
