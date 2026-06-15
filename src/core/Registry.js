import { Events, MessageFlags } from 'discord.js';
import { UserError } from './errors.js';

export class Registry {
  constructor(client, context) {
    this.client = client;
    this.context = context;
    this.commands = new Map();
    this.buttons = [];
    this.selects = [];
    this.modals = [];
    this.events = [];
  }

  registerCommand(command) {
    const name = command.data.name;
    if (this.commands.has(name)) {
      throw new Error(`Command "${name}" is already registered.`);
    }
    this.commands.set(name, command);
  }

  registerButton(prefix, handler) {
    this.buttons.push({ prefix, handler });
  }

  registerSelect(prefix, handler) {
    this.selects.push({ prefix, handler });
  }

  registerModal(prefix, handler) {
    this.modals.push({ prefix, handler });
  }

  registerEvent(name, handler, { once = false } = {}) {
    this.events.push({ name, handler, once });
  }

  attach() {
    this.client.on(Events.InteractionCreate, (interaction) =>
      this.handleInteraction(interaction),
    );

    for (const event of this.events) {
      const listener = (...args) =>
        Promise.resolve(event.handler(...args, this.context)).catch((error) =>
          this.context.logger.error(
            { error, event: event.name },
            'Discord event handler failed',
          ),
        );
      this.client[event.once ? 'once' : 'on'](event.name, listener);
    }
  }

  getCommandPayloads() {
    return [...this.commands.values()].map((command) => command.data.toJSON());
  }

  async handleInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = this.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, this.context);
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = this.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, this.context);
        }
        return;
      }

      const collection = interaction.isButton()
        ? this.buttons
        : interaction.isStringSelectMenu()
          ? this.selects
          : interaction.isModalSubmit()
            ? this.modals
            : [];
      const route = collection.find(({ prefix }) =>
        interaction.customId.startsWith(prefix),
      );
      if (route) await route.handler(interaction, this.context);
    } catch (error) {
      await this.handleInteractionError(interaction, error);
    }
  }

  async handleInteractionError(interaction, error) {
    const isUserError = error instanceof UserError;
    this.context.logger[isUserError ? 'warn' : 'error'](
      {
        error,
        interactionId: interaction.id,
        customId: interaction.customId,
        commandName: interaction.commandName,
      },
      'Interaction failed',
    );

    const payload = {
      content: isUserError
        ? error.message
        : 'Die Aktion konnte nicht abgeschlossen werden. Der Fehler wurde protokolliert.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => undefined);
    } else if (interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => undefined);
    }
  }
}
