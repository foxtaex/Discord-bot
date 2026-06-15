import { PermissionFlagsBits } from 'discord.js';
import { hasAnyRole } from '../utils/discord.js';

export class PermissionService {
  isAdministrator(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }

  canManageGuild(member) {
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  }

  canTicketSupport(member, roleIds = []) {
    return (
      this.isAdministrator(member) ||
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      hasAnyRole(member, roleIds)
    );
  }

  canVoiceSupport(member, roleIds = []) {
    return (
      this.isAdministrator(member) ||
      member.permissions.has(PermissionFlagsBits.MoveMembers) ||
      hasAnyRole(member, roleIds)
    );
  }
}
