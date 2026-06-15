import { UserError } from '../core/errors.js';

export class TicketCategoryService {
  constructor(configService) {
    this.configService = configService;
  }

  async list(guildId) {
    const config = await this.configService.get(guildId);
    return config.tickets.categories;
  }

  async add(guildId, category) {
    const categories = await this.list(guildId);
    if (categories.length >= 25) {
      throw new UserError(
        'Discord erlaubt maximal 25 Kategorien in einem Ticket-Dropdown.',
      );
    }
    if (categories.some((entry) => entry.key === category.key)) {
      throw new UserError(
        `Die Ticket-Kategorie \`${category.key}\` existiert bereits.`,
      );
    }

    const updated = [...categories, normalizeCategory(category)];
    await this.configService.replaceCategories(guildId, updated);
    return updated.at(-1);
  }

  async remove(guildId, key) {
    const categories = await this.list(guildId);
    const category = categories.find((entry) => entry.key === key);
    if (!category) {
      throw new UserError(`Die Ticket-Kategorie \`${key}\` existiert nicht.`);
    }

    await this.configService.replaceCategories(
      guildId,
      categories.filter((entry) => entry.key !== key),
    );
    return category;
  }
}

export function normalizeCategory(category) {
  return {
    key: category.key.toLowerCase(),
    label: category.label,
    description: category.description || '',
    emoji: category.emoji || '',
    parentCategoryId: category.parentCategoryId || '',
    supportRoleIds: category.supportRoleIds || [],
  };
}
