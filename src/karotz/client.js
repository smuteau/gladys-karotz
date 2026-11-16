// -----------------------------------------------------------------------------
// OpenKarotz HTTP client.
//
// A Karotz running OpenKarotz (on the original firmware or on top of Free
// Rabbits OS) serves a small CGI API on port 80: plain GET requests, no
// authentication, JSON answers of the form `{"return":"0", ...}` on success
// and `{"return":"1","msg":"..."}` on failure.
//
// The API was written as bash scripts in 2013 and its answers are not always
// valid JSON, so the parsing is tolerant. Endpoints were checked against the
// CGI scripts of the rabbit themselves (/www/cgi-bin/).
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
// The rabbit answers once the sound or the sentence has been played.
const PLAYBACK_TIMEOUT_MS = 45_000;
const SNAPSHOT_TIMEOUT_MS = 20_000;

export const EAR_MIN = 0;
export const EAR_MAX = 16;

export const ERROR_KINDS = {
  UNREACHABLE: 'unreachable',
  SLEEPING: 'sleeping',
  EARS_DISABLED: 'ears_disabled',
  NOT_SUPPORTED: 'not_supported',
  REFUSED: 'refused',
};

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

function refusal(answer) {
  const message = typeof answer.msg === 'string' && answer.msg ? answer.msg : 'Command refused';
  if (/sleeping|en veille/i.test(message)) {
    return new KarotzError(ERROR_KINDS.SLEEPING, message);
  }
  if (/ears disabled/i.test(message)) {
    return new KarotzError(ERROR_KINDS.EARS_DISABLED, message);
  }
  return new KarotzError(ERROR_KINDS.REFUSED, message);
}

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
 * @param {{ fetch?: typeof fetch }} [options] `fetch` is injected by the tests
 */
export function createKarotzClient(host, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const base = `http://${host}/cgi-bin/`;

  async function request(path, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new KarotzError(ERROR_KINDS.UNREACHABLE, `${host} did not answer (${err.message})`);
    }
    if (response.status === 404) {
      throw new KarotzError(ERROR_KINDS.NOT_SUPPORTED, `${path} is not available on ${host}`);
    }
    if (!response.ok) {
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

    /** Version, sleep state, LED, MAC addresses, storage, counters. */
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
