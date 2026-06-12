import { startRuntime, stopRuntime } from './runtime.js';

await startRuntime();

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function shutdown() {
  await stopRuntime();
  process.exit(0);
}
