// -----------------------------------------------------------------------------
// The integration end to end: a fake Gladys (SDK) in front of a fake Karotz.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { HOST, MAC, createFakeKarotz, createTestApp, snapshotName } from './helpers/fakeKarotz.js';

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

test('turning the LED back on restores its mode as well as its color', async () => {
  const karotz = createFakeKarotz({ ledColor: '21FF37', ledPulse: '1' });
  const { gladys } = await createTestApp({ karotz });
  const set = (key, value) =>
    gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:${key}` }, value);

  await set('led', 0);
  assert.equal(karotz.ledColor, '000000');
  await set('led', 1);
  assert.deepEqual(
    [karotz.ledColor, karotz.ledPulse],
    ['21FF37', '1'],
    'a pulsing LED pulses again',
  );

  await set('led-pulse', 0);
  await set('led', 0);
  await set('led', 1);
  assert.deepEqual(
    [karotz.ledColor, karotz.ledPulse],
    ['21FF37', '0'],
    'a steady one stays steady',
  );
});

test('the ears and the last LED are remembered across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'karotz-memory-'));
  const memoryFile = join(dir, 'memory.json');
  try {
    const karotz = createFakeKarotz({ ledColor: '21FF37', ledPulse: '1' });
    const first = await createTestApp({ karotz, options: { memoryFile } });
    await first.gladys.fake.setValue(
      { external_id: RABBIT },
      { external_id: `${RABBIT}:ear-left` },
      3,
    );
    await first.gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:led` }, 0);
    first.app.stopLoop();
    assert.deepEqual(JSON.parse(await readFile(memoryFile, 'utf8')).rabbits[MAC], {
      ears: { left: 3, right: 0 },
      led: { color: '21FF37', pulse: true },
    });

    // A new process: the rabbit still cannot tell where its ears are.
    const second = await createTestApp({ karotz, options: { memoryFile } });
    assert.equal(stateOf(second.gladys, 'ear-left'), 3);
    assert.equal(stateOf(second.gladys, 'ear-right'), 0);
    await second.gladys.fake.setValue(
      { external_id: RABBIT },
      { external_id: `${RABBIT}:ear-right` },
      12,
    );
    // The left ear stays where it was, instead of going back to 0.
    assert.deepEqual(karotz.callsTo('ears').at(-1).params, {
      left: '3',
      right: '12',
      noreset: '1',
    });
    await second.gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:led` }, 1);
    assert.deepEqual([karotz.ledColor, karotz.ledPulse], ['21FF37', '1']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a rabbit that misses one read is not declared unreachable', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  karotz.dropNext = 1;
  await ctx.readAll({ events: true });
  assert.equal(ctx.rabbits[0].online, true);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a failed synthesis says so, even for a sentence the rabbit cached', async () => {
  const karotz = createFakeKarotz({ speechService: false });
  const { gladys } = await createTestApp({ karotz });
  const speak = () =>
    gladys.fake.widgetAction('karotz', 'speak', {}, { settings: {}, values: { text: 'Bonjour' } });

  const first = JSON.stringify(await speak());
  assert.match(first, /sa propre synthèse vocale n'a pas répondu/);
  // The way to the voice of Gladys, not to the web page of the rabbit.
  assert.match(first, /Parler sur une enceinte/);
  assert.doesNotMatch(first, /page web|Internet/);
  // The second time Free Rabbits OS answers from its cache, in silence.
  assert.match(JSON.stringify(await speak()), /sa propre synthèse vocale n'a pas répondu/);
  assert.deepEqual(
    karotz.callsTo('tts').map((call) => call.params.nocache),
    ['0', '0', '1'],
  );
});

test('waking up from the widget: the card says so until the rabbit is done', async () => {
  const karotz = createFakeKarotz({ sleeping: true, delays: { wakeup: 200 } });
  const { gladys, ctx } = await createTestApp({ karotz, options: { quickAnswerMs: 20 } });
  const card = async () => {
    const ack = await gladys.fake.widgetGet('karotz', { settings: {}, language: 'fr' });
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
    return ack.data.content;
  };
  const buttons = (content) =>
    content.components.filter((c) => c.type === 'button').map((c) => c.action.key);

  const started = Date.now();
  const ack = await gladys.fake.widgetAction('karotz', 'wake', {}, { settings: {}, values: {} });
  assert.equal(ack.success, true);
  assert.ok(Date.now() - started < 150, 'the action does not wait for the rabbit');
  // No toast, which would vanish first: the card carries the message.
  assert.doesNotMatch(JSON.stringify(ack.data ?? {}), /réveille/);
  const waking = await card();
  assert.match(JSON.stringify(waking), /Le lapin se réveille/);
  assert.deepEqual(buttons(waking), [], 'no button while the rabbit wakes up');
  assert.equal(waking.ttl_seconds, 10, 'asked again soon, even without a nudge');

  // The reading loop leaves a waking rabbit alone.
  const reads = karotz.callsTo('status').length;
  await ctx.readAll({ events: true });
  assert.equal(karotz.callsTo('status').length, reads);

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(ctx.rabbits[0].status.sleeping, false);
  assert.equal(buttons(await card())[0], 'sleep', 'Sleep comes first once awake');
});

test('falling asleep from the widget: "Good night" stays until Wake up is there', async () => {
  const karotz = createFakeKarotz({ delays: { sleep: 200 } });
  const { gladys } = await createTestApp({ karotz, options: { quickAnswerMs: 20 } });
  const card = async () =>
    (await gladys.fake.widgetGet('karotz', { settings: {}, language: 'fr' })).data.content;
  await gladys.fake.widgetAction('karotz', 'sleep', {}, { settings: {}, values: {} });
  assert.match(JSON.stringify(await card()), /Bonne nuit, lapin/);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const asleep = await card();
  assert.doesNotMatch(JSON.stringify(asleep), /Bonne nuit/);
  assert.equal(asleep.components.find((c) => c.type === 'button').action.key, 'wake');
});

test('the LED pulse switch keeps the mode while the LED is off', async () => {
  const karotz = createFakeKarotz({ ledColor: '21FF37', ledPulse: '1' });
  const { gladys } = await createTestApp({ karotz });
  const set = (key, value) =>
    gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:${key}` }, value);

  await set('led', 0);
  assert.equal(stateOf(gladys, 'led'), 0);
  assert.equal(stateOf(gladys, 'led-pulse'), 1, 'the switch does not drop to off with the LED');

  // Changed while off: remembered, and the LED stays off.
  const leds = karotz.callsTo('leds').length;
  await set('led-pulse', 0);
  assert.equal(karotz.callsTo('leds').length, leds);
  assert.equal(karotz.ledColor, '000000');
  assert.equal(stateOf(gladys, 'led-pulse'), 0);
  await set('led', 1);
  assert.deepEqual([karotz.ledColor, karotz.ledPulse], ['21FF37', '0']);
});

test('the ears go back where they were when the rabbit wakes up', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  const set = (key, value) =>
    gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:${key}` }, value);
  const lastEars = () => karotz.callsTo('ears').at(-1)?.params;

  await set('ear-left', 5);
  await set('ear-right', 9);
  await set('awake', 0);
  const before = karotz.callsTo('ears').length;
  await set('awake', 1);
  assert.equal(karotz.callsTo('ears').length, before + 1);
  assert.deepEqual(lastEars(), { left: '5', right: '9', noreset: '1' });

  // Woken by its own schedule or button: the reading loop puts them back.
  karotz.sleeping = true;
  await ctx.readAll({ events: true });
  karotz.sleeping = false;
  await ctx.readAll({ events: true });
  assert.equal(karotz.callsTo('ears').length, before + 2);
  assert.deepEqual(lastEars(), { left: '5', right: '9', noreset: '1' });

  // Ears at 0 are where waking up leaves them: nothing to send.
  await set('ears-reset', 1);
  const afterReset = karotz.callsTo('ears').length;
  await set('awake', 0);
  await set('awake', 1);
  assert.equal(karotz.callsTo('ears').length, afterReset);
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
  assert.deepEqual(ack.data.outputs, { filename: snapshotName(1) });
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

  // The rabbit answers with a sound: no "Done" on top of it.
  for (const key of ['mood', 'time']) {
    ack = await act('karotz', key);
    assert.equal(ack.success, true);
    assert.doesNotMatch(JSON.stringify(ack.data ?? {}), /fait|Done/);
  }

  await act('karotz', 'sleep');
  ack = await act('karotz', 'mood');
  assert.equal(ack.success, true, 'a sleeping rabbit is a message, not a failure');
});

test('the photos widget walks through the pictures stored on the rabbit', async () => {
  const karotz = createFakeKarotz({ photos: [1, 2, 3].map(snapshotName), snapshots: 3 });
  const { gladys } = await createTestApp({ karotz });
  const get = async () =>
    (await gladys.fake.widgetGet('karotz_camera', { settings: {}, language: 'fr' })).data.content;
  const act = (key) =>
    gladys.fake.widgetAction('karotz_camera', key, {}, { settings: {}, values: {} });
  const buttons = (content) =>
    content.components.filter((c) => c.type === 'button').map((c) => c.action.key);
  const caption = (content) => content.components.find((c) => c.variant === 'caption').text;

  // The newest first, the whole picture.
  let content = await get();
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(caption(content), /^3\/3 · 21\/11\/2026\s17:00:03$/u);
  assert.equal(content.components.find((c) => c.type === 'image').fit, 'contain');
  assert.deepEqual(buttons(content), ['snapshot', 'photo_previous', 'clear_snapshots']);

  // Back one: no toast, the card changes.
  const ack = await act('photo_previous');
  assert.equal(ack.success, true);
  assert.equal(ack.data?.message ?? null, null);
  content = await get();
  assert.match(caption(content), /^2\/3 /);
  assert.deepEqual(buttons(content), [
    'snapshot',
    'photo_previous',
    'photo_next',
    'clear_snapshots',
  ]);

  // The image key names that picture; it is fetched once from the rabbit.
  const key = content.components.find((c) => c.type === 'image').key;
  assert.equal(key, `photo-${MAC}-20261121170002`);
  assert.equal((await gladys.fake.widgetGetImage(key)).success, true);
  assert.equal((await gladys.fake.widgetGetImage(key)).success, true);
  assert.deepEqual(
    karotz.callsTo('snapshot_get').map((c) => c.params.filename),
    [snapshotName(2)],
  );
  // A key it never declared reaches no rabbit.
  assert.equal((await gladys.fake.widgetGetImage(`photo-${MAC}-20991231235959`)).success, false);

  // A new picture is shown at once, without asking the rabbit for it again.
  await act('snapshot');
  content = await get();
  assert.match(caption(content), /^4\/4 /);
  await gladys.fake.widgetGetImage(content.components.find((c) => c.type === 'image').key);
  assert.equal(karotz.callsTo('snapshot_get').length, 2, 'only the one snapshot fetches');

  await act('clear_snapshots');
  content = await get();
  assert.deepEqual(buttons(content), ['snapshot']);
});

test('an https:// sound is refused on OpenKarotz, played on LapinLibre', async () => {
  const https = 'https://icecast.radiofrance.fr/fip-midfi.mp3';
  const openKarotz = await createTestApp();
  const refused = await openKarotz.gladys.fake.sceneAction('play_sound', { sound: https });
  assert.equal(refused.success, false);
  assert.equal(openKarotz.karotz.callsTo('sound').length, 0, 'nothing reaches the rabbit');
  await openKarotz.gladys.fake.sceneAction('play_sound', { sound: https.replace('https', 'http') });
  assert.equal(
    openKarotz.karotz.callsTo('sound').at(-1).params.url,
    https.replace('https', 'http'),
  );

  const lapinLibre = await createTestApp({ karotz: createFakeKarotz({ system: 'lapinlibre' }) });
  const played = await lapinLibre.gladys.fake.sceneAction('play_sound', { sound: https });
  assert.equal(played.success, true);
  assert.equal(lapinLibre.karotz.callsTo('sound').at(-1).params.url, https);
});

test('Gladys can speak through the rabbit with its own voice', async () => {
  const notify = (app, url) =>
    app.gladys.fake.setValue(
      { external_id: RABBIT },
      { external_id: `${RABBIT}:play-notification` },
      url,
    );
  const local = 'http://192.168.1.10:80/api/v1/tts/audio/3f9a2c.mp3';
  const gladysPlus = 'https://api.gladysgateway.com/tts/ac365e90/generate.mp3';

  const openKarotz = await createTestApp();
  const feature = openKarotz.gladys.fake.discoveredDevices[0].features.find((f) =>
    f.external_id.endsWith(':play-notification'),
  );
  assert.deepEqual([feature.category, feature.type], ['music', 'play_notification']);

  // A voice integration: Gladys serves the clip in http on the LAN.
  assert.equal((await notify(openKarotz, local)).success, true);
  assert.equal(openKarotz.karotz.callsTo('sound').at(-1).params.url, local);
  // Gladys Plus: https, which OpenKarotz cannot play.
  assert.equal((await notify(openKarotz, gladysPlus)).success, false);
  assert.equal((await notify(openKarotz, 'not a url')).success, false);
  assert.equal(openKarotz.karotz.callsTo('sound').length, 1);

  const lapinLibre = await createTestApp({ karotz: createFakeKarotz({ system: 'lapinlibre' }) });
  assert.equal((await notify(lapinLibre, gladysPlus)).success, true);
  assert.equal(lapinLibre.karotz.callsTo('sound').at(-1).params.url, gladysPlus);
});

test('the ears have push buttons: at random, and back to 0', async () => {
  const { gladys, karotz } = await createTestApp();
  const keys = gladys.fake.discoveredDevices[0].features.map((f) => f.external_id.split(':').pop());
  assert.ok(keys.includes('ears-random') && keys.includes('ears-reset'));
  const push = (key) =>
    gladys.fake.setValue({ external_id: RABBIT }, { external_id: `${RABBIT}:${key}` }, 1);

  await push('ears-random');
  assert.equal(karotz.callsTo('ears_random').length, 1);
  assert.equal(stateOf(gladys, 'ear-left'), 3);
  assert.equal(stateOf(gladys, 'ear-right'), 11);
  await push('ears-reset');
  assert.equal(karotz.callsTo('ears_reset').length, 1);
  assert.equal(stateOf(gladys, 'ear-left'), 0);
  assert.equal(stateOf(gladys, 'ear-right'), 0);
});

test('the version comes from get_version, with the version of the system', async () => {
  const { gladys } = await createTestApp();
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(
    device.params.find((p) => p.name === 'FIRMWARE_VERSION').value,
    'OpenKarotz 2.0.5 (2.0.r8)',
  );
});

test('a LapinLibre or Terrier OS rabbit behind its web password is driven the same way', async () => {
  const karotz = createFakeKarotz({ system: 'lapinlibre', password: 'carrot-2026' });
  const { gladys } = await createTestApp({
    karotz,
    config: { web_password: 'other-rabbit carrot-2026' },
  });
  const [device] = gladys.fake.discoveredDevices;
  // Same MAC, so the same device as under OpenKarotz.
  assert.equal(device.external_id, RABBIT);
  assert.deepEqual(
    device.params.find((p) => p.name === 'FIRMWARE_VERSION'),
    {
      name: 'FIRMWARE_VERSION',
      value: 'LapinLibre 4f2c1a0 (0.2.0)',
    },
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);

  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(JSON.stringify(ack.data), /LapinLibre 4f2c1a0 \(0\.2\.0\), awake/);

  // Its own refusals reach the user translated.
  karotz.speechServer = false;
  const spoken = await gladys.fake.sceneAction('speak', { text: 'Bonjour' });
  assert.equal(spoken.success, false);
  const toast = await gladys.fake.widgetAction(
    'karotz',
    'speak',
    {},
    { settings: {}, values: { text: 'Bonjour' } },
  );
  assert.match(JSON.stringify(toast), /serveur de synthèse vocale/);
});

test('a rabbit that refuses the web password is reported as such', async () => {
  const karotz = createFakeKarotz({ system: 'lapinlibre', password: 'carrot-2026' });
  const { gladys } = await createTestApp({ karotz, config: { web_password: 'wrong-pass' } });
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(JSON.stringify(gladys.fake.connectionStatus), /web password/);

  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error.fr, /mot de passe web refusé/);
  assert.doesNotMatch(JSON.stringify(ack.error), /wrong-pass|carrot-2026/);
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

test('configuration buttons fail (red) with a message in the language of the user', async () => {
  const { gladys, ctx, karotz } = await createTestApp();
  const failure = async (key, fields, pattern) => {
    const ack = await gladys.fake.action(key, fields);
    assert.equal(ack.success, false, `${key} must fail`);
    // The error is a multi-language object: Gladys shows the user's language.
    assert.deepEqual(Object.keys(ack.error).sort(), ['de', 'en', 'es', 'fr'], key);
    assert.match(`${ack.error.en} ${ack.error.fr}`, pattern, key);
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
