import { ApiServer } from './api/ApiServer.js';
import { InstanceCoordinator } from './core/InstanceCoordinator.js';
import { createRuntime } from './core/createRuntime.js';
import { CommandDeploymentService } from './services/CommandDeploymentService.js';

let runtime;
let apiServer;
let coordinator;
let shuttingDown = false;

try {
  runtime = await createRuntime();
  coordinator = new InstanceCoordinator(
    runtime.database,
    runtime.config.runtime,
    runtime.logger,
  );
  await coordinator.start({ version: '1.0.0' });

  if (runtime.config.runtime.instanceRole === 'primary') {
    if (runtime.config.discord.autoDeployCommands) {
      const commandDeployment = new CommandDeploymentService({
        ...runtime.config.discord,
        logger: runtime.logger,
      });
      await commandDeployment.deploy(runtime.registry.getCommandPayloads());
    }
    await runtime.client.login(runtime.config.discord.token);
    if (runtime.config.api.enabled) {
      apiServer = new ApiServer(runtime);
      await apiServer.start();
    }
  } else {
    runtime.logger.info(
      'Worker instance started without Discord gateway or REST API.',
    );
  }

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => {
    runtime.logger.error({ error }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    runtime.logger.fatal({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
} catch (error) {
  console.error(error);
  await shutdown('startup_error');
  process.exitCode = 1;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  runtime?.logger.info({ signal }, 'Shutting down');

  await apiServer?.stop().catch((error) =>
    runtime.logger.error({ error }, 'API shutdown failed'),
  );
  runtime?.client.destroy();
  await coordinator?.stop().catch((error) =>
    runtime.logger.error({ error }, 'Coordinator shutdown failed'),
  );
  await runtime?.database.destroy().catch((error) =>
    runtime.logger.error({ error }, 'Database shutdown failed'),
  );
}
