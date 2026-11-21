// -----------------------------------------------------------------------------
// Pure parts: configuration, answers of the rabbit, status, subnet.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts, parsePasswords } from '../src/config.js';
import { ERROR_KINDS, createKarotzClient, parseAnswer, toHexColor } from '../src/karotz/client.js';
import { SYSTEMS, firmwareLabel, parseStatus } from '../src/rabbits.js';
import { findLocalSubnets, parseSubnet, scanSubnet, subnetsOf } from '../src/actions.js';
import { createFakeKarotz } from './helpers/fakeKarotz.js';

const basic = (password) => `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;

test('hosts are cleaned, de-duplicated, and anything odd is dropped', () => {
  assert.deepEqual(parseHosts('192.168.1.70, http://Karotz.local/ ;192.168.1.70 10.0.0.5:8080'), [
    '192.168.1.70',
    'karotz.local',
    '10.0.0.5:8080',
  ]);
  assert.deepEqual(parseHosts('a b@c, ../etc, '), ['a']);
  assert.deepEqual(parseHosts(undefined), []);
});

test('the configuration falls back to the defaults and clamps the interval', () => {
  assert.equal(normalizeConfig().poll_interval, DEFAULT_CONFIG.poll_interval);
  assert.equal(normalizeConfig({ poll_interval: '5' }).poll_interval, 15);
  assert.equal(normalizeConfig({ poll_interval: 'abc' }).poll_interval, 60);
  assert.equal(normalizeConfig({ camera: false }).camera, false);
  assert.equal(normalizeConfig({}).camera, true);
});

test('answers are read even when the script wrote broken JSON', () => {
  assert.deepEqual(parseAnswer('{"return":"0","left":"3"}'), { return: '0', left: '3' });
  assert.deepEqual(parseAnswer('{"return":"1","msg":"Tag ID not found." '), {
    return: '1',
    msg: 'Tag ID not found.',
  });
  assert.deepEqual(parseAnswer('<html>oops</html>'), {});
});

test('colors are accepted as integers or hexadecimal strings', () => {
  assert.equal(toHexColor(255), '0000FF');
  assert.equal(toHexColor('#ff8000'), 'FF8000');
  assert.throws(() => toHexColor('red'));
});

test('the status prefers the Wi-Fi MAC and ignores empty values', () => {
  const status = parseStatus({
    version: '2.0.5',
    sleep: '1',
    led_color: 'ff0000',
    led_pulse: '1',
    wlan_mac: '00:00:00:00:00:00',
    eth_mac: '00:0E:8E:2C:11:22',
    karotz_percent_used_space: '36',
    usb_percent_used_space: '-1',
    nb_tags: '2',
  });
  assert.equal(status.mac, '000e8e2c1122');
  assert.equal(status.sleeping, true);
  assert.equal(status.ledColor, 'FF0000');
  assert.equal(status.ledPulse, true);
  assert.equal(status.storagePercent, 36);
  assert.equal(status.usbPercent, null);
  assert.equal(status.tagCount, 2);
});

test('the client tells unreachable, sleeping and unsupported apart', async () => {
  const answer =
    (body, status = 200) =>
    async () =>
      new Response(body, { status });
  const client = (fetch) => createKarotzClient('rabbit.test', { fetch });

  await assert.rejects(
    client(async () => {
      throw new TypeError('fetch failed');
    }).status(),
    { kind: ERROR_KINDS.UNREACHABLE },
  );
  await assert.rejects(
    client(answer('{"return":"1","msg":"Unable to perform action, rabbit is sleeping."}')).ears(
      1,
      1,
    ),
    { kind: ERROR_KINDS.SLEEPING },
  );
  await assert.rejects(client(answer('nope', 404)).volume(50), { kind: ERROR_KINDS.NOT_SUPPORTED });
  // A file name that could escape the snapshot folder is refused.
  await assert.rejects(client(answer('{"return":"0","filename":"../../etc/passwd"}')).snapshot(), {
    kind: ERROR_KINDS.REFUSED,
  });
});

test('web passwords are split on spaces, and only the list is kept', () => {
  assert.deepEqual(parsePasswords(' first-pass  second:no\tfirst-pass '), [
    'first-pass',
    'second:no',
  ]);
  assert.deepEqual(parsePasswords('bad\u0007bell good'), ['good']);
  assert.deepEqual(parsePasswords(''), []);
  assert.deepEqual(parsePasswords(undefined), []);

  const config = normalizeConfig({ web_password: 'secret-one secret-two' });
  assert.deepEqual(config.passwords, ['secret-one', 'secret-two']);
  // The raw field is not carried around, so nothing can print it by mistake.
  assert.equal('web_password' in config, false);
  assert.deepEqual(normalizeConfig().passwords, []);
});

test('the client sends a password only to a rabbit that asks for one', async () => {
  // An OpenKarotz rabbit never sees the configured passwords.
  const open = createFakeKarotz();
  let client = createKarotzClient('192.168.1.70', {
    fetch: open.fetch,
    passwords: () => ['pass-one'],
  });
  await client.status();
  await client.leds({ color: 'FF0000' });
  assert.deepEqual(
    open.calls.map((call) => call.authorization),
    [null, null],
  );

  // A LapinLibre rabbit: no password first, then each one until it accepts.
  const locked = createFakeKarotz({ system: 'lapinlibre', password: 'pass-two' });
  client = createKarotzClient('192.168.1.70', {
    fetch: locked.fetch,
    passwords: () => ['pass-one', 'pass-two'],
  });
  await client.status();
  assert.deepEqual(
    locked.calls.map((call) => call.authorization),
    [null, basic('pass-one'), basic('pass-two')],
  );
  // Then it sticks to the accepted one: one request per call.
  locked.calls.length = 0;
  await client.leds({ color: 'FF0000' });
  assert.deepEqual(
    locked.calls.map((call) => call.authorization),
    [basic('pass-two')],
  );
});

test('a missing or wrong web password is its own kind of error, without the password', async () => {
  const locked = createFakeKarotz({ system: 'lapinlibre', password: 'right-pass' });
  const client = (passwords) =>
    createKarotzClient('192.168.1.70', { fetch: locked.fetch, passwords: () => passwords });

  await assert.rejects(client([]).status(), {
    kind: ERROR_KINDS.AUTH,
    message: '192.168.1.70 asks for a web password',
  });
  const err = await client(['wrong-pass'])
    .status()
    .catch((error) => error);
  assert.equal(err.kind, ERROR_KINDS.AUTH);
  assert.doesNotMatch(err.message, /wrong-pass|right-pass/);
});

test('LapinLibre refusals are read as such', async () => {
  const lapin = (overrides) => {
    const karotz = createFakeKarotz({ system: 'lapinlibre', ...overrides });
    return createKarotzClient('192.168.1.70', { fetch: karotz.fetch });
  };
  await assert.rejects(lapin({ sleeping: true }).ears(1, 1), { kind: ERROR_KINDS.SLEEPING });
  await assert.rejects(lapin({ busy: true }).tts('Bonjour'), { kind: ERROR_KINDS.BUSY });
  await assert.rejects(lapin({ speechServer: false }).tts('Bonjour'), {
    kind: ERROR_KINDS.NO_SPEECH,
  });

  const answer =
    (body, status = 200) =>
    async () =>
      new Response(body, { status });
  const client = (fetch) => createKarotzClient('rabbit.test', { fetch });
  await assert.rejects(
    client(answer('{"return":"1","msg":"the API\'s ear moves are disabled (ears_mode)"}')).ears(
      1,
      1,
    ),
    { kind: ERROR_KINDS.EARS_DISABLED },
  );
  // A policy refusal comes with a 4xx status and the usual JSON reason.
  await assert.rejects(
    client(answer('{"return":"1","msg":"cross-site request refused"}', 403)).sleep(),
    { kind: ERROR_KINDS.REFUSED, message: 'cross-site request refused' },
  );
  await assert.rejects(client(answer('<html>oops</html>', 500)).sleep(), {
    kind: ERROR_KINDS.UNREACHABLE,
  });
});

test('a silent cached sentence is asked again without the cache', async () => {
  const answers = [
    '{"id":"","played":"0","cache":"1","return":"0","voice":"1","mute":"0"}',
    '{"id":"e5fa23a4","played":"1","cache":"0","return":"0","voice":"1","mute":"0"}',
  ];
  const nocache = [];
  const fetch = async (input) => {
    nocache.push(new URL(String(input)).searchParams.get('nocache'));
    return new Response(answers.shift(), { status: 200 });
  };
  const client = createKarotzClient('rabbit.test', { fetch });
  assert.equal((await client.tts('Bonjour')).played, '1');
  assert.deepEqual(nocache, ['0', '1']);

  // A muted rabbit is silent on purpose: not a failure, no second request.
  const muted = createKarotzClient('rabbit.test', {
    fetch: async () => new Response('{"played":"0","return":"0","mute":"1"}', { status: 200 }),
  });
  assert.equal((await muted.tts('Bonjour')).mute, '1');
});

test('a sound URL travels raw, and text is encoded as a browser does', async () => {
  const sent = [];
  const fetch = async (input) => {
    sent.push(String(input));
    return new Response('{"return":"0"}', { status: 200 });
  };
  const client = createKarotzClient('rabbit.test', { fetch });
  // OpenKarotz's sound script does not decode its url: %3A%2F%2F plays nothing.
  await client.playUrl('http://192.168.1.10:8080/tts/audio/3f9a.mp3');
  assert.equal(
    sent.at(-1),
    'http://rabbit.test/cgi-bin/sound?url=http://192.168.1.10:8080/tts/audio/3f9a.mp3',
  );
  // Spaces and accents as %XX, never +.
  await client.tts('Bonjour à tous');
  assert.match(sent.at(-1), /tts\?text=Bonjour%20%C3%A0%20tous&nocache=0$/);

  // What cannot travel raw is refused before any request.
  const before = sent.length;
  for (const bad of ['http://a.test/b?c=1&d=2', 'http://a.test/a b.mp3', 'ftp://a.test/x.mp3']) {
    await assert.rejects(client.playUrl(bad), { kind: ERROR_KINDS.REFUSED });
  }
  assert.equal(sent.length, before);
});

test('a LapinLibre status is recognised, and keeps the Wi-Fi MAC', () => {
  const status = parseStatus({
    version: '4f2c1a0 (0.2.0)',
    led_color: '00FF00',
    eth_mac: '00:00:00:00:00:00',
    wlan_mac: 'AA:BB:CC:DD:EE:FF',
    lapinlibre: { build: '0.2.0' },
  });
  assert.equal(status.system, SYSTEMS.LAPINLIBRE);
  assert.equal(status.mac, 'aabbccddeeff');
  assert.equal(firmwareLabel(status), 'LapinLibre 4f2c1a0 (0.2.0)');
  assert.equal(parseStatus({ version: '2.0.5' }).system, SYSTEMS.OPENKAROTZ);
});

test('the network search reports a locked address and never sends a password', async () => {
  const seen = [];
  const fetch = async (input, init = {}) => {
    const { hostname } = new URL(String(input));
    seen.push(init.headers?.Authorization ?? null);
    if (hostname === '192.168.1.70') {
      return createFakeKarotz().fetch(input, init);
    }
    if (hostname === '192.168.1.71') {
      return new Response('401 Unauthorized', { status: 401 });
    }
    throw new TypeError('fetch failed');
  };
  const found = await scanSubnet(fetch, '192.168.1');
  assert.deepEqual(
    found.map((hit) => [hit.ip, Boolean(hit.locked)]),
    [
      ['192.168.1.70', false],
      ['192.168.1.71', true],
    ],
  );
  assert.equal(seen.length, 254);
  assert.ok(seen.every((authorization) => authorization === null));
});

test('only private /24 networks are searched', () => {
  assert.equal(parseSubnet('192.168.1'), '192.168.1');
  assert.equal(parseSubnet(' 192.168.1.42 '), '192.168.1');
  assert.equal(parseSubnet('10.0.0.0/24'), '10.0.0');
  assert.equal(parseSubnet('172.20.3'), '172.20.3');
  assert.equal(parseSubnet('8.8.8'), null);
  assert.equal(parseSubnet('192.168'), null);
});

test('the local network is deduced from the neighbours Gladys hears', async () => {
  assert.deepEqual(
    subnetsOf([
      '192.168.0.1',
      '192.168.0.1',
      '10.0.0.5:8080',
      '192.168.0.9',
      'karotz.local',
      '8.8.8.8',
    ]),
    ['192.168.0', '10.0.0'],
  );

  const logger = { warn() {} };
  const neighbours = [{ source_ip: '192.168.0.1' }, { source_ip: '192.168.0.20' }];
  let ctx = {
    rabbits: [{ host: '10.0.0.5' }],
    logger,
    gladys: { scanNetwork: async () => neighbours },
  };
  assert.deepEqual(await findLocalSubnets(ctx), ['192.168.0', '10.0.0']);

  // A refused scan is not fatal: the configured rabbits still tell the network.
  const refused = async () => {
    throw new Error('403');
  };
  ctx = { rabbits: [{ host: '10.0.0.5' }], logger, gladys: { scanNetwork: refused } };
  assert.deepEqual(await findLocalSubnets(ctx), ['10.0.0']);
  ctx = { rabbits: [], logger, gladys: { scanNetwork: refused } };
  assert.deepEqual(await findLocalSubnets(ctx), []);
});
