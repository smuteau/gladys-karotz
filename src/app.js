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
import { createKarotzClient } from './karotz/client.js';
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
 *   createClient?: (host: string) => object }} [options]
 */
export function createApp(gladys, options = {}) {
  const logger = createLogger({ name: 'karotz' });
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const createClient =
    options.createClient ?? ((host) => createKarotzClient(host, { fetch: fetchImpl }));

  let timer = null;
  // Reads never overlap: a slow rabbit must not pile requests up.
  let reading = Promise.resolve();

  const ctx = {
    gladys,
    logger,
    fetch: fetchImpl,
    sleepMs: options.sleepMs ?? defaultSleepMs,
    config: normalizeConfig(),
    /** @type {ReturnType<typeof createRabbit>[]} */
    rabbits: [],

    /**
     * The rabbit behind a device external id (rabbit or camera). Without an
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
      await readRabbit(rabbit);
      await ctx.publishStates(rabbit);
      refreshWidgets(gladys);
    },

    /** One pass of the reading loop over every rabbit. */
    readAll({ events = false } = {}) {
      reading = reading.then(() => readAllNow(events)).catch((err) => logger.error(err));
      return reading;
    },
  };

  async function readAllNow(events) {
    let changed = false;
    let identified = false;
    for (const rabbit of ctx.rabbits) {
      const changes = await readRabbit(rabbit);
      identified ||= changes.identified;
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
    const offline = ctx.rabbits.filter((rabbit) => !rabbit.online).map((rabbit) => rabbit.host);
    if (ctx.rabbits.length === 0) {
      await gladys.setConnectionStatus(false, {
        en: 'Enter the address of your rabbit.',
        fr: "Saisissez l'adresse de votre lapin.",
      });
    } else if (offline.length > 0) {
      const list = offline.join(', ').slice(0, 150);
      await gladys.setConnectionStatus(false, {
        en: `No answer from ${list}.`,
        fr: `Pas de réponse de ${list}.`,
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
        return commands.setLed(ctx, rabbit, { pulse: value === 1 });
      case FEATURES.EAR_LEFT:
        return commands.moveEars(ctx, rabbit, { left: value });
      case FEATURES.EAR_RIGHT:
        return commands.moveEars(ctx, rabbit, { right: value });
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
      logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
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
        await applyConfig(await gladys.getConfig());
      } catch (err) {
        logger.error('Initialization failed', err);
        await gladys
          .setConnectionStatus(false, {
            en: 'Initialization failed, check the integration logs.',
            fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          })
          .catch(() => {});
      }
    });
    gladys.on('disconnected', stopLoop);
    gladys.handleShutdown(stopLoop);
  }

  return { ctx, register, applyConfig, stopLoop };
}
