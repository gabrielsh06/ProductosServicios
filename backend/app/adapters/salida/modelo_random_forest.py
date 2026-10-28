"""ADAPTADOR de salida: carga el RandomForestClassifier entrenado (.pkl)."""
import os
import joblib
from app.ports.modelo_prediccion import ModeloPrediccionPort


class ModeloRandomForest(ModeloPrediccionPort):
    def __init__(self, model_path: str):
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"No existe {model_path}. Ejecuta primero: python entrenar_modelo.py")
        self.modelo = joblib.load(model_path)

    def predecir(self, velocidad_movimiento: int, acercamiento_brusco: int) -> int:
        # El modelo espera [[velocidad_movimiento, acercamiento_brusco]]
        return int(self.modelo.predict([[velocidad_movimiento, acercamiento_brusco]])[0])
