"""ADAPTADOR de salida: modelo simulado (reglas) para probar sin sklearn."""
from app.ports.modelo_prediccion import ModeloPrediccionPort


class ModeloMock(ModeloPrediccionPort):
    def predecir(self, velocidad_movimiento: int, acercamiento_brusco: int) -> int:
        # Imita lo que aprendió el árbol con los datos de la guía 9
        return 1 if velocidad_movimiento >= 70 and acercamiento_brusco == 1 else 0
