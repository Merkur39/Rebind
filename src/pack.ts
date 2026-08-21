import { decodeUtf8, encodeUtf8 } from './bytes.ts';
import { sha256Hex } from './hash.ts';
import { SaveError, codeOf, type ErrorCode } from './errors.ts';
import { openZip } from './zip.ts';
import { unzipSync } from 'fflate';
import { assertChecksums, parseSl2 } from './sl2/bnd4.ts';
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

/** A save a pack lists but cannot hand over, named so a caller can say which. */
export interface SkippedSave {
  readonly fileName: string;
  readonly code: ErrorCode;
  readonly message: string;
}

/**
 * Everyone's save is called ER0000.sl2, so an archive of saves collides by
 * default. Names are claimed one at a time: a caller writing entries as they
 * arrive never sees the batch first.
 */
export function uniqueName(used: Set<string>, fileName: string | undefined): string {
  const wanted = fileName?.trim() || SAVE_FILE_NAME;
  const dot = wanted.lastIndexOf('.');
  const [stem, extension] = dot > 0 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, ''];

  let candidate = wanted;
  for (let n = 2; used.has(candidate); n++) candidate = `${stem}-${n}${extension}`;
  used.add(candidate);
  return candidate;
}

export interface PackWriter {
  /** Writes one save into the pack, and reports what went in. */
  add(save: Uint8Array, fileName?: string): PackedSave;
  /** Writes the manifest, closes the archive and returns it. */
  finish(): Uint8Array;
}

/**
 * Builds a pack one save at a time, so nobody has to hold the batch: fifty
 * saves are 1.4 GB of bytes and barely 100 MB of archive, and the caller can
 * let each one go as soon as it is written. The manifest goes in last — a zip
 * is read from the directory at its end, so the order entries were written in
 * makes no difference to a reader.
 */
export function openPack(options: CreatePackOptions = {}): PackWriter {
  const createdAt = options.now ?? new Date();
  const note = options.note?.trim();
  const used = new Set<string>();
  const saves: PackedSave[] = [];
  const zip = openZip(createdAt);

  return {
    add(save, fileName) {
      const profile = readProfile(save, parseSl2(save));
      const packed: PackedSave = {
        fileName: uniqueName(used, fileName),
        size: save.length,
        sha256: sha256Hex(save),
        steamId: profile.steamId.toString(),
        characters: profile.characters,
      };
      zip.add(packed.fileName, save);
      saves.push(packed);
      return packed;
    },

    finish() {
      if (saves.length === 0) {
        throw new PackError('pack-empty', 'A savepack needs at least one save.');
      }
      const manifest: PackManifest = {
        format: PACK_FORMAT,
        game: GAME_ID,
        createdAt: createdAt.toISOString(),
        ...(note ? { note } : {}),
        saves,
      };
      zip.add(MANIFEST_NAME, encodeUtf8(JSON.stringify(manifest, null, 2)));
      return zip.finish();
    },
  };
}

export function createPack(
  entries: readonly SaveToPack[],
  options: CreatePackOptions = {},
): Uint8Array {
  const writer = openPack(options);
  for (const entry of entries) writer.add(entry.save, entry.fileName);
  return writer.finish();
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
  for (const entry of manifest.saves) {
    // Read as a number when a pack is described without being unpacked, so a
    // manifest that says something else has to be caught here.
    if (!/^\d+$/.test(entry.steamId ?? '')) {
      throw new PackError(
        'pack-unreadable-manifest',
        `This savepack's manifest gives no readable account for ${entry.fileName || 'one of its saves'}.`,
      );
    }
  }
  return manifest;
}

function unpack(pack: Uint8Array, only?: string): Record<string, Uint8Array> {
  try {
    return unzipSync(pack, only ? { filter: (file) => file.name === only } : {});
  } catch {
    throw new PackError('not-an-archive', 'This file is not a savepack (it is not a valid archive).');
  }
}

/**
 * The manifest alone, leaving every save compressed where it lies. Listing what
 * a pack holds needs nothing else — the manifest already names each save, its
 * account and its characters — and fifty inflated saves are 1.4 GB to read a
 * page of description. Whoever wants the saves themselves calls readPack, which
 * is also where the checksums are answered for.
 */
export function readManifest(pack: Uint8Array): PackManifest {
  const raw = unpack(pack, MANIFEST_NAME)[MANIFEST_NAME];
  if (!raw) {
    throw new PackError(
      'pack-missing-manifest',
      'This archive is not a savepack: it has no manifest.json.',
    );
  }
  return parseManifest(raw);
}

function readOne(files: Record<string, Uint8Array>, entry: PackedSave): ReadSave {
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
  const entries = parseSl2(save);
  // Intact as packed is not the same as sound: the sender may have packed a save
  // that was already damaged, and its own digests are what say so.
  assertChecksums(save, entries);
  const profile = readProfile(save, entries);
  return { save, fileName: entry.fileName, steamId: profile.steamId, characters: profile.characters };
}

export function readPack(pack: Uint8Array): {
  manifest: PackManifest;
  saves: ReadSave[];
  bad: SkippedSave[];
} {
  const files = unpack(pack);

  const rawManifest = files[MANIFEST_NAME];
  if (!rawManifest) {
    throw new PackError(
      'pack-missing-manifest',
      'This archive is not a savepack: it has no manifest.json.',
    );
  }
  const manifest = parseManifest(rawManifest);

  const saves: ReadSave[] = [];
  const bad: SkippedSave[] = [];
  for (const entry of manifest.saves) {
    try {
      saves.push(readOne(files, entry));
    } catch (error) {
      // One save nobody can read is no reason to withhold the others: a practice
      // set travels as a set, and nineteen of twenty are still worth having.
      bad.push({
        fileName: entry.fileName,
        code: codeOf(error) ?? 'pack-corrupted',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Nothing readable at all is a broken pack rather than a partial one, and it
  // fails the way it always did.
  if (saves.length === 0) throw new PackError(bad[0]!.code, bad[0]!.message);

  return { manifest, saves, bad };
}
