import { decodeAscii } from './bytes.ts';
import { codeOf } from './errors.ts';
import { PackError, readManifest, readPack, type SkippedSave } from './pack.ts';
import { listZip, readZip } from './zip.ts';
import { assertChecksums, parseSl2 } from './sl2/bnd4.ts';
import { SaveError } from './errors.ts';
import { readProfile, type CharacterSummary } from './sl2/profile.ts';

/**
 * Whoever shares a save is not required to have this tool, so a plain
 * ER0000.sl2 has to be accepted alongside a .savepack.zip. A pack may hold
 * several saves, a raw file is always one; both are described the same way.
 */
export interface IncomingSave {
  readonly save: Uint8Array;
  readonly steamId: bigint;
  readonly characters: readonly CharacterSummary[];
  /**
   * The name recorded when the save was packed, which survives the pack being
   * renamed. Absent for a raw save file: there, the file name is all there is.
   */
  readonly fileName?: string;
}

export interface Incoming {
  readonly kind: 'savepack' | 'save file' | 'archive';
  /** When the save was packed, or when the file itself was last written. */
  readonly dated: string;
  readonly note?: string;
  readonly saves: readonly IncomingSave[];
  /** Saves the file listed but could not hand over; empty for a save file. */
  readonly skipped: readonly SkippedSave[];
}

export class IncomingSaveError extends SaveError {}

const BND4 = 'BND4';

const isSaveFile = (bytes: Uint8Array) =>
  bytes.length >= 4 && decodeAscii(bytes.subarray(0, 4)) === BND4;

/**
 * A save is taken at its word about nothing: the twelve digests it carries are
 * the same ones the game checks, and a file that fails them is one the game
 * would turn down. Costs about 80 ms on 27.6 MB, in the worker.
 */
function readSaveFile(bytes: Uint8Array) {
  const entries = parseSl2(bytes);
  assertChecksums(bytes, entries);
  return readProfile(bytes, entries);
}

/**
 * What a zip entry may be called. A name climbing out of the folder it unpacks
 * into is one we would hand straight to whoever opens the archive we build from
 * it, so it stops here.
 */
function safePath(name: string): string | null {
  // Some tools write the separator the Windows way; a zip is meant to use "/".
  const path = name.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) return null;
  return path.split('/').includes('..') ? null : path;
}

/**
 * Walks an ordinary zip of saves — what somebody without this page sends, or
 * what Windows makes of a practice folder. Every entry is unpacked in turn, kept
 * or set aside, and let go before the next: the archive of a whole library holds
 * a gigabyte and a half, and only one save of it is ever needed at once.
 */
function walkArchive<T>(
  bytes: Uint8Array,
  keep: (fileName: string, save: Uint8Array) => T,
  onEntry?: OnEntry,
): { kept: T[]; skipped: SkippedSave[] } {
  // Folders are recorded as empty entries, and have nothing to answer for.
  const worth = (name: string, size: number) => size > 0 && !name.endsWith('/');
  const total = listZip(bytes).filter((entry) => worth(entry.name, entry.size)).length;

  const kept: T[] = [];
  const skipped: SkippedSave[] = [];
  let done = 0;

  readZip(bytes, (name, save) => {
    if (!worth(name, save.length)) return;
    onEntry?.(++done, total, name);

    const path = safePath(name);
    if (path === null) {
      skipped.push({
        fileName: name,
        code: 'unsafe-name',
        message: `${name} would be unpacked outside the folder it was extracted into.`,
      });
      return;
    }
    try {
      kept.push(keep(path, save));
    } catch (error) {
      skipped.push({
        fileName: path,
        code: codeOf(error) ?? 'not-a-save',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (kept.length === 0) {
    throw new IncomingSaveError(
      'no-save-in-archive',
      'This archive holds no Elden Ring save.',
    );
  }
  return { kept, skipped };
}

/** A zip that carries no manifest is not a savepack, but may still hold saves. */
function isPlainZip(error: unknown): boolean {
  return error instanceof PackError && error.code === 'pack-missing-manifest';
}

/** Anything that is not even an archive is not one of ours at all. */
function notOurs(error: unknown): never {
  if (error instanceof PackError && error.code === 'not-an-archive') {
    throw new IncomingSaveError(
      'neither-format',
      'This is neither a savepack nor an Elden Ring save file (ER0000.sl2).',
    );
  }
  throw error;
}

export type OnEntry = (done: number, total: number, name: string) => void;

export function readIncoming(bytes: Uint8Array, fileDate: Date, onEntry?: OnEntry): Incoming {
  if (isSaveFile(bytes)) {
    const profile = readSaveFile(bytes);
    return {
      kind: 'save file',
      dated: fileDate.toISOString(),
      saves: [{ save: bytes, steamId: profile.steamId, characters: profile.characters }],
      skipped: [],
    };
  }

  try {
    const { manifest, saves, bad } = readPack(bytes);
    return {
      kind: 'savepack',
      dated: manifest.createdAt,
      ...(manifest.note ? { note: manifest.note } : {}),
      saves: saves.map((entry) => ({
        save: entry.save,
        steamId: entry.steamId,
        characters: entry.characters,
        fileName: entry.fileName,
      })),
      skipped: bad,
    };
  } catch (error) {
    if (!isPlainZip(error)) return notOurs(error);

    const { kept, skipped } = walkArchive(
      bytes,
      (fileName, save) => {
        const profile = readSaveFile(save);
        return { save, fileName, steamId: profile.steamId, characters: profile.characters };
      },
      onEntry,
    );
    return { kind: 'archive', dated: fileDate.toISOString(), saves: kept, skipped };
  }
}

/**
 * What a save says about itself, without the 27 MB it says it with. The page
 * lists what it is about to pack, and holding every save in memory to do it
 * puts a library of fifty past a gigabyte; the file itself stays on disk until
 * the pack is written.
 */
export interface SaveSummary {
  readonly fileName?: string;
  readonly size: number;
  readonly steamId: bigint;
  readonly characters: readonly CharacterSummary[];
}

export interface IncomingSummary {
  readonly kind: Incoming['kind'];
  readonly dated: string;
  readonly note?: string;
  readonly saves: readonly SaveSummary[];
  /** What the file holds and this page will not take. Known of an archive from
   * the moment it is read; of a pack, only once its saves are. */
  readonly skipped: readonly SkippedSave[];
}

/**
 * What the file says it holds, reading as little as it can to say it. A pack is
 * described from its manifest alone, every save left compressed where it lies:
 * the manifest already names each save, its account and its characters, and
 * inflating fifty of them to draw one page of description is 1.4 GB. The saves
 * are read when they are wanted — to pack them, or to rebind them — and that is
 * where their checksums are answered for.
 */
export function summariseIncoming(bytes: Uint8Array, fileDate: Date, onEntry?: OnEntry): IncomingSummary {
  if (isSaveFile(bytes)) {
    const profile = readSaveFile(bytes);
    return {
      kind: 'save file',
      dated: fileDate.toISOString(),
      saves: [{ size: bytes.length, steamId: profile.steamId, characters: profile.characters }],
      skipped: [],
    };
  }

  try {
    const manifest = readManifest(bytes);
    return {
      kind: 'savepack',
      dated: manifest.createdAt,
      ...(manifest.note ? { note: manifest.note } : {}),
      saves: manifest.saves.map((entry) => ({
        fileName: entry.fileName,
        size: entry.size,
        steamId: BigInt(entry.steamId),
        characters: entry.characters,
      })),
      skipped: [],
    };
  } catch (error) {
    if (!isPlainZip(error)) return notOurs(error);

    const { kept, skipped } = walkArchive(
      bytes,
      (fileName, save) => {
        const profile = readSaveFile(save);
        return { fileName, size: save.length, steamId: profile.steamId, characters: profile.characters };
      },
      onEntry,
    );
    return { kind: 'archive', dated: fileDate.toISOString(), saves: kept, skipped };
  }
}
