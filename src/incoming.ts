import { decodeAscii } from './bytes.ts';
import { PackError, readManifest, readPack, type SkippedSave } from './pack.ts';
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
  readonly kind: 'savepack' | 'save file';
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

/** Anything but a savepack is not one of ours at all. */
function notOurs(error: unknown): never {
  if (error instanceof PackError && error.code === 'not-an-archive') {
    throw new IncomingSaveError(
      'neither-format',
      'This is neither a savepack nor an Elden Ring save file (ER0000.sl2).',
    );
  }
  throw error;
}

export function readIncoming(bytes: Uint8Array, fileDate: Date): Incoming {
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
    return notOurs(error);
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
}

/**
 * What the file says it holds, reading as little as it can to say it. A pack is
 * described from its manifest alone, every save left compressed where it lies:
 * the manifest already names each save, its account and its characters, and
 * inflating fifty of them to draw one page of description is 1.4 GB. The saves
 * are read when they are wanted — to pack them, or to rebind them — and that is
 * where their checksums are answered for.
 */
export function summariseIncoming(bytes: Uint8Array, fileDate: Date): IncomingSummary {
  if (isSaveFile(bytes)) {
    const profile = readSaveFile(bytes);
    return {
      kind: 'save file',
      dated: fileDate.toISOString(),
      saves: [{ size: bytes.length, steamId: profile.steamId, characters: profile.characters }],
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
    };
  } catch (error) {
    return notOurs(error);
  }
}
