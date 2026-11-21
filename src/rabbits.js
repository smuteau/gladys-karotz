// -----------------------------------------------------------------------------
// The rabbits the integration knows, and how one is read.
//
// A rabbit is reached at the host the user typed, but it is IDENTIFIED by its
// MAC address, read from /cgi-bin/status: the Gladys device survives a new IP
// address, a DHCP lease or a move from Wi-Fi to Ethernet... as long as the same
// interface is used (the Wi-Fi MAC is preferred, the one nearly every rabbit
// connects with).
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './karotz/client.js';

// What serves the API. Free Rabbits OS runs OpenKarotz; Terrier OS is a
// LapinLibre and answers as one.
export const SYSTEMS = {
  OPENKAROTZ: 'OpenKarotz',
  LAPINLIBRE: 'LapinLibre',
};

// LapinLibre always answers this `eth_mac`: it has no Ethernet source.
const EMPTY_MAC = '000000000000';
const DEFAULT_LED_COLOR = '00FF00';
export const LED_OFF = '000000';

function normalizeMac(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const hex = value.replace(/[^0-9a-f]/gi, '').toLowerCase();
  return hex.length === 12 && hex !== EMPTY_MAC ? hex : null;
}

function toInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

function toPercent(value) {
  const number = toInteger(value);
  return number !== null && number >= 0 && number <= 100 ? number : null;
}

/**
 * Turn the raw /cgi-bin/status answer (every value is a string) into a typed
 * snapshot. Pure: tested on recorded answers.
 */
export function parseStatus(raw = {}) {
  const ledColor = /^[0-9a-f]{6}$/i.test(raw.led_color ?? '')
    ? raw.led_color.toUpperCase()
    : DEFAULT_LED_COLOR;
  // LapinLibre (and Terrier OS, built on it) adds its own status object.
  const lapinLibre = raw.lapinlibre !== null && typeof raw.lapinlibre === 'object';
  return {
    mac: normalizeMac(raw.wlan_mac) ?? normalizeMac(raw.eth_mac),
    system: lapinLibre ? SYSTEMS.LAPINLIBRE : SYSTEMS.OPENKAROTZ,
    version: typeof raw.version === 'string' && raw.version !== '0' ? raw.version : null,
    sleeping: String(raw.sleep) === '1',
    ledColor,
    ledPulse: String(raw.led_pulse) === '1',
    earsDisabled: String(raw.ears_disabled) === '1',
    storagePercent: toPercent(raw.karotz_percent_used_space),
    // -1 or empty when no USB key is plugged in.
    usbPercent: toPercent(raw.usb_percent_used_space),
    tagCount: toInteger(raw.nb_tags),
    soundCount: toInteger(raw.nb_sounds),
    moodCount: toInteger(raw.nb_moods),
  };
}

// Placeholders get_version answers when it has nothing to say.
const NO_VERSION = new Set(['', '0', 'unknown', 'n/a']);
const versionText = (value) =>
  typeof value === 'string' && !NO_VERSION.has(value.trim().toLowerCase()) ? value.trim() : null;

/** `/cgi-bin/get_version` -> `{ version, rootfs }`, each a string or null. */
export function parseVersions(raw = {}) {
  return { version: versionText(raw.version), rootfs: versionText(raw.rootfs_version) };
}

/**
 * `OpenKarotz 210 (2.0.r8)`, `LapinLibre 4f2c1a0 (0.2.0)`: what serves the API,
 * its version and, when known, the version of the rabbit's system.
 */
export function firmwareLabel(status, versions = null) {
  const system = status?.system ?? SYSTEMS.OPENKAROTZ;
  const version = versions?.version ?? status?.version ?? '?';
  return versions?.rootfs ? `${system} ${version} (${versions.rootfs})` : `${system} ${version}`;
}

/** Does this answer look like an OpenKarotz status? Used by the network search. */
export function looksLikeStatus(raw) {
  return Boolean(raw) && typeof raw === 'object' && 'version' in raw && 'led_color' in raw;
}

/**
 * @param {string} host
 * @param {ReturnType<import('./karotz/client.js').createKarotzClient>} client
 */
export function createRabbit(host, client) {
  return {
    host,
    client,
    // Stable identifier (MAC), unknown until the rabbit answered once.
    id: null,
    // null = never read, then true / false.
    online: null,
    status: null,
    lastError: null,
    // ERROR_KINDS of the last failed read: tells a wrong password from silence.
    lastErrorKind: null,
    // null until checked; `false` on the stock OpenKarotz.
    hasVolume: null,
    // `{ version, rootfs }` from get_version; null until asked.
    versions: null,
    volume: null,
    // The API does not report the ears: the last positions we asked for.
    ears: { left: null, right: null },
    // The last LED that was not "off", color and mode: turning the LED back
    // on restores both (a pulsing LED pulses again).
    lastLed: { color: DEFAULT_LED_COLOR, pulse: false },
    // A TRANSITIONS value of commands.js while the rabbit wakes up or falls
    // asleep on our command, else null.
    transition: null,
    // RFID tags by id; null until listed once.
    tags: null,
    // The status tag count the list above was fetched for.
    listedTagCount: null,
    // The pictures stored on the rabbit (oldest first), the one the photos
    // widget shows (null: the newest), and the bytes of the last few: see
    // photos.js.
    photos: null,
    photoShown: null,
    photoCache: null,
    photoQueue: null,
  };
}

// A rabbit busy with a long script (a mood, a picture while asleep) can miss
// one request: an online rabbit is asked twice before it is declared
// unreachable, which also fires the "rabbit unreachable" scene trigger.
const STATUS_RETRY_DELAY_MS = 2000;

async function readStatus(rabbit, sleepMs) {
  try {
    return await rabbit.client.status();
  } catch (err) {
    if (!sleepMs || err.kind !== ERROR_KINDS.UNREACHABLE) {
      throw err;
    }
    await sleepMs(STATUS_RETRY_DELAY_MS);
    return rabbit.client.status();
  }
}

/**
 * Read one rabbit and describe what changed since the previous read. Never
 * throws: an unreachable rabbit is a state, not an error. `sleepMs` enables
 * the second try of an online rabbit (see readStatus).
 *
 * @returns {Promise<{ wentOnline: boolean, wentOffline: boolean,
 *   sleepChanged: boolean, newTags: Array<object>, identified: boolean }>}
 */
export async function readRabbit(rabbit, { sleepMs } = {}) {
  const changes = {
    wentOnline: false,
    wentOffline: false,
    sleepChanged: false,
    newTags: [],
    identified: false,
  };
  const wasOnline = rabbit.online;
  const previous = rabbit.status;

  let status;
  try {
    status = parseStatus(await readStatus(rabbit, wasOnline === true ? sleepMs : undefined));
  } catch (err) {
    rabbit.online = false;
    rabbit.lastError = err.message;
    rabbit.lastErrorKind = err.kind ?? null;
    changes.wentOffline = wasOnline === true;
    return changes;
  }

  rabbit.online = true;
  rabbit.lastError = null;
  rabbit.lastErrorKind = null;
  rabbit.status = status;
  changes.wentOnline = wasOnline === false;
  // A transition needs a baseline: the first read never fires anything.
  changes.sleepChanged = previous !== null && previous.sleeping !== status.sleeping;
  if (status.ledColor !== LED_OFF) {
    rabbit.lastLed = { color: status.ledColor, pulse: status.ledPulse };
  }
  if (rabbit.id === null) {
    // A rabbit without any MAC in its status (never seen, but the scripts
    // allow it) falls back to its host: stable as long as the address is.
    rabbit.id = status.mac ?? `host-${rabbit.host.replace(/[^a-z0-9]/gi, '-')}`;
    changes.identified = true;
  }

  if (rabbit.hasVolume === null) {
    try {
      rabbit.hasVolume = await rabbit.client.hasVolume();
    } catch {
      // Unknown for now: asked again at the next read.
    }
  }

  // The `version` of the status is frozen on some firmwares (Free Rabbits OS
  // says 200 where its web page says 210): get_version tells the truth, with
  // the version of the system. Asked once, and again when the rabbit comes
  // back, since an update restarts it.
  if (rabbit.versions === null || changes.wentOnline) {
    try {
      rabbit.versions = parseVersions(await rabbit.client.getVersion());
    } catch (err) {
      if (err.kind === ERROR_KINDS.NOT_SUPPORTED) {
        rabbit.versions = { version: null, rootfs: null };
      }
    }
  }

  // The tag list is only fetched when the count moved: one request per read
  // is already a lot for a 2011 ARM9 running bash CGI scripts.
  if (rabbit.tags === null || rabbit.listedTagCount !== status.tagCount) {
    try {
      const tags = new Map((await rabbit.client.rfidList()).map((tag) => [String(tag.id), tag]));
      if (rabbit.tags !== null) {
        changes.newTags = [...tags.values()].filter((tag) => !rabbit.tags.has(String(tag.id)));
      }
      rabbit.tags = tags;
      rabbit.listedTagCount = status.tagCount;
    } catch (err) {
      if (err.kind === ERROR_KINDS.NOT_SUPPORTED) {
        rabbit.tags = new Map();
        rabbit.listedTagCount = status.tagCount;
      }
    }
  }
  return changes;
}

/** `Karotz` alone, `Karotz (192.168.1.70)` when several rabbits are configured. */
export function rabbitName(rabbit, rabbitCount) {
  return rabbitCount > 1 ? `Karotz (${rabbit.host})` : 'Karotz';
}
