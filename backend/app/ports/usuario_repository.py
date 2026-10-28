"""PUERTO de salida: persistencia de usuarios."""
from abc import ABC, abstractmethod
from typing import Optional
from app.domain.usuario import Usuario


class UsuarioRepository(ABC):
    @abstractmethod
    def inicializar(self) -> None:
        """Crea el esquema y los usuarios demo si hace falta."""

    @abstractmethod
    def buscar_por_usuario(self, usuario: str) -> Optional[Usuario]:
        """Busca por nombre de usuario o correo (sin distinguir mayúsculas)."""

    @abstractmethod
    def buscar_por_id(self, usuario_id: str) -> Optional[Usuario]:
        ...

    @abstractmethod
    def password_hash(self, usuario_id: str) -> Optional[str]:
        ...

    @abstractmethod
    def registrar_acceso(self, usuario_id: str, momento: str) -> None:
        ...
