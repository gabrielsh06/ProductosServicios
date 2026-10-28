"""Genera el reporte de evidencia en PDF (HU-08 / CA-08.1): captura del frame + metadatos GPS.
Usa reportlab. La captura es una representación del frame procesado (en producción vendría del almacén de evidencias, HU-05)."""
from datetime import datetime
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

AZUL, ROJO, TEXTO, GRIS = colors.HexColor("#1E3A8A"), colors.HexColor("#DC2626"), colors.HexColor("#111827"), colors.HexColor("#4B5563")


def _fila(c, x, y, etiqueta, valor, ancho=170 * mm):
    c.setFont("Helvetica", 9); c.setFillColor(GRIS); c.drawString(x, y, etiqueta.upper())
    c.setFont("Helvetica-Bold", 11); c.setFillColor(TEXTO); c.drawString(x + 45 * mm, y, str(valor))
    c.setStrokeColor(colors.HexColor("#E5E7EB")); c.line(x, y - 2.5 * mm, x + ancho, y - 2.5 * mm)


def generar_pdf_evidencia(a: dict) -> bytes:
    """`a` es el dict de PanelRepository.evidencia(): campos de la alerta + latitude/longitude."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Evidencia {a['id']} - SISTEP")
    w, h = A4
    m = 20 * mm

    c.setFillColor(AZUL); c.rect(0, h - 28 * mm, w, 28 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 18); c.drawString(m, h - 16 * mm, "SISTEP · Reporte de evidencia")
    c.setFont("Helvetica", 10); c.drawString(m, h - 22 * mm, "Seguridad Inteligente · Vision Guardian AI")

    y = h - 42 * mm
    c.setFillColor(TEXTO); c.setFont("Helvetica-Bold", 15); c.drawString(m, y, f"{a['title']} · {a['id']}")
    c.setFillColor(ROJO if a["priority"] == "Alta" else GRIS); c.setFont("Helvetica-Bold", 10)
    c.drawRightString(w - m, y, f"PRIORIDAD {a['priority'].upper()}")

    # Captura del frame (representación vectorial del frame procesado por la IA)
    y -= 8 * mm
    fx, fw, fh = m, w - 2 * m, 78 * mm
    c.setFillColor(colors.HexColor("#0F172A")); c.rect(fx, y - fh, fw, fh, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#1E293B")); c.setLineWidth(0.4)
    for i in range(1, 12): c.line(fx + fw * i / 12, y - fh, fx + fw * i / 12, y)
    for i in range(1, 7): c.line(fx, y - fh * i / 7, fx + fw, y - fh * i / 7)
    c.setStrokeColor(ROJO); c.setLineWidth(1.6); c.rect(fx + fw * 0.34, y - fh * 0.82, fw * 0.3, fh * 0.62, stroke=1, fill=0)
    c.setFillColor(ROJO); c.setFont("Helvetica-Bold", 8); c.drawString(fx + fw * 0.34, y - fh * 0.18, f"{a['type'].upper()} · {a['source']}")
    c.setFillColor(colors.white); c.setFont("Helvetica", 8)
    c.drawString(fx + 3 * mm, y - 5 * mm, f"{a['bus']}  ·  {a['evidenceCaption']}")
    c.drawRightString(fx + fw - 3 * mm, y - fh + 3 * mm, f"{a['date']} {a['clock']}")
    y -= fh + 4 * mm
    c.setFillColor(GRIS); c.setFont("Helvetica-Oblique", 8)
    c.drawString(m, y, "Captura del frame procesado por el modelo de IA (representación para el prototipo académico).")

    # Metadatos
    y -= 12 * mm
    c.setFillColor(AZUL); c.setFont("Helvetica-Bold", 11); c.drawString(m, y, "METADATOS DEL EVENTO")
    y -= 8 * mm
    lat, lon = a.get("latitude"), a.get("longitude")
    gps = f"{lat:.6f}, {lon:.6f}" if lat is not None and lon is not None else "No disponible para esta alerta"
    for et, val in [("Alerta", a["id"]), ("Tipo", f"{a['type']} ({a['source']})"), ("Unidad", a["bus"]),
                    ("Fecha y hora", f"{a['date']} {a['clock']} (America/Lima)"), ("Estado", a["status"]),
                    ("Ubicación", a["location"]), ("Coordenadas GPS", gps)]:
        _fila(c, m, y, et, val); y -= 8 * mm

    c.setFillColor(GRIS); c.setFont("Helvetica", 8)
    c.drawString(m, 18 * mm, f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} por SISTEP. Documento de apoyo; no sustituye el parte policial.")
    c.showPage(); c.save()
    return buf.getvalue()
