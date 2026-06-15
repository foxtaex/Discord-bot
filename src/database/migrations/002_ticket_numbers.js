import { randomInt } from 'node:crypto';

export async function up(knex) {
  await knex.schema.alterTable('tickets', (table) => {
    table.string('ticket_number', 6).nullable().unique();
  });

  const tickets = await knex('tickets').select('id');
  const assigned = new Set();

  for (const ticket of tickets) {
    let ticketNumber;
    do {
      ticketNumber = String(randomInt(100000, 1000000));
    } while (assigned.has(ticketNumber));

    assigned.add(ticketNumber);
    await knex('tickets')
      .where({ id: ticket.id })
      .update({ ticket_number: ticketNumber });
  }
}

export async function down(knex) {
  await knex.schema.alterTable('tickets', (table) => {
    table.dropUnique(['ticket_number']);
    table.dropColumn('ticket_number');
  });
}
