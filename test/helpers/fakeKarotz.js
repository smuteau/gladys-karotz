// -----------------------------------------------------------------------------
// An in-memory Karotz: a `fetch` that answers like the OpenKarotz CGI scripts.
// Tests never touch the network.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';

// Smallest bytes that pass for a JPEG (SOI marker + padding).
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

export const HOST = '192.168.1.70';
export const MAC = 'aabbccddeeff';

export function createFakeKarotz(overrides = {}) {
  const rabbit = {
    online: true,
    sleeping: false,
    ledColor: '00FF00',
    ledPulse: '0',
    hasVolume: false,
    tags: [],
    snapshots: 0,
    jpeg: JPEG,
    // Every request received: `{ path, params }`.
    calls: [],
    ...overrides,
  };

  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  const ok = (extra = {}) => json({ ...extra, return: '0' });
  const refused = (msg) => json({ return: '1', msg });
  const asleep = () => refused('Unable to perform action, rabbit is sleeping.');

  const handlers = {
    status: () =>
      json({
        version: '2.0.5',
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
        data_dir: '/usr/openkarotz',
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
    // The Python script of some firmwares answers a boolean.
    tts: () => (rabbit.sleeping ? json({ return: false }) : json({ return: true, played: true })),
    sound: () => (rabbit.sleeping ? asleep() : ok()),
    sound_control: () => ok(),
    'apps/moods': (params) => ok({ moods: params.id ?? '42' }),
    'apps/clock': () => ok({ hour: '12' }),
    reboot: () => ok(),
    volume(params) {
      if (!rabbit.hasVolume) {
        return new Response('Not found', { status: 404 });
      }
      return params.level === undefined ? refused('level must be 0-100') : ok();
    },
    snapshot() {
      rabbit.snapshots += 1;
      return ok({ filename: `snapshot_${rabbit.snapshots}.jpg` });
    },
    snapshot_get: () => new Response(rabbit.jpeg, { status: 200 }),
    clear_snapshots() {
      rabbit.snapshots = 0;
      return ok();
    },
    rfid_list_ext: () => ok({ tags: rabbit.tags }),
  };

  rabbit.fetch = async (input) => {
    const url = new URL(String(input));
    if (!rabbit.online || url.host !== (rabbit.host ?? HOST)) {
      throw new TypeError('fetch failed');
    }
    const path = url.pathname.replace('/cgi-bin/', '');
    const params = Object.fromEntries(url.searchParams);
    rabbit.calls.push({ path, params });
    const handler = handlers[path];
    return handler ? handler(params) : new Response('Not found', { status: 404 });
  };

  rabbit.callsTo = (path) => rabbit.calls.filter((call) => call.path === path);
  return rabbit;
}

/** A connected app in front of one fake rabbit. */
export async function createTestApp({ karotz = createFakeKarotz(), config = {} } = {}) {
  const gladys = createFakeGladys({ config: { hosts: HOST, ...config } });
  const app = createApp(gladys, { fetch: karotz.fetch, sleepMs: async () => {}, timers: false });
  app.register();
  await gladys.connect();
  return { gladys, app, ctx: app.ctx, karotz };
}
