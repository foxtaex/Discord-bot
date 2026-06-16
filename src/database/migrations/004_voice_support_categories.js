export async function up(knex) {
  await knex.schema.createTable('voice_support_categories', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable().index();
    table.string('category_key', 64).notNullable();
    table.string('label', 100).notNullable();
    table.string('waiting_channel_id', 32).notNullable();
    table.string('parent_category_id', 32).nullable();
    table.string('notification_channel_id', 32).nullable();
    table.text('support_role_ids').notNullable();
    table.string('room_name', 100).notNullable().defaultTo('');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(['guild_id', 'category_key']);
    table.unique(['guild_id', 'waiting_channel_id']);
  });

  await knex.schema.alterTable('voice_cases', (table) => {
    table.string('voice_category_key', 64).nullable().index();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('voice_cases', (table) => {
    table.dropColumn('voice_category_key');
  });
  await knex.schema.dropTableIfExists('voice_support_categories');
}
