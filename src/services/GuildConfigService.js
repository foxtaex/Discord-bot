import { deepMerge } from '../utils/object.js';
import { validateGuildConfig } from '../config/index.js';

export class GuildConfigService {
  constructor(repository, defaults, { cacheTtlMs = 60_000 } = {}) {
    this.repository = repository;
    this.defaults = defaults;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
  }

  async get(guildId, { refresh = false } = {}) {
    const cached = this.cache.get(guildId);
    if (!refresh && cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const override = (await this.repository.find(guildId)) || {};
    const config = validateGuildConfig(deepMerge(this.defaults, override));
    const databaseCategories = await this.repository.listCategories(guildId);
    if (databaseCategories.length > 0) {
      config.tickets.categories = databaseCategories;
    }
    const databaseVoiceCategories =
      await this.repository.listVoiceCategories(guildId);
    if (databaseVoiceCategories.length > 0) {
      config.voiceSupport.categories = databaseVoiceCategories;
    }
    validateGuildConfig(config);

    this.cache.set(guildId, {
      value: config,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return config;
  }

  async update(guildId, patch) {
    const currentOverride = (await this.repository.find(guildId)) || {};
    const nextOverride = deepMerge(currentOverride, patch);
    validateGuildConfig(deepMerge(this.defaults, nextOverride));
    await this.repository.upsert(guildId, nextOverride);
    this.cache.delete(guildId);
    return this.get(guildId, { refresh: true });
  }

  async replaceCategories(guildId, categories) {
    const current = await this.get(guildId);
    validateGuildConfig(
      deepMerge(current, { tickets: { categories } }),
    );
    await this.repository.replaceCategories(guildId, categories);
    const currentOverride = (await this.repository.find(guildId)) || {};
    await this.repository.upsert(
      guildId,
      deepMerge(currentOverride, { tickets: { categories } }),
    );
    this.cache.delete(guildId);
    return this.get(guildId, { refresh: true });
  }

  async replaceVoiceCategories(guildId, categories) {
    const current = await this.get(guildId);
    validateGuildConfig(
      deepMerge(current, { voiceSupport: { categories } }),
    );
    await this.repository.replaceVoiceCategories(guildId, categories);
    const currentOverride = (await this.repository.find(guildId)) || {};
    await this.repository.upsert(
      guildId,
      deepMerge(currentOverride, { voiceSupport: { categories } }),
    );
    this.cache.delete(guildId);
    return this.get(guildId, { refresh: true });
  }

  clear(guildId) {
    this.cache.delete(guildId);
  }
}
