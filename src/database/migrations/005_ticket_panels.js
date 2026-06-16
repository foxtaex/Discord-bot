export async function up(knex) {
  await knex.schema.createTable('ticket_panels', (table) => {
    table.increments('id').primary();
    table.string('guild_id', 32).notNullable().index();
    table.string('channel_id', 32).notNullable();
    table.string('message_id', 32).notNullable().unique();
    table.string('created_by', 32).nullable();
    table.timestamps(true, true);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ticket_panels');
}
