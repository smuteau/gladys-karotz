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
  return {
    mac: normalizeMac(raw.wlan_mac) ?? normalizeMac(raw.eth_mac),
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
    // null until checked; `false` on the stock OpenKarotz.
    hasVolume: null,
    volume: null,
    // The API does not report the ears: the last positions we asked for.
    ears: { left: null, right: null },
    // Last color that was not "off", to turn the LED back on.
    lastLedColor: DEFAULT_LED_COLOR,
    // RFID tags by id; null until listed once.
    tags: null,
    // The status tag count the list above was fetched for.
    listedTagCount: null,
    // Last picture taken through the integration: { key, base64, takenAt }.
    lastSnapshot: null,
  };
}

/**
 * Read one rabbit and describe what changed since the previous read. Never
 * throws: an unreachable rabbit is a state, not an error.
 *
 * @returns {Promise<{ wentOnline: boolean, wentOffline: boolean,
 *   sleepChanged: boolean, newTags: Array<object>, identified: boolean }>}
 */
export async function readRabbit(rabbit) {
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
    status = parseStatus(await rabbit.client.status());
  } catch (err) {
    rabbit.online = false;
    rabbit.lastError = err.message;
    changes.wentOffline = wasOnline === true;
    return changes;
  }

  rabbit.online = true;
  rabbit.lastError = null;
  rabbit.status = status;
  changes.wentOnline = wasOnline === false;
  // A transition needs a baseline: the first read never fires anything.
  changes.sleepChanged = previous !== null && previous.sleeping !== status.sleeping;
  if (status.ledColor !== LED_OFF) {
    rabbit.lastLedColor = status.ledColor;
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
