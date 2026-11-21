# Karotz for Gladys Assistant

An **external integration** for [Gladys Assistant](https://gladysassistant.com)
that drives a [Karotz](https://en.wikipedia.org/wiki/Karotz) rabbit over the
local network: speech, sounds and web radios, belly LED, ears, webcam, sleep,
RFID tags.

The rabbit must serve the **OpenKarotz API**, which three systems do:

- **OpenKarotz**, on the original firmware or on top of
  [Free Rabbits OS](https://www.freerabbits.nl/fros/) (FROS);
- **[LapinLibre](https://github.com/sweetlilmre/LapinLibre)**, a Karotz system
  built from source, with an OpenKarotz-compatible API and an optional web
  password;
- **[Terrier OS](https://terrier.cyberloutre.fr/karotz)**, a LapinLibre with
  WPA3 and the client of Le Terrier built in: the safest of the three.

Everything is local: no account, no cloud, works in any country.

> User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
> [Deutsch](docs/de.md) · [Español](docs/es.md)

## What you get in Gladys

**Devices** — one per rabbit, identified by its MAC address:

| Feature                | Type           | Notes                                                 |
| ---------------------- | -------------- | ----------------------------------------------------- |
| Awake                  | switch         | wake up / put to sleep                                |
| LED, LED color         | light          | on/off keeps the last color and mode                  |
| LED pulse              | switch         | steady or pulsing                                     |
| Left ear, right ear    | slider 0–16    | the rabbit does not report its ears: last order shown |
| Ears at random / reset | push button    | reset puts both ears back to 0                        |
| Play notification      | music          | Gladys' "Talk on a speaker" action, see below         |
| Volume                 | slider 0–100 % | only on firmwares that ship `/cgi-bin/volume`         |
| Storage used, USB used | sensor (%)     |                                                       |
| RFID tags              | sensor (count) |                                                       |
| Camera (second device) | camera image   | optional; a fresh picture on demand                   |

**Scene actions** — make the rabbit speak, play a sound or a radio, stop the
radio, play a mood, tell the time, set the LED (color, pulse, second color),
move the ears (position, random, rest), take a picture.

**Scene triggers** — rabbit unreachable, rabbit back online, rabbit fell asleep
or woke up, new RFID tag recorded.

**Dashboard widgets** — `Karotz` (state, storage, tags, and buttons: sleep /
wake up first, then speak, mood, time; the card says so while the rabbit wakes
up or falls asleep) and `Karotz photos` (the pictures stored on the rabbit, one
at a time: previous, next, take one, delete them all).

**Configuration buttons** — test the connection, search the local network for
rabbits, identify a rabbit (blue pulse and moving ears), restart a rabbit.

## Sounds, radios and voice

The rabbit plays every sound, radio and the voice of Gladys from a URL, and what
it can read depends on its system:

| What is played                                           | OpenKarotz (FROS)                   | LapinLibre, Terrier OS |
| -------------------------------------------------------- | ----------------------------------- | ---------------------- |
| sound or radio over `http://`                            | yes                                 | yes                    |
| sound or radio over `https://`                           | no (refused: its player has no TLS) | yes                    |
| voice of Gladys from a voice integration (`type: "tts"`) | yes (Gladys serves it over http)    | yes                    |
| voice of Gladys Plus                                     | no (an `https://` URL)              | yes                    |
| the rabbit's own text-to-speech                          | Free Rabbits' online service        | `TTS_SERVER=`          |

The `Play notification` feature receives the URL of the clip Gladys
synthesized (`music`/`play_notification`, as Gladys' own speakers): any voice
integration of the store works (eSpeak NG, Piper, Edge TTS, ElevenLabs…), since
the core serves the clip from its own `http://<LAN IP>:<port>`. It is reached
through Gladys' own "Talk on a speaker" scene action. The integration's
`Make the rabbit speak (its own voice)` action and the widget's Speak button
use the rabbit's own text-to-speech instead: an integration cannot ask Gladys
for a clip of its voice today.

The integration only ever talks to the rabbit over the LAN. The rabbit itself
needs the Internet for radios, its own text-to-speech and online voices; on
Terrier OS it also talks to Le Terrier.

## Finding the rabbit

A Karotz does **not** announce itself: no mDNS, no SSDP, no UDP broadcast, so
Gladys' network discovery has nothing to capture. What it does expose is its
MAC address, in `/cgi-bin/status`. Hence:

- the user enters the **IP address or host name** (several, comma-separated);
- the **Search my network** button works out the local network by itself (the
  container sits on a Docker bridge and cannot see it, so Gladys runs an SSDP
  search from the host and the answering neighbours give the /24 away), asks
  its 254 addresses for an OpenKarotz status, and lists the rabbits that
  answered. An address that asks for a password is listed apart, as a possible
  LapinLibre or Terrier OS rabbit: the search never sends the password. The
  network can still be typed when nothing answers SSDP;
- the device identifier is the **MAC address**, so a rabbit keeps its history,
  scenes and dashboards when its IP address changes.

## Limits

- **"An RFID tag was presented" is not a trigger.** OpenKarotz reacts to a tag
  by calling a URL _from the rabbit_, and a sandboxed integration cannot be
  called from the LAN. Until then: in the Karotz web page, assign the tag a URL
  of your choice. The integration only sees a _new_ tag being recorded.
- **Every picture stays on the rabbit**, whose storage is small, and OpenKarotz
  has no "delete one picture" endpoint. The camera widget has a button that
  deletes them all.
- **The rabbit does not report its ears.** The integration shows the last
  position it asked for, kept in `/data/karotz-memory.json` across restarts
  (`KAROTZ_MEMORY_FILE` outside the container).
- **The Gladys Camera widget shows the last picture taken**, for one hour: the
  Karotz has no live video, and every picture is a request to the rabbit.
- **A sleeping rabbit refuses** LED, ears, sounds and speech. The command fails
  with an explicit message; wake it up first.
- The OpenKarotz API has **no authentication**; LapinLibre and Terrier OS add
  an HTTP Basic password, but over plain HTTP. Keep the rabbit on a network
  you trust (see [SECURITY.md](SECURITY.md)).
- **Speech on LapinLibre and Terrier OS** needs a speech server set on the
  rabbit (`SERVER=` or `TTS_SERVER=` in `lapinlibre.txt`); without one the
  rabbit refuses, and the integration says so.

## Project structure

```
index.js                          SDK wiring only
src/app.js                        rabbits of the config, reading loop, handler registration
src/karotz/client.js              OpenKarotz HTTP client (tolerant parsing, error kinds)
src/rabbits.js                    one rabbit: status parsing, read, detected changes
src/devices.js                    Gladys devices, features and states
src/commands.js                   what can be asked of a rabbit (shared by every surface)
src/triggers.js                   scene triggers
src/scenes.js                     scene actions
src/widgets.js                    dashboard widgets
src/actions.js                    Configuration buttons, network search
src/config.js                     defaults + normalization
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys
test/                             node --test, SDK fake Gladys + in-memory Karotz
gladys-assistant-integration.json manifest
```

## Development

```bash
npm install
npm test               # node --test, never touches the network
npm run lint
npm run format:check
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="karotz" \
KAROTZ_MEMORY_FILE="./karotz-memory.json" \
LOG_LEVEL=debug \
npm start
```

## Before publishing

- Add the GitHub topic `gladys-assistant-integration`, turn on **Private
  vulnerability reporting**, then release with **Actions → Release**.
- Check the store rules: `npx github:GladysAssistant/integration-store .`

## Credits

Built from the official
[Gladys integration template](https://github.com/GladysAssistant/integration-template-js);
the code of the integration itself is written from scratch.

It stands on the work of these projects:

- [Free Rabbits](https://www.freerabbits.nl)
  ([FreeRabbits/KarotzFiles](https://github.com/FreeRabbits/KarotzFiles)) —
  Free Rabbits OS, which keeps the rabbits alive today, and the
  text-to-speech service the rabbit speaks with;
- **OpenKarotz** (Massalia), which wrote the HTTP API this integration talks
  to. Its website has been offline for some time;
- [LapinLibre](https://github.com/sweetlilmre/LapinLibre), a free Karotz
  system that keeps that API, documented down to its refusals;
- [Le Terrier](https://terrier.cyberloutre.fr), whose Terrier OS is a
  LapinLibre with WPA3.

Not affiliated with Violet, Mindscape, Aldebaran, OpenKarotz, Free Rabbits,
LapinLibre or Le Terrier. Karotz is a trademark of its owner.

## License

Apache-2.0
