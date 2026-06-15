import { loadConfig } from '../src/config/index.js';
import { createLogger } from '../src/core/logger.js';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { ApiKeyService } from '../src/services/ApiKeyService.js';

const args = parseArgs(process.argv.slice(2));
if (!args.name) {
  console.error(
    'Usage: npm run api:key -- --name integration --permissions messages:write,tickets:read --guilds 123',
  );
  process.exitCode = 1;
} else {
  const config = await loadConfig({ requireDiscord: false });
  const logger = createLogger(config.runtime.logLevel);
  const database = await createDatabase(config.database, logger);

  try {
    await migrateDatabase(database, logger);
    const service = new ApiKeyService(database);
    const created = await service.create({
      name: args.name,
      permissions: split(args.permissions),
      allowedGuildIds: split(args.guilds),
    });
    console.log(`API key created: ${created.apiKey}`);
    console.log('Store it now; only its hash is persisted.');
  } finally {
    await database.destroy();
  }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    result[rawKey] = inlineValue ?? values[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return result;
}

function split(value = '') {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
