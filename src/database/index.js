import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import knex from 'knex';

export async function createDatabase(config, logger) {
  if (config.client === 'sqlite') {
    await mkdir(path.dirname(config.filename), { recursive: true });
  }

  const database = knex({
    client: config.client === 'sqlite' ? 'better-sqlite3' : 'mysql2',
    connection:
      config.client === 'sqlite'
        ? { filename: config.filename }
        : {
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            charset: 'utf8mb4',
          },
    useNullAsDefault: config.client === 'sqlite',
    pool:
      config.client === 'sqlite'
        ? {
            min: 1,
            max: 1,
            afterCreate(connection, done) {
              connection.pragma('journal_mode = WAL');
              connection.pragma('foreign_keys = ON');
              done(null, connection);
            },
          }
        : { min: 2, max: 10 },
    migrations: {
      directory: path.resolve(process.cwd(), 'src/database/migrations'),
      extension: 'js',
      loadExtensions: ['.js'],
    },
  });

  database.on('query-error', (error, query) => {
    logger.error({ error, sql: query.sql }, 'Database query failed');
  });

  return database;
}

export async function migrateDatabase(database, logger) {
  const [batch, migrations] = await database.migrate.latest();
  logger.info({ batch, migrations }, 'Database migrations completed');
}
