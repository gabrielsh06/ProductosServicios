"""PUERTO de salida: contrato de persistencia de alertas."""
from abc import ABC, abstractmethod
from typing import List
from app.domain.alerta import Alerta


class AlertaRepositoryPort(ABC):
    @abstractmethod
    def guardar(self, alerta: Alerta) -> Alerta: ...

    @abstractmethod
    def actualizar_estado(self, alerta_id: int, nuevo_estado: str) -> None: ...

    @abstractmethod
    def listar(self) -> List[Alerta]: ...
