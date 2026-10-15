# Szeneneditor – Paket 1: Bedienung im Browserentwurf (Issue #44)

Stand: 15\. Oktober 2026. Status: in Umsetzung als Pull Request, nicht gemergt, nicht produktiv.

Grundlage: bestätigte Planungsrunde [szeneneditor.md](../planung/szeneneditor.md) (D006), Anforderungen F06/F07 und Abschnitt 5 in [anforderungen.md](../anforderungen.md). Verantwortlich: Claude (Umsetzung), Review: Codex.

## Umfang

Paket 1 verändert **kein Datenbank- oder Vertragsschema**. Es arbeitet auf der bestehenden Szenendefinition (`packages/contracts/src/scene.ts`: Text, Rechteck, Bild; Position, Größe, Deckkraft, Sichtbarkeit; höchstens 64 Ebenen). Speicherung, Szenensperre und lokale Wiederherstellung aus S3-06 bleiben unverändert.

| D006 | Umsetzung in Paket 1 |
|---|---|
| 1 Bereiche ausblendbar | Ebenenliste und Eigenschaftenleiste einzeln ausblendbar; „Große Arbeitsfläche“ über die ganze Seite, Escape verlässt sie |
| 3 Werkzeugleiste und Ziehen aus der Bibliothek | Werkzeugleiste für Text/Rechteck/Bild; geprüfte bzw. in Prüfung befindliche PNG/JPEG-Medien der Show lassen sich auf die Arbeitsfläche ziehen oder per Klick einfügen |
| 4/5 passende Eigenschaften, Weiteres aufklappbar | Eigenschaftenleiste nur für die gewählte Ebene; Deckkraft, Sichtbarkeit, Reihenfolge und Duplizieren unter „Weitere Einstellungen“ |
| 6 Autospeichern | unverändert aus S3-06; jede Änderung (auch Rückgängig) geht in denselben verzögerten Entwurfsspeicher |
| 8 Einpassen zuerst | neue Bildebenen starten mit „Vollständig einpassen“ und dem Seitenverhältnis aus der Medienanalyse |
| 9 Ebenennamen und Symbole | automatische fortlaufende Namen („Text 1“, „Bild 2“), frei umbenennbar; Symbol, Farbfeld bzw. Miniatur je Ebene |
| 10 Fehlende Medien | deutlicher Platzhalter „Medium fehlt“ auf der Arbeitsfläche und Fehler in der Prüfübersicht |

Zusätzlich (F07 „Mausbedienung und genaue Zahlenwerte“, Abschnitt 5 „Undo/Redo, Hilfslinien, abschaltbares Einrasten“):

- Ebenen auf der Arbeitsfläche anklicken, verschieben und über den Eckgriff skalieren; Umschalt hält beim Skalieren das Seitenverhältnis, Alt unterdrückt das Einrasten.
- Einrasten an Rand und Mitte der Szene mit sichtbaren Hilfslinien, abschaltbar.
- Pfeiltasten verschieben um 1, mit Umschalt um 10 logische Pixel; Entf entfernt die gewählte Ebene.
- Zahlenfelder übernehmen Werte erst, wenn sie im gültigen Bereich liegen; begonnene Eingaben (z. B. „2“ auf dem Weg zu „24“) werden nicht sofort korrigiert, sondern erst beim Verlassen des Feldes.
- Rückgängig/Wiederholen (Strg+Z, Strg+Y bzw. Strg+Umschalt+Z) mit höchstens 100 Schritten. Ein Ziehvorgang ist ein Schritt; Eingaben im selben Feld innerhalb einer Sekunde werden zusammengefasst. Der Verlauf gilt nur für die laufende Bearbeitung und wird beim Freigeben verworfen.
- Prüfübersicht der Szene: leere oder zu lange Szenen-/Ebenennamen (verhindern das Speichern), fehlende, fehlgeschlagene oder noch nicht geprüfte Medien, vollständig außerhalb liegende oder vollständig transparente sichtbare Ebenen und leere Texte. Ein Klick wählt die betroffene Ebene.

Die Große Arbeitsfläche zeigt den Speicherstatus und wird bei Speicher- oder Sperrfehlern automatisch verlassen, damit Meldung und Freigabe sichtbar sind. Abgelegte Medien werden nur angenommen, wenn sie zur Show bzw. Veranstaltung gehören. Bis die Medienliste einmal geladen ist, werden keine Medien als fehlend gemeldet.

## Gegenprüfung vor dem Codex-Review

Eine unabhängige Subagenten-Prüfung (Claude, ohne Kenntnis der Umsetzung) an `499645f` fand keinen P1-Befund, drei P2- und acht P3-Befunde. Behoben im Fixcommit direkt nach `499645f` (Hash im PR #55): Zahleneingabe, Statusanzeige in der Großansicht, Prüfung abgelegter Medien-IDs, Ziehabbruch, Tastenkürzel auf Checkboxen/Farbfeldern, Entf nur auf der Arbeitsfläche, Seitenverhältnis hoher Bilder, Pfeiltasten ohne Größenrundung, Medienliste noch nicht geladen, Namensfehler in der Prüfübersicht, Medienleiste unabhängig vom Speichervorgang. Diese Vorprüfung ersetzt das Review durch Codex nicht.

## Nicht enthalten (Folgepakete)

Diese Punkte brauchen Schemaerweiterungen, Rendererarbeit oder Betreiberentscheidungen und sind ausdrücklich nicht umgesetzt:

- Vorlagen beim Anlegen (D006 Punkt 2), Gruppen, Ebenensperren, Drehung, Zoom, Raster
- Video-/Animationsebenen mit Abspielen, Pause und Zeitleiste (D006 Punkt 7), Kameras
- Textausrichtung, Konturen, Schatten, abschnittsweise Textformate, eigene Schriften, Masken
- Änderungen am nativen Renderer; die Browserdarstellung ist weiterhin keine Rendererprüfung
- Showablauf mit GO (#45)

## Dateien

- `apps/web/src/scene-editor.tsx` – Arbeitsfläche, Werkzeugleiste, Ebenenliste, Medienleiste, Eigenschaftenleiste, Prüfübersicht
- `apps/web/src/scene-editor-model.ts` – reine Hilfsfunktionen (Namen, Platzierung, Einrasten, Grenzen, Verlauf, Prüfübersicht)
- `apps/web/src/scene-sketch.tsx` – SVG-Darstellung, aus `scenes.tsx` ausgelagert, mit Platzhalter für fehlende Medien
- `apps/web/src/scenes.tsx` – Sperre, Speicherung, Wiederherstellung und Verlauf
- `apps/web/src/style.css` – vorläufige Editorgestaltung (keine ShowNight-Designquelle für den Editor vorhanden)

## Prüfungen

- `tests/scene-editor.test.ts` (Teil von `pnpm test`): Namen, Platzierung, Einrasten, Grenzen, Verlauf, Prüfübersicht, Reihenfolge
- `tests/browser/scene-editor.spec.ts` (Teil von `pnpm test:browser`, eigene Testdatenbank Port 55462, HTTP 3006): Verschieben mit der Maus, Rückgängig/Wiederholen, Pfeiltasten, Eckgriff, Ziehen eines geprüften Bildes aus der Medienleiste, Umbenennen, Sichtbarkeit, Reihenfolge, Prüfübersicht, ausblendbare Bereiche, große Arbeitsfläche, mobile Breite ohne horizontales Scrollen, gespeicherter Serverstand nach Neuladen
- Bestehende Prüfung `tests/browser/preparation.spec.ts` deckt weiterhin Sperre, fehlgeschlagene Speicherung und lokale Wiederherstellung ab

In der Claude-Umgebung ist die npm-Registry gesperrt; dort liefen nur die Unit-Tests (9/9) mit einer Zod-Kopie sowie eine Chromium-Probe der Bedienung gegen eine nachgebaute API. Maßgeblich sind die CI-Läufe am jeweiligen PR-Commit.

## Bekannte Grenzen

- Die Darstellung ist ein Browserentwurf (SVG); Schriftmetrik und Bildskalierung können vom nativen Renderer abweichen.
- Tastaturbedienung der Arbeitsfläche wirkt, wenn sie den Fokus hat (Klick auf die Fläche oder Tab). In Eingabefeldern gelten die Browserfunktionen.
- Ziehen aus der Medienleiste nutzt HTML-Drag-and-Drop; auf Touchgeräten wird stattdessen per Antippen eingefügt.
- Keine Windows-/Hardwareabnahme; Browserprüfungen ersetzen diese nicht (#46).
