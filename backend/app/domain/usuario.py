"""DOMINIO: usuario que puede acceder al panel de seguridad."""
from dataclasses import dataclass
from typing import Optional

ROLES = {"admin": "Administrador", "operador": "Operador"}


@dataclass(frozen=True)
class Usuario:
    id: str
    usuario: str
    nombre: str
    correo: str
    rol: str
    activo: bool = True
    ultimo_acceso: Optional[str] = None

    @property
    def rol_etiqueta(self) -> str:
        return ROLES.get(self.rol, self.rol.capitalize())

    @property
    def iniciales(self) -> str:
        partes = [p for p in self.nombre.replace(".", " ").split() if p]
        return "".join(p[0] for p in partes[:2]).upper() or self.usuario[:2].upper()

    def publico(self) -> dict:
        """Datos seguros para enviar al navegador (nunca incluye el hash de la contraseña)."""
        return {
            "id": self.id,
            "usuario": self.usuario,
            "nombre": self.nombre,
            "correo": self.correo,
            "rol": self.rol,
            "rolLabel": self.rol_etiqueta,
            "iniciales": self.iniciales,
            "activo": self.activo,
            "ultimoAcceso": self.ultimo_acceso or "",
        }
