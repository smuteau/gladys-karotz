// -----------------------------------------------------------------------------
// The application: the rabbits of the configuration, the reading loop, and the
// registration of every SDK handler.
//
// `createApp(gladys, options)` returns the context (`ctx`) every other module
// works with. The options exist for the tests: an in-memory rabbit instead of
// the network, no real timers.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './actions.js';
import * as commands from './commands.js';
import { normalizeConfig } from './config.js';
import { FEATURES, buildDevices, buildStates, featureKey, findRabbitByDevice } from './devices.js';
import { ERROR_KINDS, createKarotzClient } from './karotz/client.js';
import { rabbitFetch } from './karotz/http.js';
import { createMemory } from './memory.js';
import { createRabbit, readRabbit } from './rabbits.js';
import { SCENE_ACTIONS } from './scenes.js';
import { buildSceneEvents } from './triggers.js';
import { WIDGETS, getWidgetImage, refreshWidgets } from './widgets.js';

// An unchanged value is still re-sent from time to time, so the "last seen"
// of the device in Gladys does not look dead.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const defaultSleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ fetch?: typeof fetch, sleepMs?: (ms: number) => Promise<void>,
 *   createClient?: (host: string) => object, memoryFile?: string|null }} [options]
 *   `memoryFile`: where ears and LED are remembered (see memory.js); none by
 *   default, index.js gives the container's.
 */
export function createApp(gladys, options = {}) {
  const logger = createLogger({ name: 'karotz' });
  // Every request to a rabbit, network search included, goes through
  // rabbitFetch: the global fetch refuses the headers of OpenKarotz.
  const fetchImpl = options.fetch ?? rabbitFetch;
  // The passwords are read at each request: a new configuration reaches the
  // rabbits already known without recreating them.
  const passwords = () => ctx.config.passwords;
  const createClient =
    options.createClient ?? ((host) => createKarotzClient(host, { fetch: fetchImpl, passwords }));

  let timer = null;
  let memoryLoaded = null;
  // Reads never overlap: a slow rabbit must not pile requests up.
  let reading = Promise.resolve();

  const ctx = {
    gladys,
    logger,
    fetch: fetchImpl,
    sleepMs: options.sleepMs ?? defaultSleepMs,
    config: normalizeConfig(),
    memory: createMemory(options.memoryFile ?? null, logger),
    // How long a widget waits for a long command before answering (tests).
    quickAnswerMs: options.quickAnswerMs,
    // Tests: how long a wake-up and a falling asleep are expected to take.
    transitionMs: options.transitionMs,
    /** @type {ReturnType<typeof createRabbit>[]} */
    rabbits: [],

    /**
     * The rabbit behind a device external id. Without an
     * id, the first rabbit: the single-rabbit home needs no selection.
     */
    findRabbit(externalId, { optional = false } = {}) {
      const known = ctx.rabbits.filter((rabbit) => rabbit.id !== null);
      const rabbit = externalId ? findRabbitByDevice(gladys, known, externalId) : known[0];
      if (!rabbit && !optional) {
        throw new Error(externalId ? `Unknown rabbit: ${externalId}` : 'No rabbit configured');
      }
      return rabbit;
    },

    async publishStates(rabbit) {
      // Every change of what Gladys shows goes through here: the moment to
      // note what the rabbit cannot tell (ears, last LED).
      await ctx.memory.remember(rabbit);
      const states = buildStates(gladys, rabbit);
      if (states.length > 0) {
        await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
      }
    },

    /**
     * Read a rabbit again after a command, so Gladys shows what the rabbit
     * really did. Fires NO scene event: the change is ours.
     */
    async refresh(rabbit) {
      await read(rabbit);
      await ctx.publishStates(rabbit);
      refreshWidgets(gladys);
    },

    /** One pass of the reading loop over every rabbit. */
    readAll({ events = false } = {}) {
      reading = reading.then(() => readAllNow(events)).catch((err) => logger.error(err));
      return reading;
    },
  };

  // One read of a rabbit; a rabbit seen for the first time gets back what was
  // remembered of it (its ears, its last LED).
  async function read(rabbit) {
    const changes = await readRabbit(rabbit, { sleepMs: ctx.sleepMs });
    if (changes.identified) {
      ctx.memory.restore(rabbit);
    }
    return changes;
  }

  async function readAllNow(events) {
    let changed = false;
    let identified = false;
    for (const rabbit of ctx.rabbits) {
      // Waking up or falling asleep on our command, the rabbit is busy with
      // its script and would miss the read: the command reads it back.
      if (rabbit.transition) {
        continue;
      }
      const changes = await read(rabbit);
      identified ||= changes.identified;
      // Ears never placed (a new rabbit, no memory): a recalibration gives
      // them a known position. Asleep, its next wake-up does it. Here, not in
      // read(): a command's own read-back must not wait for the next command.
      if (changes.identified && !rabbit.status.sleeping) {
        await commands
          .initEars(ctx, rabbit)
          .catch((err) => logger.warn(`${rabbit.host}: ears not initialized: ${err.message}`));
      }
      // Woken by its schedule or its button, or back after a restart: its
      // ears went back to 0 (the first read is a baseline, as for events).
      if (
        rabbit.online &&
        !rabbit.status.sleeping &&
        (changes.sleepChanged || changes.wentOnline)
      ) {
        commands.afterRecalibration(ctx, rabbit);
      }
      if (changes.wentOffline) {
        logger.warn(`${rabbit.host} is unreachable: ${rabbit.lastError}`);
      }
      if (changes.wentOnline) {
        logger.info(`${rabbit.host} is back`);
      }
      const sceneEvents = buildSceneEvents(gladys, rabbit, changes);
      changed ||= sceneEvents.length > 0 || changes.identified;
      if (events) {
        for (const event of sceneEvents) {
          await gladys
            .publishSceneEvent(event.key, event.data)
            .catch((err) => logger.warn(`publishSceneEvent ${event.key} failed: ${err.message}`));
        }
      }
    }
    // A rabbit seen for the first time (or whose firmware gained the volume)
    // changes the discovery list.
    if (identified) {
      await publishDevices();
    }
    for (const rabbit of ctx.rabbits) {
      await ctx
        .publishStates(rabbit)
        .catch((err) => logger.warn(`publishStates failed: ${err.message}`));
    }
    await reportConnection();
    if (changed) {
      refreshWidgets(gladys);
    }
  }

  async function publishDevices() {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, ctx.rabbits, ctx.config));
  }

  // Application-level status of the Configuration screen.
  async function reportConnection() {
    const silent = ctx.rabbits.filter((rabbit) => !rabbit.online);
    const locked = silent
      .filter((rabbit) => rabbit.lastErrorKind === ERROR_KINDS.AUTH)
      .map((rabbit) => rabbit.host);
    const offline = silent
      .filter((rabbit) => rabbit.lastErrorKind !== ERROR_KINDS.AUTH)
      .map((rabbit) => rabbit.host);
    if (ctx.rabbits.length === 0) {
      await gladys.setConnectionStatus(false, {
        en: 'Enter the address of your rabbit.',
        fr: "Saisissez l'adresse de votre lapin.",
        de: 'Tragen Sie die Adresse Ihres Hasen ein.',
        es: 'Introduzca la dirección de su conejo.',
      });
    } else if (offline.length > 0) {
      const list = offline.join(', ').slice(0, 150);
      await gladys.setConnectionStatus(false, {
        en: `No answer from ${list}.`,
        fr: `Pas de réponse de ${list}.`,
        de: `Keine Antwort von ${list}.`,
        es: `Sin respuesta de ${list}.`,
      });
    } else if (locked.length > 0) {
      const list = locked.join(', ').slice(0, 150);
      await gladys.setConnectionStatus(false, {
        en: `${list}: check the web password.`,
        fr: `${list} : vérifiez le mot de passe web.`,
        de: `${list}: Prüfen Sie das Web-Passwort.`,
        es: `${list}: compruebe la contraseña web.`,
      });
    } else {
      await gladys.setConnectionStatus(true);
    }
  }

  /** Apply a configuration: keep the rabbits already known, read everything. */
  async function applyConfig(rawConfig) {
    ctx.config = normalizeConfig(rawConfig);
    const existing = new Map(ctx.rabbits.map((rabbit) => [rabbit.host, rabbit]));
    ctx.rabbits = ctx.config.hostList.map(
      (host) => existing.get(host) ?? createRabbit(host, createClient(host)),
    );
    await ctx.readAll();
    await publishDevices();
    refreshWidgets(gladys);
    startLoop();
  }

  function startLoop() {
    stopLoop();
    if (options.timers === false || ctx.rabbits.length === 0) {
      return;
    }
    timer = setInterval(() => ctx.readAll({ events: true }), ctx.config.poll_interval * 1000);
    // The loop alone must not keep the process alive at shutdown.
    timer.unref?.();
  }

  function stopLoop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function setValue(device, feature, value) {
    const rabbit = ctx.findRabbit(device.external_id);
    switch (featureKey(gladys, rabbit, feature.external_id)) {
      case FEATURES.AWAKE:
        return value === 1 ? commands.wake(ctx, rabbit) : commands.sleep(ctx, rabbit);
      case FEATURES.LED:
        return commands.switchLed(ctx, rabbit, value === 1);
      case FEATURES.LED_COLOR:
        return commands.setLed(ctx, rabbit, { color: value });
      case FEATURES.LED_PULSE:
        return commands.setLedPulse(ctx, rabbit, value === 1);
      case FEATURES.EAR_LEFT:
        return commands.moveEars(ctx, rabbit, { left: value });
      case FEATURES.EAR_RIGHT:
        return commands.moveEars(ctx, rabbit, { right: value });
      case FEATURES.EARS_RANDOM:
        return commands.randomEars(ctx, rabbit);
      case FEATURES.EARS_RESET:
        return commands.resetEars(ctx, rabbit);
      case FEATURES.NOTIFICATION:
        return commands.playNotification(ctx, rabbit, value);
      case FEATURES.VOLUME:
        return commands.setVolume(ctx, rabbit, value);
      default:
        throw new Error(`No command for ${feature.external_id}`);
    }
  }

  /** Register every handler. Call it BEFORE gladys.connect(). */
  function register() {
    gladys.onScanRequest(async () => {
      await ctx.readAll();
      await publishDevices();
    });

    gladys.onSetValue(async (device, feature, value) => {
      // A notification is the one-time URL of a voice clip: not for the logs.
      const shown = typeof value === 'string' ? '(text)' : value;
      logger.info(`onSetValue <- ${feature.external_id} = ${shown}`);
      await setValue(device, feature, value);
    });

    gladys.onGetImage((device) =>
      commands.captureCameraImage(ctx, ctx.findRabbit(device.external_id)),
    );

    for (const [key, handler] of Object.entries(ACTIONS)) {
      gladys.onAction(key, (fields) => handler(ctx, fields ?? {}));
    }
    for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
      gladys.onSceneAction(key, (fields) => handler(ctx, fields ?? {}));
    }
    for (const [key, widget] of Object.entries(WIDGETS)) {
      gladys.onWidgetGet(key, (request) => widget.get(ctx, request ?? {}));
      gladys.onWidgetAction(key, (actionKey, params, { settings, values } = {}) =>
        widget.action(ctx, { actionKey, params, settings, values }),
      );
    }
    gladys.onWidgetGetImage((imageKey) => getWidgetImage(ctx, imageKey));

    gladys.onConfigUpdated((newConfig) => applyConfig(newConfig));

    gladys.on('connected', async () => {
      try {
        // Once: a reconnection keeps what this process already knows.
        memoryLoaded ??= ctx.memory.load();
        await memoryLoaded;
        await applyConfig(await gladys.getConfig());
      } catch (err) {
        logger.error('Initialization failed', err);
        await gladys
          .setConnectionStatus(false, {
            en: 'Initialization failed, check the integration logs.',
            fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
            de: 'Die Initialisierung ist fehlgeschlagen, prüfen Sie die Logs der Integration.',
            es: 'La inicialización ha fallado, consulte los registros de la integración.',
          })
          .catch(() => {});
      }
    });
    gladys.on('disconnected', stopLoop);
    gladys.handleShutdown(stopLoop);
  }

  return { ctx, register, applyConfig, stopLoop };
}
