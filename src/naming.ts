import { PACK_EXTENSION } from './pack.ts';

/**
 * Strips the extensions this tool knows about, leaving the rest alone. Outer
 * suffixes come off first: a pack is name.savepack.zip, and the game's own
 * shadow copy is ER0000.sl2.bak.
 */
function baseName(fileName: string): string {
  return fileName.replace(/\.(zip|bak)$/i, '').replace(/\.(sl2|savepack)$/i, '');
}

/** What a save can arrive wrapped in, as opposed to being one already. */
const CONTAINER = /\.(savepack\.zip|savepack|zip)$/i;

/**
 * The name a converted save keeps: the one it arrived with, verbatim — down to
 * the extension it never had. Runners name their saves after the point they
 * practise, and a save organiser moves the file to exactly the name typed in,
 * "03 BOSS 01 Abductors" and nothing more, so appending .sl2 would single out
 * every save that came back through here. Only a container earns a save name:
 * a pack unwraps to an .sl2, and the game's own shadow copy drops its .bak.
 */
export function reboundName(fileName: string): string {
  const unpacked = fileName.replace(CONTAINER, '');
  if (unpacked !== fileName) return `${unpacked}.sl2`;
  return fileName.replace(/\.bak$/i, '');
}

/**
 * The name of a pack built from a batch. A single save lends the pack its own
 * name; several have no common one, so the pack is dated instead.
 */
export function packName(fileNames: readonly string[], now: Date): string {
  const only = fileNames.length === 1 ? baseName(fileNames[0]!) : '';
  const stem = only || `elden-ring-${now.toISOString().slice(0, 10)}`;
  return `${stem}${PACK_EXTENSION}`;
}

/** The name of the zip holding several converted saves. */
export function bundleName(packFileName: string): string {
  return `${baseName(packFileName)}.zip`;
}
