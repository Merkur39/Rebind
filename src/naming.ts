import { PACK_EXTENSION } from './pack.ts';

/**
 * Strips the extensions this tool knows about, leaving the rest alone. Outer
 * suffixes come off first: a pack is name.savepack.zip, and the game's own
 * shadow copy is ER0000.sl2.bak.
 */
function baseName(fileName: string): string {
  return fileName.replace(/\.(zip|bak)$/i, '').replace(/\.(sl2|savepack)$/i, '');
}

/**
 * The name a converted save keeps. Runners name their saves after the point
 * they practise — "Avant Margit.sl2" — and a save organiser renames on load, so
 * the name carries the only description of what the file is. Nothing is
 * appended to it: the browser already handles a collision in the download
 * folder, and a suffix would mean renaming every file by hand.
 */
export function reboundName(fileName: string): string {
  return `${baseName(fileName)}.sl2`;
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
