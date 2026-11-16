# OpenKarotz / Free Rabbits

Steuern Sie Ihren Karotz-Hasen lokal aus Gladys: Sprache, Töne und Webradios,
LED, Ohren, Kamera, Schlaf und RFID-Tags. Kein Konto, keine Cloud.

## Bevor Sie beginnen

- Auf Ihrem Karotz muss **OpenKarotz** laufen, auf der Original-Firmware oder
  auf [Free Rabbits OS](https://www.freerabbits.nl/fros/). Schnelltest: Öffnen
  Sie `http://<adresse-des-hasen>/` im Browser, Sie sollten die Webseite von
  OpenKarotz sehen.
- Der Hase und Gladys müssen sich im **selben lokalen Netzwerk** befinden.
- Geben Sie dem Hasen eine **feste IP-Adresse** (Free Rabbits OS unterstützt
  ohnehin nur das) oder reservieren Sie sie in Ihrem Router.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Tragen Sie die **Adresse des Hasen** ein: seine IP-Adresse (z. B.
   `192.168.1.70`) oder seinen Hostnamen. Mehrere Hasen: mit Kommas trennen.
3. Speichern Sie und öffnen Sie dann den Reiter **Erkennung**: Der Hase
   erscheint dort zusammen mit seiner Kamera. Fügen Sie beide hinzu.

Sie kennen seine Adresse nicht? Ein Karotz meldet sich nicht im Netzwerk an,
aber die Integration kann nach ihm suchen. Klicken Sie auf **Mein Netzwerk
durchsuchen** (_Search my network_), ohne etwas einzutragen: Gladys erkennt Ihr
lokales Netzwerk an den Geräten, die sich dort melden (Router, Fernseher,
NAS…), dann fragt die Integration dessen 254 Adressen ab und listet die Hasen
auf, die geantwortet haben. Kopieren Sie die gefundene Adresse in das Feld und
speichern Sie.

Konnte das Netzwerk nicht ermittelt werden, sagt Ihnen die Schaltfläche das:
Tragen Sie dann die ersten drei Zahlen Ihrer lokalen Adressen (z. B.
`192.168.1`) in das Feld **Lokales Netzwerk** (_Local network_) ein und suchen
Sie erneut.

Die übrigen Einstellungen:

- **Aktualisierungsintervall** — wie oft der Hase abgefragt wird
  (standardmäßig 60 s). Ein Karotz ist eine kleine Maschine: Viel niedriger zu
  gehen bringt nichts.
- **Standardstimme** — die Stimmenkennung, mit der der Hase spricht, so wie sie
  auf der Webseite des Karotz aufgeführt ist (bei neueren Firmwares eine Zahl).
  Leer: die eigene Standardstimme des Hasen.
- **Kamera** — fügt pro Hase ein Kameragerät hinzu.

Die Texte der Integration selbst (Schaltflächen, Meldungen) sind derzeit auf
Englisch und Französisch verfügbar; Gladys zeigt sie Ihnen auf Englisch an.
Die Namen in dieser Anleitung sind deren Übersetzung.

## Geräte

Jeder Hase wird zu einem Gerät, das an seiner MAC-Adresse erkannt wird: Er
behält seinen Verlauf, seine Szenen und seine Dashboards, wenn sich seine
IP-Adresse ändert.

| Funktion               | Was Sie tun können                          |
| ---------------------- | ------------------------------------------- |
| Wach                   | den Hasen aufwecken oder schlafen legen     |
| LED, LED-Farbe         | einschalten, ausschalten, Farbe wählen      |
| LED-Pulsieren          | Dauerlicht oder pulsierendes Licht          |
| Linkes / rechtes Ohr   | Position von 0 bis 16                       |
| Lautstärke             | 0 bis 100 %, wenn Ihre Firmware es anbietet |
| Speicher, USB-Stick    | belegter Anteil in Prozent                  |
| RFID-Tags              | Anzahl der gespeicherten Tags               |
| Kamera (eigenes Gerät) | ein frisches Bild auf Abruf                 |

## Schaltflächen der Konfiguration

- **Verbindung testen** — fragt jeden Hasen ab und zeigt Version und Zustand.
- **Mein Netzwerk durchsuchen** — siehe oben.
- **Einen Hasen identifizieren** — der gewählte Hase pulsiert einige Sekunden
  blau und bewegt die Ohren.
- **Einen Hasen neu starten** — nach etwa einer Minute ist er wieder da.

Ein Erfolg wird grün angezeigt, ein Fehler rot.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu (Gladys 5.1 oder
neuer).

**Aktionen**

- **Den Hasen sprechen lassen** — ein Satz, mit der Stimme Ihrer Wahl.
  Variablen der Szene können darin verwendet werden.
- **Einen Ton oder ein Radio abspielen** — die Kennung eines auf dem Hasen
  gespeicherten Tons oder die `http://`-Adresse einer MP3-Datei oder eines
  Webradios.
- **Das Radio stoppen**.
- **Eine Stimmung abspielen** — zufällig oder über ihre Nummer.
- **Die Uhrzeit ansagen**.
- **Die LED einstellen** — Farbe hexadezimal (`FF0000` für Rot), dauerhaft
  oder pulsierend, mit einer zweiten Farbe und einer Geschwindigkeit.
- **Die Ohren bewegen** — auf eine Position, zufällig oder zurück in die
  Ruhestellung.
- **Ein Foto aufnehmen** — es wird zum Bild des Kamerageräts: Lassen Sie die
  Gladys-Aktion „Kamerabild senden“ folgen, um es zu erhalten.

Aufwecken, schlafen legen, LED einschalten: Das sind Gerätefunktionen, nutzen
Sie dafür die Standardaktion „Ein Gerät steuern“.

**Auslöser**

- **Hase nicht erreichbar** / **Hase wieder erreichbar**.
- **Hase eingeschlafen oder aufgewacht** — wenn er von selbst den Zustand
  wechselt (Webseite des Hasen, interner Zeitplan), nicht wenn Gladys es
  anordnet.
- **Neuer RFID-Tag gespeichert** — mit Kennung, Name und Farbe des Tags als
  Variablen.

## Dashboard-Widgets

- **Karotz** — Zustand des Hasen, Speicher, Anzahl der Tags und vier
  Schaltflächen: sprechen (ein kleines Formular öffnet sich), Stimmung,
  Uhrzeit ansagen, schlafen legen. Wenn er schläft, nur eine Schaltfläche:
  aufwecken.
- **Karotz-Kamera** — das letzte Foto, eine Schaltfläche für ein neues und
  eine, um die auf dem Hasen gespeicherten Fotos zu löschen.

Bei mehreren Hasen wählen Sie in den Widget-Einstellungen, welcher angezeigt
wird.

## Grenzen

- **Einen RFID-Tag vor den Hasen zu halten löst keine Szene aus.** OpenKarotz
  reagiert auf einen Tag, indem der Hase selbst eine Webadresse aufruft, und
  eine Gladys-Integration kann auf diese Weise nicht aufgerufen werden. Der
  verfügbare Auslöser betrifft das Speichern eines _neuen_ Tags.
- **Jedes Foto bleibt auf dem Hasen**, dessen Speicher klein ist. Löschen Sie
  sie von Zeit zu Zeit mit der Schaltfläche des Kamera-Widgets.
- **Ein schlafender Hase verweigert** LED, Ohren, Töne und Sprache: Wecken Sie
  ihn zuerst auf (in einer Szene mit der Aktion „Ein Gerät steuern“ beginnen).
- Die Sprachausgabe hängt vom Sprachsynthese-Dienst ab, der in Ihrem Hasen
  eingestellt ist und Internet benötigt: Spricht der Hase nicht mehr, testen
  Sie es über seine Webseite.

## Fehlerbehebung

- **„No answer“ (keine Antwort)** — Ist der Hase eingeschaltet? Öffnet sich
  seine Webseite von einem Computer im selben Netzwerk? Hat sich seine Adresse
  geändert?
- **Der Hase erscheint nicht unter Erkennung** — er muss mindestens einmal
  geantwortet haben: Nutzen Sie **Verbindung testen**.
- **Keine Funktion „Lautstärke“** — Ihre Firmware hat diese Einstellung nicht;
  beim ursprünglichen OpenKarotz ist das normal.

Nicht verbunden mit Violet, Mindscape, OpenKarotz oder Free Rabbits.
