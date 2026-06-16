import { UserError } from '../core/errors.js';

export const FACTION_STATUSES = [
  'active',
  'inactive',
  'recruiting',
  'closed',
];
export const FACTION_TYPES = ['state', 'legal', 'illegal', 'neutral'];

export class FactionService {
  constructor({ factionRepository, auditService }) {
    this.factionRepository = factionRepository;
    this.auditService = auditService;
  }

  async create(guildId, input, actorId) {
    const faction = normalizeFaction(input);
    if (await this.factionRepository.findByName(guildId, faction.name)) {
      throw new UserError(`Die Fraktion "${faction.name}" existiert bereits.`);
    }
    const created = await this.factionRepository.create(
      guildId,
      faction,
      actorId,
    );
    await this.log(guildId, actorId, 'created', created);
    return created;
  }

  async update(guildId, identifier, changes, actorId) {
    const faction = await this.resolve(guildId, identifier);
    const normalized = normalizeFactionChanges(changes);
    const updated = await this.factionRepository.update(
      faction.id,
      normalized,
      actorId,
    );
    await this.log(guildId, actorId, 'updated', updated);
    return updated;
  }

  async remove(guildId, identifier, actorId) {
    const faction = await this.resolve(guildId, identifier);
    await this.factionRepository.delete(faction.id);
    await this.log(guildId, actorId, 'deleted', faction);
    return faction;
  }

  async list(guildId) {
    return this.factionRepository.list(guildId);
  }

  async get(guildId, identifier) {
    return this.resolve(guildId, identifier);
  }

  async addMember(guildId, identifier, member, actorId) {
    const faction = await this.resolve(guildId, identifier);
    const updated = await this.factionRepository.addMember(
      faction.id,
      member,
      actorId,
    );
    await this.auditService.write({
      guildId,
      source: 'factions',
      message: `Mitglied ${member.userId} wurde zu ${faction.name} hinzugefuegt.`,
      context: { factionId: faction.publicId, actorId, userId: member.userId },
    });
    return updated;
  }

  async removeMember(guildId, identifier, userId, actorId) {
    const faction = await this.resolve(guildId, identifier);
    const updated = await this.factionRepository.removeMember(
      faction.id,
      userId,
    );
    await this.auditService.write({
      guildId,
      source: 'factions',
      message: `Mitglied ${userId} wurde aus ${faction.name} entfernt.`,
      context: { factionId: faction.publicId, actorId, userId },
    });
    return updated;
  }

  async resolve(guildId, identifier) {
    let faction = null;
    if (/^\d+$/.test(String(identifier))) {
      faction = await this.factionRepository.findById(Number(identifier));
    }
    faction ||= await this.factionRepository.findByPublicId(identifier);
    faction ||= await this.factionRepository.findByName(guildId, identifier);
    if (!faction || faction.guildId !== guildId) {
      throw new UserError('Fraktion nicht gefunden.', 'NOT_FOUND', 404);
    }
    return faction;
  }

  async log(guildId, actorId, action, faction) {
    await this.auditService.write({
      guildId,
      source: 'factions',
      message: `Fraktion ${faction.name} wurde ${action}.`,
      context: { factionId: faction.publicId, actorId },
    });
  }
}

function normalizeFaction(input) {
  const faction = normalizeFactionChanges(input);
  if (!faction.name) throw new UserError('Ein Fraktionsname ist erforderlich.');
  return {
    status: 'active',
    type: 'neutral',
    ...faction,
  };
}

function normalizeFactionChanges(input) {
  const result = { ...input };
  if ('name' in result) result.name = result.name.trim();
  if (result.status && !FACTION_STATUSES.includes(result.status)) {
    throw new UserError('Ungueltiger Fraktionsstatus.');
  }
  if (result.type && !FACTION_TYPES.includes(result.type)) {
    throw new UserError('Ungueltiger Fraktionstyp.');
  }
  return result;
}
