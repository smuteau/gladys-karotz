// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`).
//
// Each handler receives the app context and the RESOLVED fields of the action
// (scene variables substituted, defaults applied), and returns the declared
// `outputs`. Throwing fails this action only: the scene logs it and goes on.
//
// Sleep, LED on/off and the ears are device features: a scene drives them with
// the standard "control a device" action. What is here are the operations a
// feature cannot express (a sentence, a sound, a LED effect in one step...).
// -----------------------------------------------------------------------------

import * as commands from './commands.js';

const optionalNumber = (value) =>
  value === undefined || value === null || value === '' ? undefined : Number(value);

export const SCENE_ACTIONS = {
  async speak(ctx, fields) {
    await commands.speak(ctx, ctx.findRabbit(fields.rabbit), fields.text, fields.voice);
  },

  async play_sound(ctx, fields) {
    await commands.playSound(ctx, ctx.findRabbit(fields.rabbit), fields.sound);
  },

  async stop_sound(ctx, fields) {
    await commands.stopSound(ctx, ctx.findRabbit(fields.rabbit));
  },

  async play_mood(ctx, fields) {
    const answer = await commands.playMood(
      ctx,
      ctx.findRabbit(fields.rabbit),
      optionalNumber(fields.mood),
    );
    return { mood: String(answer.moods ?? '') };
  },

  async say_time(ctx, fields) {
    await commands.sayTime(ctx, ctx.findRabbit(fields.rabbit));
  },

  async set_led(ctx, fields) {
    await commands.setLed(ctx, ctx.findRabbit(fields.rabbit), {
      color: fields.color,
      pulse: fields.pulse === true,
      speed: optionalNumber(fields.speed),
      color2: fields.color2 || undefined,
    });
  },

  async move_ears(ctx, fields) {
    const rabbit = ctx.findRabbit(fields.rabbit);
    if (fields.mode === 'random') {
      await commands.randomEars(ctx, rabbit);
    } else if (fields.mode === 'reset') {
      await commands.resetEars(ctx, rabbit);
    } else {
      await commands.moveEars(ctx, rabbit, {
        left: optionalNumber(fields.left),
        right: optionalNumber(fields.right),
      });
    }
  },

  // The picture itself goes to the rabbit's camera feature: the core's "send
  // camera image" scene action picks it up from there.
  async take_snapshot(ctx, fields) {
    const snapshot = await commands.takeSnapshot(ctx, ctx.findRabbit(fields.rabbit), {
      silent: fields.silent !== false,
    });
    return { filename: snapshot.filename };
  },
};
