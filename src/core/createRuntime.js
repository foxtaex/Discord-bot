import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { loadConfig } from '../config/index.js';
import { createDatabase, migrateDatabase } from '../database/index.js';
import { GuildConfigRepository } from '../repositories/GuildConfigRepository.js';
import { FactionRepository } from '../repositories/FactionRepository.js';
import { LogRepository } from '../repositories/LogRepository.js';
import { TicketRepository } from '../repositories/TicketRepository.js';
import { TicketPanelRepository } from '../repositories/TicketPanelRepository.js';
import { VoiceCaseRepository } from '../repositories/VoiceCaseRepository.js';
import { WebAccessRepository } from '../repositories/WebAccessRepository.js';
import { ApiKeyService } from '../services/ApiKeyService.js';
import { AuditService } from '../services/AuditService.js';
import { GuildConfigService } from '../services/GuildConfigService.js';
import { FactionService } from '../services/FactionService.js';
import { PermissionService } from '../services/PermissionService.js';
import { resolveDiscordIntents } from '../services/DiscordIntentService.js';
import { WebAccessService } from '../services/WebAccessService.js';
import { createLogger } from './logger.js';
import { Registry } from './Registry.js';
import { loadModules } from './loadModules.js';

export function createGatewayIntents(discordConfig) {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ];

  if (discordConfig.guildMembersIntent) {
    intents.push(GatewayIntentBits.GuildMembers);
  }
  if (discordConfig.messageContentIntent) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  return intents;
}

export async function createRuntime({
  requireDiscord = true,
  runMigrations,
} = {}) {
  const config = await loadConfig({ requireDiscord });
  const logger = createLogger(config.runtime.logLevel);
  if (requireDiscord) {
    config.discord = await resolveDiscordIntents(config.discord, logger);
  }
  const database = await createDatabase(config.database, logger);
  if (runMigrations ?? config.runtime.autoMigrate) {
    await migrateDatabase(database, logger);
  }

  const client = new Client({
    intents: createGatewayIntents(config.discord),
    partials: [
      Partials.Channel,
      Partials.GuildMember,
      Partials.Message,
      Partials.User,
    ],
  });

  const guildConfigRepository = new GuildConfigRepository(database);
  const factionRepository = new FactionRepository(database);
  const ticketRepository = new TicketRepository(database);
  const ticketPanelRepository = new TicketPanelRepository(database);
  const voiceCaseRepository = new VoiceCaseRepository(database);
  const webAccessRepository = new WebAccessRepository(database);
  const logRepository = new LogRepository(database);
  const configService = new GuildConfigService(
    guildConfigRepository,
    config.defaults,
  );
  const permissionService = new PermissionService();
  const apiKeyService = new ApiKeyService(database, config.api.masterKey);
  const services = {};
  const context = {
    config,
    logger,
    database,
    client,
    services,
    guildConfigRepository,
    factionRepository,
    ticketRepository,
    ticketPanelRepository,
    voiceCaseRepository,
    webAccessRepository,
    logRepository,
    configService,
    permissionService,
    apiKeyService,
  };
  const auditService = new AuditService({ ...context, logRepository });
  context.auditService = auditService;
  const factionService = new FactionService({
    factionRepository,
    auditService,
  });
  const webAccessService = new WebAccessService({
    webAccessRepository,
    auditService,
  });
  context.factionService = factionService;
  context.webAccessService = webAccessService;
  services.factions = factionService;
  services.webAccess = webAccessService;

  const registry = new Registry(client, context);
  const modules = await loadModules(registry, context);
  registry.attach();

  return { ...context, registry, modules };
}
