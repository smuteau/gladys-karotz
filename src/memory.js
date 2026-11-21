// -----------------------------------------------------------------------------
// What a rabbit cannot tell, kept across restarts of the integration.
//
// Neither OpenKarotz nor LapinLibre reports where the ears are, and the LED it
// reports when turned off says nothing of the color and mode to turn back on.
// The integration knows both from its own commands: this file keeps them in
// `/data` (the one writable volume of the container), per rabbit MAC, so an
// update or a restart of Gladys does not lose them.
//
// Best effort: a missing or unreadable file only means "nothing remembered".
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';

/** Where the container keeps it. Tests and local runs pass their own path, or none. */
export const DEFAULT_MEMORY_FILE = '/data/karotz-memory.json';

const isPosition = (value) => Number.isInteger(value) && value >= 0 && value <= 16;
const isColor = (value) => typeof value === 'string' && /^[0-9A-F]{6}$/.test(value);

/** What one rabbit's entry holds, checked field by field: the file may be old or edited. */
function sanitize(entry) {
  const out = {};
  if (entry && isPosition(entry.ears?.left) && isPosition(entry.ears?.right)) {
    out.ears = { left: entry.ears.left, right: entry.ears.right };
  }
  if (entry && isColor(entry.led?.color) && typeof entry.led?.pulse === 'boolean') {
    out.led = { color: entry.led.color, pulse: entry.led.pulse };
  }
  return out;
}

/**
 * @param {string|null} file the JSON file, or null to remember nothing on disk
 * @param {{ warn: (message: string) => void }} logger
 */
export function createMemory(file, logger) {
  let rabbits = {};
  let saved = '{}';
  let writing = Promise.resolve();

  async function write(json) {
    // Write then rename: a crash mid-write never leaves half a file.
    const temporary = `${file}.tmp`;
    await writeFile(temporary, json, 'utf8');
    await rename(temporary, file);
  }

  return {
    async load() {
      if (!file) {
        return;
      }
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        rabbits = Object.fromEntries(
          Object.entries(parsed?.rabbits ?? {}).map(([id, entry]) => [id, sanitize(entry)]),
        );
        saved = JSON.stringify(rabbits);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Could not read ${file}: ${err.message}`);
        }
      }
    },

    /** Give a rabbit just identified what was remembered of it. */
    restore(rabbit) {
      const entry = rabbits[rabbit.id];
      if (!entry) {
        return;
      }
      if (entry.ears && rabbit.ears.left === null && rabbit.ears.right === null) {
        rabbit.ears = { ...entry.ears };
      }
      if (entry.led) {
        rabbit.lastLed = { ...entry.led };
      }
    },

    /** Note what the rabbit is now; writes the file only when something changed. */
    remember(rabbit) {
      if (rabbit.id === null) {
        return Promise.resolve();
      }
      rabbits[rabbit.id] = sanitize({ ears: rabbit.ears, led: rabbit.lastLed });
      const json = JSON.stringify(rabbits);
      if (!file || json === saved) {
        return Promise.resolve();
      }
      saved = json;
      writing = writing
        .then(() => write(JSON.stringify({ rabbits }, null, 2)))
        .catch((err) => logger.warn(`Could not write ${file}: ${err.message}`));
      return writing;
    },
  };
}
