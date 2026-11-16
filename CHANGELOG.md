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

[Unreleased]: https://github.com/smuteau/gladys-openkarotz-freerabbits/commits/main
