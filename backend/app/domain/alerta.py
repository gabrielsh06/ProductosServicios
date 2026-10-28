"""DOMINIO: entidades puras del negocio. No dependen de BD ni de sklearn."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

# Estados posibles del envío de la alerta a la Central PNP 105
ESTADO_PENDIENTE = "PENDIENTE"
ESTADO_ENVIADO = "ENVIADO_PNP"
ESTADO_ERROR = "ERROR_ENVIO"


@dataclass(frozen=True)
class EventoCamara:
    """Lectura simulada que llega desde las cámaras IP del bus."""
    bus_id: str
    velocidad_movimiento: int   # escala 0-100
    acercamiento_brusco: int    # 0 = No, 1 = Sí
    latitud: Optional[float] = None
    longitud: Optional[float] = None

    def __post_init__(self):
        # Reglas de negocio: validamos el rango de las variables del modelo
        if not 0 <= self.velocidad_movimiento <= 100:
            raise ValueError("velocidad_movimiento debe estar entre 0 y 100")
        if self.acercamiento_brusco not in (0, 1):
            raise ValueError("acercamiento_brusco debe ser 0 o 1")


@dataclass
class Alerta:
    """Alerta crítica que se persiste cuando la IA predice agresión."""
    bus_id: str
    velocidad_movimiento: int
    acercamiento_brusco: int
    prediccion_agresion: int
    estado_envio: str = ESTADO_PENDIENTE
    fecha_hora: datetime = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    id: Optional[int] = None

    def __post_init__(self):
        if self.fecha_hora is None:
            self.fecha_hora = datetime.now()
