"""INFRAESTRUCTURA: configuración desde variables de entorno / archivo .env."""
import os


def _cargar_env(ruta=".env"):
    # Mini-lector de .env (evita depender de python-dotenv)
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith("#") and "=" in linea:
                    k, v = linea.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


_cargar_env()

# PostgreSQL:  postgresql://usuario:clave@localhost:5432/sistep
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sistep")
MODEL_PATH = os.getenv("MODEL_PATH", "models/modelo_rf.pkl")
MODEL_BACKEND = os.getenv("MODEL_BACKEND", "random_forest")

# Autenticación. En producción AUTH_SECRET es obligatorio y debe ser largo y aleatorio.
AUTH_SECRET = os.getenv("AUTH_SECRET", "sistep-dev-secret-cambiar-en-produccion")
AUTH_TOKEN_MINUTOS = int(os.getenv("AUTH_TOKEN_MINUTOS", "480"))       # 8 horas
AUTH_MAX_INTENTOS = int(os.getenv("AUTH_MAX_INTENTOS", "5"))
AUTH_BLOQUEO_MINUTOS = int(os.getenv("AUTH_BLOQUEO_MINUTOS", "5"))
# Usuarios demo: se crean solo si la tabla panel_usuarios está vacía.
AUTH_SEED_DEMO = os.getenv("AUTH_SEED_DEMO", "1") != "0"
AUTH_DEMO_PASSWORD = os.getenv("AUTH_DEMO_PASSWORD", "Sistep2026!")
