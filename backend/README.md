# SISTEP Vision Guardian AI · Backend

FastAPI + PostgreSQL + Random Forest, arquitectura hexagonal (dominio, aplicación, puertos, adaptadores).
Implementa el contrato `../frontend/INTEGRACION_BACKEND.md` (10 endpoints bajo `/api`) y el endpoint HU-01
`POST /api/eventos`. Incluye autenticación con JWT HS256, contraseñas PBKDF2 y tabla `panel_usuarios`.
Instrucciones de arranque y pruebas: ver `../README.md`.
Ejemplos de cada endpoint: `docs/pruebas_api.http`.

## Autenticación

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (ver `docs/pruebas_api.http`).
- Todos los endpoints de datos exigen `Authorization: Bearer <token>`; `/api/health` es público.
- La lógica vive en `app/application/autenticar.py`, `app/infrastructure/seguridad.py`,
  `app/adapters/salida/usuario_repository_db.py` y `app/adapters/entrada/api_auth.py`.
- Configuración en `.env`: `AUTH_SECRET`, `AUTH_TOKEN_MINUTOS`, `AUTH_MAX_INTENTOS`,
  `AUTH_BLOQUEO_MINUTOS`, `AUTH_SEED_DEMO`, `AUTH_DEMO_PASSWORD`.
