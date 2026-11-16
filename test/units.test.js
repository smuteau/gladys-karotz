// -----------------------------------------------------------------------------
// Pure parts: configuration, answers of the rabbit, status, subnet.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts } from '../src/config.js';
import { ERROR_KINDS, createKarotzClient, parseAnswer, toHexColor } from '../src/karotz/client.js';
import { parseStatus } from '../src/rabbits.js';
import { parseSubnet } from '../src/actions.js';

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

test('only private /24 networks are searched', () => {
  assert.equal(parseSubnet('192.168.1'), '192.168.1');
  assert.equal(parseSubnet(' 192.168.1.42 '), '192.168.1');
  assert.equal(parseSubnet('10.0.0.0/24'), '10.0.0');
  assert.equal(parseSubnet('172.20.3'), '172.20.3');
  assert.equal(parseSubnet('8.8.8'), null);
  assert.equal(parseSubnet('192.168'), null);
});
