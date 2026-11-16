// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of the manifest.
// This module provides the defaults and normalizes the received object, so the
// rest of the code never deals with `undefined` or with a string where a
// number is expected.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  // Comma-separated IP addresses or host names of the rabbits.
  hosts: '',
  // Seconds between two reads of every rabbit.
  poll_interval: 60,
  // Voice passed to the rabbit's text-to-speech; empty = the rabbit's default.
  tts_voice: '',
  // Publish a camera device per rabbit.
  camera: true,
};

export const POLL_INTERVAL_MIN = 15;
export const POLL_INTERVAL_MAX = 3600;

// A host is an IPv4 address or a DNS name, with an optional port. Anything
// else is dropped: the value ends up in a URL.
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i;

/**
 * Split the `hosts` field into a clean, de-duplicated list. Users paste
 * `http://192.168.1.70/` as often as `192.168.1.70`: the scheme and the path
 * are removed rather than refused.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseHosts(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  const hosts = raw
    .split(/[\s,;]+/)
    .map((entry) =>
      entry
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase(),
    )
    .filter((entry) => HOST_PATTERN.test(entry));
  return [...new Set(hosts)];
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const hosts = typeof raw.hosts === 'string' ? raw.hosts : DEFAULT_CONFIG.hosts;
  return {
    hosts,
    hostList: parseHosts(hosts),
    poll_interval: clamp(
      raw.poll_interval ?? DEFAULT_CONFIG.poll_interval,
      POLL_INTERVAL_MIN,
      POLL_INTERVAL_MAX,
      DEFAULT_CONFIG.poll_interval,
    ),
    tts_voice: typeof raw.tts_voice === 'string' ? raw.tts_voice.trim() : DEFAULT_CONFIG.tts_voice,
    // Anything but an explicit false keeps the camera.
    camera: raw.camera !== false && raw.camera !== 'false',
  };
}
