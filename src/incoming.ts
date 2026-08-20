import { decodeAscii } from './bytes.ts';
import { PackError, readPack } from './pack.ts';
import { parseSl2 } from './sl2/bnd4.ts';
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
}

export class IncomingSaveError extends SaveError {}

const BND4 = 'BND4';

export function readIncoming(bytes: Uint8Array, fileDate: Date): Incoming {
  if (bytes.length >= 4 && decodeAscii(bytes.subarray(0, 4)) === BND4) {
    const profile = readProfile(bytes, parseSl2(bytes));
    return {
      kind: 'save file',
      dated: fileDate.toISOString(),
      saves: [{ save: bytes, steamId: profile.steamId, characters: profile.characters }],
    };
  }

  try {
    const { manifest, saves } = readPack(bytes);
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
    };
  } catch (error) {
    if (error instanceof PackError && error.code === 'not-an-archive') {
      throw new IncomingSaveError(
        'neither-format',
        'This is neither a savepack nor an Elden Ring save file (ER0000.sl2).',
      );
    }
    throw error;
  }
}
