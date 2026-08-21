import type { Incoming } from './incoming.ts';
import { bundleName, reboundName } from './naming.ts';
import { uniqueName, type SkippedSave } from './pack.ts';
import { rebindToSteamId } from './sl2/rebind.ts';
import { openZip } from './zip.ts';

export interface ReboundSave {
  /** The name it is downloaded under, or carries inside the bundle. */
  readonly name: string;
  readonly previousSteamId: bigint;
  /** How many occurrences of the previous owner's id were rewritten. */
  readonly replacements: number;
}

export interface Rebound {
  readonly bytes: Uint8Array;
  readonly name: string;
  /** True when several saves travelled back as one zip. */
  readonly bundled: boolean;
  readonly saves: readonly ReboundSave[];
  /** Saves the file listed but could not hand over, carried through as is. */
  readonly skipped: readonly SkippedSave[];
}

export type OnSave = (done: number, total: number, name: string) => void;

/**
 * Rebinds everything an incoming file carries to one account. A lone save comes
 * back as itself, under the name it arrived with; several come back as one zip,
 * because several downloads at once is something browsers throttle and ask
 * about. Each save is written into the archive as it is rebound and let go
 * straight after, so the batch is never held whole.
 */
export function rebindIncoming(
  incoming: Incoming,
  fileName: string,
  steamId: bigint,
  now: Date,
  onSave?: OnSave,
): Rebound {
  const total = incoming.saves.length;
  const used = new Set<string>();
  const saves: ReboundSave[] = [];
  const zip = total > 1 ? openZip(now) : null;
  let only: Uint8Array | null = null;

  incoming.saves.forEach((entry, index) => {
    const name = uniqueName(used, reboundName(entry.fileName ?? fileName));
    onSave?.(index + 1, total, name);

    const result = rebindToSteamId(entry.save, steamId);
    saves.push({
      name,
      previousSteamId: result.previousSteamId,
      replacements: result.replacements,
    });
    if (zip) zip.add(name, result.save);
    else only = result.save;
  });

  const skipped = incoming.skipped;
  return zip
    ? { bytes: zip.finish(), name: bundleName(fileName), bundled: true, saves, skipped }
    : { bytes: only!, name: saves[0]!.name, bundled: false, saves, skipped };
}
