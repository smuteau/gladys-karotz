# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- The cover names LapinLibre and Le Terrier next to OpenKarotz and Free Rabbits.
- The documentation says which systems have been tested on a real rabbit: so
  far OpenKarotz on Free Rabbits OS, not LapinLibre nor Terrier OS.

### Fixed

- Two descriptions of 1.0.0 were out of date: the `Karotz` widget no longer has
  a Speak button, and a picture becomes the image of the rabbit's camera, not
  of a separate camera device.

## [1.0.0] - 2026-11-22

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
- Dashboard widgets: `Karotz`, and `Karotz photos` (the pictures stored on the
  rabbit, one at a time and whole, with Previous / Next, Take a picture and
  Delete pictures).
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

### Changed

- The integration is now called Karotz, and its repository `gladys-karotz`:
  it covers OpenKarotz, LapinLibre and Terrier OS.
- The `Karotz` widget: Sleep and Wake up come first. Waking up and falling
  asleep take the rabbit 6 to 12 seconds and the toast stays 4: it is now sent
  near the end (from how long the rabbit's previous one took), so "The rabbit
  is waking up" is still there when the new button shows up. Mood and Tell the
  time no longer say "Done": the rabbit answers by itself. The storage gauge
  shows its unit (%).
- The camera is a feature of the rabbit's device instead of a second device:
  every widget setting now offers one device per rabbit, and Gladys' Camera
  widget and camera scene actions work on the rabbit itself.
- The `Karotz` widget has an Ears at random button, in last position (after
  Mood and Tell the time), where Speak was.
- The scene action `Make the rabbit speak` is now called `Make the rabbit
speak (its own voice)`, and says where to find the voice of Gladys: the
  "Talk on a speaker" action. When the rabbit's own speech fails, the message
  points there instead of to the rabbit's web page.
- The ears: the first time the integration sees a rabbit, it recalibrates
  them, so they start from a known position. Both ears to 0 is a
  recalibration, which lands exactly on the rest position of `Ears reset`.

### Removed

- The Speak button of the `Karotz` widget: the rabbit's own speech service
  fails on many Free Rabbits OS rabbits, and an integration cannot use the
  voice of Gladys yet. The scene action stays.

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
  While the LED is off, the LED pulse switch keeps showing that mode instead
  of dropping to off, and changing it only sets up the next time it comes on.
- Waking up puts the ears back where they were before the night: the rabbit
  recalibrates them to 0 when it wakes up, by command, by its own schedule or
  after a restart. The same after a mood and after telling the time, which
  recalibrate them too.
- Moving an ear no longer nudges the other one. On OpenKarotz, the answer of
  `ears_random` names the ears the other way round from `ears`: after a random
  move the integration swapped them. And a move sent while the rabbit was
  still recalibrating its ears interrupted it, so they lost their zero: every
  move now waits for the end of a recalibration.
- Tell the time on OpenKarotz used the rabbit's clock, which is in UTC: an
  hour or two off in France. The integration now gives it the hour of Gladys.
- A sound or a radio played right after another one (a clip of Gladys'
  voice, say) never started on OpenKarotz, though the rabbit answered "ok":
  its `sound` script gives the running player one second to quit. The
  integration now asks the player to quit first, and starts the sound once it
  is gone. "Stop the radio" no longer fails when nothing is playing.
- Turning the pulse switch on right after turning the LED off lit the LED
  again: both commands ran at once, and the second one still saw the LED on.
  Commands to a rabbit now run one at a time.
- The reading loop no longer asks a rabbit that is waking up or falling asleep
  on a command: busy with its script, it could miss the read.
- Moving one ear no longer sends the other back to 0 after a restart.
- A rabbit that misses one read is asked again before it is declared
  unreachable, so a busy rabbit no longer fires the "unreachable" trigger.
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

[Unreleased]: https://github.com/smuteau/gladys-karotz/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/smuteau/gladys-karotz/releases/tag/v1.0.0
