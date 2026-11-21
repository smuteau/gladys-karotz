// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`).
//
//   - `karotz`: the state of a rabbit and its most used commands;
//   - `karotz_camera`: the pictures stored on the rabbit, one at a time, and
//     buttons to take one or delete them all.
//
// Both have one optional setting, `rabbit` (a `"source": "devices"` select):
// without it the first configured rabbit is shown, which is the right answer
// for the many homes with a single Karotz.
//
// The content is declarative and rendered by the core. Check it in the tests
// with `validateWidgetContent` (test/widgets.test.js).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import * as commands from './commands.js';
import { FEATURES, rabbitIds } from './devices.js';
import { listPhotos, parsePhotoKey, photoBase64, photoDate, photoKey } from './photos.js';
import { firmwareLabel, rabbitName } from './rabbits.js';

export const WIDGET_KEYS = { RABBIT: 'karotz', CAMERA: 'karotz_camera' };

const ACTIONS = {
  WAKE: 'wake',
  SLEEP: 'sleep',
  SPEAK: 'speak',
  MOOD: 'mood',
  TIME: 'time',
  SNAPSHOT: 'snapshot',
  CLEAR_SNAPSHOTS: 'clear_snapshots',
  PHOTO_PREVIOUS: 'photo_previous',
  PHOTO_NEXT: 'photo_next',
};

const NO_RABBIT = {
  ttl_seconds: 60,
  components: [
    {
      type: 'text',
      variant: 'body',
      text: {
        en: 'No rabbit found yet. Enter its address in the integration configuration.',
        fr: "Aucun lapin trouvé pour l'instant. Saisissez son adresse dans la configuration de l'intégration.",
        de: 'Noch kein Hase gefunden. Tragen Sie seine Adresse in der Konfiguration der Integration ein.',
        es: 'Todavía no se ha encontrado ningún conejo. Introduzca su dirección en la configuración de la integración.',
      },
    },
  ],
};

function heading(ctx, rabbit) {
  return { type: 'text', variant: 'heading', text: rabbitName(rabbit, ctx.rabbits.length) };
}

function stateItem(rabbit) {
  const label = { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' };
  if (!rabbit.online) {
    return {
      label,
      icon: 'wifi-off',
      value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (rabbit.status.sleeping) {
    return {
      label,
      icon: 'moon',
      value: { en: 'Asleep', fr: 'Endormi', de: 'Schläft', es: 'Dormido' },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  return {
    label,
    icon: 'sun',
    value: { en: 'Awake', fr: 'Réveillé', de: 'Wach', es: 'Despierto' },
    color: WIDGET_COLORS.SUCCESS,
  };
}

function rabbitContent(ctx, rabbit) {
  const ids = rabbitIds(ctx.gladys, rabbit);
  const items = [
    stateItem(rabbit),
    {
      label: { en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección' },
      icon: 'link',
      value: rabbit.host.slice(0, 40),
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (rabbit.status?.version) {
    items.push({
      label: { en: 'Firmware', fr: 'Firmware', de: 'Firmware', es: 'Firmware' },
      icon: 'cpu',
      value: firmwareLabel(rabbit.status, rabbit.versions).slice(0, 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  const components = [
    heading(ctx, rabbit),
    // Live tiles: they follow the published states, no refresh involved.
    {
      type: 'gauge',
      label: {
        en: 'Storage used',
        fr: 'Stockage utilisé',
        de: 'Speicher belegt',
        es: 'Almacenamiento usado',
      },
      device_feature: ids.feature(FEATURES.STORAGE_USED),
    },
    {
      type: 'value',
      label: { en: 'RFID tags', fr: 'Tags RFID', de: 'RFID-Tags', es: 'Etiquetas RFID' },
      icon: 'tag',
      device_feature: ids.feature(FEATURES.RFID_TAGS),
    },
    { type: 'status', items },
  ];
  if (!rabbit.online) {
    return { ttl_seconds: 60, components };
  }
  if (rabbit.status.sleeping) {
    components.push({
      type: 'button',
      label: { en: 'Wake up', fr: 'Réveiller', de: 'Aufwecken', es: 'Despertar' },
      icon: 'sun',
      style: 'primary',
      action: { key: ACTIONS.WAKE },
    });
    return { ttl_seconds: 60, components };
  }
  components.push(
    {
      type: 'button',
      label: { en: 'Speak', fr: 'Faire parler', de: 'Sprechen', es: 'Hablar' },
      icon: 'message-circle',
      style: 'primary',
      // Typed input only exists behind a tap: the core opens this form.
      action: {
        key: ACTIONS.SPEAK,
        fields: [
          {
            key: 'text',
            type: 'string',
            required: true,
            label: { en: 'Sentence', fr: 'Phrase', de: 'Satz', es: 'Frase' },
          },
        ],
      },
    },
    {
      type: 'button',
      label: { en: 'Mood', fr: 'Humeur', de: 'Stimmung', es: 'Estado de ánimo' },
      // The core renders Tabler's Feather font, which has no `smile`.
      icon: 'heart',
      style: 'secondary',
      action: { key: ACTIONS.MOOD },
    },
    {
      type: 'button',
      label: {
        en: 'Tell the time',
        fr: "Dire l'heure",
        de: 'Uhrzeit ansagen',
        es: 'Decir la hora',
      },
      icon: 'clock',
      style: 'secondary',
      action: { key: ACTIONS.TIME },
    },
    {
      type: 'button',
      label: { en: 'Sleep', fr: 'Endormir', de: 'Schlafen legen', es: 'Dormir' },
      icon: 'moon',
      style: 'secondary',
      action: { key: ACTIONS.SLEEP },
    },
  );
  return { ttl_seconds: 60, components };
}

const unreachable = {
  type: 'text',
  variant: 'body',
  text: {
    en: 'The rabbit does not answer.',
    fr: 'Le lapin ne répond pas.',
    de: 'Der Hase antwortet nicht.',
    es: 'El conejo no responde.',
  },
};

const takePicture = {
  type: 'button',
  label: {
    en: 'Take a picture',
    fr: 'Prendre une photo',
    de: 'Foto aufnehmen',
    es: 'Tomar una foto',
  },
  icon: 'camera',
  style: 'primary',
  action: { key: ACTIONS.SNAPSHOT },
};

/**
 * The pictures stored on the rabbit, one at a time (the whole picture, not a
 * crop), with buttons to walk through them, take one, or delete them all.
 */
async function photosContent(ctx, rabbit, language) {
  const components = [heading(ctx, rabbit)];
  if (!rabbit.online) {
    components.push(unreachable);
    return { ttl_seconds: 60, components };
  }
  let photos;
  try {
    photos = await listPhotos(rabbit);
  } catch (err) {
    components.push({ type: 'text', variant: 'body', text: commands.describeError(err) });
    return { ttl_seconds: 60, components };
  }
  if (photos.length === 0) {
    components.push(
      {
        type: 'text',
        variant: 'body',
        text: {
          en: 'No picture yet: take the first one.',
          fr: 'Pas encore de photo : prenez la première.',
          de: 'Noch kein Foto: Nehmen Sie das erste auf.',
          es: 'Todavía no hay foto: tome la primera.',
        },
      },
      takePicture,
    );
    return { ttl_seconds: 300, components };
  }
  const index = shownIndex(rabbit, photos);
  const filename = photos[index];
  const when = photoDate(filename, LOCALES[language] ?? LOCALES.en);
  const position = `${index + 1}/${photos.length}`;
  components.push(
    {
      type: 'image',
      key: photoKey(rabbit, filename),
      alt: { en: 'Picture', fr: 'Photo', de: 'Foto', es: 'Foto' },
      fit: 'contain',
    },
    { type: 'text', variant: 'caption', text: `${position} · ${when}` },
    takePicture,
  );
  if (index > 0) {
    components.push({
      type: 'button',
      label: { en: 'Previous', fr: 'Précédente', de: 'Vorheriges', es: 'Anterior' },
      icon: 'chevron-left',
      style: 'secondary',
      action: { key: ACTIONS.PHOTO_PREVIOUS },
    });
  }
  if (index < photos.length - 1) {
    components.push({
      type: 'button',
      label: { en: 'Next', fr: 'Suivante', de: 'Nächstes', es: 'Siguiente' },
      icon: 'chevron-right',
      style: 'secondary',
      action: { key: ACTIONS.PHOTO_NEXT },
    });
  }
  components.push({
    type: 'button',
    label: {
      en: 'Delete pictures',
      fr: 'Effacer les photos',
      de: 'Fotos löschen',
      es: 'Borrar las fotos',
    },
    icon: 'trash-2',
    style: 'danger',
    // Deletes every picture stored on the rabbit: ask first.
    action: { key: ACTIONS.CLEAR_SNAPSHOTS, confirm: true },
  });
  return { ttl_seconds: 300, components };
}

/** The picture the widget shows: the one chosen, else the newest. */
function shownIndex(rabbit, photos) {
  const index = photos.indexOf(rabbit.photoShown);
  return index === -1 ? photos.length - 1 : index;
}

async function showPhoto(rabbit, step) {
  const photos = rabbit.photos ?? (await listPhotos(rabbit));
  if (photos.length === 0) {
    return;
  }
  const index = Math.min(photos.length - 1, Math.max(0, shownIndex(rabbit, photos) + step));
  rabbit.photoShown = photos[index];
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

const DONE = { en: 'Done.', fr: "C'est fait.", de: 'Erledigt.', es: 'Hecho.' };

// Waking up plays a sound and recalibrates the ears: about 12 s on a real
// Karotz, falling asleep about 6 s. The toast must not wait that long: past
// this delay it answers, and the command ends in the background.
const QUICK_ANSWER_MS = 2500;

/**
 * Run a long command, but answer within QUICK_ANSWER_MS. A failure before
 * that delay is the toast, as usual; a later one is only logged, and the
 * widgets are refreshed once the command is over, so the card shows the
 * state the rabbit really reached.
 */
async function answerSoon(ctx, work) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, ctx.quickAnswerMs ?? QUICK_ANSWER_MS);
    timer.unref?.();
  });
  const running = work();
  try {
    await Promise.race([running, late]);
  } finally {
    clearTimeout(timer);
  }
  running
    .catch((err) => ctx.logger.warn(`A widget command ended in error: ${err.message}`))
    .finally(() => refreshWidgets(ctx.gladys));
}

async function runAction(ctx, rabbit, actionKey, values) {
  switch (actionKey) {
    case ACTIONS.WAKE:
      await answerSoon(ctx, () => commands.wake(ctx, rabbit, { silent: false }));
      return {
        en: 'The rabbit is waking up.',
        fr: 'Le lapin se réveille.',
        de: 'Der Hase wacht auf.',
        es: 'El conejo se despierta.',
      };
    case ACTIONS.SLEEP:
      await answerSoon(ctx, () => commands.sleep(ctx, rabbit));
      return {
        en: 'Good night, rabbit.',
        fr: 'Bonne nuit, lapin.',
        de: 'Gute Nacht, Hase.',
        es: 'Buenas noches, conejo.',
      };
    case ACTIONS.SPEAK:
      // An older core drops the form and relays the action without values.
      if (!values?.text) {
        return {
          en: 'Update Gladys to type a sentence from the dashboard.',
          fr: 'Mettez Gladys à jour pour saisir une phrase depuis le tableau de bord.',
          de: 'Aktualisieren Sie Gladys, um einen Satz vom Dashboard aus einzugeben.',
          es: 'Actualice Gladys para escribir una frase desde el panel.',
        };
      }
      await commands.speak(ctx, rabbit, values.text);
      return DONE;
    case ACTIONS.MOOD:
      await commands.playMood(ctx, rabbit);
      return DONE;
    case ACTIONS.TIME:
      await commands.sayTime(ctx, rabbit);
      return DONE;
    case ACTIONS.SNAPSHOT:
      await commands.takeSnapshot(ctx, rabbit, { silent: false });
      return {
        en: 'Picture taken.',
        fr: 'Photo prise.',
        de: 'Foto aufgenommen.',
        es: 'Foto tomada.',
      };
    // Walking through the pictures needs no toast: the card itself changes.
    case ACTIONS.PHOTO_PREVIOUS:
      await showPhoto(rabbit, -1);
      return undefined;
    case ACTIONS.PHOTO_NEXT:
      await showPhoto(rabbit, 1);
      return undefined;
    case ACTIONS.CLEAR_SNAPSHOTS:
      await commands.clearSnapshots(ctx, rabbit);
      return {
        en: 'Pictures deleted from the rabbit.',
        fr: 'Photos effacées du lapin.',
        de: 'Fotos vom Hasen gelöscht.',
        es: 'Fotos borradas del conejo.',
      };
    default:
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
}

// A refused command is an answer for the person in front of the dashboard,
// not a crash: the toast says why (asleep, unreachable...).
async function action(ctx, { actionKey, settings, values }) {
  const rabbit = ctx.findRabbit(settings?.rabbit);
  try {
    return await runAction(ctx, rabbit, actionKey, values);
  } catch (err) {
    if (err.kind) {
      return commands.describeError(err);
    }
    throw err;
  }
}

function widget(build) {
  return {
    async get(ctx, { settings, language }) {
      const rabbit = ctx.findRabbit(settings?.rabbit, { optional: true });
      return rabbit ? build(ctx, rabbit, language) : NO_RABBIT;
    },
    action,
  };
}

export const WIDGETS = {
  [WIDGET_KEYS.RABBIT]: widget(rabbitContent),
  [WIDGET_KEYS.CAMERA]: widget(photosContent),
};

/** Raw base64 of a widget image, by the key the content declared. */
export async function getWidgetImage(ctx, imageKey) {
  const photo = parsePhotoKey(imageKey);
  const rabbit = photo && ctx.rabbits.find((candidate) => candidate.id === photo.rabbitId);
  if (!rabbit) {
    throw new Error(`Unknown widget image: ${imageKey}`);
  }
  return photoBase64(rabbit, photo.filename);
}

/** "Re-pull me now": rate-limited core-side, dropped while disconnected. */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
