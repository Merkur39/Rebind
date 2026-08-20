import { decodeUtf8, encodeUtf8 } from './bytes.ts';
import { sha256Hex } from './hash.ts';
import { SaveError } from './errors.ts';
import { unzipSync, zipSync } from 'fflate';
import { parseSl2 } from './sl2/bnd4.ts';
import { readProfile, type CharacterSummary } from './sl2/profile.ts';
import { GAME_ID, SAVE_FILE_NAME } from './game.ts';

/**
 * A .savepack.zip is an ordinary zip holding one or more saves plus a manifest,
 * so it stays inspectable with any unzip tool and readable by a future version.
 * Several saves travel together on purpose: a practice library is a set, and
 * sending it should not mean one download per file.
 */
export const PACK_FORMAT = 'rebind/1';
export const PACK_EXTENSION = '.savepack.zip';
const MANIFEST_NAME = 'manifest.json';

export interface PackedSave {
  readonly fileName: string;
  readonly size: number;
  readonly sha256: string;
  readonly steamId: string;
  readonly characters: readonly CharacterSummary[];
}

export interface PackManifest {
  readonly format: string;
  readonly game: string;
  readonly createdAt: string;
  readonly note?: string;
  readonly saves: readonly PackedSave[];
}

export interface SaveToPack {
  readonly save: Uint8Array;
  /**
   * The name the save was given. Runners name their saves after the point they
   * practise, so it describes the file better than ER0000.sl2 ever could, and
   * recording it here keeps it even if the pack itself is renamed.
   */
  readonly fileName?: string;
}

export interface ReadSave {
  readonly save: Uint8Array;
  readonly fileName: string;
  readonly steamId: bigint;
  readonly characters: readonly CharacterSummary[];
}

export interface CreatePackOptions {
  readonly note?: string;
  readonly now?: Date;
}

export class PackError extends SaveError {}

/** Everyone's save is called ER0000.sl2, so a pack collides by default. */
function uniqueNames(entries: readonly SaveToPack[]): string[] {
  const used = new Set<string>();

  return entries.map((entry) => {
    const wanted = entry.fileName?.trim() || SAVE_FILE_NAME;
    const dot = wanted.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, ''];

    let candidate = wanted;
    for (let n = 2; used.has(candidate); n++) candidate = `${stem}-${n}${extension}`;
    used.add(candidate);
    return candidate;
  });
}

export function createPack(
  entries: readonly SaveToPack[],
  options: CreatePackOptions = {},
): Uint8Array {
  if (entries.length === 0) throw new PackError('pack-empty', 'A savepack needs at least one save.');

  const note = options.note?.trim();
  const names = uniqueNames(entries);
  const files: Record<string, Uint8Array> = {};

  const saves = entries.map((entry, index): PackedSave => {
    const profile = readProfile(entry.save, parseSl2(entry.save));
    const fileName = names[index]!;
    files[fileName] = entry.save;
    return {
      fileName,
      size: entry.save.length,
      sha256: sha256Hex(entry.save),
      steamId: profile.steamId.toString(),
      characters: profile.characters,
    };
  });

  const manifest: PackManifest = {
    format: PACK_FORMAT,
    game: GAME_ID,
    createdAt: (options.now ?? new Date()).toISOString(),
    ...(note ? { note } : {}),
    saves,
  };

  files[MANIFEST_NAME] = encodeUtf8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

function parseManifest(raw: Uint8Array): PackManifest {
  let manifest: PackManifest;
  try {
    manifest = JSON.parse(decodeUtf8(raw)) as PackManifest;
  } catch {
    throw new PackError('pack-unreadable-manifest', 'This savepack has an unreadable manifest.');
  }

  if (manifest.format !== PACK_FORMAT) {
    throw new PackError(
      'pack-wrong-format',
      `This savepack uses format "${manifest.format}"; this version of Rebind only reads "${PACK_FORMAT}". Update Rebind to open it.`,
    );
  }
  if (manifest.game !== GAME_ID) {
    throw new PackError(
      'pack-wrong-game',
      `This savepack is for another game ("${manifest.game}"), not Elden Ring.`,
    );
  }
  if (!Array.isArray(manifest.saves) || manifest.saves.length === 0) {
    throw new PackError('pack-missing-save', 'This savepack lists no save at all.');
  }
  return manifest;
}

export function readPack(pack: Uint8Array): { manifest: PackManifest; saves: ReadSave[] } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(pack);
  } catch {
    throw new PackError('not-an-archive', 'This file is not a savepack (it is not a valid archive).');
  }

  const rawManifest = files[MANIFEST_NAME];
  if (!rawManifest) {
    throw new PackError(
      'pack-missing-manifest',
      'This archive is not a savepack: it has no manifest.json.',
    );
  }
  const manifest = parseManifest(rawManifest);

  const saves = manifest.saves.map((entry): ReadSave => {
    const save = files[entry.fileName];
    if (!save) {
      throw new PackError(
        'pack-missing-save',
        `This savepack is missing one of its saves (${entry.fileName}).`,
      );
    }
    if (save.length !== entry.size || sha256Hex(save) !== entry.sha256) {
      throw new PackError(
        'pack-corrupted',
        `This savepack is corrupted: ${entry.fileName} does not match its checksum.`,
      );
    }
    const profile = readProfile(save, parseSl2(save));
    return { save, fileName: entry.fileName, steamId: profile.steamId, characters: profile.characters };
  });

  return { manifest, saves };
}
