import { loadConfig } from '../src/config/index.js';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { createLogger } from '../src/core/logger.js';

const config = await loadConfig({ requireDiscord: false });
const logger = createLogger(config.runtime.logLevel);
const database = await createDatabase(config.database, logger);

try {
  await migrateDatabase(database, logger);
} finally {
  await database.destroy();
}
