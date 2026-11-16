// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
// The Configuration screen shows a RESOLVED message as a success (green) and a
// THROWN error as a failure (red). So a handler resolves its bilingual message
// only when the operation worked, and calls `fail` for everything else: a
// rabbit that does not answer, nothing found, an invalid input.
// -----------------------------------------------------------------------------

import * as commands from './commands.js';
import { looksLikeStatus, parseStatus } from './rabbits.js';

const SCAN_CONCURRENCY = 32;
const SCAN_TIMEOUT_MS = 2500;

/**
 * `192.168.1`, `192.168.1.0`, `192.168.1.0/24` or `192.168.1.42` -> `192.168.1`.
 * Only private ranges: the search sends 254 requests, never to the Internet.
 */
export function parseSubnet(raw) {
  const match = String(raw ?? '')
    .trim()
    .match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.\d{1,3})?(?:\/24)?$/);
  if (!match) {
    return null;
  }
  const [a, b, c] = match.slice(1).map(Number);
  if (a > 255 || b > 255 || c > 255) {
    return null;
  }
  const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  return isPrivate ? `${a}.${b}.${c}` : null;
}

async function probe(fetchImpl, ip) {
  try {
    const response = await fetchImpl(`http://${ip}/cgi-bin/status`, {
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const raw = JSON.parse(await response.text());
    return looksLikeStatus(raw) ? { ip, status: parseStatus(raw) } : null;
  } catch {
    return null;
  }
}

/** Ask every address of a /24 for an OpenKarotz status. */
export async function scanSubnet(fetchImpl, subnet) {
  const addresses = Array.from({ length: 254 }, (_, index) => `${subnet}.${index + 1}`);
  const found = [];
  let next = 0;
  async function worker() {
    while (next < addresses.length) {
      const ip = addresses[next];
      next += 1;
      const hit = await probe(fetchImpl, ip);
      if (hit) {
        found.push(hit);
      }
    }
  }
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  return found.sort((x, y) => x.ip.localeCompare(y.ip, undefined, { numeric: true }));
}

function describeRabbit(rabbit) {
  if (!rabbit.online) {
    return { en: `${rabbit.host}: no answer`, fr: `${rabbit.host} : pas de réponse` };
  }
  const version = rabbit.status.version ?? '?';
  const sleeping = rabbit.status.sleeping;
  return {
    en: `${rabbit.host}: OpenKarotz ${version}, ${sleeping ? 'asleep' : 'awake'}`,
    fr: `${rabbit.host} : OpenKarotz ${version}, ${sleeping ? 'endormi' : 'réveillé'}`,
  };
}

/**
 * Fail the action: the message is displayed in red under the button. Gladys
 * relays an error as a plain string (never a multi-language object), so both
 * languages travel in it.
 * @param {{ en: string, fr: string }} message
 * @returns {never}
 */
export function fail(message) {
  throw new Error(`${message.fr} / ${message.en}`);
}

const join = (messages, lang) => messages.map((message) => message[lang]).join(' — ');

export const ACTIONS = {
  async test_connection(ctx) {
    if (ctx.rabbits.length === 0) {
      fail({
        en: 'Enter the address of your rabbit first, then save.',
        fr: "Saisissez d'abord l'adresse de votre lapin, puis enregistrez.",
      });
    }
    await ctx.readAll();
    const lines = ctx.rabbits.map(describeRabbit);
    const message = { en: join(lines, 'en'), fr: join(lines, 'fr') };
    // One silent rabbit is enough to make the test a failure.
    if (ctx.rabbits.some((rabbit) => !rabbit.online)) {
      fail(message);
    }
    return message;
  },

  async find_rabbits(ctx, fields) {
    const subnet = parseSubnet(fields.subnet);
    if (!subnet) {
      fail({
        en: 'Enter the first three numbers of your local network, e.g. 192.168.1',
        fr: 'Saisissez les trois premiers nombres de votre réseau local, ex. 192.168.1',
      });
    }
    const found = await scanSubnet(ctx.fetch, subnet);
    if (found.length === 0) {
      fail({
        en: `No rabbit answered on ${subnet}.x. Is it powered, and is its web page reachable?`,
        fr: `Aucun lapin n'a répondu sur ${subnet}.x. Est-il allumé, sa page web est-elle joignable ?`,
      });
    }
    const list = found
      .map(({ ip, status }) => `${ip} (OpenKarotz ${status.version ?? '?'})`)
      .join(', ');
    return {
      en: `Found: ${list}. Copy the address into "Rabbit addresses" and save.`,
      fr: `Trouvé : ${list}. Copiez l'adresse dans « Adresses des lapins » et enregistrez.`,
    };
  },

  async identify(ctx, fields) {
    const rabbit = ctx.findRabbit(fields.rabbit);
    try {
      await commands.identify(ctx, rabbit);
    } catch (err) {
      fail(commands.describeError(err));
    }
    return {
      en: 'Look around: the rabbit pulses blue and moves its ears.',
      fr: 'Regardez autour de vous : le lapin clignote en bleu et bouge les oreilles.',
    };
  },

  async reboot(ctx, fields) {
    const rabbit = ctx.findRabbit(fields.rabbit);
    try {
      await commands.reboot(ctx, rabbit);
    } catch (err) {
      fail(commands.describeError(err));
    }
    return {
      en: 'The rabbit restarts: it will be back in about a minute.',
      fr: 'Le lapin redémarre : il sera de retour dans une minute environ.',
    };
  },
};
