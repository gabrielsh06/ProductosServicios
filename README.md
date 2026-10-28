# SISTEP · Panel de Seguridad (frontend + backend integrados)

```
sistep/
├── backend/    FastAPI + PostgreSQL + Random Forest (contrato INTEGRACION_BACKEND.md v1.0)
└── frontend/   HTML/CSS/JS nativo (repo ProductosServiciosFront), ya conectado al API
```

## Puesta en marcha (3 pasos)

```bash
# 1) PostgreSQL (con Docker; o usa tu propia instancia y ajusta DATABASE_URL)
cd backend
docker compose up -d

# 2) Backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # Windows: copy .env.example .env
python entrenar_modelo.py                               # genera models/modelo_rf.pkl
uvicorn app.adapters.entrada.api_contrato:app --port 3000 --reload

# 3) Abrir http://localhost:3000   (el backend sirve el frontend en el mismo origen: API_BASE = "/api")
```
Las tablas y los datos demo se crean solos en el primer arranque. `python seed_demo.py` los reinicia.

La primera pantalla es el **login**. Si no hay sesión, el panel redirige a `/login.html`.

## Acceso y autenticación

Usuarios demo (se crean solo si la tabla `panel_usuarios` está vacía):

| Usuario | Contraseña | Rol | Nombre |
|---|---|---|---|
| `admin` | `Sistep2026!` | Administrador | Administrador SISTEP |
| `acastro` | `Sistep2026!` | Operador | Ana Castro |
| `cmendez` | `Sistep2026!` | Operador | Carlos Méndez |

- También puedes ingresar con el correo (`ana.castro@sistep.pe`).
- El token es un JWT HS256 con duración de 8 h (`AUTH_TOKEN_MINUTOS`).
- Todos los endpoints del panel y `POST /api/eventos` exigen `Authorization: Bearer <token>`.
- `POST /api/auth/login` bloquea temporalmente tras 5 intentos fallidos (`AUTH_MAX_INTENTOS`).
- En producción define `AUTH_SECRET` (largo y aleatorio), cambia `AUTH_DEMO_PASSWORD` y pon
  `AUTH_SEED_DEMO=0` para no crear cuentas demo.

Endpoints de autenticación:

```bash
# Login -> devuelve { token, tokenType, expiresIn, expiresAt, user }
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"usuario":"acastro","password":"Sistep2026!","recordar":true}'

# Sesión actual
curl localhost:3000/api/auth/me -H "Authorization: Bearer TOKEN"

# Cerrar sesión (revoca el token)
curl -X POST localhost:3000/api/auth/logout -H "Authorization: Bearer TOKEN"
```

Si ya tienes PostgreSQL sin Docker: `createdb sistep` y pon en `.env`
`DATABASE_URL=postgresql://USUARIO:CLAVE@localhost:5432/sistep`.

## Frontend en otro puerto (opcional)
```bash
cd frontend && python -m http.server 5500
```
y antes de `js/api.js` agrega `<script>window.SISTEP_API_BASE = "http://localhost:3000/api";</script>`
(CORS ya permite http://localhost:5500; se cambia con `CORS_ORIGINS` en `.env`).

## Pruebas
| Comando (desde `backend/`) | Qué verifica |
|---|---|
| `python -m tests.test_simulacion` | HU-01: IA -> tabla Alertas -> SELECT (evidencia PDCA) |
| `python -m tests.test_panel` | Reglas del contrato (estados, reportes, config 422/409, idempotencia) |
| `python -m tests.test_auth` | Login, hash PBKDF2, firma/expiración del token, logout y bloqueo por intentos |
| `python -m tests.test_http` | HTTP real: login, 401 sin sesión, CORS, OPTIONS 204, errores JSON, frontend en `/` |

Por defecto usan SQLite temporal; con PostgreSQL: `TEST_DATABASE_URL=postgresql://... python -m tests.test_panel`
(recrea las tablas `panel_*`).

## Cómo se conecta la IA con el panel
`POST /api/eventos` (HU-01) pasa el evento por el Random Forest. Si predice agresión guarda la fila en
`Alertas` **y** crea una alerta `AL-###` en la bandeja; al abrir/recargar **Alertas** aparece en pantalla.
Requiere el token del login:
```bash
TOKEN="<token devuelto por /api/auth/login>"
curl -X POST localhost:3000/api/eventos -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bus_id":"BUS-302","velocidad_movimiento":95,"acercamiento_brusco":1,"latitud":-12.0911,"longitud":-77.023}'
```
