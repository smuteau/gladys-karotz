// -----------------------------------------------------------------------------
// The integration end to end: a fake Gladys (SDK) in front of a fake Karotz.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { HOST, MAC, createFakeKarotz, createTestApp } from './helpers/fakeKarotz.js';

const RABBIT = `ext:test-integration:karotz:${MAC}`;
const CAMERA = `ext:test-integration:karotz-camera:${MAC}`;

const stateOf = (gladys, key) =>
  gladys.fake.states.findLast((s) => s.device_feature_external_id === `${RABBIT}:${key}`)?.state;

test('a reachable rabbit is discovered under its MAC address, with its camera', async () => {
  const { gladys } = await createTestApp();
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.external_id),
    [RABBIT, CAMERA],
  );
  const keys = devices[0].features.map((f) => f.external_id.split(':').pop());
  assert.ok(keys.includes('awake') && keys.includes('led-color') && keys.includes('ear-left'));
  // The stock OpenKarotz has no /cgi-bin/volume.
  assert.ok(!keys.includes('volume'));
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the volume feature appears on firmwares that have the endpoint', async () => {
  const { gladys } = await createTestApp({ karotz: createFakeKarotz({ hasVolume: true }) });
  const keys = gladys.fake.discoveredDevices[0].features.map((f) => f.external_id);
  assert.ok(keys.includes(`${RABBIT}:volume`));
});

test('the camera device is optional', async () => {
  const { gladys } = await createTestApp({ config: { camera: false } });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id),
    [RABBIT],
  );
});

test('states follow the status of the rabbit', async () => {
  const { gladys } = await createTestApp();
  assert.equal(stateOf(gladys, 'awake'), 1);
  assert.equal(stateOf(gladys, 'led'), 1);
  assert.equal(stateOf(gladys, 'led-color'), 0x00ff00);
  assert.equal(stateOf(gladys, 'storage-used'), 36);
  assert.equal(stateOf(gladys, 'rfid-tags'), 0);
  // No USB key: nothing published rather than a fake zero.
  assert.equal(stateOf(gladys, 'usb-used'), undefined);
});

test('an unreachable rabbit is reported, not discovered', async () => {
  const { gladys } = await createTestApp({ karotz: createFakeKarotz({ online: false }) });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('commands reach the rabbit and the confirmed state comes back', async () => {
  const { gladys, karotz } = await createTestApp();
  const device = { external_id: RABBIT };
  const set = (key, value) =>
    gladys.fake.setValue(device, { external_id: `${RABBIT}:${key}` }, value);

  assert.equal((await set('led-color', 0xff0000)).success, true);
  assert.equal(karotz.callsTo('leds').at(-1).params.color, 'FF0000');
  assert.equal(stateOf(gladys, 'led-color'), 0xff0000);

  // Off, then on again: back to the last color, not to black.
  await set('led', 0);
  assert.equal(karotz.ledColor, '000000');
  assert.equal(stateOf(gladys, 'led'), 0);
  await set('led', 1);
  assert.equal(karotz.ledColor, 'FF0000');

  await set('ear-left', 7);
  assert.deepEqual(karotz.callsTo('ears').at(-1).params, { left: '7', right: '0', noreset: '1' });
  assert.equal(stateOf(gladys, 'ear-left'), 7);

  await set('awake', 0);
  assert.equal(karotz.sleeping, true);
  assert.equal(stateOf(gladys, 'awake'), 0);
});

test('a command refused by a sleeping rabbit fails the acknowledgement', async () => {
  const { gladys } = await createTestApp({ karotz: createFakeKarotz({ sleeping: true }) });
  const ack = await gladys.fake.setValue(
    { external_id: RABBIT },
    { external_id: `${RABBIT}:led-color` },
    255,
  );
  assert.equal(ack.success, false);
});

test('the reading loop fires one scene event per transition', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  await ctx.readAll({ events: true });
  assert.deepEqual(gladys.fake.sceneEvents, [], 'nothing changed, nothing fired');

  karotz.sleeping = true;
  karotz.tags.push({ id: '0123ABCD', name: 'Keys', color_name: 'RED' });
  await ctx.readAll({ events: true });
  await ctx.readAll({ events: true });
  karotz.online = false;
  await ctx.readAll({ events: true });
  await ctx.readAll({ events: true });
  karotz.online = true;
  await ctx.readAll({ events: true });

  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [e.key, e.data]),
    [
      ['sleep_changed', { device: RABBIT, state: 'asleep' }],
      [
        'rfid_tag_added',
        { device: RABBIT, tag_id: '0123ABCD', tag_name: 'Keys', tag_color: 'RED' },
      ],
      ['rabbit_offline', { device: RABBIT, host: HOST }],
      ['rabbit_online', { device: RABBIT, host: HOST }],
    ],
  );
});

test('a change made by the integration itself fires no scene event', async () => {
  const { gladys, ctx } = await createTestApp();
  await gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:awake` }, 0);
  await ctx.readAll({ events: true });
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('scene actions drive the rabbit and return their outputs', async () => {
  const { gladys, karotz } = await createTestApp({ config: { tts_voice: '2' } });

  let ack = await gladys.fake.sceneAction('speak', { rabbit: RABBIT, text: 'Bonjour' });
  assert.equal(ack.success, true);
  assert.deepEqual(karotz.callsTo('tts')[0].params, { text: 'Bonjour', voice: '2', nocache: '0' });

  await gladys.fake.sceneAction('play_sound', { rabbit: RABBIT, sound: 'bip1' });
  await gladys.fake.sceneAction('play_sound', { rabbit: RABBIT, sound: 'http://radio.test/a.mp3' });
  assert.deepEqual(
    karotz.callsTo('sound').map((c) => c.params),
    [{ id: 'bip1' }, { url: 'http://radio.test/a.mp3' }],
  );

  ack = await gladys.fake.sceneAction('play_mood', { rabbit: RABBIT, mood: 12 });
  assert.deepEqual(ack.data.outputs, { mood: '12' });

  await gladys.fake.sceneAction('set_led', {
    rabbit: RABBIT,
    color: '#0000ff',
    pulse: true,
    speed: 500,
    color2: 'FF0000',
  });
  assert.deepEqual(karotz.callsTo('leds').at(-1).params, {
    color: '0000FF',
    pulse: '1',
    speed: '500',
    color2: 'FF0000',
  });

  await gladys.fake.sceneAction('move_ears', { rabbit: RABBIT, mode: 'random', left: 0, right: 0 });
  assert.equal(karotz.callsTo('ears_random').length, 1);

  ack = await gladys.fake.sceneAction('take_snapshot', { rabbit: RABBIT, silent: true });
  assert.deepEqual(ack.data.outputs, { filename: 'snapshot_1.jpg' });
  assert.equal(gladys.fake.cameraImages.length, 1);

  for (const key of ['stop_sound', 'say_time']) {
    assert.equal((await gladys.fake.sceneAction(key, { rabbit: RABBIT })).success, true, key);
  }
});

test('the camera device answers a fresh picture', async () => {
  const { gladys } = await createTestApp();
  const ack = await gladys.fake.getImage({ external_id: CAMERA });
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /image\/jpg;base64,\/9j/);
});

test('widgets render exactly as sent, awake, asleep and offline', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  const get = async (key) => {
    const ack = await gladys.fake.widgetGet(key, { settings: {}, language: 'fr' });
    assert.equal(ack.success, true);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], key);
    return ack.data.content;
  };

  const awake = await get('karotz');
  assert.equal(awake.components.filter((c) => c.type === 'button').length, 4);

  karotz.sleeping = true;
  await ctx.readAll();
  const asleep = await get('karotz');
  assert.deepEqual(
    asleep.components.filter((c) => c.type === 'button').map((c) => c.action.key),
    ['wake'],
  );

  karotz.online = false;
  await ctx.readAll();
  const offline = await get('karotz');
  assert.equal(offline.components.filter((c) => c.type === 'button').length, 0);
  await get('karotz_camera');
});

test('widget actions answer a toast, also when the rabbit refuses', async () => {
  const { gladys, karotz } = await createTestApp();
  const act = (widget, key, values) =>
    gladys.fake.widgetAction(widget, key, {}, { settings: {}, values });

  let ack = await act('karotz', 'speak', { text: 'Coucou' });
  assert.equal(ack.success, true);
  assert.equal(karotz.callsTo('tts')[0].params.text, 'Coucou');

  ack = await act('karotz_camera', 'snapshot');
  assert.equal(ack.success, true);
  const content = (await gladys.fake.widgetGet('karotz_camera', { settings: {}, language: 'en' }))
    .data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const image = content.components.find((c) => c.type === 'image');
  assert.equal((await gladys.fake.widgetGetImage(image.key)).success, true);

  await act('karotz', 'sleep');
  ack = await act('karotz', 'mood');
  assert.equal(ack.success, true, 'a sleeping rabbit is a message, not a failure');
});

test('configuration buttons succeed (green) when the operation worked', async () => {
  const { gladys, karotz } = await createTestApp();

  let ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /OpenKarotz 2\.0\.5/);

  ack = await gladys.fake.action('find_rabbits', { subnet: '192.168.1' });
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /192\.168\.1\.70 \(OpenKarotz 2\.0\.5\)/);

  // Nothing typed: the network of the configured rabbit is searched.
  ack = await gladys.fake.action('find_rabbits', {});
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /192\.168\.1\.70 \(OpenKarotz 2\.0\.5\)/);

  ack = await gladys.fake.action('identify', { rabbit: RABBIT });
  assert.equal(ack.success, true);
  // Blue pulse, then back to the previous LED.
  const leds = karotz.callsTo('leds').map((c) => c.params.color);
  assert.deepEqual(leds, ['0000FF', '00FF00']);

  ack = await gladys.fake.action('reboot', { rabbit: RABBIT });
  assert.equal(ack.success, true);
  assert.equal(karotz.callsTo('reboot').length, 1);
});

test('configuration buttons fail (red) with a message in both languages', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  const failure = async (key, fields, pattern) => {
    const ack = await gladys.fake.action(key, fields);
    assert.equal(ack.success, false, `${key} must fail`);
    assert.match(ack.error, pattern, key);
    assert.match(ack.error, / \/ /, 'French and English in one message');
  };

  // Public ranges are never scanned, and an empty network is a failure.
  await failure('find_rabbits', { subnet: '8.8.8' }, /192\.168\.1/);
  await failure('find_rabbits', { subnet: '10.9.9' }, /No rabbit answered/);

  // A sleeping rabbit refuses the LED: identify fails.
  karotz.sleeping = true;
  await failure('identify', { rabbit: RABBIT }, /Le lapin dort/);
  karotz.sleeping = false;

  karotz.online = false;
  await failure('test_connection', {}, /pas de réponse/);
  await failure('reboot', { rabbit: RABBIT }, /The rabbit does not answer/);

  ctx.rabbits = [];
  await failure('test_connection', {}, /Enter the address/);
});
