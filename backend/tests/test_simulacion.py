"""Evidencia PDCA (fase CHECK) de la HU-01: casos de prueba + SELECT a la base de datos.
Uso:  python -m tests.test_simulacion      (PostgreSQL con DATABASE_URL del .env; o TEST_DATABASE_URL)"""
import os
from app.infrastructure import config
from app.infrastructure.container import construir_controlador
from app.infrastructure.db import Database

DB_URL = os.getenv("TEST_DATABASE_URL", config.DATABASE_URL)


def main():
    db = Database(DB_URL)
    controlador, repo = construir_controlador(db=db)
    with db.transaction() as c:
        c.execute("DELETE FROM Alertas")          # tabla limpia en cada corrida
    resultados = []

    def caso(id_, descripcion, bus, vel, acer, lat, lon, esperado):
        print(f"\n--- {id_}: {descripcion} (vel={vel}, acercamiento={acer}) ---")
        r = controlador.recibir_evento(bus, vel, acer, lat, lon)
        ok = (r.prediccion == esperado) and ((r.alerta is not None) == bool(esperado))
        print(f"   Predicción={r.prediccion} | Alerta guardada={'SÍ' if r.alerta else 'NO'} "
              f"| Resultado: {'APROBADA' if ok else 'FALLIDA'}")
        resultados.append((id_, ok))

    caso("CP-01", "Contacto normal / aglomeración", "BUS-302", 15, 0, -12.0464, -77.0428, 0)   # NO guarda alerta
    caso("CP-02", "Forcejeo / asalto", "BUS-302", 95, 1, -12.0911, -77.0230, 1)               # SÍ guarda alerta

    print("\n--- CP-03: velocidad fuera de rango (150) ---")
    try:
        controlador.recibir_evento("BUS-302", 150, 1)
        resultados.append(("CP-03", False)); print("   Resultado: FALLIDA (aceptó dato inválido)")
    except ValueError as e:
        resultados.append(("CP-03", True)); print(f"   Rechazado: {e} | Resultado: APROBADA")

    print(f"\n=== SELECT * FROM Alertas  ({db.nombre}) ===")
    with db.transaction() as c:
        filas = c.all("SELECT id, bus_id, velocidad_movimiento, acercamiento_brusco, prediccion_agresion, "
                      "fecha_hora, estado_envio, latitud, longitud FROM Alertas ORDER BY id")
    for f in filas:
        print("  ", tuple(f.values()))
    ok_bd = len(filas) == 1 and filas[0]["prediccion_agresion"] == 1 and filas[0]["estado_envio"] == "ENVIADO_PNP"
    resultados.append(("BD", ok_bd))
    print(f"\nFilas persistidas: {len(filas)} (esperado: 1) -> {'APROBADA' if ok_bd else 'FALLIDA'}")

    print("\n=== RESUMEN ===")
    for id_, ok in resultados:
        print(f"  {id_}: {'APROBADA' if ok else 'FALLIDA'}")
    raise SystemExit(0 if all(ok for _, ok in resultados) else 1)


if __name__ == "__main__":
    main()
