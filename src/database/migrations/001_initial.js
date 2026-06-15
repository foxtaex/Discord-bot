export async function up(knex) {
  await knex.schema.createTable('guild_configs', (table) => {
    table.string('guild_id', 32).primary();
    table.text('config_json').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('ticket_categories', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable().index();
    table.string('category_key', 64).notNullable();
    table.string('label', 100).notNullable();
    table.string('description', 100).notNullable().defaultTo('');
    table.string('emoji', 100).notNullable().defaultTo('');
    table.string('parent_category_id', 32).nullable();
    table.text('support_role_ids').notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(['guild_id', 'category_key']);
  });

  await knex.schema.createTable('tickets', (table) => {
    table.increments('id').primary();
    table.string('public_id', 36).notNullable().unique();
    table.string('guild_id', 32).notNullable().index();
    table.string('channel_id', 32).nullable().unique();
    table.string('user_id', 32).notNullable().index();
    table.string('category_key', 64).notNullable();
    table.string('status', 24).notNullable().index();
    table.string('active_key', 160).nullable().unique();
    table.string('claimed_by', 32).nullable();
    table.string('closed_by', 32).nullable();
    table.string('deleted_by', 32).nullable();
    table.text('transcript_path').nullable();
    table.text('metadata_json').nullable();
    table.timestamp('closed_at').nullable();
    table.timestamp('deleted_at').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('ticket_actions', (table) => {
    table.increments('id').primary();
    table.integer('ticket_id').unsigned().notNullable().index();
    table.string('action', 40).notNullable();
    table.string('actor_id', 32).nullable();
    table.text('details_json').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table
      .foreign('ticket_id')
      .references('tickets.id')
      .onDelete('CASCADE');
  });

  await knex.schema.createTable('voice_cases', (table) => {
    table.increments('id').primary();
    table.string('public_id', 36).notNullable().unique();
    table.string('guild_id', 32).notNullable().index();
    table.string('user_id', 32).notNullable().index();
    table.string('waiting_channel_id', 32).notNullable();
    table.string('support_channel_id', 32).nullable().unique();
    table.string('notification_channel_id', 32).nullable();
    table.string('status', 24).notNullable().index();
    table.string('active_key', 100).nullable().unique();
    table.string('claimed_by', 32).nullable();
    table.string('closed_by', 32).nullable();
    table.timestamp('claimed_at').nullable();
    table.timestamp('moved_at').nullable();
    table.timestamp('closed_at').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('api_keys', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('key_prefix', 16).notNullable().index();
    table.string('key_hash', 64).notNullable().unique();
    table.text('permissions_json').notNullable();
    table.text('allowed_guild_ids').notNullable();
    table.boolean('revoked').notNullable().defaultTo(false);
    table.timestamp('last_used_at').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('application_logs', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).nullable().index();
    table.string('level', 16).notNullable();
    table.string('source', 64).notNullable();
    table.text('message').notNullable();
    table.text('context_json').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bot_instances', (table) => {
    table.string('instance_id', 64).primary();
    table.string('role', 16).notNullable();
    table.string('hostname', 255).nullable();
    table.text('metadata_json').nullable();
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('heartbeat_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('bot_instances');
  await knex.schema.dropTableIfExists('application_logs');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('voice_cases');
  await knex.schema.dropTableIfExists('ticket_actions');
  await knex.schema.dropTableIfExists('tickets');
  await knex.schema.dropTableIfExists('ticket_categories');
  await knex.schema.dropTableIfExists('guild_configs');
}
