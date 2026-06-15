import { createRuntime } from '../src/core/createRuntime.js';
import { CommandDeploymentService } from '../src/services/CommandDeploymentService.js';

const runtime = await createRuntime();

try {
  const service = new CommandDeploymentService({
    ...runtime.config.discord,
    logger: runtime.logger,
  });
  await service.deploy(runtime.registry.getCommandPayloads());
} finally {
  runtime.client.destroy();
  await runtime.database.destroy();
}
