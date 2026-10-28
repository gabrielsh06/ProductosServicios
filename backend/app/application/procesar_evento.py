"""APLICACIÓN / CASO DE USO (HU-01): procesar un evento de cámara y alertar a la PNP."""
import logging
from dataclasses import dataclass
from typing import Optional
from app.domain.alerta import (Alerta, EventoCamara, ESTADO_PENDIENTE,
                               ESTADO_ENVIADO, ESTADO_ERROR)
from app.ports.alerta_repository import AlertaRepositoryPort
from app.ports.modelo_prediccion import ModeloPrediccionPort

log = logging.getLogger("sistep")


@dataclass
class ResultadoProcesamiento:
    prediccion: int
    alerta: Optional[Alerta]   # None si no hubo agresión


class ProcesarEventoUseCase:
    def __init__(self, modelo: ModeloPrediccionPort, repo: AlertaRepositoryPort):
        # Dependemos de puertos (abstracciones), no de SQLite ni sklearn
        self.modelo = modelo
        self.repo = repo

    def ejecutar(self, evento: EventoCamara) -> ResultadoProcesamiento:
        # 1) Procesamiento de IA: Random Forest clasifica el evento
        prediccion = self.modelo.predecir(evento.velocidad_movimiento, evento.acercamiento_brusco)

        # 2) Sin agresión: no se persiste nada (Given contacto normal -> Then sin alerta)
        if prediccion != 1:
            return ResultadoProcesamiento(prediccion=0, alerta=None)

        # 3) Con agresión: se guarda la alerta geolocalizada
        alerta = Alerta(bus_id=evento.bus_id,
                        velocidad_movimiento=evento.velocidad_movimiento,
                        acercamiento_brusco=evento.acercamiento_brusco,
                        prediccion_agresion=1, estado_envio=ESTADO_PENDIENTE,
                        latitud=evento.latitud, longitud=evento.longitud)
        alerta = self.repo.guardar(alerta)

        # 4) Simulación del envío a la Central PNP 105 y actualización del estado
        try:
            self._enviar_a_pnp(alerta)
            self.repo.actualizar_estado(alerta.id, ESTADO_ENVIADO)
            alerta.estado_envio = ESTADO_ENVIADO
        except Exception as e:
            log.error("Fallo el envio a PNP: %s", e)
            self.repo.actualizar_estado(alerta.id, ESTADO_ERROR)
            alerta.estado_envio = ESTADO_ERROR
        return ResultadoProcesamiento(prediccion=1, alerta=alerta)

    @staticmethod
    def _enviar_a_pnp(alerta: Alerta) -> None:
        # Aquí iría la llamada HTTPS (TLS) real a la Central PNP 105; en el PMV1 solo se simula
        print(f"   [PNP 105] Alerta #{alerta.id} enviada | bus={alerta.bus_id} "
              f"| GPS=({alerta.latitud}, {alerta.longitud})")
