import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const booleanFromEnv = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  },
  z.boolean(),
);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().default(''),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_GUILD_ID: z.string().optional().default(''),
  DISCORD_GUILD_MEMBERS_INTENT: booleanFromEnv.default(false),
  DISCORD_MESSAGE_CONTENT_INTENT: booleanFromEnv.default(false),
  DISCORD_AUTO_DEPLOY_COMMANDS: booleanFromEnv.default(true),
  DB_CLIENT: z.enum(['sqlite', 'mysql2']).default('sqlite'),
  DB_FILENAME: z.string().default('./data/bot.sqlite'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().default('discord_bot'),
  DB_USER: z.string().default('discord_bot'),
  DB_PASSWORD: z.string().default(''),
  API_ENABLED: booleanFromEnv.default(true),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(6767),
  API_MASTER_KEY: z.string().default(''),
  API_CORS_ORIGINS: z.string().default(''),
  API_RATE_LIMIT: z.coerce.number().int().positive().default(120),
  WEB_PANEL_PUBLIC_URL: z.string().default(''),
  WEB_PANEL_COOKIE_SECURE: booleanFromEnv.default(false),
  LOG_LEVEL: z.string().default('info'),
  AUTO_MIGRATE: booleanFromEnv.default(true),
  INSTANCE_ID: z.string().default(''),
  INSTANCE_ROLE: z.enum(['primary', 'worker']).default('primary'),
  CONFIG_FILE: z.string().default('./config/defaults.json'),
});

const fileConfigSchema = z.object({
  locale: z.string().default('de'),
  branding: z.object({
    name: z.string(),
    color: z.string(),
    footer: z.string(),
  }),
  welcome: z.object({
    enabled: z.boolean(),
    channelId: z.string(),
    message: z.string(),
    title: z.string(),
    color: z.string(),
    backgroundUrl: z.string(),
    imageEnabled: z.boolean(),
  }),
  tickets: z.object({
    enabled: z.boolean(),
    categoryId: z.string(),
    archiveCategoryId: z.string(),
    logChannelId: z.string(),
    supportRoleIds: z.array(z.string()),
    maxActivePerCategory: z.number().int().min(1).max(10).default(3),
    transcriptsEnabled: z.boolean(),
    transcriptMaxMessages: z.number().int().positive(),
    panel: z.object({
      title: z.string(),
      description: z.string(),
      placeholder: z.string(),
    }),
    categories: z.array(
      z.object({
        key: z.string().regex(/^[a-z0-9_-]+$/),
        label: z.string(),
        description: z.string(),
        emoji: z.string().optional().default(''),
        supportRoleIds: z.array(z.string()).default([]),
        parentCategoryId: z.string().optional().default(''),
      }),
    ),
  }),
  voiceSupport: z.object({
    enabled: z.boolean(),
    waitingChannelId: z.string(),
    categoryId: z.string(),
    notificationChannelId: z.string(),
    supportRoleIds: z.array(z.string()),
    roomName: z.string(),
    deleteRoomOnClose: z.boolean(),
    categories: z
      .array(
        z.object({
          key: z.string().regex(/^[a-z0-9_-]+$/),
          label: z.string(),
          waitingChannelId: z.string(),
          parentCategoryId: z.string().optional().default(''),
          notificationChannelId: z.string().optional().default(''),
          supportRoleIds: z.array(z.string()).default([]),
          roomName: z.string().optional().default(''),
        }),
      )
      .default([]),
  }),
  factions: z
    .object({
      enabled: z.boolean().default(true),
      color: z.string().default('#F1C40F'),
    })
    .default({ enabled: true, color: '#F1C40F' }),
});

export function validateGuildConfig(value) {
  return fileConfigSchema.parse(value);
}

export async function loadConfig({ requireDiscord = true } = {}) {
  const env = envSchema.parse(process.env);
  if (requireDiscord && (!env.DISCORD_TOKEN || !env.DISCORD_CLIENT_ID)) {
    throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be configured.');
  }
  const configPath = path.resolve(process.cwd(), env.CONFIG_FILE);
  const fileContents = await readFile(configPath, 'utf8');
  const defaults = validateGuildConfig(JSON.parse(fileContents));

  return {
    discord: {
      token: env.DISCORD_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_GUILD_ID || null,
      guildMembersIntent: env.DISCORD_GUILD_MEMBERS_INTENT,
      messageContentIntent: env.DISCORD_MESSAGE_CONTENT_INTENT,
      autoDeployCommands: env.DISCORD_AUTO_DEPLOY_COMMANDS,
    },
    database: {
      client: env.DB_CLIENT,
      filename: path.resolve(process.cwd(), env.DB_FILENAME),
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    api: {
      enabled: env.API_ENABLED,
      host: env.API_HOST,
      port: env.API_PORT,
      masterKey: env.API_MASTER_KEY,
      corsOrigins: env.API_CORS_ORIGINS
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      rateLimit: env.API_RATE_LIMIT,
      webPanelPublicUrl:
        env.WEB_PANEL_PUBLIC_URL ||
        `http://${env.API_HOST}:${env.API_PORT}/panel`,
      webPanelCookieSecure: env.WEB_PANEL_COOKIE_SECURE,
    },
    runtime: {
      logLevel: env.LOG_LEVEL,
      autoMigrate: env.AUTO_MIGRATE,
      instanceId: env.INSTANCE_ID || null,
      instanceRole: env.INSTANCE_ROLE,
    },
    defaults,
  };
}
