// -----------------------------------------------------------------------------
// What can be asked of a rabbit.
//
// Written once, reached from four surfaces: the device features (onSetValue),
// the scene actions, the dashboard widgets and the Configuration buttons.
// Every function takes the app context (`ctx`, see app.js) and a rabbit, and
// throws a KarotzError when the rabbit refuses or does not answer.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { ERROR_KINDS, KarotzError } from './karotz/client.js';
import { cameraIds } from './devices.js';
import { LED_OFF } from './rabbits.js';

// Gladys refuses a camera image over 150 KB, a widget image over 300 KB.
const CAMERA_IMAGE_MAX_BYTES = 150 * 1024;
const WIDGET_IMAGE_MAX_BYTES = 300 * 1024;

const IDENTIFY_COLOR = '0000FF';
const IDENTIFY_DURATION_MS = 5000;

export async function wake(ctx, rabbit, { silent = true } = {}) {
  await rabbit.client.wakeup({ silent });
  await ctx.refresh(rabbit);
}

export async function sleep(ctx, rabbit) {
  await rabbit.client.sleep();
  await ctx.refresh(rabbit);
}

/**
 * Set the LED. Every omitted value keeps what the rabbit currently shows.
 * @param {{ color?: string|number, pulse?: boolean, speed?: number, color2?: string|number }} led
 */
export async function setLed(ctx, rabbit, led = {}) {
  const current = rabbit.status;
  await rabbit.client.leds({
    color: led.color ?? current?.ledColor ?? rabbit.lastLedColor,
    pulse: led.pulse ?? current?.ledPulse ?? false,
    speed: led.speed,
    color2: led.color2,
  });
  await ctx.refresh(rabbit);
}

export async function switchLed(ctx, rabbit, on) {
  if (on) {
    // Back to the last color that was not "off".
    await setLed(ctx, rabbit, { color: rabbit.lastLedColor });
  } else {
    await setLed(ctx, rabbit, { color: LED_OFF, pulse: false });
  }
}

export async function moveEars(ctx, rabbit, { left, right }) {
  const target = {
    left: left ?? rabbit.ears.left ?? 0,
    right: right ?? rabbit.ears.right ?? 0,
  };
  await rabbit.client.ears(target.left, target.right);
  rabbit.ears = target;
  await ctx.publishStates(rabbit);
}

export async function resetEars(ctx, rabbit) {
  await rabbit.client.earsReset();
  rabbit.ears = { left: 0, right: 0 };
  await ctx.publishStates(rabbit);
}

export async function randomEars(ctx, rabbit) {
  const answer = await rabbit.client.earsRandom();
  const left = Number.parseInt(answer.left, 10);
  const right = Number.parseInt(answer.right, 10);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    rabbit.ears = { left, right };
    await ctx.publishStates(rabbit);
  }
}

export async function setVolume(ctx, rabbit, level) {
  await rabbit.client.volume(level);
  rabbit.volume = Math.min(100, Math.max(0, Math.round(level)));
  await ctx.publishStates(rabbit);
}

export function speak(ctx, rabbit, text, voice) {
  const sentence = String(text ?? '').trim();
  if (!sentence) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'Nothing to say');
  }
  return rabbit.client.tts(sentence, { voice: voice || ctx.config.tts_voice || undefined });
}

/** A sound of the rabbit by its id, or any http(s) stream / MP3 by its URL. */
export function playSound(ctx, rabbit, sound) {
  const value = String(sound ?? '').trim();
  if (!value) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'No sound to play');
  }
  return /^https?:\/\//i.test(value)
    ? rabbit.client.playUrl(value)
    : rabbit.client.playSound(value);
}

export const stopSound = (ctx, rabbit) => rabbit.client.soundControl('quit');
export const playMood = (ctx, rabbit, id) => rabbit.client.mood(id);
export const sayTime = (ctx, rabbit) => rabbit.client.clock();
export const reboot = (ctx, rabbit) => rabbit.client.reboot();

/**
 * Take a picture and bring it back. The rabbit keeps every snapshot on its
 * small storage and has no "delete one" endpoint: see clearSnapshots.
 * @returns {Promise<{ filename: string, key: string, base64: string, bytes: number }>}
 */
export async function takeSnapshot(ctx, rabbit, { silent = true } = {}) {
  const filename = await rabbit.client.snapshot({ silent });
  const jpeg = await rabbit.client.snapshotGet(filename);
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'The rabbit did not return a JPEG picture');
  }
  const base64 = jpeg.toString('base64');
  // The core caches a widget image by key: new bytes, new key.
  const hash = createHash('sha1').update(jpeg).digest('hex').slice(0, 12);
  const snapshot = {
    filename,
    key: `snap-${rabbit.id}-${hash}`.toLowerCase().slice(0, 64),
    base64,
    bytes: jpeg.length,
    takenAt: new Date(),
  };
  if (jpeg.length <= WIDGET_IMAGE_MAX_BYTES) {
    rabbit.lastSnapshot = snapshot;
  }
  if (ctx.config.camera && jpeg.length <= CAMERA_IMAGE_MAX_BYTES) {
    await ctx.gladys
      .publishCameraImage(cameraIds(ctx.gladys, rabbit).device, `image/jpg;base64,${base64}`)
      .catch((err) => ctx.logger.warn(`publishCameraImage failed: ${err.message}`));
  }
  return snapshot;
}

/** The `image/jpg;base64,...` string Gladys expects from a camera. */
export async function captureCameraImage(ctx, rabbit) {
  const snapshot = await takeSnapshot(ctx, rabbit);
  if (snapshot.bytes > CAMERA_IMAGE_MAX_BYTES) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'The picture is over the 150 KB Gladys accepts');
  }
  return `image/jpg;base64,${snapshot.base64}`;
}

export async function clearSnapshots(ctx, rabbit) {
  await rabbit.client.clearSnapshots();
  rabbit.lastSnapshot = null;
}

/**
 * Make the rabbit signal itself: blue pulsing LED and moving ears for a few
 * seconds, then back to its previous LED.
 */
export async function identify(ctx, rabbit) {
  const before = rabbit.status
    ? { color: rabbit.status.ledColor, pulse: rabbit.status.ledPulse }
    : { color: rabbit.lastLedColor, pulse: false };
  await rabbit.client.leds({ color: IDENTIFY_COLOR, pulse: true, speed: 300 });
  await rabbit.client.earsRandom().catch(() => {});
  await ctx.sleepMs(IDENTIFY_DURATION_MS);
  await rabbit.client.leds(before);
  await rabbit.client.earsReset().catch(() => {});
}

/** Bilingual, user-facing reading of a failure (toasts, action messages). */
export function describeError(err) {
  switch (err?.kind) {
    case ERROR_KINDS.SLEEPING:
      return {
        en: 'The rabbit is sleeping: wake it up first.',
        fr: "Le lapin dort : réveillez-le d'abord.",
        de: 'Der Hase schläft: Wecken Sie ihn zuerst auf.',
        es: 'El conejo duerme: despiértelo primero.',
      };
    case ERROR_KINDS.EARS_DISABLED:
      return {
        en: 'The ears are disabled in the rabbit settings.',
        fr: 'Les oreilles sont désactivées dans les réglages du lapin.',
        de: 'Die Ohren sind in den Einstellungen des Hasen deaktiviert.',
        es: 'Las orejas están desactivadas en los ajustes del conejo.',
      };
    case ERROR_KINDS.UNREACHABLE:
      return {
        en: 'The rabbit does not answer.',
        fr: 'Le lapin ne répond pas.',
        de: 'Der Hase antwortet nicht.',
        es: 'El conejo no responde.',
      };
    case ERROR_KINDS.AUTH:
      return {
        en: 'The rabbit refused the web password: check it in the configuration.',
        fr: 'Le lapin a refusé le mot de passe web : vérifiez-le dans la configuration.',
        de: 'Der Hase hat das Web-Passwort abgelehnt: Prüfen Sie es in der Konfiguration.',
        es: 'El conejo ha rechazado la contraseña web: compruébela en la configuración.',
      };
    case ERROR_KINDS.BUSY:
      return {
        en: 'The rabbit is busy: try again in a moment.',
        fr: 'Le lapin est occupé : réessayez dans un instant.',
        de: 'Der Hase ist beschäftigt: Versuchen Sie es gleich noch einmal.',
        es: 'El conejo está ocupado: inténtelo de nuevo en un momento.',
      };
    case ERROR_KINDS.NO_SPEECH:
      return {
        en: 'The rabbit has no speech server: set TTS_SERVER in its lapinlibre.txt.',
        fr: "Le lapin n'a pas de serveur de synthèse vocale : réglez TTS_SERVER dans son lapinlibre.txt.",
        de: 'Der Hase hat keinen Sprachserver: Setzen Sie TTS_SERVER in seiner lapinlibre.txt.',
        es: 'El conejo no tiene servidor de voz: configure TTS_SERVER en su lapinlibre.txt.',
      };
    case ERROR_KINDS.NOT_SUPPORTED:
      return {
        en: 'This firmware does not support that command.',
        fr: 'Ce firmware ne prend pas en charge cette commande.',
        de: 'Diese Firmware unterstützt diesen Befehl nicht.',
        es: 'Este firmware no admite esta orden.',
      };
    default: {
      const detail = String(err?.message ?? 'unknown error').slice(0, 120);
      return {
        en: `The rabbit refused: ${detail}`,
        fr: `Le lapin a refusé : ${detail}`,
        de: `Der Hase hat abgelehnt: ${detail}`,
        es: `El conejo se ha negado: ${detail}`,
      };
    }
  }
}
