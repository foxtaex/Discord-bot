export async function up(knex) {
  await knex.schema.alterTable('voice_cases', (table) => {
    table.string('invite_code', 32).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable('voice_cases', (table) => {
    table.dropColumn('invite_code');
  });
}
