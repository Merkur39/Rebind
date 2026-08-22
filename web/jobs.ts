import type { SkippedSave } from '../src/pack.ts';
import type { Rebound } from '../src/rebound.ts';
import type { Failure, Inspected, PackEvent, PackJob } from './jobs.worker.ts';

/**
 * The page's side of the worker. One worker serves every job and is
 * kept alive between them; cancelling kills it, which is the only way to stop
 * a deflate already under way, and the next job starts a fresh one.
 */
export type OnProgress = (done: number, total: number, name: string) => void;

export class Cancelled extends Error {}

/** Distinguishes a failure that names a file from any other thrown value. */
export function isFailure(value: unknown): value is Failure {
  return typeof value === "object" && value !== null && "file" in value && "message" in value;
}

let worker: Worker | null = null;
let cancel: (() => void) | null = null;
let watch: ((worker: Worker) => void) | null = null;

/**
 * Called with each worker as it is made, before anything else listens to it —
 * which is the whole point: the worker announces its debug ids straight away,
 * and whoever wants them has to be there first, and to swallow that message
 * before the handler below mistakes it for a job's answer.
 */
export function watchWorkers(fn: (worker: Worker) => void): void {
  watch = fn;
}

function running(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./jobs.worker.ts', import.meta.url), { type: 'module' });
    watch?.(worker);
  }
  return worker;
}

function run(job: PackJob, onProgress: OnProgress): Promise<PackEvent> {
  return new Promise((resolve, reject) => {
    const current = running();

    const settle = (outcome: () => void) => {
      current.onmessage = null;
      current.onerror = null;
      cancel = null;
      outcome();
    };

    current.onmessage = (event: MessageEvent<PackEvent>) => {
      const message = event.data;
      if (message.kind === 'progress') onProgress(message.done, message.total, message.name);
      else settle(() => resolve(message));
    };
    // A worker that dies mid-job leaves the page waiting forever otherwise.
    current.onerror = (event) => settle(() => reject(new Error(event.message || 'worker failed')));

    cancel = () => {
      current.terminate();
      worker = null;
      settle(() => reject(new Cancelled('cancelled')));
    };

    current.postMessage(job);
  });
}

/** Stops whatever is running; does nothing when nothing is. */
export function cancelJob(): void {
  cancel?.();
}

function unexpected(event: PackEvent): never {
  throw new Error(`unexpected ${event.kind} from the packing worker`);
}

export async function inspectFiles(
  files: readonly File[],
  onProgress: OnProgress,
): Promise<{ good: Inspected[]; bad: Failure[] }> {
  const event = await run({ job: 'inspect', files }, onProgress);
  if (event.kind === 'inspected') return { good: event.good, bad: event.bad };
  if (event.kind === 'failed') return { good: [], bad: [event.failure] };
  return unexpected(event);
}

export interface PackedBundle {
  readonly pack: Uint8Array;
  readonly name: string;
  readonly rawTotal: number;
  readonly count: number;
  readonly skipped: readonly SkippedSave[];
}

export async function packFiles(
  files: readonly File[],
  note: string,
  now: Date,
  onProgress: OnProgress,
): Promise<PackedBundle> {
  const event = await run({ job: 'pack', files, note, now: now.getTime() }, onProgress);
  if (event.kind === 'packed') return event;
  if (event.kind === 'failed') throw event.failure;
  return unexpected(event);
}

export async function rebindFile(
  file: File,
  steamId: bigint,
  now: Date,
  onProgress: OnProgress,
): Promise<Rebound> {
  const event = await run({ job: 'rebind', file, steamId, now: now.getTime() }, onProgress);
  if (event.kind === 'rebound') return event;
  if (event.kind === 'failed') throw event.failure;
  return unexpected(event);
}
