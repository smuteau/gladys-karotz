// -----------------------------------------------------------------------------
// What can be asked of a rabbit.
//
// Written once, reached from four surfaces: the device features (onSetValue),
// the scene actions, the dashboard widgets and the Configuration buttons.
// Every function takes the app context (`ctx`, see app.js) and a rabbit, and
// throws a KarotzError when the rabbit refuses or does not answer.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, KarotzError } from './karotz/client.js';
import { cameraIds } from './devices.js';
import { forgetPhotos, isPhotoName, rememberPhoto } from './photos.js';
import { LED_OFF, SYSTEMS } from './rabbits.js';

// Gladys refuses a camera image over 150 KB, a widget image over 300 KB.
const CAMERA_IMAGE_MAX_BYTES = 150 * 1024;
const WIDGET_IMAGE_MAX_BYTES = 300 * 1024;

const IDENTIFY_COLOR = '0000FF';
const IDENTIFY_DURATION_MS = 5000;

/** What a rabbit is busy with while it wakes up or falls asleep. */
export const TRANSITIONS = { WAKING: 'waking', FALLING_ASLEEP: 'falling_asleep' };

// Waking up takes about 12 s on a real Karotz, falling asleep about 6 s, and
// the rabbit answers only once it is over. Meanwhile the widget says what is
// going on, and the reading loop leaves the rabbit alone (see app.js).
async function inTransition(rabbit, transition, work) {
  rabbit.transition = transition;
  try {
    return await work();
  } finally {
    rabbit.transition = null;
  }
}

export function wake(ctx, rabbit, { silent = true } = {}) {
  return inTransition(rabbit, TRANSITIONS.WAKING, async () => {
    await rabbit.client.wakeup({ silent });
    await restoreEars(ctx, rabbit);
    await ctx.refresh(rabbit);
  });
}

export function sleep(ctx, rabbit) {
  return inTransition(rabbit, TRANSITIONS.FALLING_ASLEEP, async () => {
    await rabbit.client.sleep();
    await ctx.refresh(rabbit);
  });
}

/**
 * Put the ears back where Gladys last placed them. Waking up (and starting)
 * recalibrates them to 0: without this the rabbit and Gladys disagree, and
 * the rabbit forgets the position it had before the night. A failure is only
 * logged: the rabbit is awake, which is what was asked.
 */
export async function restoreEars(ctx, rabbit) {
  const { left, right } = rabbit.ears;
  if (left === null || right === null || (left === 0 && right === 0)) {
    return;
  }
  await rabbit.client
    .ears(left, right)
    .catch((err) => ctx.logger.warn(`${rabbit.host}: ears not put back: ${err.message}`));
}

/**
 * Set the LED. Every omitted value keeps what the LED shows, or, when it is
 * off, what it showed last (`lastLed`).
 * @param {{ color?: string|number, pulse?: boolean, speed?: number, color2?: string|number }} led
 */
export async function setLed(ctx, rabbit, led = {}) {
  const current = rabbit.status;
  const lit = current !== null && current.ledColor !== LED_OFF;
  await rabbit.client.leds({
    color: led.color ?? (lit ? current.ledColor : rabbit.lastLed.color),
    pulse: led.pulse ?? (lit ? current.ledPulse : rabbit.lastLed.pulse),
    speed: led.speed,
    color2: led.color2,
  });
  await ctx.refresh(rabbit);
}

/**
 * The LED pulse switch. While the LED is off it is a mode, kept for when the
 * LED comes back on: the switch keeps showing it, and the LED stays off.
 */
export async function setLedPulse(ctx, rabbit, pulse) {
  if (rabbit.status?.ledColor === LED_OFF) {
    rabbit.lastLed = { ...rabbit.lastLed, pulse };
    await ctx.publishStates(rabbit);
    return;
  }
  await setLed(ctx, rabbit, { pulse });
}

export async function switchLed(ctx, rabbit, on) {
  if (on) {
    // Back to the last LED that was not "off": its color, and its mode.
    await setLed(ctx, rabbit, { color: rabbit.lastLed.color, pulse: rabbit.lastLed.pulse });
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
  if (!/^https?:\/\//i.test(value)) {
    return rabbit.client.playSound(value);
  }
  // OpenKarotz's player (mplayer, 2011) reads no HTTPS: it answers "ok" and
  // plays nothing, checked on a real Karotz with the same stream in http and
  // https. LapinLibre reads both.
  if (/^https:/i.test(value) && rabbit.status?.system !== SYSTEMS.LAPINLIBRE) {
    throw new KarotzError(ERROR_KINDS.NO_HTTPS, `${rabbit.host} cannot play an https:// URL`);
  }
  return rabbit.client.playUrl(value);
}

/**
 * Gladys' "play a notification": the core synthesizes the sentence with the
 * voice chosen in Gladys and sends the URL of the clip. A voice integration
 * serves it from Gladys itself, in plain http on the LAN, which every rabbit
 * plays; Gladys Plus gives an https:// URL, which OpenKarotz cannot play.
 */
export async function playNotification(ctx, rabbit, url) {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!/^https?:\/\//i.test(value)) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'The notification is not the URL of a sound');
  }
  try {
    return await playSound(ctx, rabbit, value);
  } catch (err) {
    if (err.kind === ERROR_KINDS.NO_HTTPS) {
      throw new KarotzError(ERROR_KINDS.NO_HTTPS_VOICE, err.message);
    }
    throw err;
  }
}

export const stopSound = (ctx, rabbit) => rabbit.client.soundControl('quit');
export const playMood = (ctx, rabbit, id) => rabbit.client.mood(id);
export const sayTime = (ctx, rabbit) => rabbit.client.clock();
export const reboot = (ctx, rabbit) => rabbit.client.reboot();

/**
 * Take a picture and bring it back. The rabbit stores it: OpenKarotz keeps
 * every snapshot on its small storage and has no "delete one" endpoint (see
 * clearSnapshots), LapinLibre keeps the ten newest in RAM.
 * @returns {Promise<{ filename: string, base64: string, bytes: number }>}
 */
export async function takeSnapshot(ctx, rabbit, { silent = true } = {}) {
  const filename = await rabbit.client.snapshot({ silent });
  const jpeg = await rabbit.client.snapshotGet(filename);
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new KarotzError(ERROR_KINDS.REFUSED, 'The rabbit did not return a JPEG picture');
  }
  const base64 = jpeg.toString('base64');
  if (isPhotoName(filename) && jpeg.length <= WIDGET_IMAGE_MAX_BYTES) {
    // The photos widget shows it without asking the rabbit again.
    rememberPhoto(rabbit, filename, base64);
  }
  // The photos widget opens on the newest picture: this one.
  rabbit.photoShown = null;
  if (ctx.config.camera && jpeg.length <= CAMERA_IMAGE_MAX_BYTES) {
    await ctx.gladys
      .publishCameraImage(cameraIds(ctx.gladys, rabbit).device, `image/jpg;base64,${base64}`)
      .catch((err) => ctx.logger.warn(`publishCameraImage failed: ${err.message}`));
  }
  return { filename, base64, bytes: jpeg.length };
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
  forgetPhotos(rabbit);
}

/**
 * Make the rabbit signal itself: blue pulsing LED and moving ears for a few
 * seconds, then back to its previous LED.
 */
export async function identify(ctx, rabbit) {
  const before = rabbit.status
    ? { color: rabbit.status.ledColor, pulse: rabbit.status.ledPulse }
    : { ...rabbit.lastLed };
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
    case ERROR_KINDS.NO_HTTPS:
      return {
        en: 'This rabbit cannot play an https:// address: use its http:// address.',
        fr: 'Ce lapin ne sait pas lire une adresse https:// : utilisez son adresse http://.',
        de: 'Dieser Hase kann keine https://-Adresse abspielen: Verwenden Sie die http://-Adresse.',
        es: 'Este conejo no puede reproducir una dirección https://: use su dirección http://.',
      };
    case ERROR_KINDS.NO_HTTPS_VOICE:
      return {
        en: 'This rabbit cannot play the voice of Gladys Plus (https://): pick a voice integration in Gladys (Artificial intelligence page, Voice card).',
        fr: 'Ce lapin ne lit pas la voix de Gladys Plus (https://) : choisissez une intégration de voix dans Gladys (page Intelligence artificielle, carte Voix).',
        de: 'Dieser Hase kann die Stimme von Gladys Plus (https://) nicht abspielen: Wählen Sie eine Sprachintegration in Gladys (Seite Künstliche Intelligenz, Karte Stimme).',
        es: 'Este conejo no puede reproducir la voz de Gladys Plus (https://): elija una integración de voz en Gladys (página Inteligencia artificial, tarjeta Voz).',
      };
    case ERROR_KINDS.SPEECH_FAILED:
      return {
        en: 'The rabbit could not speak: its own speech service did not answer. For the voice chosen in Gladys, use the "Talk on a speaker" action.',
        fr: "Le lapin n'a pas pu parler : sa propre synthèse vocale n'a pas répondu. Pour la voix choisie dans Gladys, utilisez l'action « Parler sur une enceinte ».",
        de: 'Der Hase konnte nicht sprechen: Seine eigene Sprachausgabe hat nicht geantwortet. Für die in Gladys gewählte Stimme nutzen Sie die Aktion „Auf einem Lautsprecher sprechen“.',
        es: 'El conejo no ha podido hablar: su propia síntesis de voz no ha respondido. Para la voz elegida en Gladys, use la acción «Hablar en un altavoz».',
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
