// -----------------------------------------------------------------------------
// The Gladys devices of a rabbit, and their states.
//
// Each rabbit is published as:
//   - one `karotz` device: sleep, LED, ears, volume (when the firmware has
//     it), storage and RFID tag count;
//   - one `karotz-camera` device (optional): the webcam in its belly.
//
// Feature keys are forever (they are part of the external ids): never rename
// one, Gladys would create a new feature and orphan its history.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { EAR_MAX, EAR_MIN } from './karotz/client.js';
import { LED_OFF, rabbitName } from './rabbits.js';

export const DEVICE_TYPES = { RABBIT: 'karotz', CAMERA: 'karotz-camera' };

export const FEATURES = {
  AWAKE: 'awake',
  LED: 'led',
  LED_COLOR: 'led-color',
  LED_PULSE: 'led-pulse',
  EAR_LEFT: 'ear-left',
  EAR_RIGHT: 'ear-right',
  VOLUME: 'volume',
  STORAGE_USED: 'storage-used',
  USB_USED: 'usb-used',
  RFID_TAGS: 'rfid-tags',
  IMAGE: 'image',
};

export function rabbitIds(gladys, rabbit) {
  return gladys.externalIds(DEVICE_TYPES.RABBIT, rabbit.id);
}

export function cameraIds(gladys, rabbit) {
  return gladys.externalIds(DEVICE_TYPES.CAMERA, rabbit.id);
}

const command = (name, externalId, category, type, extra = {}) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: false,
  // The status is read back after every command: see app.js.
  has_feedback: true,
  keep_history: false,
  min: 0,
  max: 1,
  ...extra,
});

const sensor = (name, externalId, category, type, extra = {}) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 100,
  ...extra,
});

/**
 * Discovery payload of the rabbits that answered at least once (the others
 * have no identifier yet).
 */
export function buildDevices(gladys, rabbits, config) {
  const known = rabbits.filter((rabbit) => rabbit.id !== null);
  const devices = [];
  for (const rabbit of known) {
    const name = rabbitName(rabbit, rabbits.length);
    const ids = rabbitIds(gladys, rabbit);
    const { SWITCH, LIGHT, DATA, COUNTER_SENSOR } = DEVICE_FEATURE_CATEGORIES;
    const features = [
      command('Awake', ids.feature(FEATURES.AWAKE), SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY),
      command('LED', ids.feature(FEATURES.LED), LIGHT, DEVICE_FEATURE_TYPES.LIGHT.BINARY),
      command(
        'LED color',
        ids.feature(FEATURES.LED_COLOR),
        LIGHT,
        DEVICE_FEATURE_TYPES.LIGHT.COLOR,
        {
          max: 0xffffff,
        },
      ),
      command(
        'LED pulse',
        ids.feature(FEATURES.LED_PULSE),
        SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      ),
      // The rabbit does not report its ears: no feedback, the last order wins.
      command(
        'Left ear',
        ids.feature(FEATURES.EAR_LEFT),
        SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
        {
          min: EAR_MIN,
          max: EAR_MAX,
          has_feedback: false,
        },
      ),
      command(
        'Right ear',
        ids.feature(FEATURES.EAR_RIGHT),
        SWITCH,
        DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
        { min: EAR_MIN, max: EAR_MAX, has_feedback: false },
      ),
    ];
    if (rabbit.hasVolume) {
      features.push(
        command(
          'Volume',
          ids.feature(FEATURES.VOLUME),
          SWITCH,
          DEVICE_FEATURE_TYPES.SWITCH.DIMMER,
          {
            max: 100,
            unit: DEVICE_FEATURE_UNITS.PERCENT,
            has_feedback: false,
          },
        ),
      );
    }
    features.push(
      sensor(
        'Storage used',
        ids.feature(FEATURES.STORAGE_USED),
        DATA,
        DEVICE_FEATURE_TYPES.DATA.SIZE,
        {
          unit: DEVICE_FEATURE_UNITS.PERCENT,
        },
      ),
      sensor('USB key used', ids.feature(FEATURES.USB_USED), DATA, DEVICE_FEATURE_TYPES.DATA.SIZE, {
        unit: DEVICE_FEATURE_UNITS.PERCENT,
      }),
      sensor(
        'RFID tags',
        ids.feature(FEATURES.RFID_TAGS),
        COUNTER_SENSOR,
        DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
        { max: 1000 },
      ),
    );
    devices.push({
      name,
      external_id: ids.device,
      // Shown in the device page, and enough to find the rabbit again.
      params: [
        { name: 'HOST', value: rabbit.host },
        ...(rabbit.status?.version
          ? [{ name: 'FIRMWARE_VERSION', value: rabbit.status.version }]
          : []),
      ],
      features,
    });

    if (config.camera) {
      const camera = cameraIds(gladys, rabbit);
      devices.push({
        name: `${name} camera`,
        external_id: camera.device,
        features: [
          {
            name: 'Image',
            external_id: camera.feature(FEATURES.IMAGE),
            category: DEVICE_FEATURE_CATEGORIES.CAMERA,
            type: DEVICE_FEATURE_TYPES.CAMERA.IMAGE,
            read_only: true,
            has_feedback: false,
            keep_history: false,
            min: 0,
            max: 0,
          },
        ],
      });
    }
  }
  return devices;
}

/**
 * The states of one rabbit, from its last status. Sent through
 * `publishChangedStates`: only what moved reaches Gladys.
 */
export function buildStates(gladys, rabbit) {
  const { status } = rabbit;
  if (rabbit.id === null || status === null) {
    return [];
  }
  const ids = rabbitIds(gladys, rabbit);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  // A sleeping rabbit keeps its color in memory but its LED is physically off.
  const ledOn = !status.sleeping && status.ledColor !== LED_OFF;
  const states = [
    state(FEATURES.AWAKE, status.sleeping ? 0 : 1),
    state(FEATURES.LED, ledOn ? 1 : 0),
    state(FEATURES.LED_PULSE, status.ledPulse ? 1 : 0),
  ];
  if (status.ledColor !== LED_OFF) {
    states.push(state(FEATURES.LED_COLOR, Number.parseInt(status.ledColor, 16)));
  }
  const optional = [
    [FEATURES.STORAGE_USED, status.storagePercent],
    [FEATURES.USB_USED, status.usbPercent],
    [FEATURES.RFID_TAGS, status.tagCount],
    [FEATURES.EAR_LEFT, rabbit.ears.left],
    [FEATURES.EAR_RIGHT, rabbit.ears.right],
    [FEATURES.VOLUME, rabbit.hasVolume ? rabbit.volume : null],
  ];
  for (const [key, value] of optional) {
    if (value !== null && value !== undefined) {
      states.push(state(key, value));
    }
  }
  return states;
}

/** Which rabbit owns this device (rabbit or camera) external id? */
export function findRabbitByDevice(gladys, rabbits, externalId) {
  return rabbits.find(
    (rabbit) =>
      rabbit.id !== null &&
      (rabbitIds(gladys, rabbit).device === externalId ||
        cameraIds(gladys, rabbit).device === externalId),
  );
}

/** `ext:<selector>:karotz:<mac>:led-color` -> `led-color`. */
export function featureKey(gladys, rabbit, featureExternalId) {
  const ids = rabbitIds(gladys, rabbit);
  return Object.values(FEATURES).find((key) => ids.feature(key) === featureExternalId) ?? null;
}
