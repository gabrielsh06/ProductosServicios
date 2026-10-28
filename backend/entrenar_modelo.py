"""Entrena el RandomForest con los datos simulados de la guía 9 y lo guarda en .pkl."""
import os
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# Mismos datos simulados de la PoC (guía 9)
velocidad = [15, 20, 85, 90, 25, 75, 80, 10, 95, 88, 30, 70, 92, 12, 89]
acercamiento = [0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]
agresion = [0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]

X = [[v, a] for v, a in zip(velocidad, acercamiento)]
X_train, X_test, y_train, y_test = train_test_split(X, agresion, test_size=0.30, random_state=42)

modelo = RandomForestClassifier(random_state=42).fit(X_train, y_train)
print("Accuracy en test:", accuracy_score(y_test, modelo.predict(X_test)))

os.makedirs("models", exist_ok=True)
joblib.dump(modelo, "models/modelo_rf.pkl")
print("Modelo guardado en models/modelo_rf.pkl")
