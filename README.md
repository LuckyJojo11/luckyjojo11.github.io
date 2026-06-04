# Link Raster

Diese Seite wird ueber `index.html` gestartet und liest ihre Inhalte aus zwei JSON-Dateien.

## Hauptkacheln

`buttons.json` enthaelt beliebig viele Kacheln:

```json
{
  "name": "Dashboard",
  "description": "Uebersicht und wichtige Kennzahlen.",
  "url": "pages/dashboard.html",
  "icon": "icons/dashboard.svg",
  "background": "icons/bg-dashboard.svg"
}
```

- `name`: Titel der Kachel
- `description`: kurzer Beschreibungstext
- `url`: Ziel beim Klick
- `icon`: Bild aus dem `icons`-Ordner, empfohlen maximal 128x128 Pixel
- `background`: Hintergrundbild, fuellt die ganze Kachel und wird dynamisch zugeschnitten

## Obere Leiste

`nav.json` enthaelt die Link-Knoepfe der Mainbar:

```json
{
  "title": "Kontakt",
  "url": "pages/kontakt.html"
}
```

## Vorschau

Starte im Ordner `outputs` einen lokalen Webserver, damit die JSON-Dateien im Browser geladen werden koennen.
