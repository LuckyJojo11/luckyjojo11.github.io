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
- `status`: optionales Status-Label oben rechts
- `tags`: optionale Liste von Tag-IDs aus `tags.json`
- `badges`: optionale Liste von nicht filterbaren Tag-IDs aus `tags.json`

## Status

Jede Kachel kann ein Status-Objekt bekommen:

```json
{
  "status": {
    "version": "1.0.0",
    "releaseDate": "2026-06-10T18:00:00+02:00",
    "mode": 0,
    "hidden": false
  }
}
```

- `version`: wird beim gruenen Release-Status als `Version ...` angezeigt
- `releaseDate`: leer bedeutet rot `Work in Progress`
- `mode`: `0` dynamisch, `1` Released, `2` Scheduled ohne Datum/Countdown, `3` Work in Progress
- `hidden`: `true` blendet das Status-/Release-Label komplett aus
- zukuenftiges `releaseDate`: gelb `Release on ...`
- weniger als 48 Stunden bis zum Release: gelber Countdown
- vergangenes `releaseDate`: gruen `Version ...`

Das Aussehen und die Texte der drei Status-Labels kommen aus `tags.json`.
Diese Eintraege haben `filter: false`, damit sie nicht als normale Projektfilter angezeigt werden:

```json
{
  "id": "status-released",
  "description": "Version {version}",
  "icon": "badge-check",
  "background": "rgba(51, 168, 111, 0.78)",
  "color": "white",
  "filter": false
}
```

Verfuegbare Platzhalter: `{version}`, `{date}`, `{countdown}`.
Fuer den Countdown kann optional `countdownDescription` verwendet werden.
Fuer `mode: 2` kann optional `manualDescription` verwendet werden.

Optional kann eine Kachel andere Status-Style-IDs nutzen:

```json
{
  "status": {
    "version": "1.0.0",
    "releaseDate": "",
    "styles": {
      "wip": "status-wip",
      "scheduled": "status-scheduled",
      "released": "status-released"
    }
  }
}
```

## Tags

`tags.json` definiert alle Tags zentral:

```json
[
  {
    "id": "minecraft",
    "description": "Minecraft",
    "icon": "gamepad",
    "background": "rgba(105, 167, 207, 0.24)",
    "color": "blue"
  }
]
```

In `buttons.json` werden dann nur die IDs verwendet:

```json
{
  "tags": ["minecraft", "modding"]
}
```

Beim Klick auf einen Tag werden nur Projekte mit diesem Tag angezeigt. Wenn mehrere Tags aktiv sind, reicht ein Treffer.
Alle Tags erscheinen ueber den Kacheln. Ohne aktiven Filter sind alle bunt. Sobald Tags aktiv sind, bleiben aktive Tags bunt und nicht aktive Tags werden grau.
Ein Klick auf einen Tag schaltet ihn ein oder aus. Wenn mehrere Tags aktiv sind, reicht ein Treffer.
Das Suchfeld filtert zusaetzlich nach Projektname, Beschreibung und Tag-Beschreibung.

Lokale Icon-Namen: `code`, `gamepad`, `rocket`, `wrench`, `zap`, `tag`.
Andere Icon-Namen werden automatisch aus der Lucide/Iconify-Library geladen, zum Beispiel `github`, `download`, `external-link`, `shield` oder `box`.
Mit `color` kann die Icon- und Standard-Textfarbe des Tags gesetzt werden.

Unfilterbare Anzeige-Tags koennen mit `filter: false` angelegt und ueber `badges` auf Kacheln angezeigt werden.
Sie erscheinen rechts oben neben dem Status-Label:

```json
{
  "id": "collab",
  "description": "Collab",
  "icon": "users",
  "background": "rgba(183, 148, 244, 0.22)",
  "color": "purple",
  "filter": false,
  "releaseVisibility": 0
}
```

```json
{
  "badges": ["collab"]
}
```

`releaseVisibility` kann bei der Kachel selbst, Tags, Badges und kleinen Kachel-Buttons gesetzt werden:

```text
0 = immer sichtbar
1 = grau wenn unreleased
2 = unsichtbar wenn unreleased
```

Unreleased bedeutet: Der Status ist nicht `Released`.
Graue kleine Buttons sind nicht anklickbar. Eine graue Kachel bleibt optisch vorhanden, verweist aber nicht auf die Projektseite.

## Kleine Kachel-Buttons

Mit `buttons` koennen rechts unten optionale Link-Knoepfe auf einer Kachel angezeigt werden.
Sie funktionieren wie Tags, haben aber zusaetzlich `url`:

```json
{
  "buttons": [
    {
      "icon": "rocket",
      "background": "rgba(105, 167, 207, 0.24)",
      "color": "blue",
      "text": "Open",
      "url": "Eclipse-Client"
    }
  ]
}
```

Die Knoepfe starten unten rechts, stapeln sich nach oben und laufen bei vielen Eintraegen nach links weiter.

## Textformatierung

In `name`, `description`, Tag-`text` und Button-`text` koennen kurze Formatierungs-Tags verwendet werden:

```json
{
  "name": "[color=#69a7cf][bold]Eclipse[/bold][/color] Client",
  "description": "Built for [yellow][italic]Speed[/italic][/yellow]",
  "tags": [
    {
      "icon": "zap",
      "background": "rgba(255, 205, 86, 0.22)",
      "text": "[yellow]Speed[/yellow]"
    }
  ]
}
```

Farben: `[blue]Text[/blue]`, `[green]Text[/green]`, `[yellow]Text[/yellow]`, `[color=#69a7cf]Text[/color]`

Stile: `[bold]Text[/bold]`, `[italic]Text[/italic]`, `[underline]Text[/underline]`, `[strikethrough]Text[/strikethrough]`

Groesse: `[size=1.2rem]Text[/size]`, `[size=18px]Text[/size]`, `[size=120%]Text[/size]`

Schrift: `[font=serif]Text[/font]`, `[font=mono]Text[/font]`, `[font=sans]Text[/font]`

Links: `[link=https://github.com/Jengiz01]Jengiz01[/link]`

Verfuegbare Farbnamen: `blue`, `cyan`, `green`, `yellow`, `orange`, `red`, `pink`, `purple`, `white`, `muted`.
Verfuegbare Schriftarten: `sans`, `serif`, `mono`, `cursive`, `fantasy`, `system`.

Ein einzelner Backslash erzeugt einen Zeilenumbruch, zwei Backslashes erzeugen einen sichtbaren Backslash.
In JSON bedeutet das:

```json
{
  "description": "Erste Zeile\\Zweite Zeile",
  "text": "Pfad: C:\\\\Users"
}
```

## Obere Leiste

`nav.json` enthaelt die Link-Knoepfe der Mainbar:

```json
{
  "title": "Kontakt",
  "url": "pages/kontakt.html"
}
```

## Editor

Unter `/editor/` gibt es einen visuellen Editor fuer `buttons.json`, `tags.json` und `nav.json`.
Er hat eigene Bereiche fuer Projekte, Tags und obere Knoepfe.

Bei Projekten gibt es sichtbare Abschnitte fuer:

- `Edit Icons, Name and Description`
- `Edit Tags and Badges`
- `Edit Release`
- `Edit Buttons`

Tags und obere Knoepfe koennen dort ebenfalls hinzugefuegt, bearbeitet und entfernt werden.
Der Editor speichert automatisch einen lokalen Entwurf im Browser und zeigt eine Desktop- und Mobile-Vorschau.
Die JSON-Vorschau bleibt darunter erhalten, falls man Details direkt sehen oder importieren moechte.
Da die Seite statisch laeuft, kann der Browser die Projektdateien nicht direkt ueberschreiben.

## Accountsystem

Das Login nutzt Supabase Auth. Trage deine Supabase-Projektdaten in `supabase-config.js` ein:

```js
window.SUPABASE_CONFIG = {
  url: "https://dein-projekt.supabase.co",
  anonKey: "dein-public-anon-key",
  allowedEditorEmails: ["deine-mail@example.com"]
};
```

- `url`: Supabase Project URL
- `anonKey`: der public/anon key aus Supabase
- `allowedEditorEmails`: optionale Liste von E-Mail-Adressen, die den Editor benutzen duerfen

Wenn `allowedEditorEmails` leer bleibt, darf jeder eingeloggte Account den Editor oeffnen.
Der anon key ist fuer Browser-Projekte gedacht und nicht geheim. Service-Role-Keys duerfen niemals in diese Datei.
Neue Accounts koennen beim Registrieren einen Nutzernamen angeben. Dieser wird in Supabase als User-Metadata gespeichert und in der Kopfzeile angezeigt.

Login und Registrierung laufen ueber eigene Seiten:

- `/login/`
- `/sign-up/`

Damit Login per Nutzername funktioniert, braucht Supabase eine `profiles`-Tabelle:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  avatar_url text default '',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can read profiles for username login"
on public.profiles
for select
using (true);

create policy "Users can update their own profile"
on public.profiles
for all
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

Neue Accounts werden nach erfolgreicher Registrierung in diese Tabelle eingetragen. Wenn E-Mail-Bestaetigung aktiv ist, passiert das nach dem ersten Login.

Der Editor kann die Projektinhalte optional in Supabase speichern. Lege dafuer in Supabase im SQL Editor diese Tabelle und Policies an:

```sql
create table if not exists public.site_content (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz default now()
);

alter table public.site_content enable row level security;

create policy "Anyone can read site content"
on public.site_content
for select
using (true);

create policy "Editor can write site content"
on public.site_content
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'johannes.knoblich@outlook.de')
with check ((auth.jwt() ->> 'email') = 'johannes.knoblich@outlook.de');
```

Danach koennen im Editor `Save to Database` und `Load from Database` verwendet werden.
Die Hauptseite nutzt Daten aus der Datenbank, wenn unter `contentKey` ein Eintrag vorhanden ist, und faellt sonst auf die JSON-Dateien zurueck.

Fuer Bild-Uploads wird ein Supabase Storage Bucket verwendet. Lege einen public Bucket mit dem Namen `site-images` an.
Danach koennen Profilbilder sowie Projekt-Icons und Projekt-Hintergruende hochgeladen werden.

Falls du Policies manuell anlegst, nutze fuer den Bucket sinngemaess:

```sql
create policy "Anyone can read site images"
on storage.objects
for select
using (bucket_id = 'site-images');

create policy "Editor can upload site images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-images'
  and (auth.jwt() ->> 'email') = 'johannes.knoblich@outlook.de'
);
```

## Vorschau

Starte im Projektordner einen lokalen Webserver, damit die JSON-Dateien im Browser geladen werden koennen.
