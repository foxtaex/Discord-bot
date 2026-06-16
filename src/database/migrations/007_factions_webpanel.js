export async function up(knex) {
  await knex.schema.createTable('factions', (table) => {
    table.increments('id').primary();
    table.string('public_id', 36).notNullable().unique();
    table.string('guild_id', 32).notNullable().index();
    table.string('name', 100).notNullable();
    table.string('status', 32).notNullable().defaultTo('active');
    table.string('type', 32).notNullable().defaultTo('neutral');
    table.string('leader_id', 32).nullable();
    table.string('deputy_id', 32).nullable();
    table.string('discord_role_id', 32).nullable();
    table.string('channel_id', 32).nullable();
    table.text('description').nullable();
    table.text('notes').nullable();
    table.string('created_by', 64).nullable();
    table.string('updated_by', 64).nullable();
    table.timestamps(true, true);
    table.unique(['guild_id', 'name']);
  });

  await knex.schema.createTable('faction_members', (table) => {
    table.increments('id').primary();
    table.integer('faction_id').unsigned().notNullable().index();
    table.string('user_id', 32).notNullable();
    table.string('display_name', 100).nullable();
    table.string('position', 100).nullable();
    table.text('notes').nullable();
    table.string('added_by', 64).nullable();
    table.timestamps(true, true);
    table.unique(['faction_id', 'user_id']);
    table
      .foreign('faction_id')
      .references('factions.id')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('web_access_keys', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable().index();
    table.string('key_prefix', 16).notNullable().index();
    table.string('key_hash', 64).notNullable().unique();
    table.string('created_by', 32).notNullable();
    table.string('permission_level', 16).notNullable();
    table.text('permissions_json').notNullable();
    table.timestamp('expires_at').notNullable().index();
    table.timestamp('used_at').nullable();
    table.timestamp('revoked_at').nullable();
    table.timestamp('last_used_at').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('web_sessions', (table) => {
    table.increments('id').primary();
    table.integer('web_key_id').unsigned().notNullable().index();
    table.string('guild_id', 32).notNullable().index();
    table.string('user_id', 32).notNullable();
    table.string('permission_level', 16).notNullable();
    table.text('permissions_json').notNullable();
    table.string('session_hash', 64).notNullable().unique();
    table.string('csrf_hash', 64).notNullable();
    table.timestamp('expires_at').notNullable().index();
    table.timestamp('last_seen_at').nullable();
    table.timestamp('revoked_at').nullable();
    table.timestamps(true, true);
    table
      .foreign('web_key_id')
      .references('web_access_keys.id')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('webpanel_settings', (table) => {
    table.string('guild_id', 32).primary();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.text('settings_json').notNullable();
    table.string('updated_by', 64).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('user_permissions', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable().index();
    table.string('user_id', 32).notNullable();
    table.string('permission_level', 16).notNullable();
    table.text('permissions_json').notNullable();
    table.string('granted_by', 64).nullable();
    table.timestamps(true, true);
    table.unique(['guild_id', 'user_id']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_permissions');
  await knex.schema.dropTableIfExists('webpanel_settings');
  await knex.schema.dropTableIfExists('web_sessions');
  await knex.schema.dropTableIfExists('web_access_keys');
  await knex.schema.dropTableIfExists('faction_members');
  await knex.schema.dropTableIfExists('factions');
}
