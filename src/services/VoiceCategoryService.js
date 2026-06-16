import { UserError } from '../core/errors.js';

export class VoiceCategoryService {
  constructor(configService) {
    this.configService = configService;
  }

  async list(guildId) {
    const config = await this.configService.get(guildId);
    return config.voiceSupport.categories;
  }

  async add(guildId, category) {
    const categories = await this.list(guildId);
    if (categories.some((entry) => entry.key === category.key)) {
      throw new UserError(
        `Die Voice-Kategorie \`${category.key}\` existiert bereits.`,
      );
    }
    this.assertWaitingChannelAvailable(categories, category.waitingChannelId);

    const updated = [...categories, normalizeVoiceCategory(category)];
    await this.configService.replaceVoiceCategories(guildId, updated);
    return updated.at(-1);
  }

  async update(guildId, key, changes) {
    const categories = await this.list(guildId);
    const index = categories.findIndex((entry) => entry.key === key);
    if (index === -1) {
      throw new UserError(`Die Voice-Kategorie \`${key}\` existiert nicht.`);
    }

    const updatedCategory = normalizeVoiceCategory({
      ...categories[index],
      ...changes,
      key,
    });
    this.assertWaitingChannelAvailable(
      categories,
      updatedCategory.waitingChannelId,
      key,
    );
    const updated = categories.toSpliced(index, 1, updatedCategory);
    await this.configService.replaceVoiceCategories(guildId, updated);
    return updatedCategory;
  }

  async remove(guildId, key) {
    const categories = await this.list(guildId);
    const category = categories.find((entry) => entry.key === key);
    if (!category) {
      throw new UserError(`Die Voice-Kategorie \`${key}\` existiert nicht.`);
    }

    await this.configService.replaceVoiceCategories(
      guildId,
      categories.filter((entry) => entry.key !== key),
    );
    return category;
  }

  assertWaitingChannelAvailable(categories, waitingChannelId, currentKey) {
    const duplicate = categories.find(
      (entry) =>
        entry.waitingChannelId === waitingChannelId &&
        entry.key !== currentKey,
    );
    if (duplicate) {
      throw new UserError(
        `Der Warteraum wird bereits von \`${duplicate.key}\` verwendet.`,
      );
    }
  }
}

export function normalizeVoiceCategory(category) {
  if (!category.label?.trim()) {
    throw new UserError('Die Voice-Kategorie benoetigt einen Namen.');
  }
  if (!category.waitingChannelId) {
    throw new UserError('Die Voice-Kategorie benoetigt einen Warteraum.');
  }

  return {
    key: category.key.toLowerCase(),
    label: category.label.trim(),
    waitingChannelId: category.waitingChannelId,
    parentCategoryId: category.parentCategoryId || '',
    notificationChannelId: category.notificationChannelId || '',
    supportRoleIds: category.supportRoleIds || [],
    roomName: category.roomName || '',
  };
}
