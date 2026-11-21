// -----------------------------------------------------------------------------
// Entry point of the Karotz integration for Gladys.
//
// SDK wiring only: everything else lives in src/ (see CLAUDE.md for the map).
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { DEFAULT_MEMORY_FILE } from './src/memory.js';

const gladys = new GladysIntegration();

// Handlers are registered BEFORE connect().
createApp(gladys, { memoryFile: process.env.KAROTZ_MEMORY_FILE ?? DEFAULT_MEMORY_FILE }).register();

logger.info('Starting the Karotz integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
