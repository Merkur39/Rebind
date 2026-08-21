import { Unzip, UnzipInflate, Zip, ZipDeflate, unzipSync } from 'fflate';
import { SaveError } from './errors.ts';

/**
 * A zip written one entry at a time. Both things this tool downloads are
 * archives of saves — a savepack, or a batch that came back rebound — and a
 * save is 27.6 MB, so building either in one go means holding the whole batch.
 * Here each entry is deflated and let go as it arrives.
 */
export interface ZipWriter {
  add(fileName: string, bytes: Uint8Array): void;
  /** Closes the archive and returns it. The writer is spent afterwards. */
  finish(): Uint8Array;
}

export class ZipError extends SaveError {}

/**
 * A zip records dates as DOS timestamps, which run from 1980 to 2099 and
 * nowhere else: fflate refuses anything outside, and a caller handing over a
 * date rather than a stamp should not have to know that. A day of margin at
 * each end covers the timezone the fields are written in.
 */
const EARLIEST = Date.UTC(1980, 0, 2);
const LATEST = Date.UTC(2099, 11, 30);

function stampable(mtime: Date): Date {
  const at = mtime.getTime();
  return new Date(Number.isNaN(at) ? EARLIEST : Math.min(Math.max(at, EARLIEST), LATEST));
}

export function openZip(mtime: Date): ZipWriter {
  const stamp = stampable(mtime);
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;

  const zip = new Zip((error, chunk) => {
    failure ??= error;
    if (chunk) chunks.push(chunk);
  });

  function check(): void {
    if (failure) throw new ZipError('zip-unwritable', `This archive could not be written: ${failure.message}`);
  }

  return {
    add(fileName, bytes) {
      // Deflated in one push rather than in slices: the caller already holds the
      // whole entry, and fflate keeps only the compressed result afterwards.
      const entry = new ZipDeflate(fileName, { level: 6 });
      // Stamped rather than left to the clock, so the same entries written twice
      // give the same archive.
      entry.mtime = stamp;
      zip.add(entry);
      entry.push(bytes, true);
      check();
    },

    finish() {
      zip.end();
      check();

      const archive = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let at = 0;
      for (const chunk of chunks) {
        archive.set(chunk, at);
        at += chunk.length;
      }
      return archive;
    },
  };
}

/** What an archive says it holds, taken from its directory rather than its data. */
export interface ZipEntry {
  readonly name: string;
  /** The size once unpacked, as the archive announces it. */
  readonly size: number;
}

/**
 * The names an archive carries, without unpacking a single one. A zip is read
 * from the directory at its end, so this costs nothing whatever the archive
 * weighs — enough to count the work before starting it.
 */
export function listZip(archive: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  try {
    unzipSync(archive, {
      filter: (file) => {
        entries.push({ name: file.name, size: file.originalSize });
        return false;
      },
    });
  } catch {
    throw new ZipError('not-an-archive', 'This file is not a valid archive.');
  }
  return entries;
}

/**
 * Walks an archive, handing over one unpacked entry at a time and letting it go
 * before the next: a zip of a practice library holds a gigabyte and a half, and
 * nobody needs more than one save of it at once. Entries larger than `largest`
 * are passed over — a save is 27.6 MB, and an archive announcing far more is
 * either a bomb or not what we are here for.
 */
export function readZip(
  archive: Uint8Array,
  onEntry: (name: string, bytes: Uint8Array) => void,
  largest = 64 << 20,
): void {
  const unzip = new Unzip((file) => {
    if ((file.originalSize ?? 0) > largest) return;

    const chunks: Uint8Array[] = [];
    let held = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw new ZipError('not-an-archive', `This archive could not be read: ${error.message}`);
      chunks.push(chunk);
      held += chunk.length;
      if (held > largest) throw new ZipError('not-an-archive', `${file.name} unpacks to more than this page will hold.`);
      if (!final) return;

      const bytes = new Uint8Array(held);
      let at = 0;
      for (const part of chunks) {
        bytes.set(part, at);
        at += part.length;
      }
      chunks.length = 0;
      onEntry(file.name, bytes);
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    unzip.push(archive, true);
  } catch (error) {
    if (error instanceof ZipError) throw error;
    throw new ZipError('not-an-archive', 'This file is not a valid archive.');
  }
}
