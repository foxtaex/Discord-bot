import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { toJson } from '../database/json.js';

export class InstanceCoordinator {
  constructor(database, config, logger) {
    this.database = database;
    this.logger = logger;
    this.instanceId = config.instanceId || randomUUID();
    this.role = config.instanceRole;
    this.timer = null;
  }

  async start(metadata = {}) {
    const record = {
      instance_id: this.instanceId,
      role: this.role,
      hostname: os.hostname(),
      metadata_json: toJson(metadata),
      started_at: this.database.fn.now(),
      heartbeat_at: this.database.fn.now(),
    };

    await this.database('bot_instances')
      .insert(record)
      .onConflict('instance_id')
      .merge(record);

    this.timer = setInterval(() => {
      this.database('bot_instances')
        .where({ instance_id: this.instanceId })
        .update({ heartbeat_at: this.database.fn.now() })
        .catch((error) =>
          this.logger.error({ error }, 'Instance heartbeat failed'),
        );
    }, 30_000);

    this.logger.info(
      { instanceId: this.instanceId, role: this.role },
      'Instance registered',
    );
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.database('bot_instances')
      .where({ instance_id: this.instanceId })
      .delete();
  }
}
