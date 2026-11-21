// -----------------------------------------------------------------------------
// The pictures stored on a rabbit, for the photos widget.
//
// OpenKarotz keeps every snapshot on the rabbit's storage, LapinLibre the ten
// newest in RAM; both list them (`snapshot_list`) and serve one by name
// (`snapshot_get`). The widget shows one at a time: its image key carries the
// rabbit and the picture's timestamp, so the core's one-hour image cache never
// mixes two pictures, and a key maps back to exactly one file.
//
// A picture is fetched only when the dashboard asks for it, one request at a
// time per rabbit, and the last few are kept here.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, KarotzError } from './karotz/client.js';

// snapshot_2026_11_21_17_00_10.jpg: the only names asked for, or served.
const PHOTO_NAME = /^snapshot_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.jpg$/;
const PHOTO_KEY = /^photo-([a-z0-9-]+)-(\d{14})$/;

// Gladys refuses a widget image over 300 KB.
const WIDGET_IMAGE_MAX_BYTES = 300 * 1024;
const CACHED_PHOTOS = 6;

export const isPhotoName = (name) => typeof name === 'string' && PHOTO_NAME.test(name);

/** The image key of a picture: `photo-<rabbit id>-<YYYYMMDDHHMMSS>`. */
export function photoKey(rabbit, filename) {
  const digits = filename.match(PHOTO_NAME).slice(1).join('');
  return `photo-${rabbit.id}-${digits}`.toLowerCase();
}

/** `{ rabbitId, filename }` of a key, or null for a key this module never made. */
export function parsePhotoKey(key) {
  const match = PHOTO_KEY.exec(String(key));
  if (!match) {
    return null;
  }
  const [y, mo, d, h, mi, s] = match[2]
    .match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
    .slice(1);
  return { rabbitId: match[1], filename: `snapshot_${y}_${mo}_${d}_${h}_${mi}_${s}.jpg` };
}

/**
 * When the picture was taken, as the rabbit's clock wrote it in the name,
 * formatted for `locale` without any time zone shift.
 */
export function photoDate(filename, locale) {
  const [y, mo, d, h, mi, s] = filename.match(PHOTO_NAME).slice(1).map(Number);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, mo - 1, d, h, mi, s)));
}

/** The pictures on the rabbit, oldest first; also kept on the rabbit. */
export async function listPhotos(rabbit) {
  const listed = await rabbit.client.snapshotList();
  const names = listed.map((entry) => entry?.id).filter(isPhotoName);
  rabbit.photos = [...new Set(names)].sort();
  return rabbit.photos;
}

function cache(rabbit) {
  rabbit.photoCache ??= new Map();
  return rabbit.photoCache;
}

/** Keep a picture the integration already has the bytes of (just taken). */
export function rememberPhoto(rabbit, filename, base64) {
  const photos = cache(rabbit);
  photos.delete(filename);
  photos.set(filename, base64);
  while (photos.size > CACHED_PHOTOS) {
    photos.delete(photos.keys().next().value);
  }
}

export function forgetPhotos(rabbit) {
  rabbit.photos = [];
  rabbit.photoShown = null;
  cache(rabbit).clear();
}

/** The raw base64 of one stored picture, fetched once and kept a while. */
export async function photoBase64(rabbit, filename) {
  if (!isPhotoName(filename)) {
    throw new KarotzError(ERROR_KINDS.REFUSED, `Not a picture of the rabbit: ${filename}`);
  }
  const cached = cache(rabbit).get(filename);
  if (cached) {
    rememberPhoto(rabbit, filename, cached);
    return cached;
  }
  // Only a picture the rabbit listed: the core already refuses a key no
  // content declared, and a name the rabbit never gave is not asked for.
  if (!rabbit.photos?.includes(filename)) {
    throw new KarotzError(ERROR_KINDS.REFUSED, `The rabbit has no picture ${filename}`);
  }
  // One request at a time: the dashboard asks for its images all at once.
  const fetch = async () => {
    const jpeg = await rabbit.client.snapshotGet(filename);
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      throw new KarotzError(ERROR_KINDS.REFUSED, 'The rabbit did not return a JPEG picture');
    }
    if (jpeg.length > WIDGET_IMAGE_MAX_BYTES) {
      throw new KarotzError(ERROR_KINDS.REFUSED, 'The picture is over the 300 KB Gladys accepts');
    }
    const base64 = jpeg.toString('base64');
    rememberPhoto(rabbit, filename, base64);
    return base64;
  };
  const queued = (rabbit.photoQueue ?? Promise.resolve()).then(fetch, fetch);
  rabbit.photoQueue = queued.catch(() => {});
  return queued;
}
