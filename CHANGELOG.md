# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version: Karotz rabbits running OpenKarotz (stock firmware or Free
  Rabbits OS), driven over the local network, found by IP address or host name
  and identified by their MAC address.
- Devices: sleep, LED (on/off, color, pulse), ears, volume (firmwares that
  have it), storage, USB key, RFID tag count, and an optional camera.
- Scene actions: speak, play a sound or a radio, stop the radio, play a mood,
  tell the time, set the LED, move the ears, take a picture.
- Scene triggers: rabbit unreachable, back online, fell asleep or woke up, new
  RFID tag recorded.
- Dashboard widgets: `Karotz` and `Karotz camera`.
- Configuration buttons: test the connection, search the local network,
  identify a rabbit, restart a rabbit. The network search works out the local
  network by itself.
- Everything the user reads is in English, French, German and Spanish: the
  integration itself and its documentation.
- LapinLibre and Terrier OS: the same rabbits, driven through their
  OpenKarotz-compatible API, with an optional web password (one per rabbit,
  separated by spaces), their own refusals read as such (asleep, ears off,
  busy, no speech server), and their name in the connection test. The network
  search reports the addresses that ask for a password without sending it.
- The integration remembers the ears and the last LED of each rabbit across
  restarts (in `/data`): the rabbit cannot report them.
- Push buttons on the rabbit: ears at random, and ears back to 0.
- `Play notification` on the rabbit: Gladys' "Talk on a speaker" scene action
  makes it speak with the voice chosen in Gladys. On OpenKarotz it needs a
  voice integration (Gladys serves the clip over http on the LAN); the voice
  of Gladys Plus comes over https, which only LapinLibre and Terrier OS play.
- The documentation says what each system plays: `http://` only on
  OpenKarotz, `https://` too on LapinLibre and Terrier OS, and what needs the
  Internet.
- The `Karotz camera` widget becomes `Karotz photos`: the pictures stored on
  the rabbit, one at a time and whole, with Previous / Next, Take a picture
  and Delete pictures.

### Changed

- The integration is now called Karotz, and its repository `gladys-karotz`:
  it covers OpenKarotz, LapinLibre and Terrier OS.

### Fixed

- A rabbit on OpenKarotz looked offline, and the network search found
  nothing: its web server ends its header lines with a bare line feed, which
  the HTTP parser of Node refuses. The integration now reads those answers.
- A picture taken with its shutter sound, or while the rabbit sleeps, was
  reported as "no answer" and never shown: OpenKarotz prints the output of
  `dbus-send` before its headers. The integration now skips it.
- Speech: a sentence the speech service of the rabbit failed to produce said
  "Done" in silence the second time (Free Rabbits OS caches the failure). It is
  now asked again without the cache, and a failure says why.
- Turning the LED back on restores its mode: a pulsing LED pulses again.
- Moving one ear no longer sends the other back to 0 after a restart.
- A rabbit that misses one read is asked again before it is declared
  unreachable, so a busy rabbit no longer fires the "unreachable" trigger.
- Waking the rabbit or putting it to sleep from the widget answers at once,
  instead of after the 6 to 12 seconds the rabbit takes.
- Icons of the `Karotz` widget and of its Mood button: the previous ones do
  not exist in the icon font of Gladys.
- Playing a sound or a stream by URL did nothing on OpenKarotz: its `sound`
  script does not decode its `url` parameter, so `http%3A%2F%2F...` was never
  fetched. The URL now travels raw, as the rabbit's own web page sends it; a
  URL with a space, `&` or `#` is refused with a message. Every other value
  is encoded as a browser does (`%20`, never `+`).
- An `https://` sound or stream answered "ok" on OpenKarotz and played
  nothing: its player reads no HTTPS. It is now refused with a message
  (LapinLibre reads it).
- The version shown is the real one: `/cgi-bin/status` reports a frozen
  version on Free Rabbits OS (200 where the web page says 210); the
  integration now reads `/cgi-bin/get_version`, with the version of the
  system.

[Unreleased]: https://github.com/smuteau/gladys-karotz/commits/main
