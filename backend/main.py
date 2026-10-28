"""Punto de entrada: demo rápida del PMV1 por consola (requiere PostgreSQL activo)."""
from app.infrastructure.container import construir_controlador

if __name__ == "__main__":
    controlador, repo = construir_controlador()
    # Evento simulado de la HU-01: [94, 1] en Av. Javier Prado
    r = controlador.recibir_evento("BUS-302", 94, 1, -12.0911, -77.0230)
    print("Predicción:", "FORCEJEO" if r.prediccion else "NORMAL")
    print("Alertas en BD:", len(repo.listar()))
