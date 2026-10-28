"""Mide el contraste WCAG 2.2 (criterio 1.4.3 texto 4,5:1 y 1.4.11 componentes 3:1) de las parejas reales de
colores del sistema. Lee los tokens de frontend/css/global.css, así que si cambias un color vuelve a ejecutarlo.
Uso:  python docs/herramientas/contraste.py            (imprime tabla y sale con código 1 si algo no cumple)
      python docs/herramientas/contraste.py --md      (tabla en Markdown para el informe E06)"""
import re, sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[2] / "frontend" / "css" / "global.css"


def tokens(bloque):
    return {k: v.strip() for k, v in re.findall(r"(--[\w-]+):\s*([^;]+);", bloque)}


def bloques():
    s = CSS.read_text(encoding="utf-8")
    claro = tokens(re.search(r":root\s*\{(.*?)\n\}", s, re.S).group(1))
    oscuro = {**claro, **tokens(re.search(r'html\[data-theme="dark"\]\s*\{(.*?)\n\}', s, re.S).group(1))}
    return claro, oscuro


def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    f = lambda v: (v / 255 / 12.92) if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((lum(rgb(a)), lum(rgb(b))), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# (primer plano, fondo, umbral, descripción, criterio)
PAREJAS = [
    ("--color-text", "--color-bg", 4.5, "Texto principal sobre fondo de página", "1.4.3"),
    ("--color-text", "--color-surface", 4.5, "Texto principal sobre tarjetas", "1.4.3"),
    ("--color-text-secondary", "--color-surface", 4.5, "Texto secundario sobre tarjetas", "1.4.3"),
    ("--color-text-muted", "--color-surface", 4.5, "Texto atenuado / placeholder sobre tarjetas", "1.4.3"),
    ("--color-text-muted", "--color-surface-muted", 4.5, "Texto atenuado sobre superficie gris", "1.4.3"),
    ("--color-primary", "--color-surface", 4.5, "Enlaces y texto primario sobre tarjetas", "1.4.3"),
    ("--color-primary", "--color-primary-soft", 4.5, "Texto primario sobre chip suave", "1.4.3"),
    ("--color-on-fill", "--color-primary", 4.5, "Texto del botón primario", "1.4.3"),
    ("--color-on-fill", "--color-accent", 4.5, "Texto del botón de acento", "1.4.3"),
    ("--color-on-fill", "--color-danger", 4.5, "Texto del botón de peligro / pánico", "1.4.3"),
    ("--color-on-fill", "--color-primary-dark", 4.5, "Texto del botón primario en :hover", "1.4.3"),
    ("--color-on-fill", "--color-danger-dark", 4.5, "Texto del botón de peligro en :hover", "1.4.3"),
    ("--color-danger-dark", "--color-danger-soft", 4.5, "Texto de insignias «Alta» / «Offline» sobre fondo suave", "1.4.3"),
    ("--color-danger", "--color-danger-soft", 3.0, "Icono de peligro sobre fondo suave (no es texto)", "1.4.11"),
    ("--color-danger-text", "--color-danger-soft", 4.5, "Mensaje de error del login", "1.4.3"),
    ("--color-success", "--color-success-soft", 4.5, "Texto «Resuelto» sobre fondo suave", "1.4.3"),
    ("--color-warning", "--color-warning-soft", 4.5, "Texto «Pendiente» sobre fondo suave", "1.4.3"),
    ("--color-warning-text", "--color-warning-soft", 4.5, "Aviso del login", "1.4.3"),
    ("--color-accent", "--color-surface", 4.5, "Texto de acento sobre tarjetas", "1.4.3"),
    ("--color-accent", "--color-accent-soft", 4.5, "Texto de acento sobre fondo suave", "1.4.3"),
    ("--color-input-border", "--color-surface", 3.0, "Borde de campos de formulario", "1.4.11"),
    ("--color-focus", "--color-surface", 3.0, "Anillo de foco sobre tarjetas", "1.4.11"),
    ("--color-focus", "--color-bg", 3.0, "Anillo de foco sobre la página", "1.4.11"),
]


def main():
    md = "--md" in sys.argv
    claro, oscuro = bloques()
    fallos = 0
    filas = []
    for tema, t in (("claro", claro), ("oscuro", oscuro)):
        for fg, bg, umbral, desc, crit in PAREJAS:
            r = ratio(t[fg], t[bg])
            ok = r >= umbral
            fallos += not ok
            filas.append((tema, desc, t[fg], t[bg], r, umbral, crit, ok))
    if md:
        print("| Tema | Combinación | Primer plano | Fondo | Contraste | Mínimo | WCAG | Resultado |\n|---|---|---|---|---|---|---|---|")
        for tema, desc, fg, bg, r, u, crit, ok in filas:
            print(f"| {tema} | {desc} | `{fg}` | `{bg}` | **{r:.2f}:1** | {u}:1 | {crit} | {'✅ Cumple' if ok else '❌ No cumple'} |")
    else:
        for tema, desc, fg, bg, r, u, crit, ok in filas:
            print(f"{'OK ' if ok else 'FALLA'} [{tema:6}] {r:5.2f}:1 (mín {u}) {desc}  {fg} / {bg}")
    print(f"\n{len(filas) - fallos}/{len(filas)} combinaciones cumplen", file=sys.stderr)
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
