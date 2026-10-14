# Paketmedien prüfen

Dieses Paket ist eine Softwarediagnose. Bildschirm-, Ton- und Geräteausgabe bleiben aus. Es gibt noch keinen vollständigen Szenen-/Showablauf.

## Einmal vorbereiten

1. Im Startmenü unter ShowNight Streaming den lokalen Server einrichten. Eine vorhandene Einrichtung nicht erneut initialisieren.
2. Auf dem vorbereitenden ShowNight-Server ein Inhaltspaket (.snpkg), den Serverschlüssel (.sntrust) und den passenden Anmeldestand (.snauth) für diesen Rechner bereitstellen lassen.
3. Im Startmenü „Inhaltspaket importieren“ starten und den Pfad der .snpkg-Datei eingeben. Der Import prüft das gesamte Paket.
4. Serverschlüssel und danach Anmeldestand über ihre Startmenüeinträge importieren. Ein Anmeldestand muss genau zu Rechner und Paketen passen.
5. Die lokale HTTPS-Adresse und das Zertifikat wie in Anleitung.md beschrieben prüfen und einrichten.

## Bild oder Video prüfen

Ab Version 0.3.6 können vorbereitete Pakete auch Szenenentwürfe enthalten (Paketmanifest Version 2). Unter dem angesehenen Paket zeigt „Vorbereitete Szenenentwürfe“ diese Gestaltung lesend im Browser. Das ist keine native Rendererprüfung; zusammengesetzte Szenen werden noch nicht in die Diagnose übernommen. Die folgenden Schritte prüfen weiterhin ein einzelnes PNG-/VP8-Medium. Alte Pakete bleiben lesbar; für neue Szenenpakete den lokalen Server vorher aktualisieren.

1. ShowNight Streaming starten und die ausgegebene HTTPS-Adresse im Browser öffnen.
2. Mit dem vorbereiteten lokalen Admin und MFA anmelden.
3. Unter „Vorbereitete Pakete“ ein Paket ansehen.
4. Unter „Medienprozess · Softwarediagnose“ ein Medium wählen und „Paketmedium vorbereiten“ klicken. Das Diagnose-Programm bleibt unverändert.
5. „Diagnosebilder aktualisieren“ ruft Standbilder aus dem Medienprozess ab.
6. „Diagnosebild übernehmen“ übernimmt ausdrücklich die aktuelle Diagnosevorschau. Dies ist kein Show-GO.
7. „Diagnosezustand leeren“ löscht die beiden Diagnosekanäle.

Unterstützt: PNG und WebM mit VP8, jeweils höchstens 32 MiB. PNG bis 4096 × 4096, Videoeingang bis 1920 × 1080. MP4, JPEG und andere Formate sind in dieser Teilversion noch nicht unterstützt. Ein WebM-Container allein garantiert keinen VP8-Inhalt.

Alle Bilder sind kleine, manuell abgerufene Diagnose-Standbilder. Der Bildschirm-/HDMI-/Tonbetrieb wird damit nicht getestet. Paketvideos enden auf dem letzten Diagnoseframe, ohne automatischen Folgeeinsatz. Das mitgelieferte synthetische Testvideo hat weiterhin einen eigenen Diagnoseloop.

## Bei Fehlern

Bei einer beschädigten oder veränderten Datei wird die neue Vorbereitung abgewiesen. Bereits geladener Diagnoseinhalt bleibt bestehen. Keine automatischen Wiederholungen: Zustand prüfen und bewusst neu auslösen.

Zum Beenden im Serverfenster Strg+C verwenden. Ein geschlossenes Browserfenster beendet den Server nicht. Updates und Deinstallation erhalten die getrennt gespeicherten lokalen Daten.
