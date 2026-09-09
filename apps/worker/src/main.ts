import { randomUUID } from 'node:crypto';
import { createProductionRuntimeFromEnv } from '@insurance/infrastructure';
import { DurableAsyncWorker } from './worker.js';

const runtime = await createProductionRuntimeFromEnv();
const workerId = process.env.WORKER_ID?.trim() || `worker-${randomUUID()}`;
const pollMs = Math.max(250, Math.min(60_000, Number(process.env.WORKER_POLL_MS ?? 1000) || 1000));
const worker = new DurableAsyncWorker(runtime, workerId);
let stopping = false;

process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });

console.log(JSON.stringify({ event: 'WORKER_STARTED', workerId, pollMs }));
while (!stopping) {
  try {
    const result = await worker.tick();
    if (result.inspected > 0) console.log(JSON.stringify({ event: 'WORKER_TICK', workerId, ...result }));
  } catch {
    console.error(JSON.stringify({ event: 'WORKER_TICK_FAILED', workerId, category: 'WORKER_TICK_FAILED' }));
  }
  if (!stopping) await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
}
console.log(JSON.stringify({ event: 'WORKER_STOPPED', workerId }));
