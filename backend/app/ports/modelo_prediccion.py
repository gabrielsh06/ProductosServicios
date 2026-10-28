"""PUERTO de salida: contrato que debe cumplir cualquier modelo de IA."""
from abc import ABC, abstractmethod


class ModeloPrediccionPort(ABC):
    @abstractmethod
    def predecir(self, velocidad_movimiento: int, acercamiento_brusco: int) -> int:
        """Devuelve 1 (forcejeo/asalto) o 0 (contacto normal)."""
