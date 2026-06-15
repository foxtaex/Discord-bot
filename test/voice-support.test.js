import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSupportService } from '../src/services/VoiceSupportService.js';

test('voice reconciliation creates cases for non-bot waiting members', async () => {
  const createdFor = [];
  const service = new VoiceSupportService({
    client: {},
    configService: {},
    voiceCaseRepository: {},
    permissionService: {},
    auditService: {},
    logger: { warn() {} },
  });
  service.ensureCase = async (member) => {
    createdFor.push(member.id);
    return { userId: member.id };
  };

  const channel = {
    isVoiceBased: () => true,
    members: new Map([
      ['user', { id: 'user', user: { bot: false } }],
      ['bot', { id: 'bot', user: { bot: true } }],
    ]),
  };
  const guild = {
    id: 'guild',
    channels: { fetch: async () => channel },
  };
  const cases = await service.reconcileGuild(guild, {
    voiceSupport: {
      enabled: true,
      waitingChannelId: 'waiting',
    },
  });

  assert.deepEqual(createdFor, ['user']);
  assert.equal(cases.length, 1);
});

test('leaving an active private support room closes the case', async () => {
  const closed = [];
  const voiceCase = {
    id: 7,
    userId: 'user',
    activeKey: 'guild:user',
    status: 'active',
  };
  const service = new VoiceSupportService({
    client: {},
    configService: {},
    voiceCaseRepository: {
      findBySupportChannel: async (channelId) =>
        channelId === 'support' ? voiceCase : null,
    },
    permissionService: {},
    auditService: {},
    logger: { warn() {} },
  });
  service.close = async (foundCase, actor, options) => {
    closed.push({ foundCase, actor, options });
  };

  await service.handleVoiceState(
    {
      channelId: 'support',
      member: { id: 'user', user: { bot: false } },
    },
    {
      channelId: null,
      guild: { id: 'guild' },
      member: { id: 'user', user: { bot: false } },
    },
  );

  assert.deepEqual(closed, [
    {
      foundCase: voiceCase,
      actor: 'user_left_support_room',
      options: { system: true },
    },
  ]);
});

test('supporter leaving does not close the user case', async () => {
  let closed = false;
  const service = new VoiceSupportService({
    client: {},
    configService: {},
    voiceCaseRepository: {
      findBySupportChannel: async () => ({
        userId: 'user',
        activeKey: 'guild:user',
        status: 'active',
      }),
    },
    permissionService: {},
    auditService: {},
    logger: { warn() {} },
  });
  service.close = async () => {
    closed = true;
  };

  await service.handleVoiceState(
    {
      channelId: 'support',
      member: { id: 'supporter', user: { bot: false } },
    },
    {
      channelId: null,
      guild: { id: 'guild' },
      member: { id: 'supporter', user: { bot: false } },
    },
  );

  assert.equal(closed, false);
});

test('claim moves the user, stores the supporter and returns a join link', async () => {
  const updates = [];
  const auditLogs = [];
  let movedTo = null;
  const invite = {
    code: 'join123',
    url: 'https://discord.gg/join123',
    delete: async () => {},
  };
  const supportChannel = {
    id: 'support',
    isVoiceBased: () => true,
    createInvite: async () => invite,
  };
  const targetMember = {
    voice: {
      channelId: 'waiting',
      setChannel: async (channel) => {
        movedTo = channel.id;
      },
    },
  };
  const guild = {
    members: { fetch: async () => targetMember },
    channels: { fetch: async () => supportChannel },
    invites: { fetch: async () => null },
  };
  const service = new VoiceSupportService({
    client: { guilds: { fetch: async () => guild } },
    configService: {
      get: async () => ({ voiceSupport: { supportRoleIds: [] } }),
    },
    voiceCaseRepository: {
      database: { fn: { now: () => 'now' } },
      update: async (_id, changes) => {
        updates.push(changes);
        return { id: 1, ...changes };
      },
    },
    permissionService: { canVoiceSupport: () => true },
    auditService: {
      write: async (entry) => auditLogs.push(entry),
    },
    logger: { warn() {} },
  });

  const result = await service.claimAndMove(
    {
      id: 1,
      guildId: 'guild',
      userId: 'user',
      supportChannelId: 'support',
      status: 'waiting',
      activeKey: 'guild:user',
      claimedBy: null,
      claimedAt: null,
      inviteCode: null,
    },
    { id: 'supporter', user: { tag: 'Supporter' } },
  );

  assert.equal(movedTo, 'support');
  assert.equal(result.inviteUrl, 'https://discord.gg/join123');
  assert.equal(updates[0].claimed_by, 'supporter');
  assert.equal(updates[0].status, 'active');
  assert.equal(updates[0].invite_code, 'join123');
  assert.equal(auditLogs[0].context.supporterId, 'supporter');
});

test('closing a voice case revokes its invite before deleting the room', async () => {
  const operations = [];
  const guild = {
    channels: {
      fetch: async () => ({
        delete: async () => operations.push('channel-deleted'),
      }),
    },
    invites: {
      fetch: async () => ({
        delete: async () => operations.push('invite-deleted'),
      }),
    },
  };
  const service = new VoiceSupportService({
    client: { guilds: { fetch: async () => guild } },
    configService: {
      get: async () => ({
        voiceSupport: {
          supportRoleIds: [],
          deleteRoomOnClose: true,
        },
      }),
    },
    voiceCaseRepository: {
      database: { fn: { now: () => 'now' } },
      update: async (_id, changes) => changes,
    },
    permissionService: {},
    auditService: { write: async () => {} },
    logger: { warn() {} },
  });

  const result = await service.close(
    {
      id: 1,
      guildId: 'guild',
      userId: 'user',
      supportChannelId: 'support',
      status: 'active',
      inviteCode: 'join123',
    },
    'user_left_support_room',
    { system: true },
  );

  assert.deepEqual(operations, ['invite-deleted', 'channel-deleted']);
  assert.equal(result.invite_code, null);
});

test('a stale active case without a channel is released before replacement', async () => {
  const updates = [];
  const created = [];
  let activeLookupCount = 0;
  const repository = {
    database: { fn: { now: () => 'now' } },
    findActive: async () => {
      activeLookupCount += 1;
      return activeLookupCount === 1
        ? {
            id: 4,
            status: 'waiting',
            supportChannelId: 'missing',
          }
        : null;
    },
    update: async (_id, changes) => {
      updates.push(changes);
      return changes;
    },
    create: async (data) => {
      created.push(data);
      throw new Error('stop-after-create');
    },
  };
  const service = new VoiceSupportService({
    client: {},
    configService: {},
    voiceCaseRepository: repository,
    permissionService: {},
    auditService: { write: async () => {} },
    logger: { warn() {} },
  });
  const member = {
    id: 'user',
    guild: {
      id: 'guild',
      channels: { fetch: async () => null },
    },
  };

  await assert.rejects(
    service.ensureCase(member, {
      voiceSupport: {
        waitingChannelId: 'waiting',
        notificationChannelId: 'notifications',
      },
    }),
    /stop-after-create/,
  );

  assert.equal(updates[0].active_key, null);
  assert.equal(updates[0].status, 'failed');
  assert.equal(created.length, 1);
});
