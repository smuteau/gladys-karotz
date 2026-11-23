# Karotz

Steuern Sie Ihren Karotz-Hasen lokal aus Gladys: Sprache, Töne und Webradios,
LED, Ohren, Kamera, Schlaf und RFID-Tags. Kein Konto, keine Cloud.

## Bevor Sie beginnen

- Auf Ihrem Karotz muss eines dieser Systeme laufen:
  - **Terrier OS** ([Installationsanleitung](https://terrier.cyberloutre.fr/karotz)),
    auf LapinLibre aufgebaut. Es ist die sicherste Wahl: WLAN mit WPA3, SSH
    nur mit Schlüssel, eine durch ein Passwort geschützte Webseite;
  - **[LapinLibre](https://github.com/sweetlilmre/LapinLibre)**, ein freies
    System für den Karotz, aus seinen Quellen gebaut;
  - **OpenKarotz**, auf der Original-Firmware oder auf
    [Free Rabbits OS](https://www.freerabbits.nl/fros/) (nur WPA2).

  Alle drei bieten dieselbe lokale API, die von OpenKarotz: Die Integration
  steuert sie auf dieselbe Weise. Schnelltest: Öffnen Sie
  `http://<adresse-des-hasen>/` im Browser, Sie sollten die Webseite des Hasen
  sehen.

  **Bisher getestet**: ein echter Karotz mit Free Rabbits OS (OpenKarotz 210).
  LapinLibre und Terrier OS werden nach der Dokumentation ihrer API
  unterstützt, wurden aber noch nicht auf einem echten Hasen getestet: Wenn
  etwas nicht funktioniert, [melden Sie
  es](https://github.com/smuteau/gladys-karotz/issues).

- Der Hase und Gladys müssen sich im **selben lokalen Netzwerk** befinden.
- Geben Sie dem Hasen eine **feste IP-Adresse** (Free Rabbits OS unterstützt
  ohnehin nur das) oder reservieren Sie sie in Ihrem Router.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Tragen Sie die **Adresse des Hasen** ein: seine IP-Adresse (z. B.
   `192.168.1.70`) oder seinen Hostnamen. Mehrere Hasen: mit Kommas trennen.
3. **LapinLibre oder Terrier OS**: Tragen Sie das **Web-Passwort** ein, das die
   Webseite des Hasen verlangt (Benutzer `admin`). Terrier OS schreibt es in
   `web-password.txt` auf seinem Installations-USB-Stick. Mehrere Hasen mit
   unterschiedlichen Passwörtern: durch Leerzeichen trennen. Für OpenKarotz
   lassen Sie das Feld leer.
4. Speichern Sie und öffnen Sie dann den Reiter **Erkennung**: Der Hase
   erscheint dort. Fügen Sie ihn hinzu.

Sie kennen seine Adresse nicht? Ein Karotz meldet sich nicht im Netzwerk an,
aber die Integration kann nach ihm suchen. Klicken Sie auf **Mein Netzwerk
durchsuchen**, ohne etwas einzutragen: Gladys erkennt Ihr
lokales Netzwerk an den Geräten, die sich dort melden (Router, Fernseher,
NAS…), dann fragt die Integration dessen 254 Adressen ab und listet die Hasen
auf, die geantwortet haben. Kopieren Sie die gefundene Adresse in das Feld und
speichern Sie.

Die Suche sendet Ihr Passwort nie an die Geräte des Netzwerks. Ein Hase mit
LapinLibre oder Terrier OS, der durch ein Passwort geschützt ist, erscheint
daher getrennt, als Adresse, die „ein Passwort verlangt“: Fügen Sie sie hinzu
und nutzen Sie dann **Verbindung testen**.

Konnte das Netzwerk nicht ermittelt werden, sagt Ihnen die Schaltfläche das:
Tragen Sie dann die ersten drei Zahlen Ihrer lokalen Adressen (z. B.
`192.168.1`) in das Feld **Lokales Netzwerk** ein und suchen
Sie erneut.

Die übrigen Einstellungen:

- **Aktualisierungsintervall** — wie oft der Hase abgefragt wird
  (standardmäßig 60 s). Ein Karotz ist eine kleine Maschine: Viel niedriger zu
  gehen bringt nichts.
- **Standardstimme** — die Stimmenkennung, mit der der Hase spricht, so wie sie
  auf der Webseite des Karotz aufgeführt ist (bei neueren Firmwares eine Zahl).
  Leer: die eigene Standardstimme des Hasen.
- **Kamera** — gibt dem Gerät des Hasen eine Kamera.

## Geräte

Jeder Hase wird zu einem Gerät, das an seiner MAC-Adresse erkannt wird: Er
behält seinen Verlauf, seine Szenen und seine Dashboards, wenn sich seine
IP-Adresse ändert.

| Funktion               | Was Sie tun können                                     |
| ---------------------- | ------------------------------------------------------ |
| Wach                   | den Hasen aufwecken oder schlafen legen                |
| LED, LED-Farbe         | einschalten, ausschalten, Farbe wählen                 |
| LED-Pulsieren          | Dauerlicht oder pulsierendes Licht                     |
| Linkes / rechtes Ohr   | Position von 0 bis 16                                  |
| Ears at random / reset | Knöpfe: Ohren zufällig oder zurück auf 0               |
| Play notification      | die Stimme von Gladys: siehe „Töne, Radios und Stimme“ |
| Lautstärke             | 0 bis 100 %, wenn Ihre Firmware es anbietet            |
| Speicher, USB-Stick    | belegter Anteil in Prozent                             |
| RFID-Tags              | Anzahl der gespeicherten Tags                          |
| Kamera                 | ein frisches Bild auf Abruf                            |

Der Hase verrät nicht, wo seine Ohren stehen: Die Integration zeigt die zuletzt
angeforderte Position und merkt sie sich auch nach einem Neustart. Wenn sie
einen Hasen zum ersten Mal sieht, kalibriert sie seine Ohren neu (wie der Knopf
**Ears reset**): Sie starten bei 0, einer bekannten Position. Beide
Schieberegler auf 0 ist die Ruheposition: Die Integration kalibriert neu, statt
zu bewegen, und die Ohren landen genau dort, wo der Knopf **Ears reset** sie
hinstellt.

Der Hase kalibriert seine Ohren von selbst neu, wenn er aufwacht, eine Stimmung
spielt oder die Uhrzeit ansagt: Sie gehen auf 0 zurück. Die Integration bringt
sie danach an ihre letzte Position zurück, auch wenn er von selbst aufwacht oder
nach einem Neustart zurückkommt. Eine Bewegung wartet immer das Ende einer
Neukalibrierung ab (einige Sekunden): Währenddessen gesendet, würde sie diese
unterbrechen, und die Ohren verlören ihren Bezugspunkt.

Ausgeschaltet behält die LED ihren Modus: Der Schalter **LED-Pulsieren** bleibt,
wie er ist, und eine Änderung bei ausgeschalteter LED gilt fürs nächste
Einschalten, ohne sie einzuschalten.

Das **Kamera**-Widget von Gladys zeigt eine Stunde lang das letzte Foto, das die
Integration aufgenommen hat: Der Karotz hat kein Live-Video.

## Töne, Radios und Stimme

Der Hase spielt Töne, Radios und die Stimme von Gladys von einer Webadresse ab.
Was er abspielen kann, hängt von seinem System ab:

| Was Sie abspielen                                           | OpenKarotz (Free Rabbits OS)                                      | LapinLibre, Terrier OS                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Ton oder Radio über `http://`                               | ja                                                                | ja                                          |
| Ton oder Radio über `https://`                              | nein: Sein Player liest kein HTTPS, die Adresse wird abgelehnt    | ja                                          |
| Stimme von Gladys mit einer Sprachintegration aus dem Store | ja: Gladys stellt den Ton über `http://` in Ihrem Netzwerk bereit | ja                                          |
| Stimme von Gladys Plus                                      | nein: Sie kommt über `https://`                                   | ja                                          |
| Eigene Stimme des Hasen („Sprechen“)                        | der Online-Dienst von Free Rabbits OS                             | der in `lapinlibre.txt` eingestellte Server |

**Zwei Wege, den Hasen sprechen zu lassen.**

- **Mit der Stimme von Gladys**: die Gladys-Aktion **Auf einem Lautsprecher
  sprechen**, mit dem Hasen als Lautsprecher (seine Funktion „Play
  notification“). Er spricht mit der in Gladys gewählten Stimme (Seite
  Künstliche Intelligenz, Karte Stimme). Unter OpenKarotz installieren Sie eine
  Sprachintegration aus dem Store: offline (eSpeak NG, Piper), alles bleibt in
  Ihrem Netzwerk, ohne Internet; oder online (Microsoft Edge TTS, Google
  Übersetzer, ElevenLabs…). Gladys Plus funktioniert nur unter LapinLibre und
  Terrier OS. Gladys muss im Host-Netzwerk laufen (die Standardinstallation),
  damit der Hase die Adresse des Tons erreicht.
- **Mit seiner eigenen Stimme**: die Aktion **Den Hasen sprechen lassen (eigene
  Stimme)**. Das ist die Sprachausgabe des Hasen, nicht die von Gladys: ein
  Online-Dienst unter Free Rabbits OS, der auf manchen Hasen nicht mehr
  antwortet; der in `lapinlibre.txt` eingestellte Server unter LapinLibre und
  Terrier OS.

**Internet.** Die Integration spricht über Ihr Netzwerk mit dem Hasen, ohne
Cloud. Der Hase selbst braucht Internet für Radios, für seine eigene Stimme (den
Online-Dienst von Free Rabbits OS) und für die Online-Stimmen von Gladys; unter
Terrier OS tauscht er sich auch mit Le Terrier aus. Mit einer Offline-Stimme von
Gladys (eSpeak NG, Piper) spricht er ohne Internet.

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

- **Den Hasen sprechen lassen (eigene Stimme)** — ein Satz, mit der
  Sprachausgabe des Hasen und einer seiner Stimmen nach Wahl. Variablen der
  Szene können darin verwendet werden. Für die Stimme von Gladys nehmen Sie die
  Gladys-Aktion „Auf einem Lautsprecher sprechen“.
- **Einen Ton oder ein Radio abspielen** — die Kennung eines auf dem Hasen
  gespeicherten Tons oder die `http://`-Adresse einer MP3-Datei oder eines
  Webradios (ohne Leerzeichen, „&“ oder „#“: Der Hase erhält sie unverändert).
  Unter OpenKarotz wird eine `https://`-Adresse abgelehnt: Sein Player liest nur
  `http://`. LapinLibre und Terrier OS lesen beides.
- **Das Radio stoppen** — „Einen Ton oder ein Radio abspielen“ startet den
  Player des Hasen und endet sofort: Eine Szene, die nur diese Aktion enthält,
  ist gleich zu Ende, und der Hase spielt weiter bis zu dieser Aktion oder einem
  anderen Ton. Um eine bestimmte Zeit zuzuhören, setzen Sie „Einen Ton oder ein
  Radio abspielen“, „Warten“ und dann „Das Radio stoppen“ in drei Blöcke
  untereinander (Schaltfläche „Neue Aktion“). In einer Gruppe „Gleichzeitig“
  („Parallele Aktion hinzufügen“) starten die Aktionen zusammen: Das Stoppen
  folgt sofort auf den Start, und das Warten verzögert nur seinen eigenen Block.
  Ein Webradio kann außerdem einige Sekunden brauchen, bis es zu hören ist. Ein
  Ton unterbricht, was gerade spielt, auch die Stimme von Gladys: „Auf einem
  Lautsprecher sprechen“ gibt weiter, sobald der Satz beginnt; setzen Sie danach
  eine Wartezeit, wenn ein Ton folgt.
- **Eine Stimmung abspielen** — zufällig oder über ihre Nummer.
- **Die Uhrzeit ansagen** — unter OpenKarotz spielt der Hase eine zufällig
  gewählte Aufnahme der aktuellen Stunde: Nicht alle sagen die Uhrzeit. Das ist
  nicht seine Sprachausgabe. Die Integration gibt ihm die Stunde von Gladys
  (seine Uhr läuft in UTC). LapinLibre und Terrier OS sagen die aktuelle Uhrzeit an.
- **Die LED einstellen** — Farbe hexadezimal (`FF0000` für Rot), dauerhaft
  oder pulsierend, mit einer zweiten Farbe und einer Geschwindigkeit.
- **Die Ohren bewegen** — auf eine Position, zufällig oder zurück in die
  Ruhestellung.
- **Ein Foto aufnehmen** — es wird zum Bild der Kamera des Hasen: Lassen Sie die
  Gladys-Aktion „Kamerabild senden“ folgen, um es zu erhalten.

Aufwecken, schlafen legen, LED einschalten: Das sind Gerätefunktionen, nutzen
Sie dafür die Standardaktion „Ein Gerät steuern“. Der Hase braucht bis zu 12
Sekunden zum Aufwachen: Die Szene geht nach höchstens 4 Sekunden weiter, und
Sprache, Töne, LED und Ohren warten, bis er wach ist.

**Auslöser**

- **Hase nicht erreichbar** / **Hase wieder erreichbar**.
- **Hase eingeschlafen oder aufgewacht** — wenn er von selbst den Zustand
  wechselt (Webseite des Hasen, interner Zeitplan), nicht wenn Gladys es
  anordnet.
- **Neuer RFID-Tag gespeichert** — mit Kennung, Name und Farbe des Tags als
  Variablen.

## Dashboard-Widgets

- **Karotz** — Zustand des Hasen, Speicher (in %), Anzahl der Tags und vier
  Schaltflächen: schlafen legen, Stimmung, Uhrzeit ansagen, Ohren zufällig. Wenn
  er schläft, nur eine Schaltfläche: aufwecken. Der Hase braucht 6 bis 12
  Sekunden zum Einschlafen oder Aufwachen: Die Meldung („Gute Nacht, Hase.“,
  „Der Hase wacht auf.“) erscheint eine Sekunde nach dem Klick, während er noch
  dabei ist, und die Schaltfläche wechselt, sobald er fertig ist. Stimmung,
  Uhrzeit ansagen und Ohren zufällig zeigen keine Meldung: Der Hase antwortet
  selbst.
- **Karotz-Fotos** — die auf dem Hasen gespeicherten Fotos, einzeln und ganz,
  das neueste zuerst: Schaltflächen **Vorheriges** und **Nächstes**, **Foto
  aufnehmen** (sofort angezeigt) und **Fotos löschen**.

Bei mehreren Hasen wählen Sie in den Widget-Einstellungen, welcher angezeigt
wird.

## Grenzen

- **Einen RFID-Tag vor den Hasen zu halten löst keine Szene aus.** OpenKarotz
  reagiert auf einen Tag, indem der Hase selbst eine Webadresse aufruft, und
  eine Gladys-Integration kann auf diese Weise nicht aufgerufen werden. Der
  verfügbare Auslöser betrifft das Speichern eines _neuen_ Tags.
- **Unter OpenKarotz bleibt jedes Foto auf dem Hasen**, dessen Speicher klein
  ist. Löschen Sie sie von Zeit zu Zeit mit der Schaltfläche des
  Foto-Widgets. Unter LapinLibre und Terrier OS behält der Hase die letzten 10
  im Arbeitsspeicher und vergisst sie beim Neustart.
- **Ein schlafender Hase verweigert** LED, Ohren, Töne und Sprache: Wecken Sie
  ihn zuerst auf (in einer Szene mit der Aktion „Ein Gerät steuern“ beginnen).
- **Die eigene Stimme des Hasen** („Den Hasen sprechen lassen“) hängt von seinem
  Sprachdienst ab: Unter Free Rabbits OS ist er online und antwortet auf manchen
  Hasen nicht mehr. Unter LapinLibre und Terrier OS wird dieser Server in
  `lapinlibre.txt` eingestellt (`SERVER=` oder `TTS_SERVER=`): Ohne ihn
  verweigert der Hase das Sprechen, und die Integration sagt es Ihnen. Antwortet
  dieser Dienst nicht, sagt die Integration es („Der Hase konnte nicht
  sprechen“), statt einen Erfolg zu melden. Die Stimme von Gladys („Auf einem
  Lautsprecher sprechen“) hängt nicht von ihm ab.
- **Die LED gibt Farben nur ungefähr wieder**: Der Hase erhält genau die
  gewählte Farbe, aber blasse oder orange Töne wirken gesättigt.
- **Die API des Hasen spricht einfaches HTTP**, welches System er auch hat.
  Unter LapinLibre und Terrier OS geht das Web-Passwort daher lesbar über Ihr
  lokales Netzwerk: WPA3 schützt es im WLAN, nicht auf dem Kabel zwischen
  Router und Gladys. Lassen Sie den Hasen in einem Netzwerk, dem Sie vertrauen.
- **Ein Karotz mit Terrier OS bleibt ein Hase von Le Terrier**: Le Terrier und
  Gladys können ihn gleichzeitig steuern. Sprechen beide im selben Moment mit
  ihm, antwortet er, dass er beschäftigt ist: Versuchen Sie es erneut.

## Fehlerbehebung

- **„Keine Antwort“** — Ist der Hase eingeschaltet? Öffnet sich
  seine Webseite von einem Computer im selben Netzwerk? Hat sich seine Adresse
  geändert?
- **„Verlangt ein Web-Passwort“** — auf dem Hasen läuft LapinLibre oder
  Terrier OS: Tragen Sie das Passwort seiner Webseite in der Konfiguration ein.
- **„Web-Passwort abgelehnt“** — keines der eingetragenen Passwörter ist das
  richtige. Prüfen Sie es, indem Sie die Webseite des Hasen öffnen (Benutzer
  `admin`).
- **„Der Hase ist beschäftigt“** — ein anderer Befehl, zum Beispiel von Le
  Terrier, nutzte ihn in diesem Moment: Versuchen Sie es erneut.
- **„Der Hase konnte nicht sprechen“** — seine eigene Sprachausgabe (unter Free
  Rabbits OS online) hat nicht geantwortet. Lassen Sie ihn mit der Stimme von
  Gladys sprechen: die Aktion „Auf einem Lautsprecher sprechen“ und eine
  Sprachintegration aus dem Store (siehe „Töne, Radios und Stimme“).
- **Der Hase erscheint nicht unter Erkennung** — er muss mindestens einmal
  geantwortet haben: Nutzen Sie **Verbindung testen**.
- **Keine Funktion „Lautstärke“** — Ihre Firmware hat diese Einstellung nicht;
  beim ursprünglichen OpenKarotz und bei LapinLibre ist das normal.

Nicht verbunden mit Violet, Mindscape, OpenKarotz, Free Rabbits, LapinLibre
oder Le Terrier.
