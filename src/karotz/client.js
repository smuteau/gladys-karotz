// -----------------------------------------------------------------------------
// OpenKarotz HTTP client.
//
// A Karotz running OpenKarotz (on the original firmware or on top of Free
// Rabbits OS) serves a small CGI API on port 80: plain GET requests, no
// authentication, JSON answers of the form `{"return":"0", ...}` on success
// and `{"return":"1","msg":"..."}` on failure.
//
// LapinLibre, and Terrier OS which is built on it, serve the same API under
// the same paths, with three differences: an optional web password (HTTP
// Basic, user `admin`, 401 without it), policy refusals answered with a 4xx
// status and the usual JSON body, and refusal messages of their own.
//
// The API was written as bash scripts in 2013 and its answers are not always
// valid JSON, so the parsing is tolerant. Endpoints were checked against the
// CGI scripts of the rabbit themselves (/www/cgi-bin/), and against
// LapinLibre's docs/web-api.md.
// -----------------------------------------------------------------------------

import { rabbitFetch } from './http.js';

const DEFAULT_TIMEOUT_MS = 10_000;
// The rabbit answers once the sound or the sentence has been played.
const PLAYBACK_TIMEOUT_MS = 45_000;
const SNAPSHOT_TIMEOUT_MS = 20_000;

export const EAR_MIN = 0;
export const EAR_MAX = 16;

export const ERROR_KINDS = {
  UNREACHABLE: 'unreachable',
  // The web page asks for a password (LapinLibre, Terrier OS) and none of the
  // configured ones was accepted.
  AUTH: 'auth',
  SLEEPING: 'sleeping',
  EARS_DISABLED: 'ears_disabled',
  // LapinLibre: another request holds the rabbit, or an application owns it.
  BUSY: 'busy',
  // LapinLibre: no speech server is set for the rabbit's language.
  NO_SPEECH: 'no_speech',
  NOT_SUPPORTED: 'not_supported',
  REFUSED: 'refused',
};

// The user name of LapinLibre's web page, fixed by its httpd configuration.
const WEB_USER = 'admin';

export class KarotzError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message
   */
  constructor(kind, message) {
    super(message);
    this.name = 'KarotzError';
    this.kind = kind;
  }
}

/**
 * Parse an OpenKarotz answer. Valid JSON most of the time; when a script
 * forgot a quote or a brace, the `return` and `msg` keys are still read.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseAnswer(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Fall through to the lenient reading.
  }
  const answer = {};
  const code = text.match(/"return"\s*:\s*"?(\w+)"?/);
  if (code) {
    answer.return = code[1];
  }
  const msg = text.match(/"msg"\s*:\s*"([^"]*)"/);
  if (msg) {
    answer.msg = msg[1];
  }
  return answer;
}

// `"return":"0"` everywhere, except the Python text-to-speech script of some
// firmwares, which answers `"return": true`.
function isSuccess(answer) {
  const code = answer.return;
  return code === undefined || code === '0' || code === 0 || code === true || code === 'true';
}

// OpenKarotz says "rabbit is sleeping" and "ears disabled"; LapinLibre says
// "the rabbit is asleep: wake it up first", "the API's ear moves are
// disabled (ears_mode)", "the rabbit is busy..." and "no speech server is
// set for <lang>...".
function refusal(answer) {
  const message = typeof answer.msg === 'string' && answer.msg ? answer.msg : 'Command refused';
  if (/sleeping|asleep|en veille/i.test(message)) {
    return new KarotzError(ERROR_KINDS.SLEEPING, message);
  }
  if (/ears disabled|ear moves are disabled/i.test(message)) {
    return new KarotzError(ERROR_KINDS.EARS_DISABLED, message);
  }
  if (/no speech server/i.test(message)) {
    return new KarotzError(ERROR_KINDS.NO_SPEECH, message);
  }
  if (/\bbusy\b/i.test(message)) {
    return new KarotzError(ERROR_KINDS.BUSY, message);
  }
  return new KarotzError(ERROR_KINDS.REFUSED, message);
}

const basicAuth = (password) =>
  `Basic ${Buffer.from(`${WEB_USER}:${password}`, 'utf8').toString('base64')}`;

/** `#ff0000`, `FF0000` or 16711680 -> `FF0000`. */
export function toHexColor(color) {
  if (typeof color === 'number' && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
    return color.toString(16).padStart(6, '0').toUpperCase();
  }
  if (typeof color === 'string') {
    const hex = color.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return hex.toUpperCase();
    }
  }
  throw new KarotzError(ERROR_KINDS.REFUSED, `Invalid color: ${color}`);
}

function earPosition(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) {
    throw new KarotzError(ERROR_KINDS.REFUSED, `Invalid ear position: ${value}`);
  }
  return Math.min(EAR_MAX, Math.max(EAR_MIN, number));
}

/**
 * @param {string} host IP address or host name, optional `:port`
 * @param {{ fetch?: typeof fetch, passwords?: () => string[] }} [options]
 *   `fetch` defaults to `rabbitFetch` (see ./http.js: the global `fetch`
 *   cannot read OpenKarotz's headers) and is injected by the tests.
 *   `passwords` gives the web passwords of the configuration; it is called at
 *   each request, so a new configuration applies to the rabbits already known.
 */
export function createKarotzClient(
  host,
  { fetch: fetchImpl = rabbitFetch, passwords = () => [] } = {},
) {
  const base = `http://${host}/cgi-bin/`;
  // What this rabbit accepted last: null for no password, else the password
  // itself; undefined while unknown.
  let accepted;

  // No password first: an OpenKarotz rabbit, or a LapinLibre one without a
  // password, never receives the password of another rabbit.
  function candidates() {
    const all = [null, ...new Set(passwords())];
    return accepted !== undefined && all.includes(accepted)
      ? [accepted, ...all.filter((candidate) => candidate !== accepted)]
      : all;
  }

  async function send(url, timeoutMs) {
    const tried = candidates();
    for (const password of tried) {
      let response;
      try {
        response = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: password === null ? {} : { Authorization: basicAuth(password) },
        });
      } catch (err) {
        throw new KarotzError(ERROR_KINDS.UNREACHABLE, `${host} did not answer (${err.message})`);
      }
      if (response.status !== 401) {
        accepted = password;
        return response;
      }
      // httpd checks the login before it runs the script: nothing was done,
      // so trying the next password is safe, even for a sound or a sentence.
      await response.body?.cancel().catch(() => {});
    }
    accepted = undefined;
    // Never the password itself: this message ends up in the logs.
    throw new KarotzError(
      ERROR_KINDS.AUTH,
      tried.length > 1 ? `${host} refused the web password` : `${host} asks for a web password`,
    );
  }

  async function request(path, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await send(url, timeoutMs);
    if (response.status === 404) {
      throw new KarotzError(ERROR_KINDS.NOT_SUPPORTED, `${path} is not available on ${host}`);
    }
    if (!response.ok) {
      // LapinLibre answers its policy refusals (403, 405, 413, 414) with the
      // usual JSON body: its reason says more than the status.
      const answer = parseAnswer(await response.text().catch(() => ''));
      if (typeof answer.msg === 'string' && answer.msg) {
        throw refusal(answer);
      }
      throw new KarotzError(ERROR_KINDS.UNREACHABLE, `${host} answered HTTP ${response.status}`);
    }
    return response;
  }

  async function call(path, params, timeoutMs) {
    const response = await request(path, params, timeoutMs);
    const answer = parseAnswer(await response.text());
    if (!isSuccess(answer)) {
      throw refusal(answer);
    }
    return answer;
  }

  return {
    host,

    /**
     * Version, sleep state, LED, MAC addresses, storage, counters; on
     * LapinLibre, its own status in `lapinlibre` too.
     */
    status: () => call('status'),

    wakeup: ({ silent = false } = {}) => call('wakeup', { silent: silent ? 1 : undefined }),
    sleep: () => call('sleep'),
    reboot: () => call('reboot'),

    /**
     * @param {{ color: string|number, pulse?: boolean, speed?: number, color2?: string|number }} led
     * `pulse` is always sent: without it the script keeps the previous mode.
     */
    leds: ({ color, pulse = false, speed, color2 }) =>
      call('leds', {
        color: toHexColor(color),
        pulse: pulse ? 1 : 0,
        speed: pulse ? speed : undefined,
        color2: pulse && color2 !== undefined ? toHexColor(color2) : undefined,
      }),

    // `noreset`: without it the ears go through their home position first.
    ears: (left, right) =>
      call('ears', { left: earPosition(left), right: earPosition(right), noreset: 1 }),
    earsReset: () => call('ears_reset'),
    earsRandom: () => call('ears_random'),

    tts: (text, { voice, nocache = false } = {}) =>
      call('tts', { text, voice, nocache: nocache ? 1 : 0 }, PLAYBACK_TIMEOUT_MS),

    playSound: (id) => call('sound', { id }, PLAYBACK_TIMEOUT_MS),
    playUrl: (url) => call('sound', { url }, PLAYBACK_TIMEOUT_MS),
    // mplayer slave command: only streams (playUrl) are stopped this way.
    soundControl: (cmd) => call('sound_control', { cmd }),
    soundList: async () => (await call('sound_list')).sounds ?? [],

    mood: (id) => call('apps/moods', { id }, PLAYBACK_TIMEOUT_MS),
    clock: (hour) => call('apps/clock', { hour }, PLAYBACK_TIMEOUT_MS),

    /** Master volume, 0-100. Only on firmwares shipping /cgi-bin/volume. */
    volume: (level) => call('volume', { level: Math.min(100, Math.max(0, Math.round(level))) }),
    /**
     * Is /cgi-bin/volume there? Called without a level, the script refuses
     * the request (supported) where the stock OpenKarotz answers 404.
     */
    async hasVolume() {
      try {
        await call('volume');
        return true;
      } catch (err) {
        if (err.kind === ERROR_KINDS.REFUSED) {
          return true;
        }
        if (err.kind === ERROR_KINDS.NOT_SUPPORTED) {
          return false;
        }
        throw err;
      }
    },

    /**
     * Take a picture; the rabbit stores it and answers its file name.
     * @returns {Promise<string>} file name, e.g. snapshot_2026_01_31_12_00_00.jpg
     */
    async snapshot({ silent = true } = {}) {
      const answer = await call(
        'snapshot',
        { silent: silent ? 1 : undefined },
        SNAPSHOT_TIMEOUT_MS,
      );
      if (typeof answer.filename !== 'string' || !/^[\w.-]+$/.test(answer.filename)) {
        throw new KarotzError(ERROR_KINDS.REFUSED, 'The rabbit did not return a snapshot');
      }
      return answer.filename;
    },
    /** @returns {Promise<Buffer>} the JPEG bytes of a stored snapshot */
    async snapshotGet(filename) {
      const response = await request('snapshot_get', { filename }, SNAPSHOT_TIMEOUT_MS);
      return Buffer.from(await response.arrayBuffer());
    },
    snapshotList: async () => (await call('snapshot_list')).snapshots ?? [],
    clearSnapshots: () => call('clear_snapshots'),

    /** @returns {Promise<Array<{ id: string, name?: string, color_name?: string }>>} */
    rfidList: async () => (await call('rfid_list_ext')).tags ?? [],
  };
}
