import { Zip, ZipDeflate } from 'fflate';
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

export function openZip(mtime: Date): ZipWriter {
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
      entry.mtime = mtime;
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
