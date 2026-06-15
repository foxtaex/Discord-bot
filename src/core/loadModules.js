import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadModules(registry, context) {
  const modulesDirectory = path.resolve(process.cwd(), 'src/modules');
  const entries = await readdir(modulesDirectory, { withFileTypes: true });
  const loaded = [];

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const modulePath = path.join(modulesDirectory, entry.name, 'index.js');
    const imported = await import(pathToFileURL(modulePath).href);
    const module = await imported.createModule(context);
    await module.register(registry);
    loaded.push(module);
    context.logger.info({ module: module.name }, 'Module registered');
  }

  return loaded;
}
