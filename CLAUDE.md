# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration**: a Node.js service (Node 22+, ESM,
no build step) that runs in its own sandboxed Docker container and talks to
Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## What it talks to

Karotz rabbits running **OpenKarotz** (stock firmware or Free Rabbits OS):
unauthenticated HTTP GET on `http://<host>/cgi-bin/<script>`, answers
`{"return":"0",...}` or `{"return":"1","msg":"..."}`, sometimes invalid JSON.
A rabbit is a 2011 ARM9 running bash CGI scripts: one request at a time, slow,
and it answers a sound or speech request only once it has finished playing.

Also Karotz rabbits running **LapinLibre** or **Terrier OS** (a LapinLibre
with WPA3 and the client of Le Terrier): the same paths and answer shapes
(reference: LapinLibre's `docs/web-api.md`), plus an optional HTTP Basic
password (user `admin`, 401 without it), policy refusals as 4xx with the usual
JSON body, their own refusal messages ("the rabbit is asleep...", "busy..."),
a `lapinlibre` object in `status`, `eth_mac` always zero, no
`/cgi-bin/volume`. On Terrier OS the Terrier client drives the same API, so a
command can meet "the rabbit is busy with another request". LapinLibre refuses
a change whose `Sec-Fetch-Site`, `Origin` or `Referer` names another site;
`rabbitFetch` sends none of them: never add them.

**Every request to a rabbit goes through `rabbitFetch`** (`src/karotz/http.js`),
never the global `fetch`. OpenKarotz's web server ends its header lines with a
bare LF: Node's strict parser (and so `fetch`) rejects every answer with
`HPE_CR_EXPECTED` / `HPE_INVALID_HEADER_TOKEN`, and the rabbit looks offline
while curl and a browser reach it. `rabbitFetch` is `node:http` with
`insecureHTTPParser`, kept to the rabbits: GET, plain HTTP, no redirect, a
bounded answer.

## Architecture

```
index.js                          SDK wiring only: createApp(gladys).register(), then connect()
src/app.js                        ctx (config, rabbits), reading loop, handler registration
src/karotz/client.js              OpenKarotz HTTP client: tolerant parsing, KarotzError kinds
src/karotz/http.js                rabbitFetch: node:http with the lenient parser OpenKarotz needs
src/rabbits.js                    one rabbit: parseStatus, readRabbit -> detected changes
src/devices.js                    devices, features (FEATURES keys) and states
src/commands.js                   every operation on a rabbit, shared by all surfaces
src/triggers.js                   scene triggers, built from the changes of a read
src/scenes.js                     scene action handlers (manifest `scene_actions`)
src/widgets.js                    dashboard widget handlers (manifest `widgets`)
src/actions.js                    Configuration buttons (manifest `actions`), network search
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json manifest: name, config_schema, actions, image...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (en, fr mandatory)
test/                             node --test: SDK fake Gladys + test/helpers/fakeKarotz.js
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** Build them with
  `gladys.externalIds(type, platformId)`, `platformId` being the unique id the
  platform gives the device (serial, cloud id, MAC), never a label. Gladys keys
  devices, their history, scenes and dashboards on them: changing one creates a
  new device and orphans the old one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys, feature keys.
- **The container rootfs is read-only.** Write only under `/data`, the one
  writable volume. Never log tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand — except on the README's hand-pushed tag path, which bumps all three
  together before tagging. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en", "fr", "de", "es" }`:
  `label`, `description` and `placeholder` alike, never a plain string. The
  catalog `description` holds 10 to 100 characters per language. A field the
  older cores do not know needs a higher `gladys_version` minimum
  (`categories`: 4.86.0; `widgets`, `scene_triggers`, `scene_actions`,
  `type: "provider"`: 5.1.0). `test/manifest.test.js` ties the manifest to the
  code (defaults, action, scene and widget handlers): change both sides
  together.
- **User-facing text exists in four languages**: English, French, German and
  Spanish (`LANGUAGES` in `src/actions.js`). That covers the manifest texts
  (`test/manifest.test.js` checks every one), the messages of the code
  (Configuration buttons, widgets, errors, connection status) and the user
  documentation, kept in sync: `docs/en.md`, `docs/fr.md`, `docs/de.md`,
  `docs/es.md`. A new text is written in the four at once.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never leave the machine: the one transport test serves
  the raw answer of a Karotz on 127.0.0.1.
- **A rabbit is identified by its MAC**, read from `/cgi-bin/status` (Wi-Fi
  first, then Ethernet), never by its host: the host is only how to reach it.
  Do not change that order, nor the `karotz` / `karotz-camera` device types.
- **One operation, one function in `src/commands.js`.** Features, scene
  actions, widgets and Configuration buttons all call it; none talks to the
  client directly. After a command, `ctx.refresh(rabbit)` reads the rabbit
  back so Gladys shows the confirmed state.
- **Scene events come from the reading loop only** (`readAll({ events: true })`),
  one per transition. Never fire one after a command: a scene bound to it would
  loop. The first read of a rabbit is a baseline and fires nothing.
- **Be gentle with the rabbit.** No parallel requests to one rabbit, no extra
  request per read without a reason (the tag list is only fetched when the
  count moves), no periodic snapshot: every picture stays on its storage.
- **A new endpoint must be checked against the CGI scripts of the rabbit**
  (`/www/cgi-bin/`), on both the stock OpenKarotz and its variants, and
  against LapinLibre's `docs/web-api.md`; an endpoint only some of them have
  is feature-detected (see `hasVolume`).
- **No "RFID tag presented" trigger**: the rabbit would have to call the
  integration, which the sandbox does not allow. Do not fake it by polling.
- **The network search finds the LAN through Gladys.** The container is on a
  Docker bridge: its own address is useless, and Gladys does not expose its
  own. `findLocalSubnets` asks the core for an SSDP search (manifest
  `network_discovery`) and takes the /24 of whoever answers, plus those of the
  configured rabbits; the typed network is only the fallback. At most three
  networks are searched, to stay inside the timeout of the button.
- **The network search only scans private /24 ranges** (`parseSubnet`), and
  hosts from the configuration are validated before they reach a URL
  (`parseHosts`). Keep both.
- **The web password goes only where it is asked for.** It lives in the
  `web_password` secret, split by `parsePasswords`; the client tries no
  password first and a password only after a 401, then sticks to what the
  rabbit accepted. Never send it from the network search (an address that
  answers 401 is only reported), never put it in a log line, an error message,
  a URL or a widget.
- **Configuration buttons: green or red.** The Configuration screen shows a
  resolved message as a success and a thrown error as a failure. A handler of
  `src/actions.js` therefore resolves only when the operation worked, and
  fails with `fail({ en, fr, de, es })` otherwise. `fail` throws an
  `ActionFailure`, an error whose `message` is the multi-language object
  itself: the SDK relays it as is and the screen shows the user's language.
  Never join the languages in one string.
