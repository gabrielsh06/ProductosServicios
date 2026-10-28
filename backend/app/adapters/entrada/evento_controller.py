"""ADAPTADOR de entrada: recibe eventos simulados y llama al caso de uso."""
from app.application.procesar_evento import ProcesarEventoUseCase, ResultadoProcesamiento
from app.domain.alerta import EventoCamara


class EventoController:
    def __init__(self, caso_uso: ProcesarEventoUseCase):
        self.caso_uso = caso_uso

    def recibir_evento(self, bus_id, velocidad, acercamiento, lat=None, lon=None) -> ResultadoProcesamiento:
        # Traduce datos crudos a un objeto de dominio (valida rangos) y delega
        evento = EventoCamara(bus_id, velocidad, acercamiento, lat, lon)
        return self.caso_uso.ejecutar(evento)
