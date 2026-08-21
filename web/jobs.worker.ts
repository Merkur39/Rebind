/// <reference lib="webworker" />
import { codeOf, type ErrorCode } from '../src/errors.ts';
import { packName } from '../src/naming.ts';
import { openPack, type SkippedSave } from '../src/pack.ts';
import { readIncoming, summariseIncoming, type IncomingSummary } from '../src/incoming.ts';
import { rebindIncoming, type ReboundSave } from '../src/rebound.ts';

/**
 * The reading and packing of a library, off the page's thread: hashing and
 * deflating ten saves is four seconds of solid work, fifty are twenty, and a
 * frozen page for that long looks like a crashed one.
 *
 * Files cross as handles rather than bytes. A File survives the structured
 * clone by reference, so nothing is copied and only one save is ever held in
 * memory at a time — the alternative, keeping fifty decoded saves on the page,
 * is 1.4 GB.
 */
export type PackJob =
  | { readonly job: 'inspect'; readonly files: readonly File[] }
  | {
      readonly job: 'pack';
      readonly files: readonly File[];
      readonly note: string;
      readonly now: number;
    }
  | { readonly job: 'rebind'; readonly file: File; readonly steamId: bigint; readonly now: number };

/** A file that could not be read, named so the page can say which. */
export interface Failure {
  readonly file: string;
  readonly code: ErrorCode | null;
  readonly message: string;
}

export interface Inspected {
  /** Where the file sat in the batch, so the page can pair it back up. */
  readonly index: number;
  readonly name: string;
  readonly summary: IncomingSummary;
}

export type PackEvent =
  /** Starting on file `done` of `total`; the page counts from this. */
  | { readonly kind: 'progress'; readonly done: number; readonly total: number; readonly name: string }
  | { readonly kind: 'inspected'; readonly good: Inspected[]; readonly bad: Failure[] }
  | {
      readonly kind: 'packed';
      readonly pack: Uint8Array;
      readonly name: string;
      readonly rawTotal: number;
      readonly count: number;
      readonly skipped: readonly SkippedSave[];
    }
  | {
      readonly kind: 'rebound';
      readonly bytes: Uint8Array;
      readonly name: string;
      readonly bundled: boolean;
      readonly saves: readonly ReboundSave[];
      readonly skipped: readonly SkippedSave[];
    }
  | { readonly kind: 'failed'; readonly failure: Failure };

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(event: PackEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer);
}

function failureOf(file: string, error: unknown): Failure {
  return {
    file,
    code: codeOf(error),
    message: error instanceof Error ? error.message : String(error),
  };
}

async function read(file: File) {
  return readIncoming(new Uint8Array(await file.arrayBuffer()), new Date(file.lastModified));
}

/** Reads only what it takes to describe the file, not what it holds. */
async function skim(file: File) {
  return summariseIncoming(new Uint8Array(await file.arrayBuffer()), new Date(file.lastModified));
}

async function inspect(files: readonly File[]): Promise<void> {
  const good: Inspected[] = [];
  const bad: Failure[] = [];

  for (const [index, file] of files.entries()) {
    post({ kind: 'progress', done: index + 1, total: files.length, name: file.name });
    try {
      good.push({ index, name: file.name, summary: await skim(file) });
    } catch (error) {
      bad.push(failureOf(file.name, error));
    }
  }

  post({ kind: 'inspected', good, bad });
}

async function pack(files: readonly File[], note: string, now: number): Promise<void> {
  const at = new Date(now);
  const writer = openPack({ ...(note ? { note } : {}), now: at });
  const names: string[] = [];
  const skipped: SkippedSave[] = [];
  let rawTotal = 0;

  for (const [index, file] of files.entries()) {
    post({ kind: 'progress', done: index + 1, total: files.length, name: file.name });
    try {
      // Read, written and dropped within the iteration: the save is 27.6 MB and
      // the pack keeps only what it deflated.
      const incoming = await read(file);
      skipped.push(...incoming.skipped);
      for (const entry of incoming.saves) {
        const packed = writer.add(entry.save, entry.fileName ?? file.name);
        names.push(packed.fileName);
        rawTotal += packed.size;
      }
    } catch (error) {
      post({ kind: 'failed', failure: failureOf(file.name, error) });
      return;
    }
  }

  const bytes = writer.finish();
  post(
    { kind: 'packed', pack: bytes, name: packName(names, at), rawTotal, count: names.length, skipped },
    [bytes.buffer],
  );
}

async function rebind(file: File, steamId: bigint, now: number): Promise<void> {
  try {
    const incoming = await read(file);
    const rebound = rebindIncoming(incoming, file.name, steamId, new Date(now), (done, total, name) =>
      post({ kind: 'progress', done, total, name }),
    );
    post({ kind: 'rebound', ...rebound }, [rebound.bytes.buffer]);
  } catch (error) {
    post({ kind: 'failed', failure: failureOf(file.name, error) });
  }
}

scope.onmessage
 = (event: MessageEvent<PackJob>) => {
  const job = event.data;
  const run =
    job.job === 'inspect'
      ? inspect(job.files)
      : job.job === 'pack'
        ? pack(job.files, job.note, job.now)
        : rebind(job.file, job.steamId, job.now);
  run.catch((error: unknown) => post({ kind: 'failed', failure: failureOf('', error) }));
};
