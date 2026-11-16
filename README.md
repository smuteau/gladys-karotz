# OpenKarotz / Free Rabbits for Gladys Assistant

An **external integration** for [Gladys Assistant](https://gladysassistant.com)
that drives a [Karotz](https://en.wikipedia.org/wiki/Karotz) rabbit over the
local network: speech, sounds and web radios, belly LED, ears, webcam, sleep,
RFID tags.

The rabbit must run **OpenKarotz**, either on the original firmware or on top
of [Free Rabbits OS](https://www.freerabbits.nl/fros/) (FROS). Everything is
local: no account, no cloud, works in any country.

> User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
> [Deutsch](docs/de.md) · [Español](docs/es.md)

## What you get in Gladys

**Devices** — one per rabbit, identified by its MAC address:

| Feature                | Type           | Notes                                                 |
| ---------------------- | -------------- | ----------------------------------------------------- |
| Awake                  | switch         | wake up / put to sleep                                |
| LED, LED color         | light          | on/off keeps the last color                           |
| LED pulse              | switch         | steady or pulsing                                     |
| Left ear, right ear    | slider 0–16    | the rabbit does not report its ears: last order shown |
| Volume                 | slider 0–100 % | only on firmwares that ship `/cgi-bin/volume`         |
| Storage used, USB used | sensor (%)     |                                                       |
| RFID tags              | sensor (count) |                                                       |
| Camera (second device) | camera image   | optional; a fresh picture on demand                   |

**Scene actions** — make the rabbit speak, play a sound or a radio, stop the
radio, play a mood, tell the time, set the LED (color, pulse, second color),
move the ears (position, random, rest), take a picture.

**Scene triggers** — rabbit unreachable, rabbit back online, rabbit fell asleep
or woke up, new RFID tag recorded.

**Dashboard widgets** — `Karotz` (state, storage, tags, and buttons: wake up /
sleep, speak, mood, time) and `Karotz camera` (last picture, take one, delete
the pictures stored on the rabbit).

**Configuration buttons** — test the connection, search the local network for
rabbits, identify a rabbit (blue pulse and moving ears), restart a rabbit.

## Finding the rabbit

A Karotz does **not** announce itself: no mDNS, no SSDP, no UDP broadcast, so
Gladys' network discovery has nothing to capture. What it does expose is its
MAC address, in `/cgi-bin/status`. Hence:

- the user enters the **IP address or host name** (several, comma-separated);
- the **Search my network** button works out the local network by itself (the
  container sits on a Docker bridge and cannot see it, so Gladys runs an SSDP
  search from the host and the answering neighbours give the /24 away), asks
  its 254 addresses for an OpenKarotz status, and lists the rabbits that
  answered. The network can still be typed when nothing answers SSDP;
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
- **A sleeping rabbit refuses** LED, ears, sounds and speech. The command fails
  with an explicit message; wake it up first.
- The OpenKarotz API has **no authentication**: keep the rabbit on a network
  you trust (see [SECURITY.md](SECURITY.md)).

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
GLADYS_INTEGRATION_SELECTOR="openkarotz-freerabbits" \
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

It stands on the work of two projects:

- [Free Rabbits](https://www.freerabbits.nl)
  ([FreeRabbits/KarotzFiles](https://github.com/FreeRabbits/KarotzFiles)) —
  Free Rabbits OS, which keeps the rabbits alive today, and the
  text-to-speech service the rabbit speaks with;
- **OpenKarotz** (Massalia), which wrote the HTTP API this integration talks
  to. Its website has been offline for some time.

Not affiliated with Violet, Mindscape, Aldebaran, OpenKarotz or Free Rabbits.
Karotz is a trademark of its owner.

## License

Apache-2.0
