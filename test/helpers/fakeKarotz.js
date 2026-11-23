// -----------------------------------------------------------------------------
// An in-memory Karotz: a `fetch` that answers like the OpenKarotz CGI scripts,
// or, with `system: 'lapinlibre'`, like LapinLibre (and Terrier OS): its
// status object, its refusal messages, and its web password when `password`
// is set. Tests never touch the network.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';

// Smallest bytes that pass for a JPEG (SOI marker + padding).
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

export const HOST = '192.168.1.70';
export const MAC = 'aabbccddeeff';

/** The name a rabbit gives its n-th picture of the day. */
export const snapshotName = (n) =>
  `snapshot_2026_11_21_17_${String(Math.floor(n / 60)).padStart(2, '0')}_${String(n % 60).padStart(2, '0')}.jpg`;

export function createFakeKarotz(overrides = {}) {
  const rabbit = {
    online: true,
    // 'openkarotz' or 'lapinlibre'.
    system: 'openkarotz',
    // LapinLibre's web password; null = no login asked.
    password: null,
    // LapinLibre: false = no speech server for the rabbit's language.
    speechServer: true,
    // LapinLibre: another request holds the rabbit.
    busy: false,
    // OpenKarotz on Free Rabbits OS: false = its online speech service fails.
    speechService: true,
    // Free Rabbits OS: the frozen `version` of its status (its get_version
    // still tells the truth). null: the status tells the truth too.
    frozenStatusVersion: null,
    // The next N requests get no answer at all.
    dropNext: 0,
    // Milliseconds some scripts take to answer, e.g. `{ wakeup: 50 }`.
    delays: {},
    sleeping: false,
    // OpenKarotz's player: what it plays now (null: none), and every sound
    // that really started. `slowPlayer`: a running player takes longer than
    // the one second the `sound` script gives it, so the next sound does not
    // start, and the script answers "0" all the same.
    player: null,
    heard: [],
    slowPlayer: false,
    ledColor: '00FF00',
    ledPulse: '0',
    hasVolume: false,
    tags: [],
    // Pictures taken so far, and the names of those still stored.
    snapshots: 0,
    photos: [],
    jpeg: JPEG,
    // Every request received: `{ path, params, authorization }`.
    calls: [],
    ...overrides,
  };
  const lapinLibre = () => rabbit.system === 'lapinlibre';
  // Sentences Free Rabbits OS cached, failed syntheses included.
  const ttsCache = new Set();

  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  const ok = (extra = {}) => json({ ...extra, return: '0' });
  const refused = (msg) => json({ return: '1', msg });
  const asleep = () =>
    refused(
      lapinLibre()
        ? 'the rabbit is asleep: wake it up first'
        : 'Unable to perform action, rabbit is sleeping.',
    );

  const handlers = {
    status: () =>
      json({
        version: lapinLibre() ? '4f2c1a0 (0.2.0)' : (rabbit.frozenStatusVersion ?? '2.0.5'),
        ears_disabled: '0',
        sleep: rabbit.sleeping ? '1' : '0',
        sleep_time: '0',
        led_color: rabbit.ledColor,
        led_pulse: rabbit.ledPulse,
        tts_cache_size: '3',
        usb_free_space: '-1',
        karotz_free_space: '148.2M',
        eth_mac: '00:00:00:00:00:00',
        wlan_mac: 'AA:BB:CC:DD:EE:FF',
        nb_tags: String(rabbit.tags.length),
        nb_moods: '305',
        nb_sounds: '14',
        nb_stories: '0',
        karotz_percent_used_space: '36',
        usb_percent_used_space: '',
        data_dir: lapinLibre() ? '/usr/etc/conf/web' : '/usr/openkarotz',
        ...(lapinLibre()
          ? {
              lapinlibre: {
                build: '0.2.0',
                build_id: '4f2c1a0',
                speech_server: rabbit.speechServer ? 'http://192.168.1.10:8081' : '',
                web_user: rabbit.password ? 'admin' : '',
              },
            }
          : {}),
      }),
    wakeup() {
      rabbit.sleeping = false;
      return ok();
    },
    sleep() {
      if (rabbit.sleeping) {
        return refused('Unable to perform action, rabbit is already sleeping.');
      }
      rabbit.sleeping = true;
      return ok();
    },
    leds(params) {
      if (rabbit.sleeping) {
        return asleep();
      }
      rabbit.ledColor = params.color;
      rabbit.ledPulse = params.pulse ?? '0';
      return ok({ color: params.color });
    },
    ears: (params) => (rabbit.sleeping ? asleep() : ok({ left: params.left, right: params.right })),
    ears_reset: () => ok(),
    ears_random: () => ok({ left: '3', right: '11' }),
    tts(params) {
      if (lapinLibre()) {
        if (rabbit.sleeping) {
          return asleep();
        }
        return rabbit.speechServer
          ? ok({ played: true })
          : refused(
              'no speech server is set for fr-FR: set SERVER= (or TTS_SERVER=) in lapinlibre.txt',
            );
      }
      if (!rabbit.speechService) {
        // Free Rabbits OS: a failed synthesis says nothing, and is cached
        // anyway; the cached sentence then "succeeds" in silence.
        if (params.nocache !== '1' && ttsCache.has(params.text)) {
          return json({ id: '', played: '0', cache: '1', return: '0', voice: '1', mute: '0' });
        }
        ttsCache.add(params.text);
        return json({
          id: 'f879a0df',
          played: '0',
          cache: '0',
          return: '1',
          voice: '1',
          mute: '0',
        });
      }
      // The Python script of some firmwares answers a boolean.
      return rabbit.sleeping ? json({ return: false }) : json({ return: true, played: true });
    },
    sound(params) {
      if (rabbit.sleeping) {
        return asleep();
      }
      if (rabbit.player !== null && rabbit.slowPlayer && !lapinLibre()) {
        rabbit.player = null;
        return ok();
      }
      rabbit.player = params.url ?? params.id;
      rabbit.heard.push(rabbit.player);
      return ok();
    },
    sound_control(params) {
      if (rabbit.sleeping) {
        return asleep();
      }
      if (rabbit.player === null) {
        return refused('No sound currently playing.');
      }
      if (params.cmd === 'quit') {
        rabbit.player = null;
      }
      return ok({ cmd: params.cmd });
    },
    'apps/moods': (params) => ok({ moods: params.id ?? '42' }),
    'apps/clock': () => ok({ hour: '12' }),
    reboot: () => ok(),
    get_version: () =>
      lapinLibre()
        ? ok({ version: '4f2c1a0 (0.2.0)', rootfs_version: 'Unknown', patch_version: 'N/A' })
        : ok({ version: '2.0.5', rootfs_version: '2.0.r8' }),
    volume(params) {
      if (!rabbit.hasVolume) {
        return new Response('Not found', { status: 404 });
      }
      return params.level === undefined ? refused('level must be 0-100') : ok();
    },
    snapshot() {
      rabbit.snapshots += 1;
      const name = snapshotName(rabbit.snapshots);
      rabbit.photos.push(name);
      return ok({ filename: name, thumb: name.replace('.jpg', '.thumb.gif') });
    },
    snapshot_get: (params) =>
      rabbit.photos.includes(params.filename)
        ? new Response(rabbit.jpeg, { status: 200 })
        : new Response('{"return":"1","msg":"no stored snapshot has that name"}', { status: 404 }),
    snapshot_list: () => ok({ snapshots: rabbit.photos.map((id) => ({ id })) }),
    clear_snapshots() {
      rabbit.photos = [];
      return ok();
    },
    rfid_list_ext: () => ok({ tags: rabbit.tags }),
  };

  // The endpoints LapinLibre runs through its lock (`web_hardware`).
  const HARDWARE = new Set(['leds', 'ears', 'ears_random', 'ears_reset', 'tts', 'sound']);

  rabbit.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (!rabbit.online || url.host !== (rabbit.host ?? HOST)) {
      throw new TypeError('fetch failed');
    }
    if (rabbit.dropNext > 0) {
      rabbit.dropNext -= 1;
      throw new TypeError('fetch failed');
    }
    const path = url.pathname.replace('/cgi-bin/', '');
    const params = Object.fromEntries(url.searchParams);
    const authorization = init.headers?.Authorization ?? null;
    rabbit.calls.push({ path, params, authorization });
    // httpd checks the login before running any script.
    if (rabbit.password !== null) {
      const expected = `Basic ${Buffer.from(`admin:${rabbit.password}`).toString('base64')}`;
      if (authorization !== expected) {
        return new Response('<HTML><BODY><H1>401 Unauthorized</H1></BODY></HTML>', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Web Server Authentication"' },
        });
      }
    }
    if (lapinLibre() && rabbit.busy && HARDWARE.has(path)) {
      return refused('the rabbit is busy with another request: try again');
    }
    if (rabbit.delays[path]) {
      await new Promise((resolve) => setTimeout(resolve, rabbit.delays[path]));
    }
    const handler = handlers[path];
    return handler ? handler(params) : new Response('Not found', { status: 404 });
  };

  rabbit.callsTo = (path) => rabbit.calls.filter((call) => call.path === path);
  return rabbit;
}

/** A connected app in front of one fake rabbit. */
export async function createTestApp({
  karotz = createFakeKarotz(),
  config = {},
  options = {},
} = {}) {
  const gladys = createFakeGladys({ config: { hosts: HOST, ...config } });
  const app = createApp(gladys, {
    fetch: karotz.fetch,
    sleepMs: async () => {},
    timers: false,
    ...options,
  });
  app.register();
  await gladys.connect();
  return { gladys, app, ctx: app.ctx, karotz };
}
