// -----------------------------------------------------------------------------
// Scene triggers (manifest `scene_triggers`).
//
// Every trigger comes from a transition seen between two reads of a rabbit
// (see readRabbit in rabbits.js): one event per transition, never one per
// read. Nothing is fired for a change the integration made itself (a scene
// bound to it would loop): app.js only passes here the changes of the reading
// loop, never those following a command.
//
// Keys are forever: scenes store them.
//
// Not here, on purpose: "an RFID tag was presented". OpenKarotz handles a tag
// by calling a URL from the rabbit, and a sandboxed integration cannot be
// called from the LAN. See the Limits section of the documentation.
// -----------------------------------------------------------------------------

import { rabbitIds } from './devices.js';

export const TRIGGERS = {
  RABBIT_OFFLINE: 'rabbit_offline',
  RABBIT_ONLINE: 'rabbit_online',
  SLEEP_CHANGED: 'sleep_changed',
  RFID_TAG_ADDED: 'rfid_tag_added',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

export const SLEEP_STATES = { ASLEEP: 'asleep', AWAKE: 'awake' };

/**
 * The events of one read. `data` is flat and only carries the keys declared
 * in the manifest (`fields` + `variables`); `device` is the rabbit external
 * id, the value a `"source": "devices"` filter stores.
 * @returns {Array<{ key: string, data: Record<string, string> }>}
 */
export function buildSceneEvents(gladys, rabbit, changes) {
  if (rabbit.id === null) {
    return [];
  }
  const device = rabbitIds(gladys, rabbit).device;
  const events = [];
  if (changes.wentOffline) {
    events.push({ key: TRIGGERS.RABBIT_OFFLINE, data: { device, host: rabbit.host } });
  }
  if (changes.wentOnline) {
    events.push({ key: TRIGGERS.RABBIT_ONLINE, data: { device, host: rabbit.host } });
  }
  if (changes.sleepChanged) {
    events.push({
      key: TRIGGERS.SLEEP_CHANGED,
      data: {
        device,
        state: rabbit.status.sleeping ? SLEEP_STATES.ASLEEP : SLEEP_STATES.AWAKE,
      },
    });
  }
  for (const tag of changes.newTags) {
    events.push({
      key: TRIGGERS.RFID_TAG_ADDED,
      data: {
        device,
        tag_id: String(tag.id),
        tag_name: String(tag.name ?? ''),
        tag_color: String(tag.color_name ?? ''),
      },
    });
  }
  return events;
}
