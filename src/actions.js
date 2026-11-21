// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
//
// The Configuration screen shows a RESOLVED message as a success (green) and a
// THROWN error as a failure (red). So a handler resolves its multi-language message
// only when the operation worked, and calls `fail` for everything else: a
// rabbit that does not answer, nothing found, an invalid input.
// -----------------------------------------------------------------------------

import * as commands from './commands.js';
import { ERROR_KINDS } from './karotz/client.js';
import { firmwareLabel, looksLikeStatus, parseStatus } from './rabbits.js';

/** Every user-facing text exists in these languages. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const SCAN_CONCURRENCY = 64;
const SCAN_TIMEOUT_MS = 2500;
// How long Gladys listens for the neighbours of the rabbit, and how many
// networks are then searched: three /24 fit in the timeout of the button.
const NEIGHBOUR_SCAN_SECONDS = 4;
const MAX_SUBNETS = 3;

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

/**
 * The private /24 networks a list of addresses belongs to, the one with the
 * most distinct addresses first. Host names and public addresses are ignored.
 */
export function subnetsOf(addresses) {
  const counts = new Map();
  for (const address of new Set(addresses)) {
    const subnet = parseSubnet(String(address ?? '').replace(/:\d+$/, ''));
    if (subnet) {
      counts.set(subnet, (counts.get(subnet) ?? 0) + 1);
    }
  }
  return [...counts].sort((x, y) => y[1] - x[1]).map(([subnet]) => subnet);
}

/**
 * Work out the local network without asking the user. The container sits on
 * a Docker bridge: its own address says nothing about the LAN, and Gladys does
 * not expose its own. But Gladys can run an SSDP search from the host network
 * (manifest `network_discovery`): whoever answers — the router, a TV, a NAS —
 * lives on the network the rabbit is on. The rabbits already configured count
 * too. A Karotz itself never answers SSDP.
 */
export async function findLocalSubnets(ctx) {
  const addresses = ctx.rabbits.map((rabbit) => rabbit.host);
  try {
    const neighbours = await ctx.gladys.scanNetwork('ssdp', {
      timeoutSeconds: NEIGHBOUR_SCAN_SECONDS,
    });
    addresses.push(...neighbours.map((neighbour) => neighbour.source_ip));
  } catch (err) {
    // Rate limit (one scan per 10 s) or a core that refuses: not a failure by
    // itself, the user can still type the network.
    ctx.logger.warn(`Network search: the SSDP scan failed: ${err.message}`);
  }
  return subnetsOf(addresses).slice(0, MAX_SUBNETS);
}

// The search sends NO password: it asks 254 addresses, and a camera or a
// router that asks for a login must not receive the password of a rabbit.
// An address that asks for one on /cgi-bin/status is only reported, as a
// possible LapinLibre or Terrier OS rabbit.
async function probe(fetchImpl, ip) {
  try {
    const response = await fetchImpl(`http://${ip}/cgi-bin/status`, {
      signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
    });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      return { ip, locked: true };
    }
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

function describeRabbit(ctx, rabbit) {
  if (!rabbit.online && rabbit.lastErrorKind === ERROR_KINDS.AUTH) {
    return ctx.config.passwords.length === 0
      ? {
          en: `${rabbit.host}: asks for a web password`,
          fr: `${rabbit.host} : demande un mot de passe web`,
          de: `${rabbit.host}: verlangt ein Web-Passwort`,
          es: `${rabbit.host}: pide una contraseña web`,
        }
      : {
          en: `${rabbit.host}: web password refused`,
          fr: `${rabbit.host} : mot de passe web refusé`,
          de: `${rabbit.host}: Web-Passwort abgelehnt`,
          es: `${rabbit.host}: contraseña web rechazada`,
        };
  }
  if (!rabbit.online) {
    return {
      en: `${rabbit.host}: no answer`,
      fr: `${rabbit.host} : pas de réponse`,
      de: `${rabbit.host}: keine Antwort`,
      es: `${rabbit.host}: sin respuesta`,
    };
  }
  const firmware = firmwareLabel(rabbit.status);
  const sleeping = rabbit.status.sleeping;
  return {
    en: `${rabbit.host}: ${firmware}, ${sleeping ? 'asleep' : 'awake'}`,
    fr: `${rabbit.host} : ${firmware}, ${sleeping ? 'endormi' : 'réveillé'}`,
    de: `${rabbit.host}: ${firmware}, ${sleeping ? 'schläft' : 'wach'}`,
    es: `${rabbit.host}: ${firmware}, ${sleeping ? 'dormido' : 'despierto'}`,
  };
}

/**
 * An error whose `message` is a multi-language object instead of a string.
 * The SDK relays `message` untouched, and the Configuration screen picks the
 * language of the user in it, exactly as it does for a success message: the
 * red message is translated too. The logs keep the English text.
 */
export class ActionFailure extends Error {
  /** @param {{ en: string, fr: string, de: string, es: string }} text */
  constructor(text) {
    super(text.en);
    this.name = 'ActionFailure';
    this.message = text;
  }

  toString() {
    return `${this.name}: ${this.message.en}`;
  }
}

/**
 * Fail the action: the message is displayed in red under the button, in the
 * language of the user.
 * @param {{ en: string, fr: string, de: string, es: string }} message
 * @returns {never}
 */
export function fail(message) {
  throw new ActionFailure(message);
}

const join = (messages, lang) => messages.map((message) => message[lang]).join(' — ');

export const ACTIONS = {
  async test_connection(ctx) {
    if (ctx.rabbits.length === 0) {
      fail({
        en: 'Enter the address of your rabbit first, then save.',
        fr: "Saisissez d'abord l'adresse de votre lapin, puis enregistrez.",
        de: 'Tragen Sie zuerst die Adresse Ihres Hasen ein und speichern Sie.',
        es: 'Introduzca primero la dirección de su conejo y guarde.',
      });
    }
    await ctx.readAll();
    const lines = ctx.rabbits.map((rabbit) => describeRabbit(ctx, rabbit));
    const message = Object.fromEntries(LANGUAGES.map((lang) => [lang, join(lines, lang)]));
    // One silent rabbit is enough to make the test a failure.
    if (ctx.rabbits.some((rabbit) => !rabbit.online)) {
      fail(message);
    }
    return message;
  },

  async find_rabbits(ctx, fields) {
    const typed = String(fields.subnet ?? '').trim();
    let subnets;
    if (typed) {
      const subnet = parseSubnet(typed);
      if (!subnet) {
        fail({
          en: 'Enter the first three numbers of your local network, e.g. 192.168.1, or leave the field empty.',
          fr: 'Saisissez les trois premiers nombres de votre réseau local, ex. 192.168.1, ou laissez le champ vide.',
          de: 'Tragen Sie die ersten drei Zahlen Ihres lokalen Netzwerks ein, z. B. 192.168.1, oder lassen Sie das Feld leer.',
          es: 'Introduzca los tres primeros números de su red local, p. ej. 192.168.1, o deje el campo vacío.',
        });
      }
      subnets = [subnet];
    } else {
      subnets = await findLocalSubnets(ctx);
      if (subnets.length === 0) {
        fail({
          en: 'Your local network could not be worked out. Enter its first three numbers, e.g. 192.168.1, then search again.',
          fr: "Votre réseau local n'a pas pu être déterminé. Saisissez ses trois premiers nombres, ex. 192.168.1, puis relancez la recherche.",
          de: 'Ihr lokales Netzwerk konnte nicht ermittelt werden. Tragen Sie seine ersten drei Zahlen ein, z. B. 192.168.1, und suchen Sie erneut.',
          es: 'No se ha podido determinar su red local. Introduzca sus tres primeros números, p. ej. 192.168.1, y repita la búsqueda.',
        });
      }
    }
    const found = [];
    for (const subnet of subnets) {
      found.push(...(await scanSubnet(ctx.fetch, subnet)));
    }
    const searched = subnets.map((subnet) => `${subnet}.x`).join(', ');
    if (found.length === 0) {
      fail({
        en: `No rabbit answered on ${searched}. Is it powered, and is its web page reachable?`,
        fr: `Aucun lapin n'a répondu sur ${searched}. Est-il allumé, sa page web est-elle joignable ?`,
        de: `Kein Hase hat auf ${searched} geantwortet. Ist er eingeschaltet, ist seine Webseite erreichbar?`,
        es: `Ningún conejo ha respondido en ${searched}. ¿Está encendido, se puede abrir su página web?`,
      });
    }
    const rabbits = found
      .filter((hit) => !hit.locked)
      .map(({ ip, status }) => `${ip} (${firmwareLabel(status)})`)
      .join(', ');
    const locked = found
      .filter((hit) => hit.locked)
      .map(({ ip }) => ip)
      .join(', ');
    const parts = [];
    if (rabbits) {
      parts.push({
        en: `Found: ${rabbits}.`,
        fr: `Trouvé : ${rabbits}.`,
        de: `Gefunden: ${rabbits}.`,
        es: `Encontrado: ${rabbits}.`,
      });
    }
    if (locked) {
      parts.push({
        en: `Asks for a password, maybe a LapinLibre or Terrier OS rabbit: ${locked}.`,
        fr: `Demande un mot de passe, peut-être un lapin LapinLibre ou Terrier OS : ${locked}.`,
        de: `Verlangt ein Passwort, vielleicht ein Hase mit LapinLibre oder Terrier OS: ${locked}.`,
        es: `Pide una contraseña, quizá un conejo con LapinLibre o Terrier OS: ${locked}.`,
      });
    }
    parts.push({
      en: 'Copy the address into "Rabbit addresses" and save.',
      fr: "Copiez l'adresse dans « Adresses des lapins » et enregistrez.",
      de: 'Kopieren Sie die Adresse in „Adressen der Hasen“ und speichern Sie.',
      es: 'Copie la dirección en «Direcciones de los conejos» y guarde.',
    });
    return Object.fromEntries(
      LANGUAGES.map((lang) => [lang, parts.map((part) => part[lang]).join(' ')]),
    );
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
      de: 'Schauen Sie sich um: Der Hase pulsiert blau und bewegt die Ohren.',
      es: 'Mire a su alrededor: el conejo parpadea en azul y mueve las orejas.',
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
      de: 'Der Hase startet neu: In etwa einer Minute ist er wieder da.',
      es: 'El conejo se reinicia: volverá en un minuto aproximadamente.',
    };
  },
};
