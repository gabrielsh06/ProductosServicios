"""Reinicia las tablas del panel con datos demo (fechas relativas a hoy). Uso: python seed_demo.py"""
from app.adapters.salida.panel_repository import PanelRepository
from app.infrastructure.config import DATABASE_URL
from app.infrastructure.db import Database

if __name__ == "__main__":
    PanelRepository(Database(DATABASE_URL)).reiniciar_demo()
    print("Datos demo del panel recreados.")
