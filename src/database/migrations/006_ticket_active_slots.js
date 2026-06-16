export async function up(knex) {
  const activeTickets = await knex('tickets')
    .whereNotNull('active_key')
    .select('id', 'active_key');

  for (const ticket of activeTickets) {
    if (ticket.active_key.split(':').length === 3) {
      await knex('tickets')
        .where({ id: ticket.id })
        .update({ active_key: `${ticket.active_key}:1` });
    }
  }
}

export async function down(knex) {
  const activeTickets = await knex('tickets')
    .whereNotNull('active_key')
    .select('id', 'active_key');

  const restoredKeys = new Set();
  for (const ticket of activeTickets) {
    const originalKey = ticket.active_key.replace(/:\d+$/, '');
    await knex('tickets')
      .where({ id: ticket.id })
      .update({
        active_key: restoredKeys.has(originalKey) ? null : originalKey,
      });
    restoredKeys.add(originalKey);
  }
}
